import { notFound } from "next/navigation";
import { Chip, Heading, Link, Paragraph } from "@heroui/react";
import { getCaseById } from "@/features/cases/queries";
import { getSearchRunsByCase } from "@/features/patent-search/queries";
import { getSearchTermsByCase } from "@/features/search-terms/queries";
import { TERM_TYPE_ORDER } from "@/features/search-terms/term-type-labels";
import {
  getEvaluatedPatentsByCase,
  type EvaluatedPatentItem,
} from "@/features/patents/evaluation-queries";
import {
  CASE_PATENT_STATUS_LABELS,
  EVALUATED_STATUS_ORDER,
} from "@/features/patents/evaluation-options";
import { getLlmLogsByCase } from "@/features/llm-logs/queries";
import type { CasePatentStatus } from "@/db/schema";
import { formatBytesBilled as formatBytesBilledBase, formatDateTime } from "@/lib/format";
import { CaseEditForm } from "./case-edit-form";
import { CaseMemoEditor } from "./case-memo-editor";
import { LlmLogsSection } from "./llm-logs-section";

/** 検索語プレビューとして表示する件数の上限。 */
const SEARCH_TERM_PREVIEW_LIMIT = 8;

function formatBytesBilled(bytes: number | null): string {
  return formatBytesBilledBase(bytes, "-");
}

/** 評価済み特許をstatus別（重要→参考→対象外）にグルーピングする。 */
function groupByStatus(
  items: EvaluatedPatentItem[],
): Record<CasePatentStatus, EvaluatedPatentItem[]> {
  const grouped = Object.fromEntries(
    EVALUATED_STATUS_ORDER.map((status) => [status, [] as EvaluatedPatentItem[]]),
  ) as Record<CasePatentStatus, EvaluatedPatentItem[]>;

  for (const item of items) {
    grouped[item.evaluation.status].push(item);
  }
  return grouped;
}

// 案件詳細は都度DBの最新状態を反映するため force-dynamic（キャッシュしない）。
export const dynamic = "force-dynamic";

interface CaseDetailPageProps {
  params: Promise<{ caseId: string }>;
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { caseId } = await params;
  const caseItem = await getCaseById(caseId);

  if (!caseItem) {
    notFound();
  }

  const searchRuns = await getSearchRunsByCase(caseItem.id);
  const searchTermsByType = await getSearchTermsByCase(caseItem.id);
  const searchTerms = TERM_TYPE_ORDER.flatMap((type) => searchTermsByType[type]);
  const evaluatedPatents = await getEvaluatedPatentsByCase(caseItem.id);
  const evaluatedByStatus = groupByStatus(evaluatedPatents);
  const llmLogs = await getLlmLogsByCase(caseItem.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <CaseEditForm
            caseId={caseItem.id}
            initialName={caseItem.name}
            initialReferenceNumber={caseItem.referenceNumber}
            initialTechnicalField={caseItem.technicalField}
          />
        </div>
        <Link
          href={`/api/cases/${caseItem.id}/export`}
          download
          className="shrink-0 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm no-underline"
        >
          CSVエクスポート
        </Link>
      </div>

      <CaseMemoEditor caseId={caseItem.id} initialMemo={caseItem.memo} />

      <section className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-4">
        <Heading level={2} className="text-balance">
          検索語（<span className="tabular-nums">{searchTerms.length}</span>件）
        </Heading>
        {searchTerms.length === 0 ? (
          <Paragraph color="muted" className="text-pretty">
            検索語を登録してください。
          </Paragraph>
        ) : (
          <div className="flex flex-wrap gap-2">
            {searchTerms.slice(0, SEARCH_TERM_PREVIEW_LIMIT).map((term) => (
              <Chip key={term.id} size="sm">
                {term.text}
              </Chip>
            ))}
            {searchTerms.length > SEARCH_TERM_PREVIEW_LIMIT ? (
              <Chip size="sm" color="accent">
                他{searchTerms.length - SEARCH_TERM_PREVIEW_LIMIT}件
              </Chip>
            ) : null}
          </div>
        )}
        <Link href={`/cases/${caseItem.id}/terms`}>検索語の管理へ進む</Link>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
        <Heading level={2} className="text-balance">
          検索実行履歴
        </Heading>
        {searchRuns.length === 0 ? (
          <>
            <Paragraph color="muted" className="text-pretty">
              まだ検索を実行していません。
            </Paragraph>
            <Link href={`/cases/${caseItem.id}/terms`}>検索語作成画面で検索を実行する</Link>
          </>
        ) : (
          <ul className="flex flex-col gap-2">
            {searchRuns.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
              >
                <Link href={`/cases/${caseItem.id}/runs/${run.id}`} className="tabular-nums">
                  {formatDateTime(run.executedAt)}
                </Link>
                <span>{run.status === "success" ? "成功" : "失敗"}</span>
                <span className="tabular-nums">
                  {run.status === "success" ? `${run.resultCount ?? 0}件` : "-"}
                </span>
                <span className="tabular-nums">{formatBytesBilled(run.bytesBilled)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[color-mix(in_oklch,var(--accent)_6%,transparent)] p-4">
        <Heading level={2} className="text-balance">
          評価済み特許
        </Heading>
        {evaluatedPatents.length === 0 ? (
          <Paragraph color="muted" className="text-pretty">
            評価済みの特許はまだありません。
          </Paragraph>
        ) : (
          <div className="flex flex-col gap-4">
            {EVALUATED_STATUS_ORDER.map((status) => (
              <div key={status} className="flex flex-col gap-2">
                <Heading level={3} className="text-balance">
                  {CASE_PATENT_STATUS_LABELS[status]}（
                  <span className="tabular-nums">{evaluatedByStatus[status].length}</span>件）
                </Heading>
                {evaluatedByStatus[status].length === 0 ? (
                  <Paragraph size="sm" color="muted" className="text-pretty">
                    該当する特許はありません。
                  </Paragraph>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {evaluatedByStatus[status].map(({ patent, evaluation }) => (
                      <li
                        key={patent.id}
                        className="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
                      >
                        <Link
                          href={`/cases/${caseItem.id}/patents/${patent.id}`}
                          className="line-clamp-2"
                        >
                          {patent.title ?? patent.publicationNumber}
                        </Link>
                        <Paragraph size="sm" color="muted" className="text-pretty">
                          {patent.publicationNumber}
                        </Paragraph>
                        {evaluation.status === "excluded" && evaluation.exclusionReason ? (
                          <Paragraph size="sm" className="line-clamp-2">
                            対象外理由: {evaluation.exclusionReason}
                          </Paragraph>
                        ) : null}
                        {evaluation.comment ? (
                          <Paragraph size="sm" className="line-clamp-2">
                            コメント: {evaluation.comment}
                          </Paragraph>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <LlmLogsSection logs={llmLogs} />
    </div>
  );
}
