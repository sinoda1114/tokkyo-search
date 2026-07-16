import { notFound } from "next/navigation";
import { Heading, Paragraph } from "@heroui/react";
import { getCaseById } from "@/features/cases/queries";
import { getSearchTermsByCase } from "@/features/search-terms/queries";
import { AddTermsForm } from "./add-terms-form";
import { TermList } from "./term-list";
import { ExpansionPanel } from "./expansion-panel";

// 検索語は都度DBの最新状態を反映するため force-dynamic（キャッシュしない）。
export const dynamic = "force-dynamic";

interface TermsPageProps {
  params: Promise<{ caseId: string }>;
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { caseId } = await params;
  const caseItem = await getCaseById(caseId);

  if (!caseItem) {
    notFound();
  }

  const termsByType = await getSearchTermsByCase(caseId);
  const originalTerms = termsByType.original.map((term) => term.text);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Heading level={1}>検索語作成</Heading>
        <Paragraph color="muted">
          「{caseItem.name}」の検索語を登録し、AIによる関連語の展開を行えます。
        </Paragraph>
      </div>

      <AddTermsForm caseId={caseId} />

      <TermList termsByType={termsByType} />

      <ExpansionPanel
        caseId={caseId}
        originalTerms={originalTerms}
        technicalField={caseItem.technicalField}
      />
    </div>
  );
}
