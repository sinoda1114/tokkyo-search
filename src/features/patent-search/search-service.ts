import { eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { patents, searchResults, searchRunTerms, searchRuns, searchTerms } from "@/db/schema";
import { runSearchQuery } from "@/lib/bigquery/client";
import { BigQueryCostLimitError } from "@/lib/bigquery/cost-guard";
import { buildSearchQuery, type SearchConditions } from "./query-builder";
import { SearchValidationError } from "./errors";

type SearchTermRow = typeof searchTerms.$inferSelect;

export interface RunSearchInput {
  caseId: string;
  termIds: string[];
  dateFrom: string;
  dateTo: string;
  searchClaims?: boolean;
  assignee?: string;
  ipcPrefix?: string;
}

export interface RunSearchResult {
  searchRunId: string;
  resultCount: number;
  bytesBilled: number;
}

/** BigQueryのDATE型は `{ value: string }` 形式で返る場合がある（プレーン文字列の場合もある）。 */
type BigQueryDateLike = string | { value: string } | null | undefined;

/** BigQueryクエリ結果1行の形（`query-builder.ts` の `SEARCH_COLUMNS` と対応する）。 */
interface PublicationRow {
  publication_number: string;
  application_number: string | null;
  country_code: string | null;
  kind_code: string | null;
  publication_date: BigQueryDateLike;
  filing_date: BigQueryDateLike;
  title_ja: string | null;
  abstract_ja: string | null;
  assignees: string[] | null;
  ipc_codes: string[] | null;
  cpc_codes: string[] | null;
  cited_publications: string[] | null;
  /** LIMIT適用前の総ヒット件数（`query-builder.ts`のCOUNT(*) OVER()ウィンドウ関数で取得）。 */
  total_match_count: number;
}

function normalizeBigQueryDate(value: BigQueryDateLike): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.value === "string") return value.value;
  return null;
}

/** テキストに実際に含まれる検索語だけを抽出する（表示用の「使用検索語」情報として保存する）。 */
function findMatchedTerms(row: PublicationRow, termTexts: string[]): string[] {
  const haystack = `${row.title_ja ?? ""} ${row.abstract_ja ?? ""}`;
  return termTexts.filter((term) => haystack.includes(term));
}

/**
 * `parentTermId`をルート（`parentTermId`がnullの行）まで辿り、そのルートのidを返す。
 * `allTermsById`には案件内の全検索語を渡すこと（選択されていない親を辿るために必要）。
 * 循環参照（データ不整合）が万一あってもハングしないよう既訪問idはガードする。
 */
function resolveRootId(term: SearchTermRow, allTermsById: Map<string, SearchTermRow>): string {
  let current: SearchTermRow = term;
  const visited = new Set<string>([current.id]);
  while (current.parentTermId) {
    const parent = allTermsById.get(current.parentTermId);
    if (!parent || visited.has(parent.id)) {
      break;
    }
    visited.add(parent.id);
    current = parent;
  }
  return current.id;
}

/**
 * 選択された検索語（`orderedTerms`）を概念グループ（ルートが同じもの同士）にまとめる。
 * グループの順序・グループ内の語の順序は、いずれも`orderedTerms`の並び順（＝選択順）に従う。
 */
function groupTermsByRoot(
  orderedTerms: SearchTermRow[],
  allTermsById: Map<string, SearchTermRow>,
): string[][] {
  const groupOrder: string[] = [];
  const textsByRootId = new Map<string, string[]>();

  for (const term of orderedTerms) {
    const rootId = resolveRootId(term, allTermsById);
    if (!textsByRootId.has(rootId)) {
      textsByRootId.set(rootId, []);
      groupOrder.push(rootId);
    }
    textsByRootId.get(rootId)!.push(term.text);
  }

  return groupOrder.map((rootId) => textsByRootId.get(rootId)!);
}

/**
 * 案件・検索語・検索条件からBigQuery検索を実行し、結果をDBへ保存する。
 *
 * 処理の流れ:
 * 1. termIdsから実際の検索語テキストを解決する（caseIdに紐づかないIDは無視する）。
 * 2. query-builderでBigQuery向けクエリを組み立てる。
 * 3. 実行する。コスト上限超過（BigQueryCostLimitError）時は searchRuns に
 *    status: "error" で保存し、そのままエラーを再送出する。
 * 4. 成功時は結果行を patents へupsertし、searchRuns/searchRunTerms/searchResults を保存する。
 */
export async function runSearch(input: RunSearchInput): Promise<RunSearchResult> {
  const { db } = await import("@/db/client");

  const termRows = await db
    .select()
    .from(searchTerms)
    .where(inArray(searchTerms.id, input.termIds));
  const termsByCase = termRows.filter((term) => term.caseId === input.caseId);
  const termById = new Map(termsByCase.map((term) => [term.id, term]));

  // 入力された termIds の順序を保つ（BigQueryクエリの検索語パターン組み立て順に影響するため）。
  const orderedTerms = input.termIds
    .map((id) => termById.get(id))
    .filter((term): term is (typeof termsByCase)[number] => term !== undefined);

  if (orderedTerms.length === 0) {
    throw new SearchValidationError(
      "検索語が選択されていません。案件に紐づく検索語を1件以上選択してください。",
    );
  }

  // グループ化（AND検索）のためには、選択されていない語であっても親を辿れる必要があるため、
  // 案件内の全検索語を別途取得する（選択語だけでは親が欠けて根まで辿れない場合がある）。
  const allCaseTerms = await db
    .select()
    .from(searchTerms)
    .where(eq(searchTerms.caseId, input.caseId));
  const allTermsById = new Map(allCaseTerms.map((term) => [term.id, term]));

  const termTexts = orderedTerms.map((term) => term.text);
  const termGroups = groupTermsByRoot(orderedTerms, allTermsById);
  const conditions: SearchConditions = {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    termGroups,
    searchClaims: input.searchClaims,
    assignee: input.assignee,
    ipcPrefix: input.ipcPrefix,
  };

  const query = buildSearchQuery(env.GCP_PROJECT_ID, env.BQ_DATASET, conditions);
  const searchRunId = nanoid();

  try {
    const executionResult = await runSearchQuery<PublicationRow>(query);
    const rows = executionResult.rows;

    const patentValues = rows.map((row) => ({
      id: nanoid(),
      publicationNumber: row.publication_number,
      applicationNumber: row.application_number ?? null,
      countryCode: row.country_code ?? null,
      kindCode: row.kind_code ?? null,
      title: row.title_ja ?? null,
      abstract: row.abstract_ja ?? null,
      assignees: row.assignees ?? null,
      ipcCodes: row.ipc_codes ?? null,
      cpcCodes: row.cpc_codes ?? null,
      citedPublications: row.cited_publications ?? null,
      publicationDate: normalizeBigQueryDate(row.publication_date),
      filingDate: normalizeBigQueryDate(row.filing_date),
    }));

    const patentIdByPublicationNumber = new Map<string, string>();
    if (patentValues.length > 0) {
      const upserted = await db
        .insert(patents)
        .values(patentValues)
        .onConflictDoUpdate({
          target: patents.publicationNumber,
          set: {
            applicationNumber: sql`excluded.application_number`,
            countryCode: sql`excluded.country_code`,
            kindCode: sql`excluded.kind_code`,
            title: sql`excluded.title`,
            abstract: sql`excluded.abstract`,
            assignees: sql`excluded.assignees`,
            ipcCodes: sql`excluded.ipc_codes`,
            cpcCodes: sql`excluded.cpc_codes`,
            citedPublications: sql`excluded.cited_publications`,
            publicationDate: sql`excluded.publication_date`,
            filingDate: sql`excluded.filing_date`,
            fetchedAt: sql`(unixepoch())`,
          },
        })
        .returning({ id: patents.id, publicationNumber: patents.publicationNumber });

      for (const row of upserted) {
        patentIdByPublicationNumber.set(row.publicationNumber, row.id);
      }
    }

    // total_match_countはLIMIT適用前の全体件数（COUNT(*) OVER()）。件数だけの再クエリは発行せず、
    // 本体検索と同じ1回のBigQueryクエリで取得した値をそのまま使う。結果0件のときは0とする。
    const totalMatchCount = rows[0]?.total_match_count ?? 0;
    const conditionsWithTotal: SearchConditions = { ...conditions, totalMatchCount };

    await db.insert(searchRuns).values({
      id: searchRunId,
      caseId: input.caseId,
      conditions: conditionsWithTotal,
      status: "success",
      resultCount: rows.length,
      bytesBilled: executionResult.totalBytesProcessed,
    });

    await db.insert(searchRunTerms).values(
      orderedTerms.map((term) => ({ searchRunId, searchTermId: term.id })),
    );

    if (rows.length > 0) {
      const resultValues = rows.map((row, index) => {
        const patentId = patentIdByPublicationNumber.get(row.publication_number);
        if (!patentId) {
          throw new Error(
            `patents のupsert結果に publicationNumber=${row.publication_number} が見つかりません`,
          );
        }
        return {
          searchRunId,
          patentId,
          rank: index + 1,
          matchedTerms: findMatchedTerms(row, termTexts),
        };
      });
      await db.insert(searchResults).values(resultValues);
    }

    return {
      searchRunId,
      resultCount: rows.length,
      bytesBilled: executionResult.totalBytesProcessed,
    };
  } catch (error: unknown) {
    if (error instanceof BigQueryCostLimitError) {
      await db.insert(searchRuns).values({
        id: searchRunId,
        caseId: input.caseId,
        conditions,
        status: "error",
        errorMessage: error.message,
      });
    }
    throw error;
  }
}
