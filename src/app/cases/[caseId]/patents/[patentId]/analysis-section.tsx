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

/**
 * AI文献解析セクション。
 * 未解析なら実行ボタンを表示し、`/api/patents/[patentId]/analysis` をPOSTして結果を取得する。
 * 既存の解析結果があれば `initialAnalysis` としてサーバーから渡され、即座に表示する。
 */
export function AnalysisSection({ caseId, patentId, initialAnalysis }: AnalysisSectionProps) {
  const [analysis, setAnalysis] = useState<AnalysisState>(initialAnalysis);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function runAnalysis(force: boolean) {
    setIsLoading(true);
    setFetchError(null);
    try {
      const query = force ? "?force=true" : "";
      const response = await fetch(`/api/patents/${patentId}/analysis${query}`, {
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
      }
    } catch {
      setFetchError(FETCH_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }

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
  onRun: () => void;
  onRerun: () => void;
}

function AnalysisBody({ caseId, analysis, fetchError, onRun, onRerun }: AnalysisBodyProps) {
  if (analysis === null) {
    return (
      <>
        {fetchError && <ErrorAlert message={fetchError} />}
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
      onRerun={onRerun}
    />
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
  onRerun: () => void;
}

function AnalysisResultView({ caseId, result, fetchError, onRerun }: AnalysisResultViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <Alert status="warning">
        <Alert.Content>
          <Alert.Description>{AI_LIMITATION_NOTICE}</Alert.Description>
        </Alert.Content>
      </Alert>

      {fetchError && <ErrorAlert message={fetchError} />}

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
        再実行
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
