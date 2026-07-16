import { describe, expect, it } from "vitest";
import { normalizeApplicationNumber } from "./normalize";

describe("normalizeApplicationNumber", () => {
  it("「特願」プレフィックスとハイフンを除去して正規形に変換する", () => {
    expect(normalizeApplicationNumber("特願2020-123456")).toBe("2020123456");
  });

  it("「特願」プレフィックスがなくてもハイフンを除去する", () => {
    expect(normalizeApplicationNumber("2020-123456")).toBe("2020123456");
  });

  it("既に正規形（10桁数字のみ）の場合はそのまま返す", () => {
    expect(normalizeApplicationNumber("2020123456")).toBe("2020123456");
  });

  it("全角数字・全角ハイフンを半角に変換して正規化する", () => {
    expect(normalizeApplicationNumber("特願２０２０－１２３４５６")).toBe("2020123456");
  });

  it("空白（半角・全角）を除去して正規化する", () => {
    expect(normalizeApplicationNumber("特願 2020 - 123456 ")).toBe("2020123456");
    expect(normalizeApplicationNumber("特願　2020　－　123456　")).toBe("2020123456");
  });

  it("末尾の「号」を除去して正規化する", () => {
    expect(normalizeApplicationNumber("特願2020-123456号")).toBe("2020123456");
  });

  it("様々な種類のハイフン・ダッシュ文字を除去する", () => {
    expect(normalizeApplicationNumber("2020‐123456")).toBe("2020123456"); // U+2010 HYPHEN
    expect(normalizeApplicationNumber("2020–123456")).toBe("2020123456"); // U+2013 EN DASH
    expect(normalizeApplicationNumber("2020−123456")).toBe("2020123456"); // U+2212 MINUS SIGN
  });

  it("冪等性: 正規化済みの文字列を再度正規化しても変わらない", () => {
    const once = normalizeApplicationNumber("特願2020-123456");
    const twice = normalizeApplicationNumber(once);
    expect(twice).toBe(once);
  });

  it("空文字列を入力するとErrorを投げる", () => {
    expect(() => normalizeApplicationNumber("")).toThrow();
  });

  it("空白のみの文字列を入力するとErrorを投げる", () => {
    expect(() => normalizeApplicationNumber("   ")).toThrow();
  });

  it("数字が極端に少ない場合はErrorを投げる", () => {
    expect(() => normalizeApplicationNumber("12345")).toThrow();
  });

  it("数字が多すぎる場合はErrorを投げる", () => {
    expect(() => normalizeApplicationNumber("202012345678")).toThrow();
  });

  it("数字以外の文字を含む場合はErrorを投げる", () => {
    expect(() => normalizeApplicationNumber("abcdefghij")).toThrow();
  });

  it("年部分が明らかに不正な範囲の場合はErrorを投げる", () => {
    expect(() => normalizeApplicationNumber("0001123456")).toThrow();
  });
});
