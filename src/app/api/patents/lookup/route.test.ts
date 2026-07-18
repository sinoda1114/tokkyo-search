import { describe, expect, it, vi, beforeEach } from "vitest";

const { lookupPatentByPublicationNumberMock } = vi.hoisted(() => ({
  lookupPatentByPublicationNumberMock: vi.fn(),
}));

vi.mock("@/features/patents/patent-lookup-service", () => ({
  lookupPatentByPublicationNumber: lookupPatentByPublicationNumberMock,
}));

import { GET } from "./route";
import { resetRateLimitStoreForTests } from "@/lib/rate-limit";

function buildRequest(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  lookupPatentByPublicationNumberMock.mockReset();
  resetRateLimitStoreForTests();
});

describe("GET /api/patents/lookup", () => {
  it("publicationNumberクエリが無い場合、400を返しlookupPatentByPublicationNumberを呼ばない", async () => {
    const response = await GET(buildRequest("http://localhost/api/patents/lookup"));

    expect(response.status).toBe(400);
    expect(lookupPatentByPublicationNumberMock).not.toHaveBeenCalled();
  });

  it("publicationNumberクエリが空文字の場合も、400を返す", async () => {
    const response = await GET(buildRequest("http://localhost/api/patents/lookup?publicationNumber=%20"));

    expect(response.status).toBe(400);
    expect(lookupPatentByPublicationNumberMock).not.toHaveBeenCalled();
  });

  it("見つかった場合、200でpatentIdを返す", async () => {
    lookupPatentByPublicationNumberMock.mockResolvedValue({ patentId: "patent-1" });

    const response = await GET(
      buildRequest("http://localhost/api/patents/lookup?publicationNumber=JP2020-000001A"),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ patentId: "patent-1" });
    expect(lookupPatentByPublicationNumberMock).toHaveBeenCalledWith("JP2020-000001A");
  });

  it("見つからない場合、404でエラーメッセージを返す", async () => {
    lookupPatentByPublicationNumberMock.mockResolvedValue(null);

    const response = await GET(
      buildRequest("http://localhost/api/patents/lookup?publicationNumber=JP-NOTFOUND-A"),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json).toEqual({ error: "特許情報を取得できませんでした" });
  });

  it("サービスが例外を投げた場合、500を返す", async () => {
    lookupPatentByPublicationNumberMock.mockRejectedValue(new Error("BigQuery失敗"));

    const response = await GET(
      buildRequest("http://localhost/api/patents/lookup?publicationNumber=JP2020-000001A"),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json).toEqual({ error: "特許情報を取得できませんでした" });
  });

  it("同一IPからの短時間の連続リクエストが上限を超えた場合、429を返しlookupPatentByPublicationNumberを呼ばない", async () => {
    lookupPatentByPublicationNumberMock.mockResolvedValue({ patentId: "patent-1" });

    // ルックアップエンドポイントの上限（1分間に10回）まではlookupPatentByPublicationNumberが呼ばれる。
    for (let i = 0; i < 10; i += 1) {
      const okResponse = await GET(
        buildRequest("http://localhost/api/patents/lookup?publicationNumber=JP2020-000001A"),
      );
      expect(okResponse.status).toBe(200);
    }

    const response = await GET(
      buildRequest("http://localhost/api/patents/lookup?publicationNumber=JP2020-000001A"),
    );

    expect(response.status).toBe(429);
    expect(lookupPatentByPublicationNumberMock).toHaveBeenCalledTimes(10);
  });
});
