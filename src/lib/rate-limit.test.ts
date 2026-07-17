import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitExceededError, checkRateLimit, resetRateLimitStoreForTests } from "./rate-limit";

beforeEach(() => {
  resetRateLimitStoreForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("制限回数内であれば例外を投げない", () => {
    expect(() => checkRateLimit("key-within-limit", { limit: 3, windowMs: 1000 })).not.toThrow();
    expect(() => checkRateLimit("key-within-limit", { limit: 3, windowMs: 1000 })).not.toThrow();
    expect(() => checkRateLimit("key-within-limit", { limit: 3, windowMs: 1000 })).not.toThrow();
  });

  it("制限回数を超えるとRateLimitExceededErrorを投げる", () => {
    checkRateLimit("key-exceeded", { limit: 2, windowMs: 1000 });
    checkRateLimit("key-exceeded", { limit: 2, windowMs: 1000 });

    expect(() => checkRateLimit("key-exceeded", { limit: 2, windowMs: 1000 })).toThrow(
      RateLimitExceededError,
    );
  });

  it("ウィンドウが経過するとカウントがリセットされる", () => {
    vi.useFakeTimers();

    checkRateLimit("key-window-reset", { limit: 1, windowMs: 1000 });
    expect(() => checkRateLimit("key-window-reset", { limit: 1, windowMs: 1000 })).toThrow(
      RateLimitExceededError,
    );

    vi.advanceTimersByTime(1001);

    expect(() => checkRateLimit("key-window-reset", { limit: 1, windowMs: 1000 })).not.toThrow();
  });

  it("keyが異なれば独立したカウントとして扱われる", () => {
    checkRateLimit("key-independent-a", { limit: 1, windowMs: 1000 });

    expect(() => checkRateLimit("key-independent-b", { limit: 1, windowMs: 1000 })).not.toThrow();
    expect(() => checkRateLimit("key-independent-a", { limit: 1, windowMs: 1000 })).toThrow(
      RateLimitExceededError,
    );
  });
});
