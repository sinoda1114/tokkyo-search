import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

vi.mock("@/lib/env", () => ({
  env: { GEMINI_MODEL: "gemini-2.5-flash-lite" },
}));

const { analyzePatentMock } = vi.hoisted(() => ({
  analyzePatentMock: vi.fn(),
}));

vi.mock("@/lib/gemini/client", () => ({
  analyzePatent: analyzePatentMock,
}));

import { db } from "@/db/client";
import { patentAnalyses, patents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getOrRunAnalysis } from "@/features/analysis/analysis-service";
import { GeminiRequestError, GeminiValidationError } from "@/lib/gemini/errors";
import type { AnalysisResult } from "@/lib/gemini/schemas";

const sampleResult: AnalysisResult = {
  overview: "発明の概要",
  background: "背景技術",
  problem: "課題",
  solution: "解決手段",
  effect: "効果",
  keyTerms: ["半導体"],
  searchCandidates: [{ type: "synonym", text: "セミコンダクタ" }],
  citedReferences: ["JP1999-000001A"],
};

beforeEach(() => {
  analyzePatentMock.mockReset();
});

async function insertPatent(id: string, overrides: Partial<typeof patents.$inferInsert> = {}) {
  await db.insert(patents).values({
    id,
    publicationNumber: `JP-${id}-A`,
    title: "発明の名称",
    abstract: "要約文",
    claimsText: "請求項全文",
    ...overrides,
  });
}

describe("getOrRunAnalysis", () => {
  it("既存のsuccess解析結果があれば再利用し、Geminiを呼び出さない", async () => {
    await insertPatent("patent-1");
    await db.insert(patentAnalyses).values({
      id: "analysis-1",
      patentId: "patent-1",
      model: "gemini-2.5-flash-lite",
      promptVersion: "v1",
      status: "success",
      result: sampleResult,
    });

    const result = await getOrRunAnalysis("patent-1");

    expect(result).toEqual(sampleResult);
    expect(analyzePatentMock).not.toHaveBeenCalled();
  });

  it("force=trueの場合は既存のsuccess結果があっても再実行する", async () => {
    await insertPatent("patent-2");
    await db.insert(patentAnalyses).values({
      id: "analysis-2",
      patentId: "patent-2",
      model: "gemini-2.5-flash-lite",
      promptVersion: "v1",
      status: "success",
      result: sampleResult,
    });
    const newResult: AnalysisResult = { ...sampleResult, overview: "更新後の概要" };
    analyzePatentMock.mockResolvedValue(newResult);

    const result = await getOrRunAnalysis("patent-2", true);

    expect(result).toEqual(newResult);
    expect(analyzePatentMock).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(patentAnalyses).where(eq(patentAnalyses.patentId, "patent-2"));
    expect(rows).toHaveLength(1);
    expect(rows[0].result).toEqual(newResult);
    expect(rows[0].status).toBe("success");
  });

  it("解析結果が未登録の場合、Geminiを呼び出し正常に保存する", async () => {
    await insertPatent("patent-3");
    analyzePatentMock.mockResolvedValue(sampleResult);

    const result = await getOrRunAnalysis("patent-3");

    expect(result).toEqual(sampleResult);
    expect(analyzePatentMock).toHaveBeenCalledWith(
      { title: "発明の名称", abstract: "要約文", claims: "請求項全文" },
      "patent-3",
      undefined,
    );

    const rows = await db.select().from(patentAnalyses).where(eq(patentAnalyses.patentId, "patent-3"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      patentId: "patent-3",
      model: "gemini-2.5-flash-lite",
      promptVersion: "v1",
      status: "success",
      errorMessage: null,
    });
    expect(rows[0].result).toEqual(sampleResult);
  });

  it("abstractとclaimsが両方nullでも解析を実行できる", async () => {
    await insertPatent("patent-4", { abstract: null, claimsText: null });
    analyzePatentMock.mockResolvedValue(sampleResult);

    const result = await getOrRunAnalysis("patent-4");

    expect(result).toEqual(sampleResult);
    expect(analyzePatentMock).toHaveBeenCalledWith(
      { title: "発明の名称", abstract: null, claims: null },
      "patent-4",
      undefined,
    );
  });

  it("GeminiRequestError発生時はstatus:errorで保存し、エラー内容を返す", async () => {
    await insertPatent("patent-5");
    analyzePatentMock.mockRejectedValue(new GeminiRequestError("接続に失敗しました"));

    const result = await getOrRunAnalysis("patent-5");

    expect(result).toEqual({ status: "error", errorMessage: "接続に失敗しました" });

    const rows = await db.select().from(patentAnalyses).where(eq(patentAnalyses.patentId, "patent-5"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "error",
      errorMessage: "接続に失敗しました",
    });
    expect(rows[0].result).toBeNull();
  });

  it("GeminiValidationError発生時もstatus:errorで保存する", async () => {
    await insertPatent("patent-6");
    analyzePatentMock.mockRejectedValue(new GeminiValidationError("スキーマ不一致"));

    const result = await getOrRunAnalysis("patent-6");

    expect(result).toEqual({ status: "error", errorMessage: "スキーマ不一致" });

    const rows = await db.select().from(patentAnalyses).where(eq(patentAnalyses.patentId, "patent-6"));
    expect(rows[0].status).toBe("error");
  });

  it("既存のerror結果がある場合、forceなしでも再実行する", async () => {
    await insertPatent("patent-7");
    await db.insert(patentAnalyses).values({
      id: "analysis-7",
      patentId: "patent-7",
      model: "gemini-2.5-flash-lite",
      promptVersion: "v1",
      status: "error",
      errorMessage: "以前のエラー",
    });
    analyzePatentMock.mockResolvedValue(sampleResult);

    const result = await getOrRunAnalysis("patent-7");

    expect(result).toEqual(sampleResult);
    expect(analyzePatentMock).toHaveBeenCalledTimes(1);
  });

  it("存在しない特許IDの場合はエラーを返し、Geminiを呼び出さない", async () => {
    const result = await getOrRunAnalysis("no-such-patent");

    expect(result).toEqual({ status: "error", errorMessage: "特許が見つかりません" });
    expect(analyzePatentMock).not.toHaveBeenCalled();
  });

  it("caseIdを渡した場合、analyzePatentへそのままcaseIdを渡す（llm_logsにcaseIdを残すため）", async () => {
    await insertPatent("patent-8");
    analyzePatentMock.mockResolvedValue(sampleResult);

    await getOrRunAnalysis("patent-8", false, "case-123");

    expect(analyzePatentMock).toHaveBeenCalledWith(
      { title: "発明の名称", abstract: "要約文", claims: "請求項全文" },
      "patent-8",
      "case-123",
    );
  });
});
