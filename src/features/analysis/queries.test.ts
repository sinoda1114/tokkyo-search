import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { db } from "@/db/client";
import { patentAnalyses, patents } from "@/db/schema";
import { getAnalysisByPatentId } from "@/features/analysis/queries";

describe("getAnalysisByPatentId", () => {
  it("patentIdに一致する解析結果を返す", async () => {
    await db.insert(patents).values({
      id: "patent-1",
      publicationNumber: "JP-2020000001-A",
    });
    await db.insert(patentAnalyses).values({
      id: "analysis-1",
      patentId: "patent-1",
      model: "gemini-2.5-flash-lite",
      promptVersion: "v1",
      status: "success",
      result: {
        overview: "概要",
        background: null,
        problem: null,
        solution: null,
        effect: null,
        keyTerms: [],
        searchCandidates: [],
        citedReferences: [],
      },
    });

    const result = await getAnalysisByPatentId("patent-1");

    expect(result?.patentId).toBe("patent-1");
    expect(result?.status).toBe("success");
    expect(result?.result?.overview).toBe("概要");
  });

  it("解析結果が存在しない場合はundefinedを返す", async () => {
    const result = await getAnalysisByPatentId("no-such-patent");
    expect(result).toBeUndefined();
  });
});
