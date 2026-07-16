import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { createCase, updateCaseMemo } from "@/features/cases/actions";
import { db } from "@/db/client";
import { cases } from "@/db/schema";

function buildFormData(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe("createCase", () => {
  it("案件名が空文字のときバリデーションエラーを返し、DBに保存しない", async () => {
    const formData = buildFormData({
      name: "",
      referenceNumber: "REF-001",
      technicalField: "",
      memo: "",
    });

    const result = await createCase({}, formData);

    expect(result.errors?.name).toBeDefined();
    const rows = await db.select().from(cases);
    expect(rows).toHaveLength(0);
  });

  it("案件名が空白のみのときバリデーションエラーを返す", async () => {
    const formData = buildFormData({ name: "   " });

    const result = await createCase({}, formData);

    expect(result.errors?.name).toBeDefined();
  });

  it("正常系: 案件をDBに保存し、詳細ページへredirectする", async () => {
    const formData = buildFormData({
      name: "新規案件",
      referenceNumber: "REF-100",
      technicalField: "画像処理",
      memo: "秘密情報は入れない",
    });

    await expect(createCase({}, formData)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    const rows = await db.select().from(cases);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "新規案件",
      referenceNumber: "REF-100",
      technicalField: "画像処理",
      memo: "秘密情報は入れない",
    });
  });

  it("任意項目が空文字のときnullとして保存する", async () => {
    const formData = buildFormData({
      name: "最小限の案件",
      referenceNumber: "",
      technicalField: "",
      memo: "",
    });

    await expect(createCase({}, formData)).rejects.toThrow();

    const rows = await db.select().from(cases);
    const created = rows.find((row) => row.name === "最小限の案件");
    expect(created?.referenceNumber).toBeNull();
    expect(created?.technicalField).toBeNull();
    expect(created?.memo).toBeNull();
  });

  it("redirect先のURLが作成された案件の詳細ページになっている", async () => {
    const formData = buildFormData({ name: "リダイレクト確認用" });

    let digest = "";
    try {
      await createCase({}, formData);
    } catch (error) {
      digest = (error as { digest?: string }).digest ?? "";
    }

    const rows = await db.select().from(cases);
    const created = rows.find((row) => row.name === "リダイレクト確認用");
    expect(created).toBeDefined();
    expect(digest).toContain(`/cases/${created?.id}`);
  });
});

describe("updateCaseMemo", () => {
  it("メモを更新する", async () => {
    await db.insert(cases).values({ id: "case-memo", name: "メモ更新対象" });

    const result = await updateCaseMemo("case-memo", "更新後のメモ");

    expect(result.memo).toBe("更新後のメモ");
    const rows = await db.select().from(cases);
    const updated = rows.find((row) => row.id === "case-memo");
    expect(updated?.memo).toBe("更新後のメモ");
  });

  it("空文字のメモはnullとして保存する", async () => {
    await db.insert(cases).values({ id: "case-memo-2", name: "メモ削除対象", memo: "元のメモ" });

    const result = await updateCaseMemo("case-memo-2", "   ");

    expect(result.memo).toBeNull();
  });
});
