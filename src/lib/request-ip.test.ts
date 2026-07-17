import { describe, expect, it } from "vitest";
import { getRequestIp } from "./request-ip";

describe("getRequestIp", () => {
  it("x-forwarded-forが1件のとき、そのIPを返す", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });

    expect(getRequestIp(request)).toBe("203.0.113.1");
  });

  it("x-forwarded-forが複数件のとき、先頭（クライアントに最も近い）のIPを返す", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1, 10.0.0.2" },
    });

    expect(getRequestIp(request)).toBe("203.0.113.1");
  });

  it("x-forwarded-forが無くx-real-ipがある場合、x-real-ipを返す", () => {
    const request = new Request("http://localhost/", {
      headers: { "x-real-ip": "203.0.113.9" },
    });

    expect(getRequestIp(request)).toBe("203.0.113.9");
  });

  it("どちらのヘッダーも無い場合、固定文字列にフォールバックする", () => {
    const request = new Request("http://localhost/");

    expect(getRequestIp(request)).toBe("unknown");
  });
});
