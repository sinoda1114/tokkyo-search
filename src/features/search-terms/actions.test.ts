import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import {
  addResearchTerms,
  addSearchTerms,
  saveSelectedExpansions,
} from "@/features/search-terms/actions";
import { db } from "@/db/client";
import { cases, searchTerms } from "@/db/schema";
import { eq } from "drizzle-orm";

async function seedCase(caseId: string): Promise<void> {
  await db.insert(cases).values({ id: caseId, name: "テスト案件" });
}

describe("addSearchTerms", () => {
  it("複数の検索語を termType: original, source: user として保存する", async () => {
    await seedCase("case-1");

    const result = await addSearchTerms("case-1", ["半導体", "パッケージ"]);

    expect(result.insertedCount).toBe(2);
    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-1"));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.termType === "original" && r.source === "user")).toBe(true);
    expect(rows.map((r) => r.text).sort()).toEqual(["パッケージ", "半導体"]);
  });

  it("前後の空白をトリムし、空文字の語は無視する", async () => {
    await seedCase("case-2");

    const result = await addSearchTerms("case-2", ["  半導体  ", "", "   "]);

    expect(result.insertedCount).toBe(1);
    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-2"));
    expect(rows.map((r) => r.text)).toEqual(["半導体"]);
  });

  it("同一案件・同一テキストの重複は無視して保存しない", async () => {
    await seedCase("case-3");
    await addSearchTerms("case-3", ["半導体"]);

    const result = await addSearchTerms("case-3", ["半導体", "新語"]);

    expect(result.insertedCount).toBe(1);
    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-3"));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.text)).toEqual(expect.arrayContaining(["新語", "半導体"]));
  });

  it("入力語がすべて空のとき何も保存しない", async () => {
    await seedCase("case-4");

    const result = await addSearchTerms("case-4", ["", "   "]);

    expect(result.insertedCount).toBe(0);
    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-4"));
    expect(rows).toHaveLength(0);
  });
});

describe("saveSelectedExpansions", () => {
  it("選択された展開候補を source: llm として保存する", async () => {
    await seedCase("case-5");

    const result = await saveSelectedExpansions("case-5", [
      { type: "synonym", text: "セミコンダクタ", sourceTerm: "半導体" },
      { type: "english", text: "semiconductor", sourceTerm: "半導体" },
    ]);

    expect(result.insertedCount).toBe(2);
    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-5"));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === "llm")).toBe(true);
    const synonymRow = rows.find((r) => r.termType === "synonym");
    expect(synonymRow?.text).toBe("セミコンダクタ");
  });

  it("同一案件・同一タイプ・同一テキストの重複は無視する", async () => {
    await seedCase("case-6");
    await saveSelectedExpansions("case-6", [
      { type: "synonym", text: "セミコンダクタ", sourceTerm: "半導体" },
    ]);

    const result = await saveSelectedExpansions("case-6", [
      { type: "synonym", text: "セミコンダクタ", sourceTerm: "半導体" },
    ]);

    expect(result.insertedCount).toBe(0);
    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-6"));
    expect(rows).toHaveLength(1);
  });

  it("選択が空配列のとき何も保存しない", async () => {
    await seedCase("case-7");

    const result = await saveSelectedExpansions("case-7", []);

    expect(result.insertedCount).toBe(0);
  });
});

describe("addResearchTerms", () => {
  it("AI解析結果から選択された語を source: analysis として保存する", async () => {
    await seedCase("case-8");

    await addResearchTerms("case-8", [
      { termType: "synonym", text: "特徴的な用語A" },
      { termType: "broader", text: "再検索候補B" },
    ]);

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-8"));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.source === "analysis")).toBe(true);
    const broaderRow = rows.find((r) => r.termType === "broader");
    expect(broaderRow?.text).toBe("再検索候補B");
  });

  it("同一案件・同一タイプ・同一テキストの重複は無視する", async () => {
    await seedCase("case-9");
    await addResearchTerms("case-9", [{ termType: "synonym", text: "重複語" }]);

    await addResearchTerms("case-9", [{ termType: "synonym", text: "重複語" }]);

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-9"));
    expect(rows).toHaveLength(1);
  });

  it("入力が空配列のとき何も保存しない（DBに触れずエラーにもならない）", async () => {
    await seedCase("case-10");

    await addResearchTerms("case-10", []);

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-10"));
    expect(rows).toHaveLength(0);
  });
});
