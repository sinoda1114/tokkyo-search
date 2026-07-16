import { Type, type Schema } from "@google/genai";
import { z } from "zod";

/**
 * 検索語展開で提案する語のタイプ。
 * `src/db/schema.ts` の `searchTermTypeValues` から `original`（ユーザー入力そのもの）を除いた語彙と一致させること。
 */
export const expansionTermTypeValues = [
  "synonym",
  "broader",
  "narrower",
  "material",
  "function",
  "effect",
  "english",
] as const;
export type ExpansionTermType = (typeof expansionTermTypeValues)[number];

export const expansionTermTypeSchema = z.enum(expansionTermTypeValues);

export const expansionResultSchema = z.object({
  terms: z.array(
    z.object({
      type: expansionTermTypeSchema,
      text: z.string().min(1),
      sourceTerm: z.string().min(1),
    }),
  ),
});
export type ExpansionResult = z.infer<typeof expansionResultSchema>;

/** `@google/genai` の `config.responseSchema` に渡すためのスキーマ定義。 */
export const expansionResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    terms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: [...expansionTermTypeValues],
          },
          text: { type: Type.STRING },
          sourceTerm: { type: Type.STRING },
        },
        required: ["type", "text", "sourceTerm"],
      },
    },
  },
  required: ["terms"],
};

export const analysisSearchCandidateSchema = z.object({
  type: z.string().min(1),
  text: z.string().min(1),
});

export const analysisResultSchema = z.object({
  overview: z.string().nullable(),
  background: z.string().nullable(),
  problem: z.string().nullable(),
  solution: z.string().nullable(),
  effect: z.string().nullable(),
  keyTerms: z.array(z.string()),
  searchCandidates: z.array(analysisSearchCandidateSchema),
  citedReferences: z.array(z.string()),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

/** `@google/genai` の `config.responseSchema` に渡すためのスキーマ定義。 */
export const analysisResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING, nullable: true },
    background: { type: Type.STRING, nullable: true },
    problem: { type: Type.STRING, nullable: true },
    solution: { type: Type.STRING, nullable: true },
    effect: { type: Type.STRING, nullable: true },
    keyTerms: { type: Type.ARRAY, items: { type: Type.STRING } },
    searchCandidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          text: { type: Type.STRING },
        },
        required: ["type", "text"],
      },
    },
    citedReferences: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "overview",
    "background",
    "problem",
    "solution",
    "effect",
    "keyTerms",
    "searchCandidates",
    "citedReferences",
  ],
};
