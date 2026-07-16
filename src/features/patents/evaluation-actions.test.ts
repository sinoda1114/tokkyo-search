import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { cases, casePatents, patents } from "@/db/schema";
import { ratePatent } from "@/features/patents/evaluation-actions";

async function seedCaseAndPatent(caseId: string, patentId: string): Promise<void> {
  await db.insert(cases).values({ id: caseId, name: "テスト案件" });
  await db.insert(patents).values({ id: patentId, publicationNumber: `JP-${patentId}-A` });
}

async function findEvaluation(caseId: string, patentId: string) {
  const rows = await db
    .select()
    .from(casePatents)
    .where(and(eq(casePatents.caseId, caseId), eq(casePatents.patentId, patentId)));
  return rows[0];
}

describe("ratePatent", () => {
  it("statusがexcludedでexclusionReason未入力のときバリデーションエラーになりDBに保存しない", async () => {
    await seedCaseAndPatent("case-1", "patent-1");

    await expect(
      ratePatent({ caseId: "case-1", patentId: "patent-1", status: "excluded" }),
    ).rejects.toThrow();

    const rows = await db.select().from(casePatents);
    expect(rows).toHaveLength(0);
  });

  it("statusがexcludedでexclusionReasonが空白のみのときもバリデーションエラーになる", async () => {
    await seedCaseAndPatent("case-1b", "patent-1b");

    await expect(
      ratePatent({
        caseId: "case-1b",
        patentId: "patent-1b",
        status: "excluded",
        exclusionReason: "   ",
      }),
    ).rejects.toThrow();

    const rows = await db.select().from(casePatents);
    expect(rows).toHaveLength(0);
  });

  it("importantやreferenceではexclusionReasonなしでも保存できる", async () => {
    await seedCaseAndPatent("case-2", "patent-2");

    await ratePatent({
      caseId: "case-2",
      patentId: "patent-2",
      status: "important",
      comment: "有力な先行技術",
    });

    const evaluation = await findEvaluation("case-2", "patent-2");
    expect(evaluation?.status).toBe("important");
    expect(evaluation?.comment).toBe("有力な先行技術");
    expect(evaluation?.exclusionReason).toBeNull();
  });

  it("正常系: excludedはexclusionReasonありで保存できる", async () => {
    await seedCaseAndPatent("case-3", "patent-3");

    await ratePatent({
      caseId: "case-3",
      patentId: "patent-3",
      status: "excluded",
      exclusionReason: "技術分野が異なる",
    });

    const evaluation = await findEvaluation("case-3", "patent-3");
    expect(evaluation?.status).toBe("excluded");
    expect(evaluation?.exclusionReason).toBe("技術分野が異なる");
  });

  it("既存評価をupsertで上書き更新する", async () => {
    await seedCaseAndPatent("case-4", "patent-4");
    await ratePatent({ caseId: "case-4", patentId: "patent-4", status: "reference" });

    await ratePatent({
      caseId: "case-4",
      patentId: "patent-4",
      status: "important",
      comment: "更新後コメント",
    });

    const rows = await db
      .select()
      .from(casePatents)
      .where(and(eq(casePatents.caseId, "case-4"), eq(casePatents.patentId, "patent-4")));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("important");
    expect(rows[0].comment).toBe("更新後コメント");
  });

  it("excludedからimportantへ変更した場合exclusionReasonがクリアされる", async () => {
    await seedCaseAndPatent("case-5", "patent-5");
    await ratePatent({
      caseId: "case-5",
      patentId: "patent-5",
      status: "excluded",
      exclusionReason: "分野違い",
    });

    await ratePatent({ caseId: "case-5", patentId: "patent-5", status: "important" });

    const evaluation = await findEvaluation("case-5", "patent-5");
    expect(evaluation?.exclusionReason).toBeNull();
    expect(evaluation?.status).toBe("important");
  });

  it("unratedへの評価解除も保存できる", async () => {
    await seedCaseAndPatent("case-6", "patent-6");
    await ratePatent({ caseId: "case-6", patentId: "patent-6", status: "important" });

    await ratePatent({ caseId: "case-6", patentId: "patent-6", status: "unrated" });

    const evaluation = await findEvaluation("case-6", "patent-6");
    expect(evaluation?.status).toBe("unrated");
  });

  it("caseIdが空文字のときバリデーションエラーになる", async () => {
    await expect(
      ratePatent({ caseId: "", patentId: "patent-7", status: "reference" }),
    ).rejects.toThrow();
  });
});
