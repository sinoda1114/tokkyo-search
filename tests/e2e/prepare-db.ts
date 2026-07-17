import { existsSync, rmSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { E2E_DB_FILE } from "./config";

/**
 * E2E専用のローカルSQLite(libsql)ファイルDBを毎回まっさらな状態に作り直し、
 * drizzleのマイグレーションを流す。
 *
 * 注意: Playwrightの `globalSetup` オプションは、このPlaywrightバージョンでは
 * `webServer`（プラグイン）のセットアップより後に実行される（内部タスク順序:
 * removeOutputDirs → プラグインセットアップ[webServer起動を含む] → globalTeardown → globalSetup）。
 * そのため `globalSetup` に頼るとNext.jsサーバーがテーブル未作成のDBに対してリクエストを
 * 受け始めてしまう。代わりに、`playwright.config.ts` の `webServer.command` からこのスクリプトを
 * `next dev` の起動より前に直接実行する（`npx tsx tests/e2e/prepare-db.ts && next dev ...`）。
 */
async function prepareDb(): Promise<void> {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const path = `${E2E_DB_FILE}${suffix}`;
    if (existsSync(path)) {
      rmSync(path);
    }
  }

  const client = createClient({ url: `file:${E2E_DB_FILE}` });
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle" });
  } finally {
    client.close();
  }
}

prepareDb().catch((error: unknown) => {
  process.stderr.write(`E2E用DBの準備に失敗しました: ${String(error)}\n`);
  process.exitCode = 1;
});
