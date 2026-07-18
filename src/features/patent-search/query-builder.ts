/**
 * BigQuery JP派生テーブル（`patents_jp.publications`）向けの検索クエリを組み立てる。
 *
 * 重要な制約:
 * - BigQueryクライアントに一切依存しない純粋関数のみを置く（テスト容易性・env非依存のため）。
 * - 日付範囲（パーティションプルーニング）は必須。範囲指定なしのフルスキャンは許可しない。
 * - ユーザー入力（検索語・出願人・IPC）はすべて名前付きパラメータ経由で渡し、SQL文字列へ直接埋め込まない。
 * - claims_ja（請求項全文）は検索結果のSELECT列に含めない（スキャンコスト最小化）。
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** BigQueryのプロジェクトID/データセットIDとして妥当な文字のみ許容する（識別子インジェクション対策）。 */
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]+$/;

const SEARCH_COLUMNS = [
  "publication_number",
  "application_number",
  "country_code",
  "kind_code",
  "publication_date",
  "filing_date",
  "title_ja",
  "abstract_ja",
  "assignees",
  "ARRAY(SELECT DISTINCT c FROM UNNEST(ipc_codes) AS c) AS ipc_codes",
  "ARRAY(SELECT DISTINCT c FROM UNNEST(cpc_codes) AS c) AS cpc_codes",
  "cited_publications",
  // LIMITで打ち切られる前の総ヒット件数をウィンドウ関数で同一クエリ内に含める。
  // 件数だけを数えるための別クエリを発行するとスキャンコストが二重に発生するため、
  // 必ずこの1クエリで本体の検索結果と総件数の両方を取得すること。
  "COUNT(*) OVER() AS total_match_count",
] as const;

export const RESULT_LIMIT = 200;

export interface SearchConditions {
  /** 検索対象の下限日（'YYYY-MM-DD'、必須）。パーティションプルーニングのガードとして必須。 */
  dateFrom: string;
  /** 検索対象の上限日（'YYYY-MM-DD'、必須）。 */
  dateTo: string;
  /**
   * 検索語グループ（先行技術調査における概念グループ化）。
   * 外側の配列＝グループ（グループ間はAND結合）、内側の配列＝グループ内の語（OR結合）。
   * 例: [["放熱","冷却","ヒートシンク"], ["半導体パッケージ","電子部品"]]
   *   → (放熱 OR 冷却 OR ヒートシンク) AND (半導体パッケージ OR 電子部品)
   * グループが1つだけの場合は従来どおりの単純なOR検索になる。
   * 正規表現の特殊文字はリテラルとして扱われる。
   */
  termGroups: string[][];
  /** 請求項（claims_ja）も検索対象に含めるか。デフォルトfalse。 */
  searchClaims?: boolean;
  /** 出願人の部分一致（任意）。 */
  assignee?: string;
  /** IPC前方一致（任意）。 */
  ipcPrefix?: string;
  /**
   * 総ヒット件数（LIMIT適用前）。クエリ組み立てへの入力ではなく、実行結果を
   * `search_runs.conditions` へ保存する際に一緒に記録するための出力用フィールド。
   */
  totalMatchCount?: number;
}

export interface BuiltQuery {
  sql: string;
  params: Record<string, unknown>;
}

function validateIdentifier(value: string, label: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(
      `${label} に使用できない文字が含まれています（英数字・アンダースコア・ハイフンのみ許可）: ${value}`,
    );
  }
}

function validateDate(value: string, label: string): void {
  if (!value || value.trim() === "") {
    throw new Error(`${label} は必須です（パーティションプルーニングのため日付範囲指定が必要）`);
  }
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${label} の形式が不正です（'YYYY-MM-DD'で指定してください）: ${value}`);
  }
}

/** 正規表現の特殊文字をエスケープし、REGEXP_CONTAINSでリテラル一致として扱えるようにする。 */
function escapeRegexLiteral(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** グループ内の語をトリム・空文字除去したうえで正規表現のORパターンへ変換する。 */
function buildGroupPattern(group: string[]): string {
  const normalized = group.map((term) => term.trim()).filter((term) => term.length > 0);
  const escaped = normalized.map(escapeRegexLiteral);
  return escaped.length === 1 ? escaped[0] : `(${escaped.join("|")})`;
}

/** 各グループをトリム・空文字除去し、語が1件も残らない空グループ自体を落とす。 */
function normalizeTermGroups(termGroups: string[][]): string[][] {
  return termGroups
    .map((group) => group.map((term) => term.trim()).filter((term) => term.length > 0))
    .filter((group) => group.length > 0);
}

/** LIKE述語に使うため、パーセント・アンダースコア・バックスラッシュをエスケープする。 */
function escapeLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildTableRef(projectId: string, dataset: string): string {
  validateIdentifier(projectId, "projectId");
  validateIdentifier(dataset, "dataset");
  return `\`${projectId}.${dataset}.publications\``;
}

/**
 * 検索条件からBigQuery向けのSELECTクエリを組み立てる。
 * claims_jaはSELECT列に含めない（コスト最小化のため）。
 */
export function buildSearchQuery(
  projectId: string,
  dataset: string,
  conditions: SearchConditions,
): BuiltQuery {
  const tableRef = buildTableRef(projectId, dataset);
  validateDate(conditions.dateFrom, "dateFrom");
  validateDate(conditions.dateTo, "dateTo");
  if (conditions.dateFrom > conditions.dateTo) {
    throw new Error("dateFrom は dateTo 以前の日付を指定してください");
  }
  const normalizedGroups = normalizeTermGroups(conditions.termGroups);
  if (normalizedGroups.length === 0) {
    throw new Error("termGroups は1件以上、各グループに1件以上の検索語を指定してください");
  }
  const groupPatterns = normalizedGroups.map(buildGroupPattern);
  const searchClaims = conditions.searchClaims ?? false;

  const params: Record<string, unknown> = {
    dateFrom: conditions.dateFrom,
    dateTo: conditions.dateTo,
    searchClaims,
  };
  groupPatterns.forEach((pattern, index) => {
    params[`pattern${index}`] = pattern;
  });

  // グループ間はAND、グループ内（同一 @patternN）はOR。1グループのみのときは
  // 従来の単純なOR検索（`buildTermsPattern`相当）と同じ挙動になる。
  const groupClauses = groupPatterns.map((_, index) => {
    const paramName = `pattern${index}`;
    return [
      "(",
      `REGEXP_CONTAINS(title_ja, @${paramName})`,
      ` OR REGEXP_CONTAINS(abstract_ja, @${paramName})`,
      ` OR (@searchClaims AND REGEXP_CONTAINS(claims_ja, @${paramName}))`,
      ")",
    ].join("");
  });

  const whereClauses = [
    "publication_date >= DATE(@dateFrom)",
    "publication_date <= DATE(@dateTo)",
    ...groupClauses,
  ];

  if (conditions.assignee && conditions.assignee.trim() !== "") {
    params.assigneePattern = `%${escapeLikeLiteral(conditions.assignee.trim())}%`;
    whereClauses.push(
      "EXISTS (SELECT 1 FROM UNNEST(assignees) AS a WHERE a LIKE @assigneePattern ESCAPE '\\\\')",
    );
  }

  if (conditions.ipcPrefix && conditions.ipcPrefix.trim() !== "") {
    params.ipcPrefix = conditions.ipcPrefix.trim();
    whereClauses.push("EXISTS (SELECT 1 FROM UNNEST(ipc_codes) AS c WHERE STARTS_WITH(c, @ipcPrefix))");
  }

  const sql = [
    `SELECT ${SEARCH_COLUMNS.join(", ")}`,
    `FROM ${tableRef}`,
    `WHERE ${whereClauses.join("\n  AND ")}`,
    "ORDER BY publication_date DESC",
    `LIMIT ${RESULT_LIMIT}`,
  ].join("\n");

  return { sql, params };
}

/**
 * 単一特許のclaims_ja（請求項全文）だけを取得する軽量クエリを組み立てる。
 * 検索結果一覧では取得しないclaims_jaを、詳細表示時にだけ個別取得するために使う。
 */
export function buildClaimsLookupQuery(
  projectId: string,
  dataset: string,
  publicationNumber: string,
): BuiltQuery {
  const tableRef = buildTableRef(projectId, dataset);
  if (!publicationNumber || publicationNumber.trim() === "") {
    throw new Error("publicationNumber は必須です");
  }

  const sql = [
    "SELECT claims_ja",
    `FROM ${tableRef}`,
    "WHERE publication_number = @publicationNumber",
    "LIMIT 1",
  ].join("\n");

  return { sql, params: { publicationNumber } };
}
