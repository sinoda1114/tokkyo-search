import { describe, expect, it } from "vitest";
import { buildExpansionPrompt } from "./expansion";

describe("buildExpansionPrompt", () => {
  it("入力語をすべて含むプロンプトを生成する", () => {
    const prompt = buildExpansionPrompt(["ねじ", "ボルト"]);
    expect(prompt).toContain("ねじ");
    expect(prompt).toContain("ボルト");
  });

  it("技術分野が指定されていれば含める", () => {
    const prompt = buildExpansionPrompt(["ねじ"], "機械要素");
    expect(prompt).toContain("機械要素");
  });

  it("技術分野未指定でもエラーにならず「指定なし」と記載する", () => {
    const prompt = buildExpansionPrompt(["ねじ"]);
    expect(prompt).toContain("指定なし");
  });

  it("発明内容の推測禁止と語の創作禁止を明記する", () => {
    const prompt = buildExpansionPrompt(["ねじ"]);
    expect(prompt).toContain("推測しないこと");
    expect(prompt).toContain("創作しないこと");
  });

  it("各タイプ最大5語の制約を明記する", () => {
    const prompt = buildExpansionPrompt(["ねじ"]);
    expect(prompt).toContain("5語");
  });

  it("JSON出力のみを指示する", () => {
    const prompt = buildExpansionPrompt(["ねじ"]);
    expect(prompt).toMatch(/JSON/);
  });

  it("sourceTermの指示を含む", () => {
    const prompt = buildExpansionPrompt(["ねじ"]);
    expect(prompt).toContain("sourceTerm");
  });

  it("展開する7種の語タイプをすべて含む", () => {
    const prompt = buildExpansionPrompt(["ねじ"]);
    for (const type of [
      "synonym",
      "broader",
      "narrower",
      "material",
      "function",
      "effect",
      "english",
    ]) {
      expect(prompt).toContain(type);
    }
  });
});
