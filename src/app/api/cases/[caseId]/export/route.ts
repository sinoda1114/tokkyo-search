import { NextResponse } from "next/server";
import { getCaseById } from "@/features/cases/queries";
import { getEvaluatedPatentsByCase, type EvaluatedPatentItem } from "@/features/patents/evaluation-queries";
import { getSearchRunsByCase, type SearchRunRow } from "@/features/patent-search/queries";
import { CASE_PATENT_STATUS_LABELS } from "@/features/patents/evaluation-options";
import { formatDateTime } from "@/lib/format";

// 都度DBの最新状態でCSVを生成するため force-dynamic（キャッシュしない）。
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ caseId: string }>;
}

const CSV_BOM = "\uFEFF";

/**
 * CSVフィールドをエスケープする。カンマ・ダブルクォート・改行を含む場合のみ
 * ダブルクォートで囲み、内部のダブルクォートは2重化する（RFC 4180）。
 */
function toCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(fields: string[]): string {
  return fields.map(toCsvField).join(",");
}

/**
 * `search_runs.conditions`（JSON, drizzleの型上は`unknown`）から表示に必要な項目だけを安全に取り出す。
 * `query-builder.ts` の検索条件の形は改修が進行中（`terms: string[]` → `termGroups: string[][]`）
 * のため、このモジュールはその型に直接依存せず、両方の形を許容して防御的にパースする
 * （`runs/[runId]/page.tsx` の `parseConditions` と同じ考え方）。
 */
interface ExportSearchConditions {
  dateFrom?: string;
  dateTo?: string;
  terms?: string[];
  termGroups?: string[][];
  searchClaims?: boolean;
  assignee?: string;
  ipcPrefix?: string;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseSearchConditions(value: unknown): ExportSearchConditions {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    dateFrom: typeof record.dateFrom === "string" ? record.dateFrom : undefined,
    dateTo: typeof record.dateTo === "string" ? record.dateTo : undefined,
    terms: isStringArray(record.terms) ? record.terms : undefined,
    termGroups: Array.isArray(record.termGroups)
      ? record.termGroups.filter(isStringArray)
      : undefined,
    searchClaims: typeof record.searchClaims === "boolean" ? record.searchClaims : undefined,
    assignee: typeof record.assignee === "string" ? record.assignee : undefined,
    ipcPrefix: typeof record.ipcPrefix === "string" ? record.ipcPrefix : undefined,
  };
}

/** 検索条件に含まれるすべての検索語テキストを（グループ形式・フラット形式のどちらでも）取り出す。 */
function collectTermTexts(conditions: ExportSearchConditions): string[] {
  if (conditions.termGroups) {
    return conditions.termGroups.flat();
  }
  return conditions.terms ?? [];
}

/** 検索条件を人が読める1つのテキストにまとめる。 */
function formatConditions(conditions: ExportSearchConditions): string {
  const parts: string[] = [];
  if (conditions.dateFrom && conditions.dateTo) {
    parts.push(`期間: ${conditions.dateFrom}〜${conditions.dateTo}`);
  }
  parts.push(`請求項検索: ${conditions.searchClaims ? "あり" : "なし"}`);
  if (conditions.assignee) {
    parts.push(`出願人: ${conditions.assignee}`);
  }
  if (conditions.ipcPrefix) {
    parts.push(`IPC: ${conditions.ipcPrefix}`);
  }
  return parts.join("; ");
}

const SEARCH_RUN_STATUS_LABELS: Record<SearchRunRow["status"], string> = {
  success: "成功",
  error: "失敗",
};

function buildEvaluatedPatentsSection(items: EvaluatedPatentItem[]): string[] {
  const rows = [
    "評価済み特許",
    toCsvRow(["公開番号", "タイトル", "ステータス", "コメント", "対象外理由"]),
  ];
  for (const { patent, evaluation } of items) {
    rows.push(
      toCsvRow([
        patent.publicationNumber,
        patent.title ?? "",
        CASE_PATENT_STATUS_LABELS[evaluation.status],
        evaluation.comment ?? "",
        evaluation.exclusionReason ?? "",
      ]),
    );
  }
  return rows;
}

function buildSearchRunsSection(runs: SearchRunRow[]): string[] {
  const rows = [
    "検索実行履歴",
    toCsvRow(["実行日時", "ステータス", "結果件数", "使用検索語", "検索条件"]),
  ];
  for (const run of runs) {
    const conditions = parseSearchConditions(run.conditions);
    rows.push(
      toCsvRow([
        formatDateTime(run.executedAt),
        SEARCH_RUN_STATUS_LABELS[run.status],
        run.status === "success" ? String(run.resultCount ?? 0) : "-",
        collectTermTexts(conditions).join("、"),
        formatConditions(conditions),
      ]),
    );
  }
  return rows;
}

function buildCaseExportCsv(
  caseItem: { name: string; referenceNumber: string | null; technicalField: string | null },
  evaluatedPatents: EvaluatedPatentItem[],
  searchRuns: SearchRunRow[],
): string {
  const lines = [
    "案件情報",
    toCsvRow(["名称", caseItem.name]),
    toCsvRow(["管理番号", caseItem.referenceNumber ?? ""]),
    toCsvRow(["技術分野", caseItem.technicalField ?? ""]),
    "",
    ...buildEvaluatedPatentsSection(evaluatedPatents),
    "",
    ...buildSearchRunsSection(searchRuns),
  ];
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

/** ファイル名に使えない文字（パス区切り・制御文字等）を除去する。 */
function sanitizeFileNameSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]/g, "").trim();
}

/**
 * 案件の評価済み特許一覧・検索実行履歴をCSV（UTF-8 BOM付き）でエクスポートする。
 * 弁理士が依頼者・審査対応向けの報告書を作成する際、手作業転記なしでそのまま
 * Excelへ取り込める形式にする。
 */
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  const { caseId } = await params;

  const caseItem = await getCaseById(caseId);
  if (!caseItem) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const [evaluatedPatents, searchRuns] = await Promise.all([
    getEvaluatedPatentsByCase(caseId),
    getSearchRunsByCase(caseId),
  ]);

  const csv = buildCaseExportCsv(caseItem, evaluatedPatents, searchRuns);
  const fileNameBase = sanitizeFileNameSegment(caseItem.name) || "case";
  const fileName = `${fileNameBase}_調査報告書.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
