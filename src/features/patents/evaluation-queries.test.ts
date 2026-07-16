import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { db } from "@/db/client";
import { cases, casePatents, patents } from "@/db/schema";
import {
  getCasePatentStatus,
  getCasePatentStatusesByCase,
  getEvaluatedPatentsByCase,
} from "@/features/patents/evaluation-queries";

describe("getCasePatentStatus", () => {
  it("caseIdとpatentIdに一致する評価を返す", async () => {
    await db.insert(cases).values({ id: "case-1", name: "案件1" });
    await db.insert(patents).values({ id: "patent-1", publicationNumber: "JP-1-A" });
    await db
      .insert(casePatents)
      .values({ caseId: "case-1", patentId: "patent-1", status: "important" });

    const result = await getCasePatentStatus("case-1", "patent-1");

    expect(result?.status).toBe("important");
  });

  it("評価が存在しない場合undefinedを返す", async () => {
    const result = await getCasePatentStatus("case-x", "patent-x");
    expect(result).toBeUndefined();
  });

  it("別の案件の評価は返さない", async () => {
    await db.insert(cases).values([
      { id: "case-a", name: "案件A" },
      { id: "case-b", name: "案件B" },
    ]);
    await db.insert(patents).values({ id: "patent-shared", publicationNumber: "JP-S-A" });
    await db
      .insert(casePatents)
      .values({ caseId: "case-a", patentId: "patent-shared", status: "reference" });

    const result = await getCasePatentStatus("case-b", "patent-shared");

    expect(result).toBeUndefined();
  });
});

describe("getCasePatentStatusesByCase", () => {
  it("案件に紐づく評価を一括取得する", async () => {
    await db.insert(cases).values({ id: "case-bulk", name: "一括取得案件" });
    await db.insert(patents).values([
      { id: "patent-bulk-1", publicationNumber: "JP-BULK-1-A" },
      { id: "patent-bulk-2", publicationNumber: "JP-BULK-2-A" },
    ]);
    await db.insert(casePatents).values([
      { caseId: "case-bulk", patentId: "patent-bulk-1", status: "important" },
      { caseId: "case-bulk", patentId: "patent-bulk-2", status: "excluded", exclusionReason: "対象外" },
    ]);

    const result = await getCasePatentStatusesByCase("case-bulk");

    expect(result).toHaveLength(2);
    const byPatentId = new Map(result.map((row) => [row.patentId, row]));
    expect(byPatentId.get("patent-bulk-1")?.status).toBe("important");
    expect(byPatentId.get("patent-bulk-2")?.status).toBe("excluded");
  });

  it("評価がない案件では空配列を返す", async () => {
    const result = await getCasePatentStatusesByCase("case-none");
    expect(result).toEqual([]);
  });
});

describe("getEvaluatedPatentsByCase", () => {
  it("評価済み（unrated以外）の特許を案件IDで取得する", async () => {
    await db.insert(cases).values({ id: "case-2", name: "案件2" });
    await db.insert(patents).values([
      { id: "patent-a", publicationNumber: "JP-A-A", title: "特許A" },
      { id: "patent-b", publicationNumber: "JP-B-A", title: "特許B" },
      { id: "patent-c", publicationNumber: "JP-C-A", title: "特許C" },
    ]);
    await db.insert(casePatents).values([
      { caseId: "case-2", patentId: "patent-a", status: "important" },
      { caseId: "case-2", patentId: "patent-b", status: "unrated" },
      { caseId: "case-2", patentId: "patent-c", status: "excluded", exclusionReason: "分野違い" },
    ]);

    const result = await getEvaluatedPatentsByCase("case-2");

    expect(result).toHaveLength(2);
    const ids = result.map((item) => item.patent.id).sort();
    expect(ids).toEqual(["patent-a", "patent-c"]);
    const important = result.find((item) => item.patent.id === "patent-a");
    expect(important?.evaluation.status).toBe("important");
  });

  it("他の案件の評価は含まれない", async () => {
    await db.insert(cases).values([
      { id: "case-3", name: "案件3" },
      { id: "case-4", name: "案件4" },
    ]);
    await db.insert(patents).values({ id: "patent-d", publicationNumber: "JP-D-A" });
    await db
      .insert(casePatents)
      .values({ caseId: "case-4", patentId: "patent-d", status: "important" });

    const result = await getEvaluatedPatentsByCase("case-3");

    expect(result).toHaveLength(0);
  });
});
