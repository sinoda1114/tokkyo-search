import { notFound } from "next/navigation";
import { Alert, Chip, Heading, Link, Paragraph } from "@heroui/react";
import { getCaseById } from "@/features/cases/queries";
import { getSearchResultsByRun, getSearchRunById } from "@/features/patent-search/queries";
import { getCasePatentStatusesByCase } from "@/features/patents/evaluation-queries";
import { EvaluationControl } from "./evaluation-control";

// 検索結果は都度DBの最新状態を反映するため force-dynamic（キャッシュしない）。
export const dynamic = "force-dynamic";

const BYTES_PER_GIB = 1024 ** 3;
const ABSTRACT_PREVIEW_LENGTH = 120;

interface SearchRunPageProps {
  params: Promise<{ caseId: string; runId: string }>;
}

function formatBytesBilled(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "不明";
  return `${(bytes / BYTES_PER_GIB).toFixed(3)} GB`;
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("ja-JP");
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
  const evaluations = await getCasePatentStatusesByCase(caseId);
  const evaluationByPatentId = new Map(evaluations.map((row) => [row.patentId, row]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading level={1}>検索実行結果</Heading>
        <Paragraph color="muted">
          「{caseItem.name}」の検索結果（{run.resultCount ?? results.length}件）
        </Paragraph>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-[var(--muted,gray)]">実行日時</dt>
        <dd>{formatDateTime(run.executedAt)}</dd>
        <dt className="text-[var(--muted,gray)]">スキャン量（課金対象）</dt>
        <dd>{formatBytesBilled(run.bytesBilled)}</dd>
      </dl>

      {results.length === 0 ? (
        <Paragraph color="muted">条件に一致する特許が見つかりませんでした。</Paragraph>
      ) : (
        <ol className="flex flex-col gap-3">
          {results.map((result) => (
            <li
              key={result.patentId}
              className="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <Link href={`/cases/${caseId}/patents/${result.patentId}`}>
                  {result.publicationNumber}
                </Link>
                <Paragraph size="sm" color="muted">
                  #{result.rank}
                </Paragraph>
              </div>
              <Paragraph>{result.title ?? "（名称不明）"}</Paragraph>
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
