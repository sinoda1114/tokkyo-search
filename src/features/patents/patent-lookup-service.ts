import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { env } from "@/lib/env";
import { patents } from "@/db/schema";
import { runSearchQuery } from "@/lib/bigquery/client";
import type { BuiltQuery } from "@/features/patent-search/query-builder";

/**
 * 公開番号から特許1件を直接取得するためのBigQueryクエリ。
 *
 * `query-builder.ts` の `buildSearchQuery` / `buildClaimsLookupQuery` と同じ設計制約に従う
 * （識別子はホワイトリスト検証、ユーザー入力はパラメータ経由、claims_jaはSELECTに含めない）。
 * `buildClaimsLookupQuery` と同様、単一publicationNumberの完全一致・LIMIT 1のため
 * 日付範囲（パーティションプルーニング）は要求しない。
 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const LOOKUP_COLUMNS = [
  "publication_number",
  "application_number",
  "country_code",
  "kind_code",
  "publication_date",
  "filing_date",
  "title_ja",
  "abstract_ja",
  "assignees",
  "ARRAY(SELECT DISTINCT c FROM UNNEST(ipc_codes) AS c) AS ipc_codes",
  "ARRAY(SELECT DISTINCT c FROM UNNEST(cpc_codes) AS c) AS cpc_codes",
  "cited_publications",
] as const;

function validateIdentifier(value: string, label: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `${label} に使用できない文字が含まれています（英数字・アンダースコア・ハイフンのみ許可）: ${value}`,
    );
  }
}

export function buildPatentLookupQuery(
  projectId: string,
  dataset: string,
  publicationNumber: string,
): BuiltQuery {
  validateIdentifier(projectId, "projectId");
  validateIdentifier(dataset, "dataset");
  if (!publicationNumber || publicationNumber.trim() === "") {
    throw new Error("publicationNumber は必須です");
  }

  const tableRef = `\`${projectId}.${dataset}.publications\``;
  const sql = [
    `SELECT ${LOOKUP_COLUMNS.join(", ")}`,
    `FROM ${tableRef}`,
    "WHERE publication_number = @publicationNumber",
    "LIMIT 1",
  ].join("\n");

  return { sql, params: { publicationNumber: publicationNumber.trim() } };
}

/** BigQueryのDATE型は `{ value: string }` 形式で返る場合がある（プレーン文字列の場合もある）。 */
type BigQueryDateLike = string | { value: string } | null | undefined;

/** `buildPatentLookupQuery` の結果1行の形（`LOOKUP_COLUMNS` と対応する）。 */
interface PatentLookupRow {
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
}

function normalizeBigQueryDate(value: BigQueryDateLike): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && typeof value.value === "string") return value.value;
  return null;
}

export interface PatentLookupResult {
  patentId: string;
}

/**
 * 公開番号から特許を直接取得する。
 *
 * AI解析結果の「引用文献」は公開番号の文字列（例:"JP2015-000123A"）であり、タイトル・要約への
 * 正規表現検索語としては機能しない。ユーザーが引用文献の公開番号から直接特許詳細へ遷移できるように
 * するための専用ルックアップ（`/api/patents/lookup` から呼ばれる）。
 *
 * 処理の流れ:
 * 1. `patents.publicationNumber` に既に一致する行があればそれを返す（BigQueryを叩かない）。
 * 2. 無ければBigQueryへ単一publicationNumberでの軽量クエリ（LIMIT 1）を投げる。
 * 3. 取得できた場合は `patents` へupsertし、そのpatentIdを返す
 *    （`search-service.ts` の既存upsertパターンと同様、`publicationNumber` UNIQUE制約を
 *    conflict targetにして重複挿入を防ぐ）。
 * 4. BigQueryでも見つからない場合はnullを返す。
 */
export async function lookupPatentByPublicationNumber(
  publicationNumber: string,
): Promise<PatentLookupResult | null> {
  const { db } = await import("@/db/client");

  const existing = await db
    .select()
    .from(patents)
    .where(eq(patents.publicationNumber, publicationNumber))
    .limit(1);
  if (existing[0]) {
    return { patentId: existing[0].id };
  }

  const query = buildPatentLookupQuery(env.GCP_PROJECT_ID, env.BQ_DATASET, publicationNumber);
  const result = await runSearchQuery<PatentLookupRow>(query);
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const upserted = await db
    .insert(patents)
    .values({
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
    })
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
    .returning({ id: patents.id });

  const patentId = upserted[0]?.id;
  if (!patentId) {
    throw new Error("patents のupsertに失敗しました（publicationNumber: " + publicationNumber + "）");
  }

  return { patentId };
}
