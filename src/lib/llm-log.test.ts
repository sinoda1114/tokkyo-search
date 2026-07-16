import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { logLlmCall } from "@/lib/llm-log";
import { db } from "@/db/client";
import { llmLogs } from "@/db/schema";

describe("logLlmCall", () => {
  it("expansion呼び出しの内容をllm_logsに保存する", async () => {
    await logLlmCall({
      kind: "expansion",
      caseId: "case-1",
      requestPayload: "リクエスト本文",
      responsePayload: "レスポンス本文",
      model: "gemini-2.5-flash-lite",
    });

    const rows = await db.select().from(llmLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "expansion",
      caseId: "case-1",
      patentId: null,
      requestPayload: "リクエスト本文",
      responsePayload: "レスポンス本文",
      model: "gemini-2.5-flash-lite",
    });
    expect(rows[0].id).toEqual(expect.any(String));
  });

  it("analysis呼び出しでpatentIdを保存し、caseId未指定はnullになる", async () => {
    await logLlmCall({
      kind: "analysis",
      patentId: "patent-1",
      requestPayload: "解析リクエスト",
      model: "gemini-2.5-flash-lite",
    });

    const rows = await db.select().from(llmLogs);
    const analysisRow = rows.find((row) => row.kind === "analysis");
    expect(analysisRow).toMatchObject({
      kind: "analysis",
      caseId: null,
      patentId: "patent-1",
      requestPayload: "解析リクエスト",
      responsePayload: null,
    });
  });

  it("responsePayload未指定時はnullを保存する（失敗時の記録を想定）", async () => {
    await logLlmCall({
      kind: "expansion",
      requestPayload: "失敗したリクエスト",
      model: "gemini-2.5-flash-lite",
    });

    const rows = await db.select().from(llmLogs);
    const failedRow = rows.find((row) => row.requestPayload === "失敗したリクエスト");
    expect(failedRow?.responsePayload).toBeNull();
  });
});
