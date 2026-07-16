import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AnalysisResult } from "@/lib/gemini/schemas";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

export const cases = sqliteTable("cases", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  referenceNumber: text("reference_number"),
  technicalField: text("technical_field"),
  memo: text("memo"),
  ...timestamps,
});

export const searchTermTypeValues = [
  "original",
  "synonym",
  "broader",
  "narrower",
  "material",
  "function",
  "effect",
  "english",
] as const;
export type SearchTermType = (typeof searchTermTypeValues)[number];

export const searchTermSourceValues = ["user", "llm", "analysis"] as const;
export type SearchTermSource = (typeof searchTermSourceValues)[number];

export const searchTerms = sqliteTable(
  "search_terms",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    parentTermId: text("parent_term_id"),
    termType: text("term_type").$type<SearchTermType>().notNull(),
    text: text("text").notNull(),
    source: text("source").$type<SearchTermSource>().notNull().default("user"),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    // 同一案件・同一タイプで同じ語を重複登録しないための制約。
    // 追加系Server Actionはこれを前提に `onConflictDoNothing()` で重複を無視する。
    uniqueIndex("search_terms_case_id_term_type_text_unique").on(
      table.caseId,
      table.termType,
      table.text,
    ),
  ],
);

export const searchRunStatusValues = ["success", "error"] as const;
export type SearchRunStatus = (typeof searchRunStatusValues)[number];

export const searchRuns = sqliteTable("search_runs", {
  id: text("id").primaryKey(),
  caseId: text("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  conditions: text("conditions", { mode: "json" }).notNull(),
  status: text("status").$type<SearchRunStatus>().notNull(),
  errorMessage: text("error_message"),
  resultCount: integer("result_count"),
  bytesBilled: integer("bytes_billed"),
  executedAt: integer("executed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const searchRunTerms = sqliteTable(
  "search_run_terms",
  {
    searchRunId: text("search_run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    searchTermId: text("search_term_id")
      .notNull()
      .references(() => searchTerms.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.searchRunId, table.searchTermId] })],
);

export const patents = sqliteTable("patents", {
  id: text("id").primaryKey(),
  publicationNumber: text("publication_number").notNull().unique(),
  applicationNumber: text("application_number"),
  countryCode: text("country_code"),
  kindCode: text("kind_code"),
  title: text("title"),
  abstract: text("abstract"),
  claimsText: text("claims_text"),
  assignees: text("assignees", { mode: "json" }).$type<string[]>(),
  ipcCodes: text("ipc_codes", { mode: "json" }).$type<string[]>(),
  cpcCodes: text("cpc_codes", { mode: "json" }).$type<string[]>(),
  citedPublications: text("cited_publications", { mode: "json" }).$type<string[]>(),
  publicationDate: text("publication_date"),
  filingDate: text("filing_date"),
  jpoData: text("jpo_data", { mode: "json" }),
  fetchedAt: integer("fetched_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const searchResults = sqliteTable(
  "search_results",
  {
    searchRunId: text("search_run_id")
      .notNull()
      .references(() => searchRuns.id, { onDelete: "cascade" }),
    patentId: text("patent_id")
      .notNull()
      .references(() => patents.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    matchedTerms: text("matched_terms", { mode: "json" }).$type<string[]>(),
  },
  (table) => [primaryKey({ columns: [table.searchRunId, table.patentId] })],
);

export const casePatentStatusValues = ["unrated", "important", "reference", "excluded"] as const;
export type CasePatentStatus = (typeof casePatentStatusValues)[number];

export const casePatents = sqliteTable(
  "case_patents",
  {
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    patentId: text("patent_id")
      .notNull()
      .references(() => patents.id, { onDelete: "cascade" }),
    status: text("status").$type<CasePatentStatus>().notNull().default("unrated"),
    comment: text("comment"),
    exclusionReason: text("exclusion_reason"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [primaryKey({ columns: [table.caseId, table.patentId] })],
);

export const analysisStatusValues = ["success", "error"] as const;
export type AnalysisStatus = (typeof analysisStatusValues)[number];

export const patentAnalyses = sqliteTable("patent_analyses", {
  id: text("id").primaryKey(),
  patentId: text("patent_id")
    .notNull()
    .unique()
    .references(() => patents.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  result: text("result", { mode: "json" }).$type<AnalysisResult>(),
  status: text("status").$type<AnalysisStatus>().notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamps.createdAt,
});

export const llmLogKindValues = ["expansion", "analysis"] as const;
export type LlmLogKind = (typeof llmLogKindValues)[number];

export const llmLogs = sqliteTable("llm_logs", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<LlmLogKind>().notNull(),
  caseId: text("case_id"),
  patentId: text("patent_id"),
  requestPayload: text("request_payload").notNull(),
  responsePayload: text("response_payload"),
  model: text("model").notNull(),
  createdAt: timestamps.createdAt,
});
