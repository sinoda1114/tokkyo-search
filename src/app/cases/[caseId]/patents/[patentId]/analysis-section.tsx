"use client";

import { useState } from "react";
import { Alert, Button, Chip, Heading, Paragraph, Spinner } from "@heroui/react";
import type { AnalysisResult } from "@/lib/gemini/schemas";
import { ResearchCandidatesPanel } from "./research-candidates-panel";

type AnalysisState =
  | { status: "success"; result: AnalysisResult }
  | { status: "error"; errorMessage: string }
  | null;

interface AnalysisSectionProps {
  caseId: string;
  patentId: string;
  initialAnalysis: AnalysisState;
  /** 請求項全文（`patents.claimsText`）が取得済みかどうか。解析の案内文言の出し分けに使う。 */
  hasClaimsText: boolean;
}

interface AnalysisApiErrorBody {
  status: "error";
  errorMessage: string;
}

function isErrorBody(value: unknown): value is AnalysisApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value as { status?: unknown }).status === "error"
  );
}

const TEXT_FIELDS: Array<{
  key: "overview" | "background" | "problem" | "solution" | "effect";
  label: string;
}> = [
  { key: "overview", label: "概要" },
  { key: "background", label: "背景技術" },
  { key: "problem", label: "課題" },
  { key: "solution", label: "解決手段" },
  { key: "effect", label: "効果" },
];

const FETCH_ERROR_MESSAGE = "AI解析の実行に失敗しました。時間をおいて再度お試しください。";
const AI_LIMITATION_NOTICE =
  "この解析結果はAIが本文から抽出した要約です。特許性・新規性・進歩性の判断結果ではありません。";
const CLAIMS_MISSING_NOTICE =
  "請求項が未取得のため、要約のみで解析します（先に請求項を取得すると精度が上がる場合があります）。";
const CLAIMS_AVAILABLE_REMINDER =
  "請求項を取得済みです。請求項を含めて解析し直せます。";

/**
 * AI文献解析セクション。
 * 未解析なら実行ボタンを表示し、`/api/patents/[patentId]/analysis` をPOSTして結果を取得する。
 * 既存の解析結果があれば `initialAnalysis` としてサーバーから渡され、即座に表示する。
 *
 * `hasClaimsText` は請求項の取得状況を伝えるプロパティで、`page.tsx` からサーバー側の
 * `patent.claimsText` に基づいて渡される。請求項セクションで新たに請求項を取得すると
 * `router.refresh()` が呼ばれ、このpropが更新される（`claims-section.tsx` 参照）。
 * `claimsIncludedInResult` は「現在表示中の解析結果が請求項ありの状態で実行されたか」を
 * このセッション内で追跡するためのローカル状態（DBには保存しない。`patent_analyses` の
 * スキーマは変更しない方針のため、再解析を促す案内はクライアント側の推定に留める）。
 */
export function AnalysisSection({ caseId, patentId, initialAnalysis, hasClaimsText }: AnalysisSectionProps) {
  const [analysis, setAnalysis] = useState<AnalysisState>(initialAnalysis);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [claimsIncludedInResult, setClaimsIncludedInResult] = useState(false);

  async function runAnalysis(force: boolean) {
    setIsLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ caseId });
      if (force) {
        params.set("force", "true");
      }
      const response = await fetch(`/api/patents/${patentId}/analysis?${params.toString()}`, {
        method: "POST",
      });
      if (!response.ok) {
        setFetchError(FETCH_ERROR_MESSAGE);
        return;
      }
      const json: unknown = await response.json();
      if (isErrorBody(json)) {
        setAnalysis({ status: "error", errorMessage: json.errorMessage });
      } else {
        setAnalysis({ status: "success", result: json as AnalysisResult });
        setClaimsIncludedInResult(hasClaimsText);
      }
    } catch {
      setFetchError(FETCH_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }

  const showClaimsReminder = hasClaimsText && !claimsIncludedInResult;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>AI文献解析</Heading>

      {isLoading ? (
        <div className="flex items-center gap-2" aria-live="polite" aria-busy={isLoading}>
          <Spinner size="sm" />
          <Paragraph color="muted">AIが解析しています…</Paragraph>
        </div>
      ) : (
        <AnalysisBody
          caseId={caseId}
          analysis={analysis}
          fetchError={fetchError}
          hasClaimsText={hasClaimsText}
          showClaimsReminder={showClaimsReminder}
          onRun={() => runAnalysis(false)}
          onRerun={() => runAnalysis(true)}
        />
      )}
    </section>
  );
}

interface AnalysisBodyProps {
  caseId: string;
  analysis: AnalysisState;
  fetchError: string | null;
  hasClaimsText: boolean;
  showClaimsReminder: boolean;
  onRun: () => void;
  onRerun: () => void;
}

function AnalysisBody({
  caseId,
  analysis,
  fetchError,
  hasClaimsText,
  showClaimsReminder,
  onRun,
  onRerun,
}: AnalysisBodyProps) {
  if (analysis === null) {
    return (
      <>
        {fetchError && <ErrorAlert message={fetchError} />}
        {!hasClaimsText && <NoticeAlert message={CLAIMS_MISSING_NOTICE} />}
        <Button type="button" variant="secondary" size="sm" onPress={onRun}>
          AI解析を実行
        </Button>
      </>
    );
  }

  if (analysis.status === "error") {
    return (
      <>
        <ErrorAlert message={analysis.errorMessage} />
        {fetchError && <ErrorAlert message={fetchError} />}
        {!hasClaimsText && <NoticeAlert message={CLAIMS_MISSING_NOTICE} />}
        <Button type="button" variant="secondary" size="sm" onPress={onRerun}>
          再実行
        </Button>
      </>
    );
  }

  return (
    <AnalysisResultView
      caseId={caseId}
      result={analysis.result}
      fetchError={fetchError}
      showClaimsReminder={showClaimsReminder}
      onRerun={onRerun}
    />
  );
}

function NoticeAlert({ message }: { message: string }) {
  return (
    <Alert status="accent">
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert status="danger">
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

interface AnalysisResultViewProps {
  caseId: string;
  result: AnalysisResult;
  fetchError: string | null;
  showClaimsReminder: boolean;
  onRerun: () => void;
}

function AnalysisResultView({
  caseId,
  result,
  fetchError,
  showClaimsReminder,
  onRerun,
}: AnalysisResultViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <Alert status="warning">
        <Alert.Content>
          <Alert.Description>{AI_LIMITATION_NOTICE}</Alert.Description>
        </Alert.Content>
      </Alert>

      {fetchError && <ErrorAlert message={fetchError} />}
      {showClaimsReminder && <NoticeAlert message={CLAIMS_AVAILABLE_REMINDER} />}

      {TEXT_FIELDS.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-1">
          <Heading level={3}>{label}</Heading>
          <Paragraph color={result[key] ? "default" : "muted"}>
            {result[key] ?? "本文から特定できませんでした"}
          </Paragraph>
        </div>
      ))}

      <TagListSection label="特徴的な技術用語" items={result.keyTerms} />
      <TagListSection
        label="再検索候補語"
        items={result.searchCandidates.map((candidate) => `${candidate.type}: ${candidate.text}`)}
      />
      <TagListSection label="引用文献" items={result.citedReferences} />

      <ResearchCandidatesPanel caseId={caseId} analysis={result} />

      <Button type="button" variant="secondary" size="sm" onPress={onRerun}>
        {showClaimsReminder ? "請求項を含めて再解析" : "再実行"}
      </Button>
    </div>
  );
}

function TagListSection({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <Heading level={3}>{label}</Heading>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item}>
              <Chip size="sm">{item}</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <Paragraph color="muted">該当なし</Paragraph>
      )}
    </div>
  );
}
