import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", async () => {
  const { createTestDb } = await import("@/db/test-utils");
  const testDb = await createTestDb();
  return { db: testDb };
});

import { db } from "@/db/client";
import { patents } from "@/db/schema";
import { getPatentById } from "@/features/patents/queries";

describe("getPatentById", () => {
  it("IDに一致する特許を返す", async () => {
    await db.insert(patents).values({
      id: "patent-1",
      publicationNumber: "JP-2020123456-A",
      applicationNumber: "2020-123456",
      countryCode: "JP",
      kindCode: "A",
      title: "発明の名称",
      abstract: "要約文",
      assignees: ["テスト工業株式会社"],
      ipcCodes: ["H01L23/00"],
      cpcCodes: ["H01L23/00"],
      citedPublications: ["JP1999-000001A"],
      publicationDate: "2020-05-01",
      filingDate: "2019-01-01",
    });

    const result = await getPatentById("patent-1");

    expect(result?.id).toBe("patent-1");
    expect(result?.publicationNumber).toBe("JP-2020123456-A");
    expect(result?.title).toBe("発明の名称");
    expect(result?.assignees).toEqual(["テスト工業株式会社"]);
  });

  it("存在しないIDのときundefinedを返す", async () => {
    const result = await getPatentById("no-such-patent");
    expect(result).toBeUndefined();
  });
});
