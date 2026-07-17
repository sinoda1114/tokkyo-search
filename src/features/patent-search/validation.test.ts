import { describe, expect, it } from "vitest";
import { collectFieldErrors, searchRequestSchema } from "./validation";

const baseInput = {
  termIds: ["term-1"],
  dateFrom: "2000-01-01",
  dateTo: "2024-12-31",
};

describe("searchRequestSchema", () => {
  it("accepts a valid request", () => {
    const result = searchRequestSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("rejects when termIds is empty", () => {
    const result = searchRequestSchema.safeParse({ ...baseInput, termIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).termIds).toBe("検索語を1件以上選択してください");
    }
  });

  it("rejects when dateFrom is missing", () => {
    const result = searchRequestSchema.safeParse({ ...baseInput, dateFrom: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).dateFrom).toBeDefined();
    }
  });

  it("rejects when dateTo is missing", () => {
    const result = searchRequestSchema.safeParse({ ...baseInput, dateTo: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(collectFieldErrors(result.error).dateTo).toBeDefined();
    }
  });

  it("rejects when dateFrom has an invalid format", () => {
    const result = searchRequestSchema.safeParse({ ...baseInput, dateFrom: "2000/01/01" });
    expect(result.success).toBe(false);
  });

  it("rejects when dateFrom is after dateTo", () => {
    const result = searchRequestSchema.safeParse({
      ...baseInput,
      dateFrom: "2024-12-31",
      dateTo: "2000-01-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = collectFieldErrors(result.error);
      expect(fieldErrors.dateTo).toBe("検索対象期間の終了日は開始日以降の日付を指定してください");
    }
  });

  it("accepts when dateFrom equals dateTo", () => {
    const result = searchRequestSchema.safeParse({ ...baseInput, dateFrom: "2020-01-01", dateTo: "2020-01-01" });
    expect(result.success).toBe(true);
  });

  it("treats blank assignee/ipcPrefix as undefined", () => {
    const result = searchRequestSchema.safeParse({ ...baseInput, assignee: "  ", ipcPrefix: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assignee).toBeUndefined();
      expect(result.data.ipcPrefix).toBeUndefined();
    }
  });
});

describe("collectFieldErrors", () => {
  it("keeps only the first error message per field", () => {
    const result = searchRequestSchema.safeParse({ termIds: [], dateFrom: "", dateTo: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = collectFieldErrors(result.error);
      expect(Object.keys(fieldErrors).sort()).toEqual(["dateFrom", "dateTo", "termIds"]);
    }
  });
});
