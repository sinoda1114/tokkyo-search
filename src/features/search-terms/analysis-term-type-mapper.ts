import { type SearchTermType } from "@/db/schema";

const FALLBACK_TERM_TYPE: SearchTermType = "synonym";

/**
 * AI文献解析結果の `searchCandidates[].type` は自由記述の文字列（英語/日本語どちらも来うる）。
 * 既知の表記（英語・日本語）を `SearchTermType` にマッピングし、未知の文字列は "synonym" にフォールバックする。
 */
const CANDIDATE_TYPE_ALIASES: Record<string, SearchTermType> = {
  synonym: "synonym",
  類義語: "synonym",
  broader: "broader",
  上位概念: "broader",
  上位: "broader",
  narrower: "narrower",
  下位概念: "narrower",
  下位: "narrower",
  material: "material",
  材質: "material",
  function: "function",
  機能: "function",
  effect: "effect",
  効果: "effect",
  english: "english",
  英語: "english",
  英語表現: "english",
};

/**
 * 解析結果の再検索候補タイプ文字列を `SearchTermType` にマッピングする純粋関数。
 * 前後の空白・大文字小文字の違いを無視して既知の表記と照合し、一致しない場合は "synonym" を返す。
 */
export function mapAnalysisCandidateType(type: string): SearchTermType {
  const normalized = type.trim().toLowerCase();
  return CANDIDATE_TYPE_ALIASES[normalized] ?? FALLBACK_TERM_TYPE;
}
