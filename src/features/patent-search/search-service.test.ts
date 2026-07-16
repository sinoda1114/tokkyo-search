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
import { cases, patents, searchResults, searchRuns, searchRunTerms, searchTerms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BigQueryCostLimitError } from "@/lib/bigquery/cost-guard";
import { buildSearchQuery } from "@/features/patent-search/query-builder";
import { SearchValidationError } from "@/features/patent-search/errors";
import { runSearch, type RunSearchInput } from "@/features/patent-search/search-service";

async function seedCase(caseId: string): Promise<void> {
  await db.insert(cases).values({ id: caseId, name: "テスト案件" });
}

async function seedTerm(id: string, caseId: string, text: string): Promise<void> {
  await db.insert(searchTerms).values({ id, caseId, termType: "original", text, source: "user" });
}

function buildPublicationRow(overrides: Record<string, unknown> = {}) {
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

describe("runSearch", () => {
  it("正常系: patents/searchRuns/searchResults/searchRunTermsを保存し、結果を返す", async () => {
    await seedCase("case-1");
    await seedTerm("term-1", "case-1", "半導体");
    runSearchQueryMock.mockResolvedValue({
      rows: [buildPublicationRow()],
      totalBytesProcessed: 12345,
    });

    const input: RunSearchInput = {
      caseId: "case-1",
      termIds: ["term-1"],
      dateFrom: "2000-01-01",
      dateTo: "2024-12-31",
    };

    const result = await runSearch(input);

    expect(result.resultCount).toBe(1);
    expect(result.bytesBilled).toBe(12345);
    expect(result.searchRunId).toBeTruthy();

    const runRows = await db.select().from(searchRuns).where(eq(searchRuns.id, result.searchRunId));
    expect(runRows).toHaveLength(1);
    expect(runRows[0]).toMatchObject({
      caseId: "case-1",
      status: "success",
      resultCount: 1,
      bytesBilled: 12345,
    });

    const patentRows = await db.select().from(patents);
    expect(patentRows).toHaveLength(1);
    expect(patentRows[0]).toMatchObject({
      publicationNumber: "JP2020-000001A",
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

    const resultRows = await db
      .select()
      .from(searchResults)
      .where(eq(searchResults.searchRunId, result.searchRunId));
    expect(resultRows).toHaveLength(1);
    expect(resultRows[0].rank).toBe(1);
    expect(resultRows[0].matchedTerms).toEqual(["半導体"]);
    expect(resultRows[0].patentId).toBe(patentRows[0].id);

    const runTermRows = await db
      .select()
      .from(searchRunTerms)
      .where(eq(searchRunTerms.searchRunId, result.searchRunId));
    expect(runTermRows).toHaveLength(1);
    expect(runTermRows[0].searchTermId).toBe("term-1");
  });

  it("query-builderに渡す条件が正しく組み立てられる（termIdsから実テキストを解決する）", async () => {
    await seedCase("case-2");
    await seedTerm("term-a", "case-2", "半導体");
    await seedTerm("term-b", "case-2", "放熱構造");
    runSearchQueryMock.mockResolvedValue({ rows: [], totalBytesProcessed: 0 });

    await runSearch({
      caseId: "case-2",
      termIds: ["term-a", "term-b"],
      dateFrom: "2010-01-01",
      dateTo: "2020-01-01",
      searchClaims: true,
      assignee: "テスト工業",
      ipcPrefix: "H01L",
    });

    expect(runSearchQueryMock).toHaveBeenCalledTimes(1);
    const calledQuery = runSearchQueryMock.mock.calls[0][0];

    const expectedQuery = buildSearchQuery("test-project", "patents_jp", {
      dateFrom: "2010-01-01",
      dateTo: "2020-01-01",
      terms: ["半導体", "放熱構造"],
      searchClaims: true,
      assignee: "テスト工業",
      ipcPrefix: "H01L",
    });

    expect(calledQuery.sql).toBe(expectedQuery.sql);
    expect(calledQuery.params.dateFrom).toBe("2010-01-01");
    expect(calledQuery.params.dateTo).toBe("2020-01-01");
    expect(calledQuery.params.searchClaims).toBe(true);
    expect(calledQuery.params.assigneePattern).toBe("%テスト工業%");
    expect(calledQuery.params.ipcPrefix).toBe("H01L");
  });

  it("既存特許（publicationNumberが一致）はpatentsを更新し、重複挿入しない", async () => {
    await seedCase("case-3");
    await seedTerm("term-3", "case-3", "半導体");
    await db.insert(patents).values({
      id: "existing-patent-id",
      publicationNumber: "JP2020-000003A",
      title: "旧タイトル",
    });
    runSearchQueryMock.mockResolvedValue({
      rows: [buildPublicationRow({ publication_number: "JP2020-000003A", title_ja: "新タイトル" })],
      totalBytesProcessed: 100,
    });

    const result = await runSearch({
      caseId: "case-3",
      termIds: ["term-3"],
      dateFrom: "2000-01-01",
      dateTo: "2024-12-31",
    });

    const patentRows = await db
      .select()
      .from(patents)
      .where(eq(patents.publicationNumber, "JP2020-000003A"));
    expect(patentRows).toHaveLength(1);
    expect(patentRows[0].id).toBe("existing-patent-id");
    expect(patentRows[0].title).toBe("新タイトル");

    const resultRows = await db
      .select()
      .from(searchResults)
      .where(eq(searchResults.searchRunId, result.searchRunId));
    expect(resultRows[0].patentId).toBe("existing-patent-id");
  });

  it("BigQueryCostLimitError発生時、status:errorでsearchRunsに保存し、re-throwする", async () => {
    await seedCase("case-4");
    await seedTerm("term-4", "case-4", "半導体");
    const patentCountBefore = (await db.select().from(patents)).length;
    const costError = new BigQueryCostLimitError("見積もりスキャン量が上限を超えています");
    runSearchQueryMock.mockRejectedValue(costError);

    await expect(
      runSearch({
        caseId: "case-4",
        termIds: ["term-4"],
        dateFrom: "2000-01-01",
        dateTo: "2024-12-31",
      }),
    ).rejects.toThrow(BigQueryCostLimitError);

    const runRows = await db.select().from(searchRuns).where(eq(searchRuns.caseId, "case-4"));
    expect(runRows).toHaveLength(1);
    expect(runRows[0].status).toBe("error");
    expect(runRows[0].errorMessage).toContain("見積もりスキャン量が上限を超えています");
    expect(runRows[0].resultCount).toBeNull();

    const patentRows = await db.select().from(patents);
    expect(patentRows).toHaveLength(patentCountBefore);
  });

  it("termIdsが解決できない（存在しない/他案件のもの）場合、SearchValidationErrorを投げてBigQueryを呼ばない", async () => {
    await seedCase("case-5");
    await seedCase("case-other");
    await seedTerm("term-other", "case-other", "他案件の語");

    await expect(
      runSearch({
        caseId: "case-5",
        termIds: ["term-other", "not-exist"],
        dateFrom: "2000-01-01",
        dateTo: "2024-12-31",
      }),
    ).rejects.toThrow(SearchValidationError);

    expect(runSearchQueryMock).not.toHaveBeenCalled();
  });

  it("複数結果のrankは検索結果の順序どおりに1から採番される", async () => {
    await seedCase("case-6");
    await seedTerm("term-6", "case-6", "半導体");
    runSearchQueryMock.mockResolvedValue({
      rows: [
        buildPublicationRow({ publication_number: "JP-A" }),
        buildPublicationRow({ publication_number: "JP-B" }),
        buildPublicationRow({ publication_number: "JP-C" }),
      ],
      totalBytesProcessed: 999,
    });

    const result = await runSearch({
      caseId: "case-6",
      termIds: ["term-6"],
      dateFrom: "2000-01-01",
      dateTo: "2024-12-31",
    });

    const resultRows = await db
      .select()
      .from(searchResults)
      .where(eq(searchResults.searchRunId, result.searchRunId));
    const byPublication = new Map<string, number>();
    const patentRows = await db.select().from(patents);
    for (const row of resultRows) {
      const patent = patentRows.find((p) => p.id === row.patentId);
      if (patent) byPublication.set(patent.publicationNumber, row.rank);
    }
    expect(byPublication.get("JP-A")).toBe(1);
    expect(byPublication.get("JP-B")).toBe(2);
    expect(byPublication.get("JP-C")).toBe(3);
  });

  it("matchedTermsはtitle/abstractに実際に含まれる検索語のみを記録する", async () => {
    await seedCase("case-7");
    await seedTerm("term-7a", "case-7", "半導体");
    await seedTerm("term-7b", "case-7", "存在しない語句");
    runSearchQueryMock.mockResolvedValue({
      rows: [buildPublicationRow({ title_ja: "半導体パッケージ", abstract_ja: "説明文" })],
      totalBytesProcessed: 1,
    });

    const result = await runSearch({
      caseId: "case-7",
      termIds: ["term-7a", "term-7b"],
      dateFrom: "2000-01-01",
      dateTo: "2024-12-31",
    });

    const resultRows = await db
      .select()
      .from(searchResults)
      .where(eq(searchResults.searchRunId, result.searchRunId));
    expect(resultRows[0].matchedTerms).toEqual(["半導体"]);
  });
});
