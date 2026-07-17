/**
 * E2E（Playwright）専用の定数。
 * `playwright.config.ts` と `global-setup.ts` の両方から参照するためここに集約する。
 */

/** E2E実行中だけ使うNext.jsの待受ポート。開発中の `next dev`（既定3000番）と衝突しないようにする。 */
export const E2E_PORT = 3100;

export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** E2E専用のローカルファイルDB（libsql）。実行のたびに `global-setup.ts` が作り直す。 */
export const E2E_DB_FILE = "./e2e-test.db";

/**
 * E2E実行中だけNext.jsのビルド出力先を分離するディレクトリ名。
 * 既存の対話的な `next dev`（既定 `.next`）を壊さないための隔離（`next.config.ts` の `NEXT_DIST_DIR` 参照）。
 */
export const E2E_DIST_DIR = ".next-e2e";
