"use server";

import { nanoid } from "nanoid";
import { searchTerms, type SearchTermType } from "@/db/schema";

/** 検索語1件あたりの上限文字数。極端に長い文字列がそのまま検索語として登録されるのを防ぐ。 */
const TERM_TEXT_MAX_LENGTH = 100;

function normalizeTerms(terms: string[]): string[] {
  const trimmed = terms
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && term.length <= TERM_TEXT_MAX_LENGTH);
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
  const valid = selected.filter((term) => term.text.trim().length <= TERM_TEXT_MAX_LENGTH);
  if (valid.length === 0) {
    return { insertedCount: 0 };
  }

  const { db } = await import("@/db/client");
  const rows = valid.map((term) => ({
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

export interface ResearchTerm {
  termType: SearchTermType;
  text: string;
}

/**
 * AI文献解析結果（特徴的用語・再検索候補・引用文献）からユーザーが選んだ語を
 * termType: 呼び出し側が決めたタイプ, source: "analysis" として一括保存する。
 * 重複（同一案件・同一タイプ・同一テキスト）は無視する。
 */
export async function addResearchTerms(caseId: string, terms: ResearchTerm[]): Promise<void> {
  const valid = terms.filter((term) => term.text.trim().length <= TERM_TEXT_MAX_LENGTH);
  if (valid.length === 0) {
    return;
  }

  const { db } = await import("@/db/client");
  const rows = valid.map((term) => ({
    id: nanoid(),
    caseId,
    termType: term.termType,
    text: term.text,
    source: "analysis" as const,
  }));

  await db.insert(searchTerms).values(rows).onConflictDoNothing();
}
