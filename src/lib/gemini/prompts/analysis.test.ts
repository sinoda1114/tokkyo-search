import { describe, expect, it } from "vitest";
import { buildAnalysisPrompt } from "./analysis";

describe("buildAnalysisPrompt", () => {
  const basePatent = {
    title: "テスト特許",
    abstract: "要約本文",
    claims: "請求項本文",
  };

  it("title/abstract/claimsを含める", () => {
    const prompt = buildAnalysisPrompt(basePatent);
    expect(prompt).toContain("テスト特許");
    expect(prompt).toContain("要約本文");
    expect(prompt).toContain("請求項本文");
  });

  it("abstractがnullの場合は「未収録」として扱う", () => {
    const prompt = buildAnalysisPrompt({ title: "T", abstract: null, claims: "claims" });
    expect(prompt).toContain("未収録");
  });

  it("claimsがnullの場合は「未収録」として扱う", () => {
    const prompt = buildAnalysisPrompt({ title: "T", abstract: "abstract", claims: null });
    expect(prompt).toContain("未収録");
  });

  it("特許性・新規性・進歩性を断定しない制約を明記する", () => {
    const prompt = buildAnalysisPrompt(basePatent);
    expect(prompt).toContain("特許性");
    expect(prompt).toContain("新規性");
    expect(prompt).toContain("進歩性");
  });

  it("推測・補完しない制約を明記する", () => {
    const prompt = buildAnalysisPrompt(basePatent);
    expect(prompt).toContain("推測");
  });

  it("本文にない情報はnullとする制約を明記する", () => {
    const prompt = buildAnalysisPrompt(basePatent);
    expect(prompt).toContain("null");
  });

  it("JSON出力のみを指示する", () => {
    const prompt = buildAnalysisPrompt(basePatent);
    expect(prompt).toMatch(/JSON/);
  });

  it("抽出項目をすべて含む", () => {
    const prompt = buildAnalysisPrompt(basePatent);
    for (const field of [
      "overview",
      "background",
      "problem",
      "solution",
      "effect",
      "keyTerms",
      "searchCandidates",
      "citedReferences",
    ]) {
      expect(prompt).toContain(field);
    }
  });
});
