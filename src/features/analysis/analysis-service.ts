import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";
import { patentAnalyses } from "@/db/schema";
import { env } from "@/lib/env";
import { getPatentById } from "@/features/patents/queries";
import { analyzePatent } from "@/lib/gemini/client";
import { GeminiRequestError, GeminiValidationError } from "@/lib/gemini/errors";
import type { AnalysisResult } from "@/lib/gemini/schemas";

/** 解析プロンプトの版数。プロンプトの内容を変更した際は更新する。 */
const PROMPT_VERSION = "v1";
const TITLE_FALLBACK = "（名称不明）";
const NOT_FOUND_MESSAGE = "特許が見つかりません";
const UNKNOWN_ERROR_MESSAGE = "不明なエラーが発生しました";

export interface AnalysisErrorResult {
  status: "error";
  errorMessage: string;
}

function isGeminiError(error: unknown): error is GeminiRequestError | GeminiValidationError {
  return error instanceof GeminiRequestError || error instanceof GeminiValidationError;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return UNKNOWN_ERROR_MESSAGE;
}

/** `patentAnalyses` へupsertする（`patentId` UNIQUE制約を使い、同一特許の解析結果は常に1件に保つ）。 */
async function upsertAnalysis(
  patentId: string,
  values: { status: "success" | "error"; result: AnalysisResult | null; errorMessage: string | null },
): Promise<void> {
  const { db } = await import("@/db/client");
  await db
    .insert(patentAnalyses)
    .values({
      id: nanoid(),
      patentId,
      model: env.GEMINI_MODEL,
      promptVersion: PROMPT_VERSION,
      result: values.result,
      status: values.status,
      errorMessage: values.errorMessage,
    })
    .onConflictDoUpdate({
      target: patentAnalyses.patentId,
      set: {
        model: env.GEMINI_MODEL,
        promptVersion: PROMPT_VERSION,
        result: sql`excluded.result`,
        status: sql`excluded.status`,
        errorMessage: sql`excluded.error_message`,
      },
    });
}

/**
 * 特許のAI解析結果を取得する。既存の成功済み解析結果があれば再利用しGeminiを呼び出さない
 * （`force`指定時、または既存結果がない/前回エラーだった場合のみ実行する）。
 *
 * 提供された本文にない情報を事実として出力しない・特許性や新規性を断定しないという制約は
 * `analyzePatent` 側のプロンプトで強制される。本関数は結果の再利用・保存の責務のみを持つ。
 *
 * `caseId` はどの案件の詳細画面から実行されたかをログ（`llm_logs.caseId`）に残すために
 * `analyzePatent` へそのまま渡す（呼び出し元のAPIルートがURLから受け取って渡す）。
 */
export async function getOrRunAnalysis(
  patentId: string,
  force = false,
  caseId?: string,
): Promise<AnalysisResult | AnalysisErrorResult> {
  if (!force) {
    const { getAnalysisByPatentId } = await import("./queries");
    const existing = await getAnalysisByPatentId(patentId);
    if (existing && existing.status === "success" && existing.result) {
      return existing.result;
    }
  }

  const patent = await getPatentById(patentId);
  if (!patent) {
    return { status: "error", errorMessage: NOT_FOUND_MESSAGE };
  }

  try {
    const result = await analyzePatent(
      {
        title: patent.title ?? TITLE_FALLBACK,
        abstract: patent.abstract,
        claims: patent.claimsText,
      },
      patentId,
      caseId,
    );

    await upsertAnalysis(patentId, { status: "success", result, errorMessage: null });
    return result;
  } catch (error: unknown) {
    if (!isGeminiError(error)) {
      throw error;
    }
    const errorMessage = getErrorMessage(error);
    await upsertAnalysis(patentId, { status: "error", result: null, errorMessage });
    return { status: "error", errorMessage };
  }
}
