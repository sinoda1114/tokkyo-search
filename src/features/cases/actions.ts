"use server";

import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cases } from "@/db/schema";

const MEMO_MAX_LENGTH = 5000;

const createCaseSchema = z.object({
  name: z.string().trim().min(1, "案件名を入力してください").max(200, "案件名は200文字以内で入力してください"),
  referenceNumber: z.string().trim().max(100, "管理番号は100文字以内で入力してください").optional(),
  technicalField: z.string().trim().max(100, "技術分野は100文字以内で入力してください").optional(),
  memo: z.string().trim().max(MEMO_MAX_LENGTH, `メモは${MEMO_MAX_LENGTH}文字以内で入力してください`).optional(),
});

const updateMemoSchema = z.string().trim().max(MEMO_MAX_LENGTH, `メモは${MEMO_MAX_LENGTH}文字以内で入力してください`);

export interface CreateCaseFormState {
  errors?: {
    name?: string[];
    referenceNumber?: string[];
    technicalField?: string[];
    memo?: string[];
  };
  values?: {
    name: string;
    referenceNumber: string;
    technicalField: string;
    memo: string;
  };
}

function readField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * 案件作成フォームのServer Action。
 * Zodバリデーション → DB保存 → 作成した案件の詳細ページへredirect。
 * `@/db/client` は呼び出し時に遅延インポートする（他featureの`llm-log.ts`と同じパターン）。
 */
export async function createCase(
  _prevState: CreateCaseFormState,
  formData: FormData,
): Promise<CreateCaseFormState> {
  const raw = {
    name: readField(formData, "name"),
    referenceNumber: readField(formData, "referenceNumber"),
    technicalField: readField(formData, "technicalField"),
    memo: readField(formData, "memo"),
  };

  const parsed = createCaseSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      values: raw,
    };
  }

  const { db } = await import("@/db/client");
  const id = nanoid();
  await db.insert(cases).values({
    id,
    name: parsed.data.name,
    referenceNumber: parsed.data.referenceNumber || null,
    technicalField: parsed.data.technicalField || null,
    memo: parsed.data.memo || null,
  });

  redirect(`/cases/${id}`);
}

export interface UpdateCaseMemoResult {
  memo: string | null;
}

/**
 * 案件メモをインライン編集で更新する。フォーム送信ではなくClient Componentから
 * 直接呼び出す想定（FormDataを介さずcaseIdとmemoを受け取る）。
 */
export async function updateCaseMemo(caseId: string, memo: string): Promise<UpdateCaseMemoResult> {
  const trimmed = updateMemoSchema.parse(memo);
  const { db } = await import("@/db/client");
  const [updated] = await db
    .update(cases)
    .set({ memo: trimmed || null, updatedAt: new Date() })
    .where(eq(cases.id, caseId))
    .returning({ memo: cases.memo });

  return { memo: updated?.memo ?? null };
}
