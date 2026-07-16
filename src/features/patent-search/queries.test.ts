import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { db } from "@/db/client";
import { cases, patents, searchResults, searchRuns } from "@/db/schema";
import {
  getSearchResultsByRun,
  getSearchRunById,
  getSearchRunsByCase,
} from "@/features/patent-search/queries";

async function seedCase(caseId: string): Promise<void> {
  await db.insert(cases).values({ id: caseId, name: "テスト案件" });
}

describe("getSearchRunsByCase", () => {
  it("案件に紐づく検索実行履歴を実行日時の降順で返す", async () => {
    await seedCase("case-1");
    await db.insert(searchRuns).values([
      {
        id: "run-old",
        caseId: "case-1",
        conditions: { dateFrom: "2000-01-01", dateTo: "2020-01-01", terms: ["a"] },
        status: "success",
        resultCount: 3,
        bytesBilled: 100,
        executedAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "run-new",
        caseId: "case-1",
        conditions: { dateFrom: "2000-01-01", dateTo: "2020-01-01", terms: ["a"] },
        status: "error",
        errorMessage: "コスト上限超過",
        executedAt: new Date("2024-06-01T00:00:00Z"),
      },
    ]);

    const result = await getSearchRunsByCase("case-1");

    expect(result.map((r) => r.id)).toEqual(["run-new", "run-old"]);
    expect(result[1].resultCount).toBe(3);
    expect(result[0].status).toBe("error");
  });

  it("他案件の検索実行履歴は含めない", async () => {
    await seedCase("case-a");
    await seedCase("case-b");
    await db.insert(searchRuns).values([
      {
        id: "run-a",
        caseId: "case-a",
        conditions: { dateFrom: "2000-01-01", dateTo: "2020-01-01", terms: ["a"] },
        status: "success",
        resultCount: 1,
      },
      {
        id: "run-b",
        caseId: "case-b",
        conditions: { dateFrom: "2000-01-01", dateTo: "2020-01-01", terms: ["a"] },
        status: "success",
        resultCount: 1,
      },
    ]);

    const result = await getSearchRunsByCase("case-a");

    expect(result.map((r) => r.id)).toEqual(["run-a"]);
  });

  it("検索実行履歴が0件のとき空配列を返す", async () => {
    await seedCase("case-empty");

    const result = await getSearchRunsByCase("case-empty");

    expect(result).toEqual([]);
  });
});

describe("getSearchRunById", () => {
  it("IDに一致する検索実行を返す", async () => {
    await seedCase("case-2");
    await db.insert(searchRuns).values({
      id: "run-2",
      caseId: "case-2",
      conditions: { dateFrom: "2000-01-01", dateTo: "2020-01-01", terms: ["半導体"] },
      status: "success",
      resultCount: 5,
      bytesBilled: 999,
    });

    const result = await getSearchRunById("run-2");

    expect(result?.id).toBe("run-2");
    expect(result?.caseId).toBe("case-2");
    expect(result?.resultCount).toBe(5);
  });

  it("存在しないIDのときundefinedを返す", async () => {
    const result = await getSearchRunById("no-such-run");
    expect(result).toBeUndefined();
  });
});

describe("getSearchResultsByRun", () => {
  it("rank順にpatentsとJOINした検索結果を返す", async () => {
    await seedCase("case-3");
    await db.insert(searchRuns).values({
      id: "run-3",
      caseId: "case-3",
      conditions: { dateFrom: "2000-01-01", dateTo: "2020-01-01", terms: ["半導体"] },
      status: "success",
      resultCount: 2,
    });
    await db.insert(patents).values([
      {
        id: "patent-1",
        publicationNumber: "JP-1",
        title: "発明1",
        assignees: ["会社A"],
        publicationDate: "2020-01-01",
        abstract: "要約1",
      },
      {
        id: "patent-2",
        publicationNumber: "JP-2",
        title: "発明2",
        assignees: ["会社B"],
        publicationDate: "2021-01-01",
        abstract: "要約2",
      },
    ]);
    await db.insert(searchResults).values([
      { searchRunId: "run-3", patentId: "patent-2", rank: 2, matchedTerms: ["半導体"] },
      { searchRunId: "run-3", patentId: "patent-1", rank: 1, matchedTerms: ["半導体"] },
    ]);

    const result = await getSearchResultsByRun("run-3");

    expect(result.map((r) => r.publicationNumber)).toEqual(["JP-1", "JP-2"]);
    expect(result[0].rank).toBe(1);
    expect(result[0].title).toBe("発明1");
    expect(result[0].matchedTerms).toEqual(["半導体"]);
  });

  it("検索結果が0件のとき空配列を返す", async () => {
    await seedCase("case-4");
    await db.insert(searchRuns).values({
      id: "run-4",
      caseId: "case-4",
      conditions: { dateFrom: "2000-01-01", dateTo: "2020-01-01", terms: ["半導体"] },
      status: "success",
      resultCount: 0,
    });

    const result = await getSearchResultsByRun("run-4");

    expect(result).toEqual([]);
  });
});
