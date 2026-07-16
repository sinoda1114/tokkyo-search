import { searchTermTypeValues, type SearchTermType } from "@/db/schema";

/**
 * 検索語タイプの日本語表示ラベル。
 * `src/db/schema.ts` の `searchTermTypeValues` と1対1で対応させること。
 */
export const TERM_TYPE_LABELS: Record<SearchTermType, string> = {
  original: "入力語",
  synonym: "類義語",
  broader: "上位概念",
  narrower: "下位概念",
  material: "材質",
  function: "機能",
  effect: "効果",
  english: "英語表現",
};

/** 一覧表示・展開候補表示で使うタイプの表示順。 */
export const TERM_TYPE_ORDER: readonly SearchTermType[] = searchTermTypeValues;
