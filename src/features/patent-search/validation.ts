/**
 * 検索実行フォームのバリデーションスキーマ。
 * APIルート（サーバー）とフォームコンポーネント（クライアント）の双方から参照し、
 * 「日付逆転を弾かない」「サーバーとクライアントで判定がずれる」といった不整合を防ぐ。
 */
import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const optionalNonEmptyString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

function dateField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label}を指定してください`)
    .regex(DATE_PATTERN, `${label}の形式が不正です（YYYY-MM-DD）`);
}

export const searchRequestSchema = z
  .object({
    termIds: z.array(z.string().trim().min(1)).min(1, "検索語を1件以上選択してください"),
    dateFrom: dateField("検索対象期間の開始日"),
    dateTo: dateField("検索対象期間の終了日"),
    searchClaims: z.boolean().optional(),
    assignee: optionalNonEmptyString,
    ipcPrefix: optionalNonEmptyString,
  })
  .refine((data) => !DATE_PATTERN.test(data.dateFrom) || !DATE_PATTERN.test(data.dateTo) || data.dateFrom <= data.dateTo, {
    message: "検索対象期間の終了日は開始日以降の日付を指定してください",
    path: ["dateTo"],
  });

export type SearchRequestInput = z.input<typeof searchRequestSchema>;
export type SearchRequestOutput = z.infer<typeof searchRequestSchema>;

/** ZodErrorをフィールド名 → 最初のエラーメッセージ のマップへ変換する。 */
export function collectFieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}
