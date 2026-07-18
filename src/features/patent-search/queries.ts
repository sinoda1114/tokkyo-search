import { asc, desc, eq } from "drizzle-orm";
import { patents, searchResults, searchRunTerms, searchRuns, searchTerms } from "@/db/schema";

export type SearchRunRow = typeof searchRuns.$inferSelect;

export interface SearchResultItem {
  patentId: string;
  publicationNumber: string;
  title: string | null;
  abstract: string | null;
  assignees: string[] | null;
  publicationDate: string | null;
  rank: number;
  matchedTerms: string[] | null;
}

/** 案件詳細画面で表示する検索実行履歴の上限件数（無制限クエリによる肥大化を防ぐ）。 */
const SEARCH_RUNS_BY_CASE_LIMIT = 200;

/**
 * 案件に紐づく検索実行履歴を実行日時の降順で取得する。
 * `@/db/client` は関数呼び出し時に遅延インポートする（他featureと同じパターン）。
 */
export async function getSearchRunsByCase(caseId: string): Promise<SearchRunRow[]> {
  const { db } = await import("@/db/client");
  return db
    .select()
    .from(searchRuns)
    .where(eq(searchRuns.caseId, caseId))
    .orderBy(desc(searchRuns.executedAt))
    .limit(SEARCH_RUNS_BY_CASE_LIMIT);
}

/** IDで検索実行を1件取得する。存在しない場合はundefinedを返す。 */
export async function getSearchRunById(searchRunId: string): Promise<SearchRunRow | undefined> {
  const { db } = await import("@/db/client");
  const rows = await db.select().from(searchRuns).where(eq(searchRuns.id, searchRunId)).limit(1);
  return rows[0];
}

/** 検索実行に紐づく検索結果を、patentsとJOINしてrank順に取得する。 */
export async function getSearchResultsByRun(searchRunId: string): Promise<SearchResultItem[]> {
  const { db } = await import("@/db/client");
  return db
    .select({
      patentId: patents.id,
      publicationNumber: patents.publicationNumber,
      title: patents.title,
      abstract: patents.abstract,
      assignees: patents.assignees,
      publicationDate: patents.publicationDate,
      rank: searchResults.rank,
      matchedTerms: searchResults.matchedTerms,
    })
    .from(searchResults)
    .innerJoin(patents, eq(searchResults.patentId, patents.id))
    .where(eq(searchResults.searchRunId, searchRunId))
    .orderBy(asc(searchResults.rank));
}

/**
 * 検索実行で実際に使用された検索語のテキスト一覧を取得する。
 * `search_run_terms` を `search_terms` とJOINして解決する（既存の
 * `getSearchResultsByRun` と同じJOINパターン）。順序は保証しない。
 */
export async function getSearchTermTextsByRun(searchRunId: string): Promise<string[]> {
  const { db } = await import("@/db/client");
  const rows = await db
    .select({ text: searchTerms.text })
    .from(searchRunTerms)
    .innerJoin(searchTerms, eq(searchRunTerms.searchTermId, searchTerms.id))
    .where(eq(searchRunTerms.searchRunId, searchRunId));
  return rows.map((row) => row.text);
}
