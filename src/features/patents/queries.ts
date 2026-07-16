import { eq } from "drizzle-orm";
import { patents } from "@/db/schema";

export type Patent = typeof patents.$inferSelect;

/**
 * IDで特許を1件取得する。存在しない場合はundefinedを返す。
 * `@/db/client` は関数呼び出し時に遅延インポートする（他featureと同じパターン）。
 */
export async function getPatentById(patentId: string): Promise<Patent | undefined> {
  const { db } = await import("@/db/client");
  const rows = await db.select().from(patents).where(eq(patents.id, patentId)).limit(1);
  return rows[0];
}
