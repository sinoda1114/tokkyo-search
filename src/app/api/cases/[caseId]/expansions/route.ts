import { NextResponse } from "next/server";
import { z } from "zod";
import { getCaseById } from "@/features/cases/queries";
import { generateExpansion } from "@/lib/gemini/client";
import { GeminiRequestError, GeminiValidationError } from "@/lib/gemini/errors";

// Gemini呼び出しを伴うため常に動的に実行する（ビルド時の静的評価・キャッシュ対象にしない）。
export const dynamic = "force-dynamic";

const requestBodySchema = z.object({
  terms: z.array(z.string().trim().min(1)).min(1, "検索語を1件以上指定してください"),
});

interface RouteContext {
  params: Promise<{ caseId: string }>;
}

/**
 * 案件に紐づく検索語をGeminiへ送り、類義語・上位/下位概念等の展開候補を返す。
 * 実際のDB保存は行わない（UIがユーザーの選択を受けて `saveSelectedExpansions` を呼ぶ2段階UI）。
 */
export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const { caseId } = await params;

  const caseItem = await getCaseById(caseId);
  if (!caseItem) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const parsed = requestBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "検索語を1件以上指定してください" },
      { status: 400 },
    );
  }

  try {
    const result = await generateExpansion(
      parsed.data.terms,
      caseItem.technicalField ?? undefined,
      caseId,
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof GeminiRequestError || error instanceof GeminiValidationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "検索語展開に失敗しました" }, { status: 500 });
  }
}
