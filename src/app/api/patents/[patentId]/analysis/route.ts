import { NextResponse } from "next/server";
import { getPatentById } from "@/features/patents/queries";
import { getOrRunAnalysis } from "@/features/analysis/analysis-service";
import { RateLimitExceededError, checkRateLimit } from "@/lib/rate-limit";
import { getRequestIp } from "@/lib/request-ip";

// Gemini呼び出しを伴うため常に動的に実行する（ビルド時の静的評価・キャッシュ対象にしない）。
export const dynamic = "force-dynamic";

// force=trueで再実行するとGemini呼び出しが発生するため、同一IPからの連打を抑制する。
const ANALYSIS_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

interface RouteContext {
  params: Promise<{ patentId: string }>;
}

interface ForceRequestBody {
  force?: unknown;
}

function isForceRequestBody(value: unknown): value is ForceRequestBody {
  return typeof value === "object" && value !== null;
}

/**
 * `force` 指定をクエリパラメータ（`?force=true`）またはJSONボディ（`{"force":true}`）から読み取る。
 * ボディが空・JSONとして不正な場合はforceなし扱いにする（エラーにしない）。
 */
async function resolveForce(request: Request): Promise<boolean> {
  const url = new URL(request.url);
  if (url.searchParams.get("force") === "true") {
    return true;
  }

  const text = await request.text();
  if (!text) {
    return false;
  }

  try {
    const body: unknown = JSON.parse(text);
    return isForceRequestBody(body) ? Boolean(body.force) : false;
  } catch {
    return false;
  }
}

/**
 * 特許のAI解析を実行（または既存結果を再利用）し、結果をJSONで返す。
 * 実際の再利用・保存の判断は `getOrRunAnalysis` に委譲する。
 */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  try {
    checkRateLimit(getRequestIp(request), ANALYSIS_RATE_LIMIT);
  } catch (error: unknown) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const { patentId } = await params;

  const patent = await getPatentById(patentId);
  if (!patent) {
    return NextResponse.json({ error: "特許が見つかりません" }, { status: 404 });
  }

  const force = await resolveForce(request);
  const result = await getOrRunAnalysis(patentId, force);
  return NextResponse.json(result);
}
