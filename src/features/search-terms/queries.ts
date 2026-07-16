import { asc, eq } from "drizzle-orm";
import { searchTerms, searchTermTypeValues, type SearchTermType } from "@/db/schema";

export type SearchTermRow = typeof searchTerms.$inferSelect;
export type SearchTermsByType = Record<SearchTermType, SearchTermRow[]>;

function emptyGroups(): SearchTermsByType {
  return Object.fromEntries(
    searchTermTypeValues.map((type) => [type, [] as SearchTermRow[]]),
  ) as SearchTermsByType;
}

/**
 * 案件に紐づく検索語をtermType別にグルーピングして取得する。
 * `@/db/client` は関数呼び出し時に遅延インポートする（このモジュールを import しただけでは
 * DB接続用の環境変数を検証しない。テストでは `@/db/client` を vi.mock でテスト用DBに差し替える）。
 */
export async function getSearchTermsByCase(caseId: string): Promise<SearchTermsByType> {
  const { db } = await import("@/db/client");
  const rows = await db
    .select()
    .from(searchTerms)
    .where(eq(searchTerms.caseId, caseId))
    .orderBy(asc(searchTerms.createdAt));

  const grouped = emptyGroups();
  for (const row of rows) {
    grouped[row.termType].push(row);
  }
  return grouped;
}
