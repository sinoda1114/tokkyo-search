import { ApiError, GoogleGenAI, type Schema } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";
import { logLlmCall } from "@/lib/llm-log";
import { GeminiRequestError, GeminiValidationError } from "./errors";
import { buildAnalysisPrompt, type AnalysisPatentInput } from "./prompts/analysis";
import { buildExpansionPrompt } from "./prompts/expansion";
import {
  analysisResponseSchema,
  analysisResultSchema,
  expansionResponseSchema,
  expansionResultSchema,
  type AnalysisResult,
  type ExpansionResult,
} from "./schemas";

const TEMPERATURE = 0.2;
const RETRY_DELAYS_MS = [1000, 4000];
const SCHEMA_RETRY_NOTE =
  "\n\n直前の出力は指定されたJSONスキーマに厳密に従っていませんでした。指定されたJSONスキーマに厳密に従って、もう一度JSONのみを出力してください。";

/**
 * E2Eテスト専用のモックモード判定。
 * `MOCK_EXTERNAL_APIS=1` が設定されている場合のみ有効になり、実際のGemini呼び出しを行わない。
 * 本番環境で誤って有効化されないよう、値は厳密に "1" のときのみtrueとする。
 */
function isMockExternalApisEnabled(): boolean {
  return process.env.MOCK_EXTERNAL_APIS === "1";
}

/** E2Eテスト用の固定フィクスチャ（検索語展開）。 */
const MOCK_EXPANSION_RESULT: ExpansionResult = {
  terms: [
    { type: "synonym", text: "放熱機構", sourceTerm: "放熱構造" },
    { type: "broader", text: "冷却構造", sourceTerm: "放熱構造" },
    { type: "english", text: "heat dissipation structure", sourceTerm: "放熱構造" },
  ],
};

/** E2Eテスト用の固定フィクスチャ（特許解析）。 */
const MOCK_ANALYSIS_RESULT: AnalysisResult = {
  overview: "半導体パッケージの放熱構造に関する発明の概要（E2Eテスト用フィクスチャ）。",
  background: "従来の半導体パッケージは放熱性に課題があった。",
  problem: "放熱効率を高めつつ小型化を両立することが課題である。",
  solution: "放熱部材の形状と配置を工夫することで放熱経路を確保する。",
  effect: "放熱性が向上し、パッケージの信頼性が高まる。",
  keyTerms: ["放熱構造", "半導体パッケージ"],
  searchCandidates: [{ type: "synonym", text: "放熱機構" }],
  citedReferences: ["JP2015-000123A"],
};

let cachedClient: GoogleGenAI | undefined;

/**
 * Gemini SDKクライアントの遅延初期化。
 * モジュールimport時にはenvへアクセスしない（呼び出し時に初めて GEMINI_API_KEY を検証する）。
 */
function getGeminiClient(): GoogleGenAI {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return cachedClient;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "不明なエラー";
}

/**
 * Gemini APIへ1回分のリクエストを送る。429/5xx相当のエラーは指数バックオフ（1秒→4秒）で
 * 最大2回リトライしてから諦める。
 */
async function requestGeneration(prompt: string, responseSchema: Schema): Promise<string> {
  const client = getGeminiClient();
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        model: env.GEMINI_MODEL,
        contents: prompt,
        config: {
          temperature: TEMPERATURE,
          responseMimeType: "application/json",
          responseSchema,
        },
      });
      const text = response.text;
      if (!text) {
        throw new GeminiRequestError("Geminiからのレスポンスが空でした");
      }
      return text;
    } catch (error: unknown) {
      lastError = error;
      const status = error instanceof ApiError ? error.status : undefined;
      const isLastAttempt = attempt === RETRY_DELAYS_MS.length;
      if (isLastAttempt || status === undefined || !isRetryableStatus(status)) {
        break;
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new GeminiRequestError(
    `Gemini APIの呼び出しに失敗しました: ${getErrorMessage(lastError)}`,
    { cause: lastError },
  );
}

type ParseResult<T> = { success: true; data: T } | { success: false; error: string };

function parseAndValidate<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }
  return { success: true, data: parsed.data };
}

interface StructuredGenerationResult<T> {
  requestPayload: string;
  responsePayload: string;
  result: T;
}

/**
 * JSON構造化出力を要求し、Zodスキーマで再検証する（SDKのresponseSchemaだけを信用しない）。
 * 検証に失敗した場合は「スキーマに厳密に従ってください」という一文を追記して1回だけ再送する。
 * それでも失敗した場合は GeminiValidationError を投げる。
 */
async function generateStructured<T>(
  prompt: string,
  responseSchema: Schema,
  resultSchema: z.ZodType<T>,
): Promise<StructuredGenerationResult<T>> {
  const firstText = await requestGeneration(prompt, responseSchema);
  const firstParsed = parseAndValidate(firstText, resultSchema);
  if (firstParsed.success) {
    return { requestPayload: prompt, responsePayload: firstText, result: firstParsed.data };
  }

  const retryPrompt = `${prompt}${SCHEMA_RETRY_NOTE}`;
  const secondText = await requestGeneration(retryPrompt, responseSchema);
  const secondParsed = parseAndValidate(secondText, resultSchema);
  if (secondParsed.success) {
    return {
      requestPayload: retryPrompt,
      responsePayload: secondText,
      result: secondParsed.data,
    };
  }

  throw new GeminiValidationError(
    `Geminiのレスポンスが期待するJSONスキーマに従っていません: ${secondParsed.error}`,
  );
}

/** ログ保存の失敗が本処理（検索語展開・特許解析）の結果を握りつぶさないよう、ベストエフォートで記録する。 */
async function logBestEffort(entry: Parameters<typeof logLlmCall>[0]): Promise<void> {
  try {
    await logLlmCall(entry);
  } catch {
    // ログ保存の失敗は本処理の成否に影響させない。
  }
}

/**
 * ユーザー入力語から類義語・上位/下位概念・材質・機能・効果・英語表現を展開する。
 * 入力語から直接導ける語のみを提案させ、発明内容の推測はさせない（プロンプト側で強制）。
 */
export async function generateExpansion(
  terms: string[],
  technicalField?: string,
  caseId?: string,
): Promise<ExpansionResult> {
  if (isMockExternalApisEnabled()) {
    return MOCK_EXPANSION_RESULT;
  }

  const prompt = buildExpansionPrompt(terms, technicalField);

  try {
    const { requestPayload, responsePayload, result } = await generateStructured(
      prompt,
      expansionResponseSchema,
      expansionResultSchema,
    );
    await logBestEffort({
      kind: "expansion",
      caseId,
      requestPayload,
      responsePayload,
      model: env.GEMINI_MODEL,
    });
    return result;
  } catch (error: unknown) {
    await logBestEffort({
      kind: "expansion",
      caseId,
      requestPayload: prompt,
      model: env.GEMINI_MODEL,
    });
    throw error;
  }
}

/**
 * 特許文献（title/abstract/claims）を解析し、概要・背景技術・課題・解決手段・効果等を構造化抽出する。
 * 提供された本文にない内容を事実として出力させず、特許性・新規性・進歩性の断定もさせない
 * （プロンプト側で強制し、結果はZodで再検証する）。
 *
 * `caseId` はどの案件の詳細画面から実行された解析かをログ（`llm_logs.caseId`）に残すために渡す。
 * 案件詳細のAI送受信ログ一覧は `caseId` 一致で抽出するため、これを渡さないとログが永遠に表示されない
 * （呼び出し元は `getOrRunAnalysis` 経由でAPIルートのURLから受け取ったcaseIdを渡すこと）。
 */
export async function analyzePatent(
  patent: AnalysisPatentInput,
  patentId?: string,
  caseId?: string,
): Promise<AnalysisResult> {
  if (isMockExternalApisEnabled()) {
    return MOCK_ANALYSIS_RESULT;
  }

  const prompt = buildAnalysisPrompt(patent);

  try {
    const { requestPayload, responsePayload, result } = await generateStructured(
      prompt,
      analysisResponseSchema,
      analysisResultSchema,
    );
    await logBestEffort({
      kind: "analysis",
      patentId,
      caseId,
      requestPayload,
      responsePayload,
      model: env.GEMINI_MODEL,
    });
    return result;
  } catch (error: unknown) {
    await logBestEffort({
      kind: "analysis",
      patentId,
      caseId,
      requestPayload: prompt,
      model: env.GEMINI_MODEL,
    });
    throw error;
  }
}
