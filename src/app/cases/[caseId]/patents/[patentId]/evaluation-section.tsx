import { Heading } from "@heroui/react";
import { EvaluationControl } from "../../runs/[runId]/evaluation-control";
import type { CasePatentStatus } from "@/db/schema";

interface EvaluationSectionProps {
  caseId: string;
  patentId: string;
  initialStatus: CasePatentStatus;
  initialComment?: string | null;
  initialExclusionReason?: string | null;
}

/**
 * 特許詳細画面用の評価セクション。
 * ボタン群・対象外理由入力・コメント入力のロジックは検索結果一覧と共通の
 * `EvaluationControl`（`runs/[runId]/evaluation-control.tsx`）を再利用し、
 * ここでは見出し付きセクションとしてラップするだけに留める。
 */
export function EvaluationSection({
  caseId,
  patentId,
  initialStatus,
  initialComment,
  initialExclusionReason,
}: EvaluationSectionProps) {
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4">
      <Heading level={2}>評価</Heading>
      <EvaluationControl
        caseId={caseId}
        patentId={patentId}
        initialStatus={initialStatus}
        initialComment={initialComment}
        initialExclusionReason={initialExclusionReason}
        showComment
      />
    </section>
  );
}
