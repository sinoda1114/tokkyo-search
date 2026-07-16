import { describe, expect, it, vi, beforeEach } from "vitest";

const { fetchAndCacheClaimsMock } = vi.hoisted(() => ({
  fetchAndCacheClaimsMock: vi.fn(),
}));

vi.mock("@/features/patents/claims-service", () => ({
  fetchAndCacheClaims: fetchAndCacheClaimsMock,
}));

import { loadClaims } from "@/features/patents/actions";

beforeEach(() => {
  fetchAndCacheClaimsMock.mockReset();
});

describe("loadClaims", () => {
  it("fetchAndCacheClaimsの結果をclaimsTextとして返す", async () => {
    fetchAndCacheClaimsMock.mockResolvedValue("請求項テキスト");

    const result = await loadClaims("patent-1");

    expect(result).toEqual({ claimsText: "請求項テキスト" });
    expect(fetchAndCacheClaimsMock).toHaveBeenCalledWith("patent-1");
  });

  it("取得できない場合はclaimsText: nullを返す", async () => {
    fetchAndCacheClaimsMock.mockResolvedValue(null);

    const result = await loadClaims("patent-2");

    expect(result).toEqual({ claimsText: null });
  });
});
