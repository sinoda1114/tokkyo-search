import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCaseByIdMock, generateExpansionMock } = vi.hoisted(() => ({
  getCaseByIdMock: vi.fn(),
  generateExpansionMock: vi.fn(),
}));

vi.mock("@/features/cases/queries", () => ({
  getCaseById: getCaseByIdMock,
}));

vi.mock("@/lib/gemini/client", () => ({
  generateExpansion: generateExpansionMock,
}));

import { POST } from "./route";
import { GeminiRequestError, GeminiValidationError } from "@/lib/gemini/errors";
import { resetRateLimitStoreForTests } from "@/lib/rate-limit";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/case-1/expansions", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function buildContext(caseId: string) {
  return { params: Promise.resolve({ caseId }) };
}

beforeEach(() => {
  getCaseByIdMock.mockReset();
  generateExpansionMock.mockReset();
  resetRateLimitStoreForTests();
});

describe("POST /api/cases/[caseId]/expansions", () => {
  it("案件が存在しない場合、404を返す", async () => {
    getCaseByIdMock.mockResolvedValue(undefined);

    const response = await POST(buildRequest({ terms: ["半導体"] }), buildContext("no-case"));

    expect(response.status).toBe(404);
    expect(generateExpansionMock).not.toHaveBeenCalled();
  });

  it("termsが空配列のとき400を返す", async () => {
    getCaseByIdMock.mockResolvedValue({ id: "case-1", technicalField: null });

    const response = await POST(buildRequest({ terms: [] }), buildContext("case-1"));

    expect(response.status).toBe(400);
    expect(generateExpansionMock).not.toHaveBeenCalled();
  });

  it("正常系: 案件のtechnicalFieldをヒントとして渡し、展開結果をJSONで返す", async () => {
    getCaseByIdMock.mockResolvedValue({ id: "case-1", technicalField: "半導体" });
    generateExpansionMock.mockResolvedValue({
      terms: [{ type: "synonym", text: "セミコンダクタ", sourceTerm: "半導体" }],
    });

    const response = await POST(
      buildRequest({ terms: ["半導体"] }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.terms).toHaveLength(1);
    expect(generateExpansionMock).toHaveBeenCalledWith(["半導体"], "半導体", "case-1");
  });

  it("GeminiRequestError発生時、502とエラーメッセージを返す", async () => {
    getCaseByIdMock.mockResolvedValue({ id: "case-1", technicalField: null });
    generateExpansionMock.mockRejectedValue(new GeminiRequestError("接続に失敗しました"));

    const response = await POST(buildRequest({ terms: ["半導体"] }), buildContext("case-1"));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toContain("接続に失敗しました");
  });

  it("GeminiValidationError発生時、502とエラーメッセージを返す", async () => {
    getCaseByIdMock.mockResolvedValue({ id: "case-1", technicalField: null });
    generateExpansionMock.mockRejectedValue(new GeminiValidationError("スキーマ不一致"));

    const response = await POST(buildRequest({ terms: ["半導体"] }), buildContext("case-1"));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toContain("スキーマ不一致");
  });

  it("不正なJSONボディのとき400を返す", async () => {
    getCaseByIdMock.mockResolvedValue({ id: "case-1", technicalField: null });
    const request = new Request("http://localhost/api/cases/case-1/expansions", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, buildContext("case-1"));

    expect(response.status).toBe(400);
  });

  it("同一IPからの短時間の連続リクエストが上限を超えた場合、429を返しgenerateExpansionを呼ばない", async () => {
    getCaseByIdMock.mockResolvedValue({ id: "case-1", technicalField: null });
    generateExpansionMock.mockResolvedValue({ terms: [] });

    // 展開エンドポイントの上限（1分間に10回）まではgenerateExpansionが呼ばれる。
    for (let i = 0; i < 10; i += 1) {
      const okResponse = await POST(buildRequest({ terms: ["半導体"] }), buildContext("case-1"));
      expect(okResponse.status).toBe(200);
    }

    const response = await POST(buildRequest({ terms: ["半導体"] }), buildContext("case-1"));

    expect(response.status).toBe(429);
    expect(generateExpansionMock).toHaveBeenCalledTimes(10);
  });
});
