import { describe, expect, it } from "vitest";
import { assertWithinBudget, BigQueryCostLimitError } from "./cost-guard";

describe("assertWithinBudget", () => {
  it("does not throw when the estimate is within budget", () => {
    expect(() => assertWithinBudget(1_000, 2_000)).not.toThrow();
  });

  it("does not throw when the estimate exactly equals the budget", () => {
    expect(() => assertWithinBudget(2_000, 2_000)).not.toThrow();
  });

  it("throws BigQueryCostLimitError when the estimate exceeds the budget", () => {
    expect(() => assertWithinBudget(3_000, 2_000)).toThrow(BigQueryCostLimitError);
  });

  it("includes the estimated and max GB in the error message", () => {
    const oneGib = 1024 ** 3;
    try {
      assertWithinBudget(2 * oneGib, oneGib);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(BigQueryCostLimitError);
      const message = (error as Error).message;
      expect(message).toContain("2.00GB");
      expect(message).toContain("1.00GB");
    }
  });
});
