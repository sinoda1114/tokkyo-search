import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { env } from "@/lib/env";

function createDb() {
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  return drizzle(client, { schema });
}

// Next.js（Turbopack）はServer ComponentsとRoute Handlersを別モジュールレイヤーとして
// バンドルするため、同一プロセス内でもこのファイルが複数回評価され、対策なしでは
// `db`が別々のSQLiteコネクションになる。ファイルDB（libsql `file:`）でこれが起きると、
// 片方の接続でのinsert直後にもう片方の接続からSELECTすると反映前の状態が読めてしまい、
// 「検索実行後に結果ページが404になる」といった書き込み直後の可視性ラグを引き起こす。
// globalThisにキャッシュして、プロセス内では常に同一コネクションを再利用する。
declare global {
  var __tokkyoSearchDb: ReturnType<typeof createDb> | undefined;
}

export const db = globalThis.__tokkyoSearchDb ?? createDb();
globalThis.__tokkyoSearchDb = db;
export type Db = typeof db;
