import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { getCaseById, getCases } from "@/features/cases/queries";
import { db } from "@/db/client";
import { cases } from "@/db/schema";

describe("getCases", () => {
  it("案件が0件のとき空配列を返す", async () => {
    const result = await getCases();
    expect(result).toEqual([]);
  });

  it("更新日時の降順で案件を返す", async () => {
    await db.insert(cases).values({
      id: "case-old",
      name: "古い案件",
      updatedAt: new Date("2024-01-01T00:00:00Z"),
    });
    await db.insert(cases).values({
      id: "case-new",
      name: "新しい案件",
      updatedAt: new Date("2024-06-01T00:00:00Z"),
    });

    const result = await getCases();
    expect(result.map((c) => c.id)).toEqual(["case-new", "case-old"]);
  });
});

describe("getCaseById", () => {
  it("存在するcaseIdで案件を返す", async () => {
    await db.insert(cases).values({
      id: "case-1",
      name: "テスト案件",
      referenceNumber: "REF-001",
      technicalField: "半導体",
    });

    const result = await getCaseById("case-1");
    expect(result).toMatchObject({
      id: "case-1",
      name: "テスト案件",
      referenceNumber: "REF-001",
      technicalField: "半導体",
    });
  });

  it("存在しないcaseIdでundefinedを返す", async () => {
    const result = await getCaseById("does-not-exist");
    expect(result).toBeUndefined();
  });
});
