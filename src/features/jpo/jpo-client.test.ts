import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JpoNotConfiguredError } from "./errors";
import { fetchProgressInfo } from "./jpo-client";

describe("fetchProgressInfo", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 認証情報未設定（申請中）の状態を明示的に再現する。
    vi.stubEnv("JPO_API_USERNAME", "");
    vi.stubEnv("JPO_API_PASSWORD", "");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
  });

  it("JPO_API_USERNAME/JPO_API_PASSWORDが未設定の場合、JpoNotConfiguredErrorを投げる", async () => {
    await expect(fetchProgressInfo("2020-123456")).rejects.toThrow(JpoNotConfiguredError);
  });

  it("認証情報が未設定の場合、ネットワーク呼び出しを一切行わない", async () => {
    await expect(fetchProgressInfo("2020-123456")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("片方の環境変数のみ設定されている場合もJpoNotConfiguredErrorを投げる", async () => {
    vi.stubEnv("JPO_API_USERNAME", "dummy-user");
    vi.stubEnv("JPO_API_PASSWORD", "");

    await expect(fetchProgressInfo("2020-123456")).rejects.toThrow(JpoNotConfiguredError);
  });
});
