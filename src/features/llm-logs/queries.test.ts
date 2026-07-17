import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { db } from "@/db/client";
import { cases, llmLogs } from "@/db/schema";
import { getLlmLogsByCase } from "@/features/llm-logs/queries";

async function seedCase(caseId: string): Promise<void> {
  await db.insert(cases).values({ id: caseId, name: "テスト案件" });
}

describe("getLlmLogsByCase", () => {
  it("案件に紐づくAI送受信ログを作成日時の降順で返す", async () => {
    await seedCase("case-1");
    await db.insert(llmLogs).values([
      {
        id: "log-old",
        kind: "expansion",
        caseId: "case-1",
        requestPayload: "古いリクエスト",
        responsePayload: "古いレスポンス",
        model: "gemini-2.5-flash-lite",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "log-new",
        kind: "analysis",
        caseId: "case-1",
        patentId: "patent-1",
        requestPayload: "新しいリクエスト",
        responsePayload: "新しいレスポンス",
        model: "gemini-2.5-pro",
        createdAt: new Date("2024-06-01T00:00:00Z"),
      },
    ]);

    const result = await getLlmLogsByCase("case-1");

    expect(result.map((log) => log.id)).toEqual(["log-new", "log-old"]);
    expect(result[0].kind).toBe("analysis");
    expect(result[0].patentId).toBe("patent-1");
    expect(result[1].requestPayload).toBe("古いリクエスト");
  });

  it("他案件のログは含めない", async () => {
    await seedCase("case-a");
    await seedCase("case-b");
    await db.insert(llmLogs).values([
      {
        id: "log-a",
        kind: "expansion",
        caseId: "case-a",
        requestPayload: "リクエストA",
        model: "gemini-2.5-flash-lite",
      },
      {
        id: "log-b",
        kind: "expansion",
        caseId: "case-b",
        requestPayload: "リクエストB",
        model: "gemini-2.5-flash-lite",
      },
    ]);

    const result = await getLlmLogsByCase("case-a");

    expect(result.map((log) => log.id)).toEqual(["log-a"]);
  });

  it("caseIdに紐づかない（patentId起点の）ログは含めない", async () => {
    await seedCase("case-c");
    await db.insert(llmLogs).values({
      id: "log-no-case",
      kind: "analysis",
      patentId: "patent-x",
      requestPayload: "案件と無関係なリクエスト",
      model: "gemini-2.5-flash-lite",
    });

    const result = await getLlmLogsByCase("case-c");

    expect(result).toEqual([]);
  });

  it("ログが0件のとき空配列を返す", async () => {
    await seedCase("case-empty");

    const result = await getLlmLogsByCase("case-empty");

    expect(result).toEqual([]);
  });
});
