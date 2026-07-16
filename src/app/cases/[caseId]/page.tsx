import { notFound } from "next/navigation";
import { Heading, Link, Paragraph } from "@heroui/react";
import { getCaseById } from "@/features/cases/queries";
import { getSearchRunsByCase } from "@/features/patent-search/queries";
import {
  getEvaluatedPatentsByCase,
  type EvaluatedPatentItem,
} from "@/features/patents/evaluation-queries";
import {
  CASE_PATENT_STATUS_LABELS,
  EVALUATED_STATUS_ORDER,
} from "@/features/patents/evaluation-options";
import type { CasePatentStatus } from "@/db/schema";
import { CaseMemoEditor } from "./case-memo-editor";

const BYTES_PER_GIB = 1024 ** 3;

function formatBytesBilled(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "-";
  return `${(bytes / BYTES_PER_GIB).toFixed(3)} GB`;
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("ja-JP");
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
  const evaluatedPatents = await getEvaluatedPatentsByCase(caseItem.id);
  const evaluatedByStatus = groupByStatus(evaluatedPatents);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Heading level={1}>{caseItem.name}</Heading>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-[var(--muted,gray)]">管理番号</dt>
          <dd>{caseItem.referenceNumber ?? "未設定"}</dd>
          <dt className="text-[var(--muted,gray)]">技術分野</dt>
          <dd>{caseItem.technicalField ?? "未設定"}</dd>
        </dl>
      </div>

      <CaseMemoEditor caseId={caseItem.id} initialMemo={caseItem.memo} />

      <section className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] p-4">
        <Heading level={2}>検索語</Heading>
        <Paragraph color="muted">検索語を登録してください。</Paragraph>
        <Link href={`/cases/${caseItem.id}/terms`}>検索語の管理へ進む</Link>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
        <Heading level={2}>検索実行履歴</Heading>
        {searchRuns.length === 0 ? (
          <Paragraph color="muted">まだ検索を実行していません。</Paragraph>
        ) : (
          <ul className="flex flex-col gap-2">
            {searchRuns.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
              >
                <Link href={`/cases/${caseItem.id}/runs/${run.id}`}>
                  {formatDateTime(run.executedAt)}
                </Link>
                <span>{run.status === "success" ? "成功" : "失敗"}</span>
                <span>{run.status === "success" ? `${run.resultCount ?? 0}件` : "-"}</span>
                <span>{formatBytesBilled(run.bytesBilled)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
        <Heading level={2}>評価済み特許</Heading>
        {evaluatedPatents.length === 0 ? (
          <Paragraph color="muted">評価済みの特許はまだありません。</Paragraph>
        ) : (
          <div className="flex flex-col gap-4">
            {EVALUATED_STATUS_ORDER.map((status) => (
              <div key={status} className="flex flex-col gap-2">
                <Heading level={3}>
                  {CASE_PATENT_STATUS_LABELS[status]}（{evaluatedByStatus[status].length}件）
                </Heading>
                {evaluatedByStatus[status].length === 0 ? (
                  <Paragraph size="sm" color="muted">
                    該当する特許はありません。
                  </Paragraph>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {evaluatedByStatus[status].map(({ patent, evaluation }) => (
                      <li
                        key={patent.id}
                        className="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
                      >
                        <Link href={`/cases/${caseItem.id}/patents/${patent.id}`}>
                          {patent.title ?? patent.publicationNumber}
                        </Link>
                        <Paragraph size="sm" color="muted">
                          {patent.publicationNumber}
                        </Paragraph>
                        {evaluation.status === "excluded" && evaluation.exclusionReason ? (
                          <Paragraph size="sm">対象外理由: {evaluation.exclusionReason}</Paragraph>
                        ) : null}
                        {evaluation.comment ? (
                          <Paragraph size="sm">コメント: {evaluation.comment}</Paragraph>
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
    </div>
  );
}
