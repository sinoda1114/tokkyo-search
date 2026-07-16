import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-utils";
import { cases } from "./schema";

describe("createTestDb", () => {
  it("applies the schema migrations to an in-memory database", async () => {
    const db = await createTestDb();

    await db.insert(cases).values({
      id: "case-1",
      name: "テスト案件",
    });

    const rows = await db.select().from(cases);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("テスト案件");
  });
});
