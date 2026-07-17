import type { LlmLogKind } from "@/db/schema";

/**
 * AI送受信ログの種別（kind）の日本語表示ラベル。
 * `src/db/schema.ts` の `llmLogKindValues` と1対1で対応させること
 * （`Record<LlmLogKind, string>` により網羅性は型で保証される）。
 */
export const LLM_LOG_KIND_LABELS: Record<LlmLogKind, string> = {
  expansion: "検索語展開",
  analysis: "特許解析",
};
