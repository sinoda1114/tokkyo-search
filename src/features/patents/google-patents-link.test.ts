import { describe, expect, it } from "vitest";
import { buildGooglePatentsUrl } from "@/features/patents/google-patents-link";

describe("buildGooglePatentsUrl", () => {
  it("公開番号のハイフンを除去してGoogle PatentsのURLを組み立てる", () => {
    expect(buildGooglePatentsUrl("JP-2020123456-A")).toBe(
      "https://patents.google.com/patent/JP2020123456A",
    );
  });

  it("kindCodeが英数字混在（A1等）でもそのまま連結される", () => {
    expect(buildGooglePatentsUrl("US-10123456-B2")).toBe(
      "https://patents.google.com/patent/US10123456B2",
    );
  });

  it("既にハイフンなしの公開番号はそのまま連結される", () => {
    expect(buildGooglePatentsUrl("JP2020123456A")).toBe(
      "https://patents.google.com/patent/JP2020123456A",
    );
  });

  it("ハイフンが1箇所だけの公開番号でも正しく変換する", () => {
    expect(buildGooglePatentsUrl("JP2020-000001A")).toBe(
      "https://patents.google.com/patent/JP2020000001A",
    );
  });

  it("前後の空白をトリムしてから変換する", () => {
    expect(buildGooglePatentsUrl("  JP-2020123456-A  ")).toBe(
      "https://patents.google.com/patent/JP2020123456A",
    );
  });

  it("空文字が渡されるとエラーを投げる", () => {
    expect(() => buildGooglePatentsUrl("")).toThrow();
  });

  it("空白のみの文字列が渡されるとエラーを投げる", () => {
    expect(() => buildGooglePatentsUrl("   ")).toThrow();
  });
});
