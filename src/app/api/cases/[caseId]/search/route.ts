import { NextResponse } from "next/server";
import { z } from "zod";
import { getCaseById } from "@/features/cases/queries";
import { runSearch } from "@/features/patent-search/search-service";
import { SearchValidationError } from "@/features/patent-search/errors";
import { BigQueryCostLimitError } from "@/lib/bigquery/cost-guard";

// BigQuery呼び出しを伴うため常に動的に実行する（ビルド時の静的評価・キャッシュ対象にしない）。
export const dynamic = "force-dynamic";

// 空文字は「未指定」として扱う（フロントから `assignee: ""` 等が届いても400にしない）。
const optionalNonEmptyString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const requestBodySchema = z.object({
  termIds: z.array(z.string().trim().min(1)).min(1, "検索語を1件以上選択してください"),
  dateFrom: z.string().trim().min(1, "検索対象期間の開始日を指定してください"),
  dateTo: z.string().trim().min(1, "検索対象期間の終了日を指定してください"),
  searchClaims: z.boolean().optional(),
  assignee: optionalNonEmptyString,
  ipcPrefix: optionalNonEmptyString,
});

interface RouteContext {
  params: Promise<{ caseId: string }>;
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "検索の実行に失敗しました";
}

/**
 * 案件に紐づく検索語・検索条件からBigQuery検索を実行する。
 * コスト上限超過（BigQueryCostLimitError）と入力不正（SearchValidationError）は400、
 * それ以外の予期しないエラーは500として返す。
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
      { error: parsed.error.issues[0]?.message ?? "リクエストが不正です" },
      { status: 400 },
    );
  }

  try {
    const result = await runSearch({
      caseId,
      termIds: parsed.data.termIds,
      dateFrom: parsed.data.dateFrom,
      dateTo: parsed.data.dateTo,
      searchClaims: parsed.data.searchClaims,
      assignee: parsed.data.assignee,
      ipcPrefix: parsed.data.ipcPrefix,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof BigQueryCostLimitError) {
      return NextResponse.json(
        { error: `検索のコスト上限を超過したため実行できませんでした。${extractErrorMessage(error)}` },
        { status: 400 },
      );
    }
    if (error instanceof SearchValidationError) {
      return NextResponse.json({ error: extractErrorMessage(error) }, { status: 400 });
    }
    return NextResponse.json({ error: "検索の実行に失敗しました" }, { status: 500 });
  }
}
