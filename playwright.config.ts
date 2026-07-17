import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_DB_FILE, E2E_DIST_DIR, E2E_PORT } from "./tests/e2e/config";

/**
 * E2E（Playwright）設定。
 *
 * 重要な設計判断:
 * - BigQuery/GeminiはRoute Handler内（サーバーサイド）から呼ばれるため、ブラウザの
 *   ネットワークインターセプト（page.route）では止められない。代わりに `MOCK_EXTERNAL_APIS=1`
 *   をwebServerの環境変数として渡し、`src/lib/bigquery/client.ts` / `src/lib/gemini/client.ts`
 *   側の分岐で固定フィクスチャを返させる（実API課金・非決定性を避ける）。
 * - Turso本番DBの代わりに、E2E専用のローカルファイルDB（`file:./e2e-test.db`）を使う。
 *   `webServer.command` の中で `tests/e2e/prepare-db.ts` を `next dev` の起動前に直接実行し、
 *   マイグレーションを流してから起動する（`globalSetup` オプションは使わない。このPlaywright
 *   バージョンでは内部タスク順序上 `webServer`（プラグイン）のセットアップの方が先に走ってしまい、
 *   テーブル未作成のDBに対してNext.jsがリクエストを受け始めてしまうため）。
 * - 既存の対話的な `next dev`（既定ポート3000・既定 `.next`）と衝突しないよう、
 *   ポート・distDirともに分離する。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  timeout: 60_000,
  // devモード（Turbopack）は各ルートを初回アクセス時にオンデマンドでコンパイルするため、
  // 既定の5秒より長めに待つ（特に案件詳細など複数ページを跨ぐ主要フローの初回コンパイル分）。
  expect: { timeout: 15_000 },
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // 日本語UI前提のプロダクトのため、日付ピッカー等ロケール依存のレンダリング（年/月/日順・aria-label文言）を
    // 実際のユーザー環境に合わせる。既定（en-US）のままだとMM/DD/YYYY順・英語ラベルになりテストが実体と乖離する。
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx tests/e2e/prepare-db.ts && npm run dev -- --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      MOCK_EXTERNAL_APIS: "1",
      NEXT_DIST_DIR: E2E_DIST_DIR,
      TURSO_DATABASE_URL: `file:${E2E_DB_FILE}`,
      GCP_PROJECT_ID: "e2e-test-project",
      GCP_SERVICE_ACCOUNT_KEY: Buffer.from(
        JSON.stringify({
          client_email: "e2e-test@example.iam.gserviceaccount.com",
          private_key: "dummy",
        }),
      ).toString("base64"),
      BQ_DATASET: "patents_jp",
      GEMINI_API_KEY: "dummy-gemini-api-key",
      GEMINI_MODEL: "gemini-2.5-flash-lite",
    },
  },
});
