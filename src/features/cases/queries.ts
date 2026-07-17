import { desc, eq } from "drizzle-orm";
import { cases } from "@/db/schema";

export type CaseListItem = typeof cases.$inferSelect;

/**
 * 案件一覧を更新日時の降順で取得する。
 * `@/db/client` は関数呼び出し時に遅延インポートする（このモジュールを import しただけでは
 * DB接続用の環境変数を検証しない。テストでは `@/db/client` を vi.mock でテスト用DBに差し替える）。
 */
const MAX_CASES = 200;

export async function getCases(): Promise<CaseListItem[]> {
  const { db } = await import("@/db/client");
  return db.select().from(cases).orderBy(desc(cases.updatedAt)).limit(MAX_CASES);
}

/**
 * caseIdで案件を1件取得する。存在しない場合はundefinedを返す。
 */
export async function getCaseById(caseId: string): Promise<CaseListItem | undefined> {
  const { db } = await import("@/db/client");
  const rows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  return rows[0];
}
