import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";
import proxy from "./proxy";

const ORIGINAL_USER = process.env.BASIC_AUTH_USER;
const ORIGINAL_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

function buildRequest(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/cases", { headers });
}

function basicAuthHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

afterEach(() => {
  if (ORIGINAL_USER === undefined) {
    delete process.env.BASIC_AUTH_USER;
  } else {
    process.env.BASIC_AUTH_USER = ORIGINAL_USER;
  }
  if (ORIGINAL_PASSWORD === undefined) {
    delete process.env.BASIC_AUTH_PASSWORD;
  } else {
    process.env.BASIC_AUTH_PASSWORD = ORIGINAL_PASSWORD;
  }
});

describe("proxy (Basic Auth gate)", () => {
  it("BASIC_AUTH_USER/PASSWORD未設定のとき認証をスキップする", () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;

    const response = proxy(buildRequest());

    expect(response.status).toBe(200);
  });

  it("Authorizationヘッダがないとき401を返す", () => {
    process.env.BASIC_AUTH_USER = "admin";
    process.env.BASIC_AUTH_PASSWORD = "secret";

    const response = proxy(buildRequest());

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("誤ったユーザー名/パスワードのとき401を返す", () => {
    process.env.BASIC_AUTH_USER = "admin";
    process.env.BASIC_AUTH_PASSWORD = "secret";

    const response = proxy(
      buildRequest({ authorization: basicAuthHeader("admin", "wrong") }),
    );

    expect(response.status).toBe(401);
  });

  it("正しいユーザー名/パスワードのとき通過させる", () => {
    process.env.BASIC_AUTH_USER = "admin";
    process.env.BASIC_AUTH_PASSWORD = "secret";

    const response = proxy(
      buildRequest({ authorization: basicAuthHeader("admin", "secret") }),
    );

    expect(response.status).toBe(200);
  });

  it("パスワードに:を含む場合も正しく検証する", () => {
    process.env.BASIC_AUTH_USER = "admin";
    process.env.BASIC_AUTH_PASSWORD = "sec:ret";

    const response = proxy(
      buildRequest({ authorization: basicAuthHeader("admin", "sec:ret") }),
    );

    expect(response.status).toBe(200);
  });
});
