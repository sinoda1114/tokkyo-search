import { BigQuery } from "@google-cloud/bigquery";
import { env } from "@/lib/env";
import type { BuiltQuery } from "@/features/patent-search/query-builder";
import { assertWithinBudget } from "./cost-guard";

export interface QueryExecutionResult<T> {
  rows: T[];
  totalBytesProcessed: number;
}

/** サービスアカウントキーJSONのうち、認証に必要な最小限の形。 */
interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/** dryRun/実行ジョブのmetadataから読み取りたい統計情報の最小限の形。 */
interface QueryJobMetadata {
  statistics?: {
    query?: {
      totalBytesProcessed?: string;
      totalBytesBilled?: string;
    };
  };
}

function isServiceAccountKey(value: unknown): value is ServiceAccountKey {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.client_email === "string" && typeof record.private_key === "string";
}

function parseServiceAccountKey(base64Key: string): ServiceAccountKey {
  const json = Buffer.from(base64Key, "base64").toString("utf-8");
  const parsed: unknown = JSON.parse(json);
  if (!isServiceAccountKey(parsed)) {
    throw new Error(
      "GCP_SERVICE_ACCOUNT_KEY のデコード結果が不正です（client_email/private_keyを含むJSONが必要）",
    );
  }
  return parsed;
}

let cachedClient: BigQuery | undefined;

/**
 * BigQueryクライアントを遅延初期化して返す。
 * モジュールimport時にはenvへアクセスしない（テストでのimportを壊さないため）。
 */
export function getBigQueryClient(): BigQuery {
  if (cachedClient) return cachedClient;
  const credentials = parseServiceAccountKey(env.GCP_SERVICE_ACCOUNT_KEY);
  cachedClient = new BigQuery({
    projectId: env.GCP_PROJECT_ID,
    credentials,
  });
  return cachedClient;
}

function readTotalBytes(metadata: QueryJobMetadata, field: "totalBytesBilled" | "totalBytesProcessed"): number {
  const value = metadata.statistics?.query?.[field];
  return value ? Number(value) : 0;
}

/** dryRun実行でクエリのスキャン見積もりバイト数を取得する（実クエリは実行しない）。 */
export async function estimateQueryBytes(query: BuiltQuery): Promise<number> {
  const client = getBigQueryClient();
  const [job] = await client.createQueryJob({
    query: query.sql,
    params: query.params,
    dryRun: true,
  });
  const metadata = job.metadata as QueryJobMetadata;
  return readTotalBytes(metadata, "totalBytesProcessed");
}

/**
 * 検索クエリを実行する。実行前に必ず見積もり→予算チェックを行い、
 * 上限超過時はBigQueryCostLimitErrorを投げて実クエリを実行しない。
 */
export async function runSearchQuery<T = Record<string, unknown>>(
  query: BuiltQuery,
): Promise<QueryExecutionResult<T>> {
  const estimatedBytes = await estimateQueryBytes(query);
  assertWithinBudget(estimatedBytes, env.BQ_MAX_BYTES_BILLED);

  const client = getBigQueryClient();
  const [job] = await client.createQueryJob({
    query: query.sql,
    params: query.params,
    maximumBytesBilled: String(env.BQ_MAX_BYTES_BILLED),
  });
  const [rows] = await job.getQueryResults();
  const metadata = job.metadata as QueryJobMetadata;
  const totalBytesProcessed =
    readTotalBytes(metadata, "totalBytesBilled") || readTotalBytes(metadata, "totalBytesProcessed");

  return { rows: rows as T[], totalBytesProcessed };
}
