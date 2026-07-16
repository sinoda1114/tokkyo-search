import { EmptyState, Heading, Link, Paragraph, Table } from "@heroui/react";
import { getCases } from "@/features/cases/queries";

// 一覧はDBの最新状態を都度反映する必要があり、キャッシュ不可（force-dynamic）。
// これによりビルド時の静的プリレンダリングで env 未設定のまま db/client を評価してビルドが
// 落ちることも防ぐ。
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
});

const primaryLinkClassName =
  "inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90";

export default async function CasesPage() {
  const items = await getCases();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Heading level={1}>案件一覧</Heading>
        <Link href="/cases/new" className={primaryLinkClassName}>
          新規案件作成
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState>
          <Heading level={2}>案件がまだありません</Heading>
          <Paragraph color="muted">
            最初の案件を作成して先行技術調査を始めましょう。
          </Paragraph>
          <Link href="/cases/new" className={primaryLinkClassName}>
            新規案件を作成する
          </Link>
        </EmptyState>
      ) : (
        <Table.Root>
          <Table.ScrollContainer>
            <Table.Content aria-label="案件一覧">
              <Table.Header>
                <Table.Column isRowHeader>案件名</Table.Column>
                <Table.Column>管理番号</Table.Column>
                <Table.Column>技術分野</Table.Column>
                <Table.Column>更新日時</Table.Column>
              </Table.Header>
              <Table.Body>
                {items.map((item) => (
                  <Table.Row key={item.id} id={item.id}>
                    <Table.Cell>
                      <Link href={`/cases/${item.id}`}>{item.name}</Link>
                    </Table.Cell>
                    <Table.Cell>{item.referenceNumber ?? "—"}</Table.Cell>
                    <Table.Cell>{item.technicalField ?? "—"}</Table.Cell>
                    <Table.Cell>{dateFormatter.format(item.updatedAt)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table.Root>
      )}
    </div>
  );
}
