import { and, eq, ne } from "drizzle-orm";
import { casePatents, patents } from "@/db/schema";
import type { Patent } from "./queries";

export type CasePatentRow = typeof casePatents.$inferSelect;

/**
 * 案件・特許の組み合わせに対する評価を1件取得する。存在しない場合はundefinedを返す
 * （評価が未保存＝未評価とみなす。呼び出し側で"unrated"扱いにする）。
 * `@/db/client` は関数呼び出し時に遅延インポートする（他featureと同じパターン）。
 */
export async function getCasePatentStatus(
  caseId: string,
  patentId: string,
): Promise<CasePatentRow | undefined> {
  const { db } = await import("@/db/client");
  const rows = await db
    .select()
    .from(casePatents)
    .where(and(eq(casePatents.caseId, caseId), eq(casePatents.patentId, patentId)))
    .limit(1);
  return rows[0];
}

/**
 * 案件に紐づく評価を一括取得する（未評価＝行が存在しない特許は含まれない）。
 * 検索結果一覧のように多数の特許を1画面に表示する場合、行ごとに`getCasePatentStatus`を
 * 呼ぶとN+1になるため、呼び出し側でMap化して各行にpropsとして渡す想定。
 */
export async function getCasePatentStatusesByCase(caseId: string): Promise<CasePatentRow[]> {
  const { db } = await import("@/db/client");
  return db.select().from(casePatents).where(eq(casePatents.caseId, caseId));
}

export interface EvaluatedPatentItem {
  patent: Patent;
  evaluation: CasePatentRow;
}

/** 案件詳細画面で表示する評価済み特許の上限件数（無制限クエリによる肥大化を防ぐ）。 */
const EVALUATED_PATENTS_BY_CASE_LIMIT = 200;

/**
 * 案件詳細画面の集計表示用に、評価済み（status !== "unrated"）の特許を特許情報とJOINして取得する。
 * status別のグルーピングは呼び出し側（page.tsx）で行う。
 */
export async function getEvaluatedPatentsByCase(caseId: string): Promise<EvaluatedPatentItem[]> {
  const { db } = await import("@/db/client");
  return db
    .select({
      patent: patents,
      evaluation: casePatents,
    })
    .from(casePatents)
    .innerJoin(patents, eq(casePatents.patentId, patents.id))
    .where(and(eq(casePatents.caseId, caseId), ne(casePatents.status, "unrated")))
    .limit(EVALUATED_PATENTS_BY_CASE_LIMIT);
}
