import { env, isJpoEnabled } from "@/lib/env";
import { JpoNotConfiguredError, JpoRequestError } from "./errors";
import { normalizeApplicationNumber } from "./normalize";

/**
 * 特許庁「特許情報取得API」クライアント。
 *
 * 前提: 利用者は本APIの利用申請中であり、認証情報（JPO_API_USERNAME /
 * JPO_API_PASSWORD）は未取得（発行まで約1週間）。このモジュールは、認証情報が
 * 未設定でも他の機能に一切影響しないことを最優先要件として設計されている。
 * `isJpoEnabled()` が false の間は、このモジュールの公開関数はネットワーク呼び出しを
 * 一切行わず、即座に {@link JpoNotConfiguredError} を投げる。
 *
 * 以下は WebSearch/WebFetch で確認できた「特許情報取得API 利用の手引き 第1.4版」
 * （特許庁 総務部 総務課 情報技術統括室、別紙５「認証の手順について」）に基づく事実:
 * - トークン取得: POST、Header `Content-Type: application/x-www-form-urlencoded`、
 *   Body（urlencoded）に `grant_type=password`, `username=<ID>`, `password=<PW>`。
 * - レスポンス（JSON）: `access_token`, `expires_in`（秒, 実測1時間=3600）,
 *   `refresh_token`, `refresh_expires_in`（秒, 実測8時間=28800）, `token_type`。
 * - トークン更新: POST 同一URL、Body に `grant_type=refresh_token`,
 *   `refresh_token=<取得済みrefresh_token>`。
 * - API呼び出し: GET、Header `Authorization: Bearer <access_token>`。
 * - ホスト: `https://ip-data.jpo.go.jp`。
 * - 経過情報取得エンドポイント: `GET /api/patent/v1/app_progress/{出願番号}`
 *   （出願番号は西暦4桁+年間通番6桁の10桁、例: "2020008423"）。
 *   出典: 手引きの取得イメージ画像に記載の実例 `GET /api/patent/v1/app_progress/2016045210`、
 *   および https://qiita.com/kenichiro_ayaki/items/fc3d400142d47c9c27b0 の記載。
 *
 * 一方で、以下は確認できておらず、断定的な実装を避けTODOとしている:
 * - トークン取得パスそのもの（「(トークン取得パス)」の実際の文字列）。手引きには
 *   「利用登録後に特許庁から連絡があったトークン取得用URLにアクセス」とのみ記載され、
 *   固定の公開パスではなく利用者ごとにメール等で個別通知される。
 * - 経過情報レスポンスJSONの正確なスキーマ（「審査ステータス」に相当するフィールド名等）。
 *   二次資料（Qiita等）から `result.statusCode`（API全体の処理結果コード）、
 *   `data.applicationNumber`, `data.inventionTitle`, `data.publicationNumber`,
 *   `data.registrationNumber` 等の存在は推測できるが、一次資料（API仕様書 /
 *   XMLタグ構造仕様書、https://ip-data.jpo.go.jp/api_guide/api_reference.html ）に
 *   Claude からアクセスできず正確な型を確定できなかった。
 */

const JPO_API_HOST = "https://ip-data.jpo.go.jp";
const APP_PROGRESS_PATH_PREFIX = "/api/patent/v1/app_progress";
const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * トークン取得用パス。特許庁からの利用登録完了通知（メール）で個別に届く値であり、
 * 公開仕様書に固定パスの記載はない。
 *
 * TODO: 実際のパスが判明したら、`src/lib/env.ts` の envSchema に
 * `JPO_TOKEN_PATH`（optional）として正式に追加し、この関数を `env.JPO_TOKEN_PATH`
 * を参照する実装に置き換えること。現時点では env.ts のスキーマ変更を避けるため、
 * 生の `process.env` を直接参照する（このファイル単体で完結させるため）。
 */
function getTokenPath(): string {
  const tokenPath = process.env.JPO_TOKEN_PATH;
  if (!tokenPath) {
    throw new JpoRequestError(
      "JPO_TOKEN_PATH が未設定です。特許庁からの利用登録完了通知に記載されるトークン取得パスを" +
        "環境変数 JPO_TOKEN_PATH に設定してください（申請中のため未確認: TODOを参照）。",
    );
  }
  return tokenPath;
}

interface JpoTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

function isJpoTokenResponse(value: unknown): value is JpoTokenResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.access_token === "string" &&
    typeof record.refresh_token === "string" &&
    typeof record.expires_in === "number" &&
    typeof record.refresh_expires_in === "number"
  );
}

interface JpoTokenCache {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

let tokenCache: JpoTokenCache | null = null;

/** テスト用: モジュール内のトークンキャッシュをリセットする。 */
export function resetJpoTokenCacheForTesting(): void {
  tokenCache = null;
}

async function requestToken(body: URLSearchParams): Promise<JpoTokenCache> {
  const tokenPath = getTokenPath();
  const url = new URL(tokenPath.startsWith("/") ? tokenPath : `/${tokenPath}`, JPO_API_HOST);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error: unknown) {
    throw new JpoRequestError(`JPOトークン取得のHTTPリクエストに失敗しました: ${getErrorMessage(error)}`);
  }

  if (!response.ok) {
    throw new JpoRequestError(`JPOトークン取得に失敗しました（HTTP ${response.status}）`);
  }

  const json: unknown = await response.json();
  if (!isJpoTokenResponse(json)) {
    throw new JpoRequestError("JPOトークン取得レスポンスの形式が想定と異なります");
  }

  const now = Date.now();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessTokenExpiresAt: now + json.expires_in * 1000,
    refreshTokenExpiresAt: now + json.refresh_expires_in * 1000,
  };
}

function fetchNewToken(): Promise<JpoTokenCache> {
  const body = new URLSearchParams();
  body.set("grant_type", "password");
  body.set("username", env.JPO_API_USERNAME ?? "");
  body.set("password", env.JPO_API_PASSWORD ?? "");
  return requestToken(body);
}

function refreshExistingToken(refreshTokenValue: string): Promise<JpoTokenCache> {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshTokenValue);
  return requestToken(body);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (tokenCache && tokenCache.accessTokenExpiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS > now) {
    return tokenCache.accessToken;
  }

  if (tokenCache && tokenCache.refreshTokenExpiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS > now) {
    tokenCache = await refreshExistingToken(tokenCache.refreshToken);
    return tokenCache.accessToken;
  }

  tokenCache = await fetchNewToken();
  return tokenCache.accessToken;
}

/**
 * 特許経過情報。`raw` は特許庁APIの生レスポンス（jpoDataカラムにそのまま保存する想定）。
 */
export interface JpoProgressInfo {
  applicationNumber: string;
  status: string | null;
  raw: unknown;
}

/**
 * 出願番号に基づき、特許経過情報を取得する。
 *
 * `isJpoEnabled()` が false の場合（＝申請中で認証情報未設定の場合）は、
 * ネットワーク呼び出しを一切行わずに {@link JpoNotConfiguredError} を投げる。
 *
 * @throws {JpoNotConfiguredError} 認証情報が未設定の場合。
 * @throws {JpoRequestError} トークン取得パス未設定、HTTPリクエスト失敗、
 *   レスポンス形式不正など、リクエストを完了できない場合。
 * @throws {Error} `applicationNumber` が出願番号として妥当な形式でない場合
 *   （{@link normalizeApplicationNumber} 参照）。
 */
export async function fetchProgressInfo(applicationNumber: string): Promise<JpoProgressInfo> {
  if (!isJpoEnabled()) {
    throw new JpoNotConfiguredError();
  }

  const normalizedApplicationNumber = normalizeApplicationNumber(applicationNumber);
  const accessToken = await getAccessToken();

  const url = new URL(`${APP_PROGRESS_PATH_PREFIX}/${normalizedApplicationNumber}`, JPO_API_HOST);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error: unknown) {
    throw new JpoRequestError(`JPO経過情報取得のHTTPリクエストに失敗しました: ${getErrorMessage(error)}`);
  }

  if (!response.ok) {
    throw new JpoRequestError(`JPO経過情報取得に失敗しました（HTTP ${response.status}）`);
  }

  const raw: unknown = await response.json();

  // TODO: 経過情報レスポンス内の「審査ステータス」に相当するフィールド名は、
  // 一次資料（特許情報取得API仕様書 / XMLタグ構造仕様書）でのみ正確に確認できるが、
  // 本実装時点ではアクセスできなかった。断定的な解析は行わず、生レスポンスの
  // 保存（jpoDataカラム相当）のみ行う。認証情報取得後、実レスポンスのサンプルを
  // 取得したうえで、正しいフィールド名を用いた解析処理をここに実装すること。
  return {
    applicationNumber: normalizedApplicationNumber,
    status: null,
    raw,
  };
}
