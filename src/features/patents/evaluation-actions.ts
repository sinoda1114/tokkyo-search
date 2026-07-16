"use server";

import { z } from "zod";
import { sql } from "drizzle-orm";
import { casePatents, casePatentStatusValues, type CasePatentStatus } from "@/db/schema";

const ratePatentSchema = z
  .object({
    caseId: z.string().trim().min(1, "caseIdは必須です"),
    patentId: z.string().trim().min(1, "patentIdは必須です"),
    status: z.enum(casePatentStatusValues),
    comment: z.string().trim().optional(),
    exclusionReason: z.string().trim().optional(),
  })
  .refine((data) => data.status !== "excluded" || (data.exclusionReason ?? "").length > 0, {
    message: "対象外にする場合は対象外理由を入力してください",
    path: ["exclusionReason"],
  });

export interface RatePatentInput {
  caseId: string;
  patentId: string;
  status: CasePatentStatus;
  comment?: string;
  exclusionReason?: string;
}

/**
 * 特許の評価（重要/参考/対象外/未評価）を保存するServer Action。
 * PK(caseId, patentId)に対するupsertのため、初回評価も既存評価の更新も同じ関数で扱う。
 * status: "excluded" のときexclusionReasonは必須（Zodのrefineでバリデーションし、
 * 違反時はエラーをthrowする）。excluded以外に変更した場合、exclusionReasonは保存しない
 * （既存の対象外理由を引きずらないようクリアする）。
 */
export async function ratePatent(input: RatePatentInput): Promise<void> {
  const parsed = ratePatentSchema.parse(input);

  const comment = parsed.comment && parsed.comment.length > 0 ? parsed.comment : null;
  const exclusionReason = parsed.status === "excluded" ? (parsed.exclusionReason ?? null) : null;

  const { db } = await import("@/db/client");
  await db
    .insert(casePatents)
    .values({
      caseId: parsed.caseId,
      patentId: parsed.patentId,
      status: parsed.status,
      comment,
      exclusionReason,
    })
    .onConflictDoUpdate({
      target: [casePatents.caseId, casePatents.patentId],
      set: {
        status: sql`excluded.status`,
        comment: sql`excluded.comment`,
        exclusionReason: sql`excluded.exclusion_reason`,
        updatedAt: new Date(),
      },
    });
}
