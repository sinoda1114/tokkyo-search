import { Heading, Paragraph } from "@heroui/react";
import { CaseForm } from "./case-form";

export default function NewCasePage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Heading level={1}>新規案件作成</Heading>
        <Paragraph color="muted">案件の基本情報を入力してください。</Paragraph>
      </div>
      <CaseForm />
    </div>
  );
}
