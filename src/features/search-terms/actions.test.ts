import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import {
  addResearchTerms,
  addSearchTerms,
  deleteSearchTerm,
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

  it("101文字を超える語は保存しない", async () => {
    await seedCase("case-11");

    const result = await addSearchTerms("case-11", ["あ".repeat(101), "正常な語"]);

    expect(result.insertedCount).toBe(1);
    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-11"));
    expect(rows.map((row) => row.text)).toEqual(["正常な語"]);
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

  it("sourceTermに一致する既存の検索語をparentTermIdとして紐づける（概念グループ化）", async () => {
    await seedCase("case-12");
    const [original] = await db
      .insert(searchTerms)
      .values({ id: "original-1", caseId: "case-12", termType: "original", text: "半導体", source: "user" })
      .returning();

    await saveSelectedExpansions("case-12", [
      { type: "synonym", text: "セミコンダクタ", sourceTerm: "半導体" },
    ]);

    const rows = await db
      .select()
      .from(searchTerms)
      .where(eq(searchTerms.caseId, "case-12"));
    const child = rows.find((r) => r.text === "セミコンダクタ");
    expect(child?.parentTermId).toBe(original.id);
  });

  it("sourceTermに一致する既存の検索語が見つからない場合、parentTermIdはnullのまま保存する", async () => {
    await seedCase("case-13");

    await saveSelectedExpansions("case-13", [
      { type: "synonym", text: "セミコンダクタ", sourceTerm: "存在しない語" },
    ]);

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-13"));
    expect(rows[0]?.parentTermId).toBeNull();
  });

  it("他案件に同一テキストの検索語があってもparentTermIdとして紐づけない", async () => {
    await seedCase("case-14a");
    await seedCase("case-14b");
    await db
      .insert(searchTerms)
      .values({ id: "other-case-term", caseId: "case-14a", termType: "original", text: "半導体", source: "user" });

    await saveSelectedExpansions("case-14b", [
      { type: "synonym", text: "セミコンダクタ", sourceTerm: "半導体" },
    ]);

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-14b"));
    expect(rows[0]?.parentTermId).toBeNull();
  });
});

describe("deleteSearchTerm", () => {
  it("指定した検索語を削除する", async () => {
    await seedCase("case-20");
    await db
      .insert(searchTerms)
      .values({ id: "term-20", caseId: "case-20", termType: "original", text: "半導体", source: "user" });

    await deleteSearchTerm("case-20", "term-20");

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-20"));
    expect(rows).toHaveLength(0);
  });

  it("削除対象を親に持つ子の検索語もカスケードで削除する", async () => {
    await seedCase("case-21");
    await db.insert(searchTerms).values([
      { id: "parent-21", caseId: "case-21", termType: "original", text: "半導体", source: "user" },
      {
        id: "child-21",
        caseId: "case-21",
        termType: "synonym",
        text: "セミコンダクタ",
        source: "llm",
        parentTermId: "parent-21",
      },
      {
        id: "grandchild-21",
        caseId: "case-21",
        termType: "english",
        text: "semiconductor",
        source: "llm",
        parentTermId: "child-21",
      },
    ]);

    await deleteSearchTerm("case-21", "parent-21");

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-21"));
    expect(rows).toHaveLength(0);
  });

  it("兄弟の検索語には影響しない", async () => {
    await seedCase("case-22");
    await db.insert(searchTerms).values([
      { id: "parent-22", caseId: "case-22", termType: "original", text: "半導体", source: "user" },
      { id: "sibling-22", caseId: "case-22", termType: "original", text: "放熱構造", source: "user" },
    ]);

    await deleteSearchTerm("case-22", "parent-22");

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-22"));
    expect(rows.map((r) => r.id)).toEqual(["sibling-22"]);
  });

  it("他案件の検索語IDを指定しても削除しない（caseIdの一致を必須とする）", async () => {
    await seedCase("case-23a");
    await seedCase("case-23b");
    await db
      .insert(searchTerms)
      .values({ id: "term-23", caseId: "case-23a", termType: "original", text: "半導体", source: "user" });

    await deleteSearchTerm("case-23b", "term-23");

    const rows = await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-23a"));
    expect(rows).toHaveLength(1);
  });

  it("存在しないIDを指定してもエラーにならない", async () => {
    await seedCase("case-24");

    await expect(deleteSearchTerm("case-24", "no-such-term")).resolves.toBeUndefined();
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
