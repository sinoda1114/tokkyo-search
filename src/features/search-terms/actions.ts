"use server";

import { nanoid } from "nanoid";
import { searchTerms, type SearchTermType } from "@/db/schema";

function normalizeTerms(terms: string[]): string[] {
  const trimmed = terms.map((term) => term.trim()).filter((term) => term.length > 0);
  return Array.from(new Set(trimmed));
}

export interface AddSearchTermsResult {
  insertedCount: number;
}

/**
 * ユーザーが入力した検索語を termType: "original", source: "user" として一括保存する。
 * 同一案件・同一テキストの重複（`search_terms_case_id_term_type_text_unique`）は無視する。
 * `@/db/client` は関数呼び出し時に遅延インポートする（他featureと同じパターン）。
 */
export async function addSearchTerms(
  caseId: string,
  terms: string[],
): Promise<AddSearchTermsResult> {
  const normalized = normalizeTerms(terms);
  if (normalized.length === 0) {
    return { insertedCount: 0 };
  }

  const { db } = await import("@/db/client");
  const rows = normalized.map((text) => ({
    id: nanoid(),
    caseId,
    termType: "original" as const,
    text,
    source: "user" as const,
  }));

  const inserted = await db
    .insert(searchTerms)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: searchTerms.id });

  return { insertedCount: inserted.length };
}

export interface SelectedExpansionTerm {
  type: SearchTermType;
  text: string;
  sourceTerm: string;
}

export interface SaveSelectedExpansionsResult {
  insertedCount: number;
}

/**
 * AI展開結果からユーザーが選んだ候補語を termType: 選択されたタイプ, source: "llm" として一括保存する。
 * 重複（同一案件・同一タイプ・同一テキスト）は無視する。
 */
export async function saveSelectedExpansions(
  caseId: string,
  selected: SelectedExpansionTerm[],
): Promise<SaveSelectedExpansionsResult> {
  if (selected.length === 0) {
    return { insertedCount: 0 };
  }

  const { db } = await import("@/db/client");
  const rows = selected.map((term) => ({
    id: nanoid(),
    caseId,
    termType: term.type,
    text: term.text,
    source: "llm" as const,
  }));

  const inserted = await db
    .insert(searchTerms)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: searchTerms.id });

  return { insertedCount: inserted.length };
}
