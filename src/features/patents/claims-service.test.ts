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
import { buildClaimsLookupQuery } from "@/features/patent-search/query-builder";
import { fetchAndCacheClaims } from "@/features/patents/claims-service";

beforeEach(() => {
  runSearchQueryMock.mockReset();
});

describe("fetchAndCacheClaims", () => {
  it("claimsTextが既にある場合はBigQueryを呼ばずそのまま返す", async () => {
    await db.insert(patents).values({
      id: "patent-cached",
      publicationNumber: "JP-2020000001-A",
      claimsText: "既存の請求項テキスト",
    });

    const result = await fetchAndCacheClaims("patent-cached");

    expect(result).toBe("既存の請求項テキスト");
    expect(runSearchQueryMock).not.toHaveBeenCalled();
  });

  it("claimsTextがない場合はBigQueryから取得しDBを更新してから返す", async () => {
    await db.insert(patents).values({
      id: "patent-nocache",
      publicationNumber: "JP-2020000002-A",
    });
    runSearchQueryMock.mockResolvedValue({
      rows: [{ claims_ja: "取得した請求項テキスト" }],
      totalBytesProcessed: 10,
    });

    const result = await fetchAndCacheClaims("patent-nocache");

    expect(result).toBe("取得した請求項テキスト");
    expect(runSearchQueryMock).toHaveBeenCalledTimes(1);

    const expectedQuery = buildClaimsLookupQuery("test-project", "patents_jp", "JP-2020000002-A");
    const calledQuery = runSearchQueryMock.mock.calls[0][0];
    expect(calledQuery.sql).toBe(expectedQuery.sql);
    expect(calledQuery.params).toEqual(expectedQuery.params);

    const rows = await db.select().from(patents).where(eq(patents.id, "patent-nocache"));
    expect(rows[0].claimsText).toBe("取得した請求項テキスト");
  });

  it("BigQueryから取得できない場合はnullを返しDBを更新しない", async () => {
    await db.insert(patents).values({
      id: "patent-notfound",
      publicationNumber: "JP-2020000003-A",
    });
    runSearchQueryMock.mockResolvedValue({ rows: [], totalBytesProcessed: 0 });

    const result = await fetchAndCacheClaims("patent-notfound");

    expect(result).toBeNull();
    const rows = await db.select().from(patents).where(eq(patents.id, "patent-notfound"));
    expect(rows[0].claimsText).toBeNull();
  });

  it("claims_jaがnullで返ってきた場合もnullを返しDBを更新しない", async () => {
    await db.insert(patents).values({
      id: "patent-null-claims",
      publicationNumber: "JP-2020000004-A",
    });
    runSearchQueryMock.mockResolvedValue({
      rows: [{ claims_ja: null }],
      totalBytesProcessed: 5,
    });

    const result = await fetchAndCacheClaims("patent-null-claims");

    expect(result).toBeNull();
    const rows = await db.select().from(patents).where(eq(patents.id, "patent-null-claims"));
    expect(rows[0].claimsText).toBeNull();
  });

  it("存在しないpatentIdのときnullを返す", async () => {
    const result = await fetchAndCacheClaims("no-such-patent");
    expect(result).toBeNull();
    expect(runSearchQueryMock).not.toHaveBeenCalled();
  });
});
