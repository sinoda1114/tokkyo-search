import { describe, expect, it, vi, beforeEach } from "vitest";

const { runSearchMock } = vi.hoisted(() => ({
  runSearchMock: vi.fn(),
}));

vi.mock("@/features/patent-search/search-service", () => ({
  runSearch: runSearchMock,
}));

import { POST } from "./route";
import { BigQueryCostLimitError } from "@/lib/bigquery/cost-guard";
import { SearchValidationError } from "@/features/patent-search/errors";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/case-1/search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function buildContext(caseId: string) {
  return { params: Promise.resolve({ caseId }) };
}

beforeEach(() => {
  runSearchMock.mockReset();
});

describe("POST /api/cases/[caseId]/search", () => {
  it("正常系: runSearchの結果からsearchRunIdをJSONで返す", async () => {
    runSearchMock.mockResolvedValue({
      searchRunId: "run-1",
      resultCount: 3,
      bytesBilled: 1000,
    });

    const response = await POST(
      buildRequest({ termIds: ["term-1"], dateFrom: "2000-01-01", dateTo: "2024-12-31" }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.searchRunId).toBe("run-1");
    expect(runSearchMock).toHaveBeenCalledWith({
      caseId: "case-1",
      termIds: ["term-1"],
      dateFrom: "2000-01-01",
      dateTo: "2024-12-31",
      searchClaims: undefined,
      assignee: undefined,
      ipcPrefix: undefined,
    });
  });

  it("任意項目を含めて渡した場合、そのままrunSearchへ渡す", async () => {
    runSearchMock.mockResolvedValue({ searchRunId: "run-2", resultCount: 0, bytesBilled: 0 });

    await POST(
      buildRequest({
        termIds: ["term-1", "term-2"],
        dateFrom: "2000-01-01",
        dateTo: "2024-12-31",
        searchClaims: true,
        assignee: "テスト工業",
        ipcPrefix: "H01L",
      }),
      buildContext("case-1"),
    );

    expect(runSearchMock).toHaveBeenCalledWith({
      caseId: "case-1",
      termIds: ["term-1", "term-2"],
      dateFrom: "2000-01-01",
      dateTo: "2024-12-31",
      searchClaims: true,
      assignee: "テスト工業",
      ipcPrefix: "H01L",
    });
  });

  it("assignee/ipcPrefixが空文字のとき、未指定として扱いrunSearchへundefinedを渡す", async () => {
    runSearchMock.mockResolvedValue({ searchRunId: "run-3", resultCount: 0, bytesBilled: 0 });

    const response = await POST(
      buildRequest({
        termIds: ["term-1"],
        dateFrom: "2000-01-01",
        dateTo: "2024-12-31",
        assignee: "",
        ipcPrefix: "",
      }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(200);
    expect(runSearchMock).toHaveBeenCalledWith({
      caseId: "case-1",
      termIds: ["term-1"],
      dateFrom: "2000-01-01",
      dateTo: "2024-12-31",
      searchClaims: undefined,
      assignee: undefined,
      ipcPrefix: undefined,
    });
  });

  it("termIdsが空配列のとき400を返し、runSearchを呼ばない", async () => {
    const response = await POST(
      buildRequest({ termIds: [], dateFrom: "2000-01-01", dateTo: "2024-12-31" }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(400);
    expect(runSearchMock).not.toHaveBeenCalled();
  });

  it("dateFromが未指定のとき400を返す", async () => {
    const response = await POST(
      buildRequest({ termIds: ["term-1"], dateTo: "2024-12-31" }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(400);
    expect(runSearchMock).not.toHaveBeenCalled();
  });

  it("dateToが未指定のとき400を返す", async () => {
    const response = await POST(
      buildRequest({ termIds: ["term-1"], dateFrom: "2000-01-01" }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(400);
    expect(runSearchMock).not.toHaveBeenCalled();
  });

  it("不正なJSONボディのとき400を返す", async () => {
    const request = new Request("http://localhost/api/cases/case-1/search", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request, buildContext("case-1"));

    expect(response.status).toBe(400);
  });

  it("BigQueryCostLimitError発生時、コスト超過である旨のメッセージとともに400を返す", async () => {
    runSearchMock.mockRejectedValue(new BigQueryCostLimitError("見積もりスキャン量が上限を超えています"));

    const response = await POST(
      buildRequest({ termIds: ["term-1"], dateFrom: "2000-01-01", dateTo: "2024-12-31" }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("見積もりスキャン量が上限を超えています");
  });

  it("SearchValidationError発生時、400を返す", async () => {
    runSearchMock.mockRejectedValue(new SearchValidationError("検索語が選択されていません"));

    const response = await POST(
      buildRequest({ termIds: ["term-1"], dateFrom: "2000-01-01", dateTo: "2024-12-31" }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toContain("検索語が選択されていません");
  });

  it("その他のエラー発生時、500を返す", async () => {
    runSearchMock.mockRejectedValue(new Error("unexpected"));

    const response = await POST(
      buildRequest({ termIds: ["term-1"], dateFrom: "2000-01-01", dateTo: "2024-12-31" }),
      buildContext("case-1"),
    );

    expect(response.status).toBe(500);
  });
});
