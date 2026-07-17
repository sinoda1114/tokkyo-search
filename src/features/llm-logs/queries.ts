import { desc, eq } from "drizzle-orm";
import { llmLogs } from "@/db/schema";

export type LlmLogRow = typeof llmLogs.$inferSelect;

const RECENT_LOGS_LIMIT = 50;

/**
 * 案件に紐づくAI（Gemini）送受信ログを作成日時の降順で取得する。
 * 件数が多い場合を想定し、直近 `RECENT_LOGS_LIMIT` 件までに制限する。
 * `@/db/client` は関数呼び出し時に遅延インポートする（他featureと同じパターン）。
 */
export async function getLlmLogsByCase(caseId: string): Promise<LlmLogRow[]> {
  const { db } = await import("@/db/client");
  return db
    .select()
    .from(llmLogs)
    .where(eq(llmLogs.caseId, caseId))
    .orderBy(desc(llmLogs.createdAt))
    .limit(RECENT_LOGS_LIMIT);
}
