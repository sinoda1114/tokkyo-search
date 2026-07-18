import { describe, expect, it, vi, beforeEach } from "vitest";

const { getCaseByIdMock, getEvaluatedPatentsByCaseMock, getSearchRunsByCaseMock } = vi.hoisted(
  () => ({
    getCaseByIdMock: vi.fn(),
    getEvaluatedPatentsByCaseMock: vi.fn(),
    getSearchRunsByCaseMock: vi.fn(),
  }),
);

vi.mock("@/features/cases/queries", () => ({
  getCaseById: getCaseByIdMock,
}));

vi.mock("@/features/patents/evaluation-queries", () => ({
  getEvaluatedPatentsByCase: getEvaluatedPatentsByCaseMock,
}));

vi.mock("@/features/patent-search/queries", () => ({
  getSearchRunsByCase: getSearchRunsByCaseMock,
}));

import { GET } from "./route";

function buildContext(caseId: string) {
  return { params: Promise.resolve({ caseId }) };
}

beforeEach(() => {
  getCaseByIdMock.mockReset();
  getEvaluatedPatentsByCaseMock.mockReset();
  getSearchRunsByCaseMock.mockReset();
});

describe("GET /api/cases/[caseId]/export", () => {
  it("案件が存在しない場合、404を返す", async () => {
    getCaseByIdMock.mockResolvedValue(undefined);

    const response = await GET(new Request("http://localhost/api/cases/no-case/export"), buildContext("no-case"));

    expect(response.status).toBe(404);
    expect(getEvaluatedPatentsByCaseMock).not.toHaveBeenCalled();
    expect(getSearchRunsByCaseMock).not.toHaveBeenCalled();
  });

  it("正常系: text/csvのContent-Typeと添付ファイル名を持つレスポンスを返す", async () => {
    getCaseByIdMock.mockResolvedValue({
      id: "case-1",
      name: "半導体案件",
      referenceNumber: "REF-001",
      technicalField: "半導体",
      memo: null,
    });
    getEvaluatedPatentsByCaseMock.mockResolvedValue([]);
    getSearchRunsByCaseMock.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/cases/case-1/export"), buildContext("case-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/csv");
    expect(response.headers.get("Content-Type")).toContain("utf-8");
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("filename=");
  });

  it("CSV本文はUTF-8 BOMで始まる（Excelでの文字化け対策）", async () => {
    getCaseByIdMock.mockResolvedValue({
      id: "case-1",
      name: "案件",
      referenceNumber: null,
      technicalField: null,
      memo: null,
    });
    getEvaluatedPatentsByCaseMock.mockResolvedValue([]);
    getSearchRunsByCaseMock.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/cases/case-1/export"), buildContext("case-1"));
    // `.text()`はFetch APIの仕様でTextDecoderが先頭のBOMを消費してしまうため検証できない。
    // 実際にファイルへ保存されるバイト列（EF BB BF）を直接確認する。
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("評価済み特許の一覧（ステータス・コメント・除外理由）をCSVに含める", async () => {
    getCaseByIdMock.mockResolvedValue({
      id: "case-1",
      name: "案件",
      referenceNumber: null,
      technicalField: null,
      memo: null,
    });
    getEvaluatedPatentsByCaseMock.mockResolvedValue([
      {
        patent: {
          id: "patent-1",
          publicationNumber: "JP2020-000001A",
          title: "放熱構造に関する発明",
        },
        evaluation: {
          status: "important",
          comment: "有力な先行文献",
          exclusionReason: null,
        },
      },
      {
        patent: {
          id: "patent-2",
          publicationNumber: "JP2021-000002A",
          title: "対象外特許",
        },
        evaluation: {
          status: "excluded",
          comment: null,
          exclusionReason: "技術分野が異なる, 参考にならない",
        },
      },
    ]);
    getSearchRunsByCaseMock.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/cases/case-1/export"), buildContext("case-1"));
    const text = await response.text();

    expect(text).toContain("評価済み特許");
    expect(text).toContain("JP2020-000001A");
    expect(text).toContain("重要");
    expect(text).toContain("有力な先行文献");
    expect(text).toContain("JP2021-000002A");
    expect(text).toContain("対象外");
    // カンマを含むフィールドはダブルクォートで囲みエスケープされる
    expect(text).toContain('"技術分野が異なる, 参考にならない"');
  });

  it("検索実行履歴（実行日時・使用検索語・条件・件数）をCSVに含める", async () => {
    getCaseByIdMock.mockResolvedValue({
      id: "case-1",
      name: "案件",
      referenceNumber: null,
      technicalField: null,
      memo: null,
    });
    getEvaluatedPatentsByCaseMock.mockResolvedValue([]);
    getSearchRunsByCaseMock.mockResolvedValue([
      {
        id: "run-1",
        caseId: "case-1",
        conditions: {
          dateFrom: "2019-01-01",
          dateTo: "2021-01-01",
          terms: ["放熱構造", "放熱機構"],
          searchClaims: true,
          assignee: "テスト株式会社",
          ipcPrefix: "H01L",
        },
        status: "success",
        errorMessage: null,
        resultCount: 3,
        bytesBilled: 12345,
        executedAt: new Date("2024-05-01T01:00:00Z"),
      },
      {
        id: "run-2",
        caseId: "case-1",
        conditions: { dateFrom: "2019-01-01", dateTo: "2021-01-01", terms: ["放熱構造"] },
        status: "error",
        errorMessage: "コスト上限超過",
        resultCount: null,
        bytesBilled: null,
        executedAt: new Date("2024-05-02T01:00:00Z"),
      },
    ]);

    const response = await GET(new Request("http://localhost/api/cases/case-1/export"), buildContext("case-1"));
    const text = await response.text();

    expect(text).toContain("検索実行履歴");
    expect(text).toContain("放熱構造");
    expect(text).toContain("放熱機構");
    expect(text).toContain("成功");
    expect(text).toContain("失敗");
    expect(text).toContain("テスト株式会社");
    expect(text).toContain("H01L");
    expect(text).toMatch(/3/);
  });
});
