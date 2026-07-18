import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { createCase, deleteCase, updateCase, updateCaseMemo } from "@/features/cases/actions";
import { db } from "@/db/client";
import { casePatents, cases, llmLogs, patents, searchRuns, searchTerms } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  it("案件名が201文字のときバリデーションエラーを返す", async () => {
    const formData = buildFormData({ name: "あ".repeat(201) });

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

  it("5001文字のメモは例外を投げる", async () => {
    await db.insert(cases).values({ id: "case-memo-3", name: "メモ上限対象" });

    await expect(updateCaseMemo("case-memo-3", "あ".repeat(5001))).rejects.toThrow();
  });
});

describe("updateCase", () => {
  it("案件名・管理番号・技術分野を更新する", async () => {
    await db.insert(cases).values({
      id: "case-edit-1",
      name: "旧案件名",
      referenceNumber: "OLD-001",
      technicalField: "旧分野",
    });

    await updateCase("case-edit-1", {
      name: "新案件名",
      referenceNumber: "NEW-001",
      technicalField: "新分野",
    });

    const rows = await db.select().from(cases).where(eq(cases.id, "case-edit-1"));
    expect(rows[0]).toMatchObject({
      name: "新案件名",
      referenceNumber: "NEW-001",
      technicalField: "新分野",
    });
  });

  it("案件名が空文字のとき例外を投げ、DBを更新しない", async () => {
    await db.insert(cases).values({ id: "case-edit-2", name: "元の名前" });

    await expect(
      updateCase("case-edit-2", { name: "", referenceNumber: "", technicalField: "" }),
    ).rejects.toThrow();

    const rows = await db.select().from(cases).where(eq(cases.id, "case-edit-2"));
    expect(rows[0].name).toBe("元の名前");
  });

  it("案件名が201文字のとき例外を投げる", async () => {
    await db.insert(cases).values({ id: "case-edit-3", name: "元の名前" });

    await expect(updateCase("case-edit-3", { name: "あ".repeat(201) })).rejects.toThrow();
  });

  it("管理番号・技術分野を空文字にするとnullとして保存する", async () => {
    await db.insert(cases).values({
      id: "case-edit-4",
      name: "更新対象",
      referenceNumber: "REF-EXIST",
      technicalField: "分野EXIST",
    });

    await updateCase("case-edit-4", {
      name: "更新対象",
      referenceNumber: "",
      technicalField: "",
    });

    const rows = await db.select().from(cases).where(eq(cases.id, "case-edit-4"));
    expect(rows[0].referenceNumber).toBeNull();
    expect(rows[0].technicalField).toBeNull();
  });

  it("referenceNumber/technicalFieldを省略した場合はnullとして保存する", async () => {
    await db.insert(cases).values({
      id: "case-edit-5",
      name: "更新対象2",
      referenceNumber: "REF-EXIST-2",
    });

    await updateCase("case-edit-5", { name: "更新対象2（改）" });

    const rows = await db.select().from(cases).where(eq(cases.id, "case-edit-5"));
    expect(rows[0]).toMatchObject({
      name: "更新対象2（改）",
      referenceNumber: null,
      technicalField: null,
    });
  });
});

describe("deleteCase", () => {
  it("案件を削除し、/cases一覧へredirectする", async () => {
    await db.insert(cases).values({ id: "case-delete-1", name: "削除対象" });

    await expect(deleteCase("case-delete-1")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    await expect(deleteCase("case-delete-1")).rejects.toMatchObject({
      digest: expect.stringContaining("/cases"),
    });

    const rows = await db.select().from(cases).where(eq(cases.id, "case-delete-1"));
    expect(rows).toHaveLength(0);
  });

  it("関連するsearch_terms・search_runs・case_patentsもカスケード削除される", async () => {
    await db.insert(cases).values({ id: "case-delete-2", name: "削除対象2" });
    await db.insert(patents).values({ id: "patent-delete-2", publicationNumber: "JP-DEL-2-A" });
    await db.insert(searchTerms).values({
      id: "term-delete-2",
      caseId: "case-delete-2",
      termType: "original",
      text: "削除確認語",
    });
    await db.insert(searchRuns).values({
      id: "run-delete-2",
      caseId: "case-delete-2",
      conditions: { dateFrom: "2020-01-01", dateTo: "2020-12-31", terms: ["削除確認語"] },
      status: "success",
      resultCount: 0,
    });
    await db.insert(casePatents).values({
      caseId: "case-delete-2",
      patentId: "patent-delete-2",
      status: "important",
    });

    await expect(deleteCase("case-delete-2")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    expect(await db.select().from(searchTerms).where(eq(searchTerms.caseId, "case-delete-2"))).toHaveLength(0);
    expect(await db.select().from(searchRuns).where(eq(searchRuns.caseId, "case-delete-2"))).toHaveLength(0);
    expect(
      await db.select().from(casePatents).where(eq(casePatents.caseId, "case-delete-2")),
    ).toHaveLength(0);
  });

  it("FK制約がないllm_logsも手動削除で除去される", async () => {
    await db.insert(cases).values({ id: "case-delete-3", name: "削除対象3" });
    await db.insert(llmLogs).values({
      id: "log-delete-3",
      kind: "expansion",
      caseId: "case-delete-3",
      requestPayload: "{}",
      model: "test-model",
    });

    await expect(deleteCase("case-delete-3")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    expect(await db.select().from(llmLogs).where(eq(llmLogs.caseId, "case-delete-3"))).toHaveLength(0);
  });

  it("存在しないcaseIdでも例外を投げずにredirectする（冪等）", async () => {
    await expect(deleteCase("case-does-not-exist")).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
});
