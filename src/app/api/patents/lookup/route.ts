import { NextResponse } from "next/server";
import { lookupPatentByPublicationNumber } from "@/features/patents/patent-lookup-service";
import { RateLimitExceededError, checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

// BigQuery呼び出しを伴いうるため常に動的に実行する（ビルド時の静的評価・キャッシュ対象にしない）。
export const dynamic = "force-dynamic";

// BigQueryはクエリごとに課金が発生しうるため、同一IPからの連打を抑制する。
const LOOKUP_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

const MISSING_PARAM_MESSAGE = "publicationNumberは必須です";
const NOT_FOUND_MESSAGE = "特許情報を取得できませんでした";
const LOOKUP_ERROR_MESSAGE = "特許情報を取得できませんでした";

/**
 * 公開番号（`publicationNumber`）から特許を直接取得するAPI。
 *
 * AI文献解析結果の「引用文献」は公開番号の文字列であり、タイトル・要約への正規表現検索語としては
 * 機能しない。このAPIはユーザーが引用文献の公開番号から直接その特許の詳細画面へ遷移するために使う
 * （`research-candidates-panel.tsx` から呼ばれる）。
 *
 * 実際の取得・保存ロジックは `lookupPatentByPublicationNumber` に委譲する
 * （patentsテーブル優先確認 → 無ければBigQueryへ単一publicationNumberでの軽量クエリ）。
 */
export async function GET(request: Request): Promise<Response> {
  try {
    checkRateLimit(getRequestIp(request), LOOKUP_RATE_LIMIT);
  } catch (error: unknown) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const publicationNumber = url.searchParams.get("publicationNumber")?.trim();
  if (!publicationNumber) {
    return NextResponse.json({ error: MISSING_PARAM_MESSAGE }, { status: 400 });
  }

  try {
    const result = await lookupPatentByPublicationNumber(publicationNumber);
    if (!result) {
      return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 });
    }
    return NextResponse.json({ patentId: result.patentId });
  } catch {
    return NextResponse.json({ error: LOOKUP_ERROR_MESSAGE }, { status: 500 });
  }
}
