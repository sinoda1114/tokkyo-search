import { describe, expect, it } from "vitest";
import { searchTermTypeValues } from "@/db/schema";
import {
  analysisResultSchema,
  expansionResultSchema,
  expansionTermTypeValues,
} from "./schemas";

describe("expansionTermTypeValues", () => {
  it("db/schema.tsのsearchTermTypeValuesから'original'を除いた語彙と一致する", () => {
    const expected = searchTermTypeValues.filter((value) => value !== "original");
    expect([...expansionTermTypeValues].sort()).toEqual([...expected].sort());
  });
});

describe("expansionResultSchema", () => {
  it("正しい形の展開結果を受理する", () => {
    const result = expansionResultSchema.safeParse({
      terms: [
        { type: "synonym", text: "同義語", sourceTerm: "元の語" },
        { type: "english", text: "example", sourceTerm: "元の語" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("未知のtermTypeを拒否する", () => {
    const result = expansionResultSchema.safeParse({
      terms: [{ type: "original", text: "x", sourceTerm: "y" }],
    });
    expect(result.success).toBe(false);
  });

  it("空文字のtextを拒否する", () => {
    const result = expansionResultSchema.safeParse({
      terms: [{ type: "synonym", text: "", sourceTerm: "y" }],
    });
    expect(result.success).toBe(false);
  });

  it("sourceTerm欠如を拒否する", () => {
    const result = expansionResultSchema.safeParse({
      terms: [{ type: "synonym", text: "x" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("analysisResultSchema", () => {
  it("null許容項目と配列項目を受理する", () => {
    const result = analysisResultSchema.safeParse({
      overview: null,
      background: null,
      problem: "課題テキスト",
      solution: null,
      effect: null,
      keyTerms: ["用語A"],
      searchCandidates: [{ type: "synonym", text: "候補" }],
      citedReferences: [],
    });
    expect(result.success).toBe(true);
  });

  it("必須フィールドの欠如を拒否する", () => {
    const result = analysisResultSchema.safeParse({
      overview: null,
    });
    expect(result.success).toBe(false);
  });

  it("keyTermsが配列でない場合を拒否する", () => {
    const result = analysisResultSchema.safeParse({
      overview: null,
      background: null,
      problem: null,
      solution: null,
      effect: null,
      keyTerms: "用語A",
      searchCandidates: [],
      citedReferences: [],
    });
    expect(result.success).toBe(false);
  });

  it("searchCandidatesのtypeが許容値以外の場合を拒否する", () => {
    const result = analysisResultSchema.safeParse({
      overview: null,
      background: null,
      problem: null,
      solution: null,
      effect: null,
      keyTerms: [],
      searchCandidates: [{ type: "problem", text: "候補" }],
      citedReferences: [],
    });
    expect(result.success).toBe(false);
  });

  it("searchCandidatesのtextが長すぎる場合を拒否する", () => {
    const result = analysisResultSchema.safeParse({
      overview: null,
      background: null,
      problem: null,
      solution: null,
      effect: null,
      keyTerms: [],
      searchCandidates: [{ type: "synonym", text: "あ".repeat(41) }],
      citedReferences: [],
    });
    expect(result.success).toBe(false);
  });
});
