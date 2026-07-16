import { describe, expect, it, vi, beforeEach } from "vitest";

const { getPatentByIdMock, getOrRunAnalysisMock } = vi.hoisted(() => ({
  getPatentByIdMock: vi.fn(),
  getOrRunAnalysisMock: vi.fn(),
}));

vi.mock("@/features/patents/queries", () => ({
  getPatentById: getPatentByIdMock,
}));

vi.mock("@/features/analysis/analysis-service", () => ({
  getOrRunAnalysis: getOrRunAnalysisMock,
}));

import { POST } from "./route";

function buildRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: "POST",
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
      : {}),
  });
}

function buildContext(patentId: string) {
  return { params: Promise.resolve({ patentId }) };
}

beforeEach(() => {
  getPatentByIdMock.mockReset();
  getOrRunAnalysisMock.mockReset();
});

describe("POST /api/patents/[patentId]/analysis", () => {
  it("特許が存在しない場合、404を返す", async () => {
    getPatentByIdMock.mockResolvedValue(undefined);

    const response = await POST(
      buildRequest("http://localhost/api/patents/no-such-patent/analysis"),
      buildContext("no-such-patent"),
    );

    expect(response.status).toBe(404);
    expect(getOrRunAnalysisMock).not.toHaveBeenCalled();
  });

  it("正常系: forceを指定しない場合、force=falseでgetOrRunAnalysisを呼びJSONを返す", async () => {
    getPatentByIdMock.mockResolvedValue({ id: "patent-1" });
    getOrRunAnalysisMock.mockResolvedValue({ overview: "概要" });

    const response = await POST(
      buildRequest("http://localhost/api/patents/patent-1/analysis"),
      buildContext("patent-1"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ overview: "概要" });
    expect(getOrRunAnalysisMock).toHaveBeenCalledWith("patent-1", false);
  });

  it("クエリでforce=trueが指定された場合、forceありでgetOrRunAnalysisを呼ぶ", async () => {
    getPatentByIdMock.mockResolvedValue({ id: "patent-1" });
    getOrRunAnalysisMock.mockResolvedValue({ overview: "再実行後の概要" });

    const response = await POST(
      buildRequest("http://localhost/api/patents/patent-1/analysis?force=true"),
      buildContext("patent-1"),
    );

    expect(response.status).toBe(200);
    expect(getOrRunAnalysisMock).toHaveBeenCalledWith("patent-1", true);
  });

  it("ボディでforce:trueが指定された場合も、forceありでgetOrRunAnalysisを呼ぶ", async () => {
    getPatentByIdMock.mockResolvedValue({ id: "patent-1" });
    getOrRunAnalysisMock.mockResolvedValue({ overview: "概要" });

    const response = await POST(
      buildRequest("http://localhost/api/patents/patent-1/analysis", { force: true }),
      buildContext("patent-1"),
    );

    expect(response.status).toBe(200);
    expect(getOrRunAnalysisMock).toHaveBeenCalledWith("patent-1", true);
  });

  it("getOrRunAnalysisがエラー結果を返した場合もそのままJSONで返す", async () => {
    getPatentByIdMock.mockResolvedValue({ id: "patent-1" });
    getOrRunAnalysisMock.mockResolvedValue({ status: "error", errorMessage: "接続に失敗しました" });

    const response = await POST(
      buildRequest("http://localhost/api/patents/patent-1/analysis"),
      buildContext("patent-1"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "error", errorMessage: "接続に失敗しました" });
  });
});
