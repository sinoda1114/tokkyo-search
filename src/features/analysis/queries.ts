import { eq } from "drizzle-orm";
import { patentAnalyses } from "@/db/schema";

export type PatentAnalysis = typeof patentAnalyses.$inferSelect;

/**
 * 特許IDに紐づくAI解析結果を1件取得する。存在しない場合はundefinedを返す。
 * `patentId` はUNIQUE制約があるため、同一特許の解析結果は常に高々1件。
 * `@/db/client` は関数呼び出し時に遅延インポートする（他featureと同じパターン）。
 */
export async function getAnalysisByPatentId(
  patentId: string,
): Promise<PatentAnalysis | undefined> {
  const { db } = await import("@/db/client");
  const rows = await db
    .select()
    .from(patentAnalyses)
    .where(eq(patentAnalyses.patentId, patentId))
    .limit(1);
  return rows[0];
}
