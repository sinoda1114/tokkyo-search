import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { patents } from "@/db/schema";
import { runSearchQuery } from "@/lib/bigquery/client";
import { buildClaimsLookupQuery } from "@/features/patent-search/query-builder";

/** `buildClaimsLookupQuery` の結果1行の形。 */
interface ClaimsLookupRow {
  claims_ja: string | null;
}

/**
 * 特許の請求項全文（claims_ja）を取得する。
 *
 * 処理の流れ:
 * 1. `patents.claimsText` が既に保存されていればそれをそのまま返す（BigQueryを叩かない）。
 * 2. なければBigQueryへ軽量クエリ（claims_jaのみ）を発行し、取得できたら
 *    `patents.claimsText` を更新してから返す。
 * 3. 取得できなかった場合（該当データなし、またはclaims_jaがnull）はnullを返し、
 *    DBは更新しない（次回また取得を試せるようにするため）。
 */
export async function fetchAndCacheClaims(patentId: string): Promise<string | null> {
  const { db } = await import("@/db/client");

  const rows = await db.select().from(patents).where(eq(patents.id, patentId)).limit(1);
  const patent = rows[0];
  if (!patent) {
    return null;
  }
  if (patent.claimsText) {
    return patent.claimsText;
  }

  const query = buildClaimsLookupQuery(env.GCP_PROJECT_ID, env.BQ_DATASET, patent.publicationNumber);
  const result = await runSearchQuery<ClaimsLookupRow>(query);
  const claimsText = result.rows[0]?.claims_ja ?? null;
  if (!claimsText) {
    return null;
  }

  await db.update(patents).set({ claimsText }).where(eq(patents.id, patentId));
  return claimsText;
}
