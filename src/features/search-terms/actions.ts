"use server";

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { searchTerms, type SearchTermType } from "@/db/schema";
import type { Db } from "@/db/client";

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
 * `sourceTerm`（展開元の語テキスト）に一致する既存の`search_terms`行を同一案件内から探す。
 * 「概念グループ」は`parentTermId`をルート（`parentTermId`がnullの行）まで辿った先を指すため、
 * 展開元自体がすでに他の語の子（非ルート）であっても、その行のidをそのまま親として使う
 * （ルート解決は検索実行時 `search-service.ts` 側で行う）。
 * 同一テキストの行が複数見つかった場合はルート（`parentTermId`がnull）を優先し、
 * それでも複数あれば最も古い行を採用する。
 */
async function resolveParentIdsBySourceText(
  db: Db,
  caseId: string,
  sourceTexts: string[],
): Promise<Map<string, string>> {
  const parentIdByText = new Map<string, string>();
  if (sourceTexts.length === 0) {
    return parentIdByText;
  }

  const candidateRows = await db
    .select({
      id: searchTerms.id,
      text: searchTerms.text,
      parentTermId: searchTerms.parentTermId,
      createdAt: searchTerms.createdAt,
    })
    .from(searchTerms)
    .where(and(eq(searchTerms.caseId, caseId), inArray(searchTerms.text, sourceTexts)));

  for (const text of sourceTexts) {
    const matches = candidateRows.filter((row) => row.text === text);
    if (matches.length === 0) {
      continue;
    }
    const root = matches.find((row) => row.parentTermId === null);
    const preferred =
      root ??
      matches.reduce((oldest, row) => (row.createdAt < oldest.createdAt ? row : oldest));
    parentIdByText.set(text, preferred.id);
  }

  return parentIdByText;
}

/**
 * AI展開結果からユーザーが選んだ候補語を termType: 選択されたタイプ, source: "llm" として一括保存する。
 * 重複（同一案件・同一タイプ・同一テキスト）は無視する。
 * `sourceTerm`から解決できる既存の検索語があれば`parentTermId`として紐づけ、AND検索の
 * 概念グループを構成できるようにする（見つからない場合はnullのまま保存する）。
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

  const sourceTexts = Array.from(
    new Set(valid.map((term) => term.sourceTerm.trim()).filter((text) => text.length > 0)),
  );
  const parentIdByText = await resolveParentIdsBySourceText(db, caseId, sourceTexts);

  const rows = valid.map((term) => ({
    id: nanoid(),
    caseId,
    termType: term.type,
    text: term.text,
    source: "llm" as const,
    parentTermId: parentIdByText.get(term.sourceTerm.trim()) ?? null,
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

/**
 * 指定した検索語を削除する。`parentTermId`で本語を親として参照している子語（AI展開で
 * 増えた類義語等）はカスケードで一緒に削除する。`search_terms.parentTermId` にはDB側の
 * 外部キー制約を張っていないため、アプリケーション側で子を先に再帰的に削除してから
 * 本体を削除する。他案件の検索語IDを指定した場合は何もしない（caseIdの一致を必須とする）。
 */
export async function deleteSearchTerm(caseId: string, termId: string): Promise<void> {
  const { db } = await import("@/db/client");

  async function deleteWithChildren(id: string): Promise<void> {
    const children = await db
      .select({ id: searchTerms.id })
      .from(searchTerms)
      .where(and(eq(searchTerms.caseId, caseId), eq(searchTerms.parentTermId, id)));

    for (const child of children) {
      await deleteWithChildren(child.id);
    }

    await db.delete(searchTerms).where(and(eq(searchTerms.caseId, caseId), eq(searchTerms.id, id)));
  }

  await deleteWithChildren(termId);
}
