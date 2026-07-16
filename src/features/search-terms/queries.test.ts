import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { getSearchTermsByCase } from "@/features/search-terms/queries";
import { db } from "@/db/client";
import { cases, searchTerms, searchTermTypeValues } from "@/db/schema";

async function seedCase(caseId: string): Promise<void> {
  await db.insert(cases).values({ id: caseId, name: "テスト案件" });
}

describe("getSearchTermsByCase", () => {
  it("検索語が0件のとき、全termTypeキーを持つ空配列のオブジェクトを返す", async () => {
    await seedCase("case-empty");

    const result = await getSearchTermsByCase("case-empty");

    for (const type of searchTermTypeValues) {
      expect(result[type]).toEqual([]);
    }
  });

  it("termType別に検索語をグルーピングして返す", async () => {
    await seedCase("case-1");
    await db.insert(searchTerms).values([
      { id: "t1", caseId: "case-1", termType: "original", text: "半導体", source: "user" },
      { id: "t2", caseId: "case-1", termType: "original", text: "パッケージ", source: "user" },
      { id: "t3", caseId: "case-1", termType: "synonym", text: "セミコンダクタ", source: "llm" },
    ]);

    const result = await getSearchTermsByCase("case-1");

    expect(result.original.map((t) => t.text)).toHaveLength(2);
    expect(result.original.map((t) => t.text)).toEqual(
      expect.arrayContaining(["半導体", "パッケージ"]),
    );
    expect(result.synonym.map((t) => t.text)).toEqual(["セミコンダクタ"]);
    expect(result.broader).toEqual([]);
  });

  it("他の案件の検索語は含めない", async () => {
    await seedCase("case-a");
    await seedCase("case-b");
    await db.insert(searchTerms).values([
      { id: "ta", caseId: "case-a", termType: "original", text: "A案件語", source: "user" },
      { id: "tb", caseId: "case-b", termType: "original", text: "B案件語", source: "user" },
    ]);

    const result = await getSearchTermsByCase("case-a");

    expect(result.original.map((t) => t.text)).toEqual(["A案件語"]);
  });
});
