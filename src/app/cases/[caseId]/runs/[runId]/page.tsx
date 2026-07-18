import { notFound } from "next/navigation";
import { Alert, Chip, Heading, Link, Paragraph } from "@heroui/react";
import { getCaseById } from "@/features/cases/queries";
import {
  getSearchResultsByRun,
  getSearchRunById,
  getSearchTermTextsByRun,
} from "@/features/patent-search/queries";
import { RESULT_LIMIT } from "@/features/patent-search/query-builder";
import { getCasePatentStatusesByCase } from "@/features/patents/evaluation-queries";
import { formatBytesBilled, formatDateTime } from "@/lib/format";
import { EvaluationControl } from "./evaluation-control";

// 検索結果は都度DBの最新状態を反映するため force-dynamic（キャッシュしない）。
export const dynamic = "force-dynamic";

const ABSTRACT_PREVIEW_LENGTH = 120;

interface SearchRunPageProps {
  params: Promise<{ caseId: string; runId: string }>;
}

/** `search_runs.conditions`（JSON, mode: "json" のためTS上は`unknown`）から表示用に必要な項目だけを安全に取り出す。 */
interface DisplayConditions {
  dateFrom?: string;
  dateTo?: string;
  termGroups?: string[][];
  searchClaims?: boolean;
  assignee?: string;
  ipcPrefix?: string;
  totalMatchCount?: number;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseConditions(value: unknown): DisplayConditions {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    dateFrom: typeof record.dateFrom === "string" ? record.dateFrom : undefined,
    dateTo: typeof record.dateTo === "string" ? record.dateTo : undefined,
    termGroups: Array.isArray(record.termGroups) ? record.termGroups.filter(isStringArray) : undefined,
    searchClaims: typeof record.searchClaims === "boolean" ? record.searchClaims : undefined,
    assignee: typeof record.assignee === "string" ? record.assignee : undefined,
    ipcPrefix: typeof record.ipcPrefix === "string" ? record.ipcPrefix : undefined,
    totalMatchCount: typeof record.totalMatchCount === "number" ? record.totalMatchCount : undefined,
  };
}

/**
 * 総ヒット件数（LIMIT適用前）とLIMIT・ソート順（日付が新しい順であり関連度順ではない）の
 * 関係を明示するメッセージを組み立てる。totalMatchCountが未記録の古い検索実行（本機能追加前）
 * では、これまでどおりresultCountのみを表示する。
 */
function formatTotalCountMessage(totalMatchCount: number | undefined, resultCount: number): string {
  if (totalMatchCount === undefined) {
    return `${resultCount}件`;
  }
  if (totalMatchCount <= RESULT_LIMIT) {
    return `全${totalMatchCount}件を表示（日付が新しい順）`;
  }
  return `全${totalMatchCount}件中${RESULT_LIMIT}件を表示（日付が新しい順、200件超は未表示）`;
}

function previewAbstract(abstract: string | null): string | null {
  if (!abstract) return null;
  if (abstract.length <= ABSTRACT_PREVIEW_LENGTH) return abstract;
  return `${abstract.slice(0, ABSTRACT_PREVIEW_LENGTH)}…`;
}

export default async function SearchRunPage({ params }: SearchRunPageProps) {
  const { caseId, runId } = await params;

  const caseItem = await getCaseById(caseId);
  if (!caseItem) {
    notFound();
  }

  const run = await getSearchRunById(runId);
  if (!run || run.caseId !== caseId) {
    notFound();
  }

  if (run.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Heading level={1}>検索実行結果</Heading>
          <Paragraph color="muted">「{caseItem.name}」の検索実行（{formatDateTime(run.executedAt)}）</Paragraph>
        </div>

        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>検索の実行に失敗しました</Alert.Title>
            <Alert.Description>
              {run.errorMessage ?? "不明なエラーが発生しました。"}
            </Alert.Description>
          </Alert.Content>
        </Alert>

        <Link href={`/cases/${caseId}/terms`}>検索語の管理に戻って条件を見直し、再実行する</Link>
      </div>
    );
  }

  const results = await getSearchResultsByRun(runId);
  const usedTermTexts = await getSearchTermTextsByRun(runId);
  const evaluations = await getCasePatentStatusesByCase(caseId);
  const evaluationByPatentId = new Map(evaluations.map((row) => [row.patentId, row]));
  const conditions = parseConditions(run.conditions);
  const termGroups = conditions.termGroups ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1}>検索実行結果</Heading>
        <Paragraph color="muted">
          「{caseItem.name}」の検索結果（
          {formatTotalCountMessage(conditions.totalMatchCount, run.resultCount ?? results.length)}）
        </Paragraph>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-[var(--muted,gray)]">実行日時</dt>
        <dd>{formatDateTime(run.executedAt)}</dd>
        <dt className="text-[var(--muted,gray)]">スキャン量（課金対象）</dt>
        <dd>{formatBytesBilled(run.bytesBilled)}</dd>
      </dl>

      <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
        <Heading level={2}>検索条件</Heading>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-[var(--muted,gray)]">検索対象期間</dt>
          <dd>
            {conditions.dateFrom ?? "不明"} 〜 {conditions.dateTo ?? "不明"}
          </dd>
          <dt className="text-[var(--muted,gray)]">出願人</dt>
          <dd>{conditions.assignee ?? "指定なし"}</dd>
          <dt className="text-[var(--muted,gray)]">IPC前方一致</dt>
          <dd>{conditions.ipcPrefix ?? "指定なし"}</dd>
          <dt className="text-[var(--muted,gray)]">請求項も検索対象に含める</dt>
          <dd>{conditions.searchClaims ? "含む" : "含まない"}</dd>
        </dl>

        {termGroups.length > 0 ? (
          <div className="flex flex-col gap-1">
            <Paragraph size="sm" color="muted">
              検索式（グループ内はOR、グループ間はAND）
            </Paragraph>
            <Paragraph size="sm" className="font-mono">
              {termGroups.map((group) => `(${group.join(" OR ")})`).join(" AND ")}
            </Paragraph>
          </div>
        ) : null}

        {usedTermTexts.length > 0 ? (
          <div className="flex flex-col gap-1">
            <Paragraph size="sm" color="muted">
              使用した検索語
            </Paragraph>
            <div className="flex flex-wrap gap-2">
              {usedTermTexts.map((text) => (
                <Chip key={text} size="sm">
                  {text}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {results.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Paragraph color="muted">条件に一致する特許が見つかりませんでした。</Paragraph>
          <Link href={`/cases/${caseId}/terms`}>検索語の管理に戻って条件を見直し、再実行する</Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {results.map((result) => (
            <li
              key={result.patentId}
              className="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/cases/${caseId}/patents/${result.patentId}`}
                  className="text-lg font-semibold"
                >
                  {result.title ?? "（名称不明）"}
                </Link>
                <Paragraph size="sm" color="muted" className="tabular-nums">
                  #{result.rank}
                </Paragraph>
              </div>
              <Paragraph size="sm" color="muted">
                {result.publicationNumber}
              </Paragraph>
              <Paragraph size="sm" color="muted">
                {(result.assignees ?? []).join("、") || "出願人不明"} ・{" "}
                {result.publicationDate ?? "公開日不明"}
              </Paragraph>
              {previewAbstract(result.abstract) ? (
                <Paragraph size="sm">{previewAbstract(result.abstract)}</Paragraph>
              ) : null}
              {result.matchedTerms && result.matchedTerms.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {result.matchedTerms.map((term) => (
                    <Chip key={term} size="sm">
                      {term}
                    </Chip>
                  ))}
                </div>
              ) : null}
              <EvaluationControl
                caseId={caseId}
                patentId={result.patentId}
                initialStatus={evaluationByPatentId.get(result.patentId)?.status ?? "unrated"}
                initialComment={evaluationByPatentId.get(result.patentId)?.comment}
                initialExclusionReason={evaluationByPatentId.get(result.patentId)?.exclusionReason}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
