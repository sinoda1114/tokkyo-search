import { notFound } from "next/navigation";
import { Heading, Link, Paragraph } from "@heroui/react";
import { getCaseById } from "@/features/cases/queries";
import { getSearchRunsByCase } from "@/features/patent-search/queries";
import { CaseMemoEditor } from "./case-memo-editor";

const BYTES_PER_GIB = 1024 ** 3;

function formatBytesBilled(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "-";
  return `${(bytes / BYTES_PER_GIB).toFixed(3)} GB`;
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("ja-JP");
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
    </div>
  );
}
