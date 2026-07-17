import { test, expect } from "@playwright/test";

/**
 * 主要フロー（案件作成 → 検索語登録 → AI展開 → 検索実行 → 特許詳細 → AI解析 → 評価）の
 * 一気通貫E2Eテスト。
 *
 * BigQuery/Geminiは `playwright.config.ts` の `webServer.env` で `MOCK_EXTERNAL_APIS=1` を
 * 設定することで、実APIを叩かずに固定フィクスチャを返す（詳細は
 * `src/lib/bigquery/client.ts` / `src/lib/gemini/client.ts` を参照）。
 */
test("案件作成から検索語登録・AI展開・検索実行・特許詳細のAI解析・評価までの一連の流れ", async ({
  page,
}) => {
  const caseName = `E2Eテスト案件 ${Date.now()}`;

  // 1. 案件作成
  await page.goto("/cases/new");
  await page.getByLabel("案件名").fill(caseName);
  await page.getByLabel("技術分野").fill("画像処理");

  await Promise.all([
    page.waitForURL(/\/cases\/[^/]+$/),
    page.getByRole("button", { name: "案件を作成" }).click(),
  ]);
  await expect(page.getByRole("heading", { level: 1, name: caseName })).toBeVisible();

  // 2. 検索語の管理へ進む
  await page.getByRole("link", { name: "検索語の管理へ進む" }).click();
  await page.waitForURL(/\/cases\/[^/]+\/terms$/);

  // 3. 検索語登録
  await page.getByPlaceholder("例: 半導体, 放熱構造").fill("放熱構造");
  await page.getByRole("button", { name: "検索語を登録" }).click();
  await expect(page.getByText("1件の検索語を登録しました。")).toBeVisible();

  const termListSection = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "登録済み検索語" }),
  });
  await expect(termListSection.getByText("放熱構造", { exact: true })).toBeVisible();

  // 4. AI展開を実行（Geminiはモックされ、固定候補が返る）
  const [expansionResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/expansions") && response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "AI展開を実行" }).click(),
  ]);
  expect(expansionResponse.ok()).toBeTruthy();

  await expect(
    page.getByRole("checkbox", { name: "[類義語] 放熱機構（由来: 放熱構造）" }),
  ).toBeVisible();

  // 提案された候補（全件デフォルト選択済み）をそのまま保存する
  // AI由来の検索語チップには視覚的な区別のため「AI: 」プレフィックスが付く。
  await page.getByRole("button", { name: "選択した候補を保存" }).click();
  await expect(termListSection.getByText("AI: 放熱機構", { exact: true })).toBeVisible();
  await expect(termListSection.getByText("AI: 冷却構造", { exact: true })).toBeVisible();

  // 5. 検索実行（BigQueryはモックされ、固定の検索結果1件が返る）
  const searchSection = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "公開特許検索を実行" }),
  });
  // Checkboxのinput自体は視覚的に隠されており(clip-path)、直接の`.check()`はポインタ
  // イベントの奪い合いで不安定になるため、可視のラベルテキストをクリックして切り替える。
  await searchSection.getByText("[入力語] 放熱構造", { exact: true }).click();
  await searchSection.getByText("[類義語] 放熱機構", { exact: true }).click();
  // HeroUI DateRangePickerはネイティブ<input type="date">ではなく年/月/日のspinbuttonで構成される。
  // 各spinbuttonへキー入力すると自動的に次のセグメントへフォーカスが送られる。
  await page.getByRole("spinbutton", { name: /^年, 開始日,/ }).click();
  await page.keyboard.type("2019");
  await page.keyboard.type("01");
  await page.keyboard.type("01");
  await page.keyboard.type("2021");
  await page.keyboard.type("01");
  await page.keyboard.type("01");

  await Promise.all([
    page.waitForURL(/\/cases\/[^/]+\/runs\/[^/]+$/),
    page.getByRole("button", { name: "検索を実行" }).click(),
  ]);

  // 6. 検索実行結果（固定フィクスチャの特許1件が表示される）
  // タイトルが主導線のLinkになっており、出願番号は補助表示（非リンク）。
  await expect(page.getByRole("heading", { level: 1, name: "検索実行結果" })).toBeVisible();
  const patentLink = page.getByRole("link", { name: "半導体パッケージの放熱構造" });
  await expect(patentLink).toBeVisible();
  await expect(page.getByText("JP2020-000001A")).toBeVisible();

  // 7. 特許詳細へ
  await patentLink.click();
  await page.waitForURL(/\/cases\/[^/]+\/patents\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "半導体パッケージの放熱構造" }),
  ).toBeVisible();

  // 8. AI文献解析を実行（Geminiはモックされ、固定の解析結果が返る）
  const [analysisResponse] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes("/analysis") && response.request().method() === "POST",
    ),
    page.getByRole("button", { name: "AI解析を実行" }).click(),
  ]);
  expect(analysisResponse.ok()).toBeTruthy();
  await expect(
    page.getByText("半導体パッケージの放熱構造に関する発明の概要（E2Eテスト用フィクスチャ）。"),
  ).toBeVisible();

  // 9. 評価（重要としてマークする）
  const evaluationSection = page.locator("section", {
    has: page.getByRole("heading", { level: 2, name: "評価" }),
  });
  await evaluationSection.getByRole("button", { name: "重要" }).click();
  await expect(evaluationSection.getByText("評価: 重要")).toBeVisible();
});
