import { describe, expect, it, vi, beforeEach } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number;
    constructor(options: { message: string; status: number }) {
      super(options.message);
      this.name = "ApiError";
      this.status = options.status;
    }
  }
  class GoogleGenAI {
    models = { generateContent: generateContentMock };
  }
  const Type = {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
  };
  return { ApiError, GoogleGenAI, Type };
});

const { logLlmCallMock } = vi.hoisted(() => ({
  logLlmCallMock: vi.fn(),
}));

vi.mock("@/lib/llm-log", () => ({
  logLlmCall: logLlmCallMock,
}));

vi.mock("@/lib/env", () => ({
  env: { GEMINI_API_KEY: "test-api-key", GEMINI_MODEL: "gemini-test-model" },
}));

import { analyzePatent } from "@/lib/gemini/client";

const samplePatentInput = { title: "テスト特許", abstract: "要約文", claims: "請求項全文" };

const sampleResultJson = JSON.stringify({
  overview: "概要",
  background: "背景",
  problem: "課題",
  solution: "解決手段",
  effect: "効果",
  keyTerms: [],
  searchCandidates: [],
  citedReferences: [],
});

beforeEach(() => {
  generateContentMock.mockReset();
  logLlmCallMock.mockReset();
});

describe("analyzePatent", () => {
  it("caseIdを渡した場合、llm_logsへの記録（logLlmCall）にcaseIdを含める", async () => {
    generateContentMock.mockResolvedValue({ text: sampleResultJson });

    await analyzePatent(samplePatentInput, "patent-1", "case-1");

    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    expect(logLlmCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "analysis", patentId: "patent-1", caseId: "case-1" }),
    );
  });

  it("caseIdを渡さない場合、caseIdなしで記録する（後方互換）", async () => {
    generateContentMock.mockResolvedValue({ text: sampleResultJson });

    await analyzePatent(samplePatentInput, "patent-2");

    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const callArg = logLlmCallMock.mock.calls[0][0] as { caseId?: string; patentId?: string };
    expect(callArg.patentId).toBe("patent-2");
    expect(callArg.caseId).toBeUndefined();
  });

  it("Gemini呼び出しがエラーの場合も、caseIdを含めてベストエフォートでログを記録する", async () => {
    generateContentMock.mockRejectedValue(new Error("network down"));

    await expect(analyzePatent(samplePatentInput, "patent-3", "case-3")).rejects.toThrow();

    expect(logLlmCallMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "analysis", patentId: "patent-3", caseId: "case-3" }),
    );
  });
});
