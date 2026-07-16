import { describe, expect, it } from "vitest";
import { mapAnalysisCandidateType } from "@/features/search-terms/analysis-term-type-mapper";

describe("mapAnalysisCandidateType", () => {
  it.each([
    ["synonym", "synonym"],
    ["broader", "broader"],
    ["narrower", "narrower"],
    ["material", "material"],
    ["function", "function"],
    ["effect", "effect"],
    ["english", "english"],
  ] as const)("既知の英語表記 %s は %s にマッピングする", (input, expected) => {
    expect(mapAnalysisCandidateType(input)).toBe(expected);
  });

  it.each([
    ["類義語", "synonym"],
    ["上位概念", "broader"],
    ["下位概念", "narrower"],
    ["材質", "material"],
    ["機能", "function"],
    ["効果", "effect"],
    ["英語表現", "english"],
  ] as const)("既知の日本語表記 %s は %s にマッピングする", (input, expected) => {
    expect(mapAnalysisCandidateType(input)).toBe(expected);
  });

  it("大文字小文字・前後の空白の違いを無視してマッピングする", () => {
    expect(mapAnalysisCandidateType("  Synonym  ")).toBe("synonym");
    expect(mapAnalysisCandidateType("BROADER")).toBe("broader");
  });

  it("未知の文字列は synonym にフォールバックする", () => {
    expect(mapAnalysisCandidateType("unknown-type")).toBe("synonym");
    expect(mapAnalysisCandidateType("")).toBe("synonym");
    expect(mapAnalysisCandidateType("その他")).toBe("synonym");
  });
});
