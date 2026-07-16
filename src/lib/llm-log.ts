import { nanoid } from "nanoid";
import { llmLogs, type LlmLogKind } from "@/db/schema";

export interface LogLlmCallEntry {
  kind: LlmLogKind;
  caseId?: string;
  patentId?: string;
  requestPayload: string;
  responsePayload?: string;
  model: string;
}

/**
 * Geminiへの送信内容・応答内容を llm_logs テーブルに記録する。
 * `@/db/client` は関数呼び出し時に遅延インポートする（このモジュールを import しただけでは
 * DB接続用の環境変数を検証しない。テストでは `@/db/client` を vi.mock でテスト用DBに差し替える）。
 */
export async function logLlmCall(entry: LogLlmCallEntry): Promise<void> {
  const { db } = await import("@/db/client");
  await db.insert(llmLogs).values({
    id: nanoid(),
    kind: entry.kind,
    caseId: entry.caseId ?? null,
    patentId: entry.patentId ?? null,
    requestPayload: entry.requestPayload,
    responsePayload: entry.responsePayload ?? null,
    model: entry.model,
  });
}
