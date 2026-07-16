import { casePatentStatusValues, type CasePatentStatus } from "@/db/schema";

/**
 * 特許評価ステータスの日本語表示ラベル。
 * `src/db/schema.ts` の `casePatentStatusValues` と1対1で対応させること。
 */
export const CASE_PATENT_STATUS_LABELS: Record<CasePatentStatus, string> = {
  unrated: "未評価",
  important: "重要",
  reference: "参考",
  excluded: "対象外",
};

/** 案件詳細の集計表示で使うステータスの表示順（unratedは集計対象外のため含めない）。 */
export const EVALUATED_STATUS_ORDER: readonly CasePatentStatus[] = casePatentStatusValues.filter(
  (status) => status !== "unrated",
);
