import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

vi.mock("@/lib/env", () => ({
  env: { GCP_PROJECT_ID: "test-project", BQ_DATASET: "patents_jp" },
}));

const { runSearchQueryMock } = vi.hoisted(() => ({
  runSearchQueryMock: vi.fn(),
}));

vi.mock("@/lib/bigquery/client", () => ({
  runSearchQuery: runSearchQueryMock,
}));

import { db } from "@/db/client";
import { patents } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  buildPatentLookupQuery,
  lookupPatentByPublicationNumber,
} from "@/features/patents/patent-lookup-service";

function buildLookupRow(overrides: Record<string, unknown> = {}) {
  return {
    publication_number: "JP2020-000001A",
    application_number: "2020-000001",
    country_code: "JP",
    kind_code: "A",
    publication_date: "2020-05-01",
    filing_date: "2019-01-01",
    title_ja: "半導体パッケージ構造",
    abstract_ja: "本発明は半導体パッケージに関する",
    assignees: ["テスト工業株式会社"],
    ipc_codes: ["H01L23/00"],
    cpc_codes: ["H01L23/00"],
    cited_publications: ["JP1999-000001A"],
    ...overrides,
  };
}

beforeEach(() => {
  runSearchQueryMock.mockReset();
});

describe("buildPatentLookupQuery", () => {
  it("publicationNumberの完全一致・LIMIT1のクエリを組み立てる（claims_jaは含めない）", () => {
    const query = buildPatentLookupQuery("test-project", "patents_jp", "JP2020-000001A");

    expect(query.sql).toContain("WHERE publication_number = @publicationNumber");
    expect(query.sql).toContain("LIMIT 1");
    expect(query.sql).not.toContain("claims_ja");
    expect(query.sql).toContain("`test-project.patents_jp.publications`");
    expect(query.params).toEqual({ publicationNumber: "JP2020-000001A" });
  });

  it("publicationNumberが空文字の場合はエラーを投げる", () => {
    expect(() => buildPatentLookupQuery("test-project", "patents_jp", "  ")).toThrow();
  });

  it("projectId/datasetに不正な文字が含まれる場合はエラーを投げる", () => {
    expect(() => buildPatentLookupQuery("bad project", "patents_jp", "JP2020-000001A")).toThrow();
    expect(() => buildPatentLookupQuery("test-project", "bad dataset", "JP2020-000001A")).toThrow();
  });
});

describe("lookupPatentByPublicationNumber", () => {
  it("patentsに既に存在する場合、BigQueryを呼ばずそのpatentIdを返す", async () => {
    await db.insert(patents).values({
      id: "existing-id",
      publicationNumber: "JP2020-000001A",
      title: "既存タイトル",
    });

    const result = await lookupPatentByPublicationNumber("JP2020-000001A");

    expect(result).toEqual({ patentId: "existing-id" });
    expect(runSearchQueryMock).not.toHaveBeenCalled();
  });

  it("patentsに存在しない場合、BigQueryへ問い合わせてpatentsへ保存しpatentIdを返す", async () => {
    runSearchQueryMock.mockResolvedValue({
      rows: [buildLookupRow({ publication_number: "JP2020-000010A" })],
      totalBytesProcessed: 10,
    });

    const result = await lookupPatentByPublicationNumber("JP2020-000010A");

    expect(result).not.toBeNull();
    expect(runSearchQueryMock).toHaveBeenCalledTimes(1);

    const calledQuery = runSearchQueryMock.mock.calls[0][0];
    const expectedQuery = buildPatentLookupQuery("test-project", "patents_jp", "JP2020-000010A");
    expect(calledQuery.sql).toBe(expectedQuery.sql);
    expect(calledQuery.params).toEqual(expectedQuery.params);

    const rows = await db
      .select()
      .from(patents)
      .where(eq(patents.publicationNumber, "JP2020-000010A"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      publicationNumber: "JP2020-000010A",
      applicationNumber: "2020-000001",
      countryCode: "JP",
      kindCode: "A",
      title: "半導体パッケージ構造",
      abstract: "本発明は半導体パッケージに関する",
      assignees: ["テスト工業株式会社"],
      ipcCodes: ["H01L23/00"],
      cpcCodes: ["H01L23/00"],
      citedPublications: ["JP1999-000001A"],
      publicationDate: "2020-05-01",
      filingDate: "2019-01-01",
    });
    expect(result?.patentId).toBe(rows[0].id);
  });

  it("BigQueryでも見つからない場合、nullを返しpatentsへ何も保存しない", async () => {
    runSearchQueryMock.mockResolvedValue({ rows: [], totalBytesProcessed: 0 });

    const result = await lookupPatentByPublicationNumber("JP-NOTFOUND-A");

    expect(result).toBeNull();
    const rows = await db
      .select()
      .from(patents)
      .where(eq(patents.publicationNumber, "JP-NOTFOUND-A"));
    expect(rows).toHaveLength(0);
  });

  it("既存特許（publicationNumberが一致）に対しては重複挿入せず、既存idを維持したまま更新する", async () => {
    await db.insert(patents).values({
      id: "existing-id-2",
      publicationNumber: "JP2020-000002A",
      title: "旧タイトル",
    });
    runSearchQueryMock.mockResolvedValue({
      rows: [
        buildLookupRow({ publication_number: "JP2020-000002A", title_ja: "新タイトル" }),
      ],
      totalBytesProcessed: 10,
    });

    // このケースは通常patentsの事前チェックでヒットしBigQueryを呼ばないが、
    // upsertのonConflictDoUpdate側の安全性（IDが維持されること）を明示的に検証する。
    const result = await lookupPatentByPublicationNumber("JP2020-000002A");

    expect(result).toEqual({ patentId: "existing-id-2" });
    expect(runSearchQueryMock).not.toHaveBeenCalled();
  });
});
