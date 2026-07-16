/**
 * 特許庁「特許情報取得API」連携に関するエラー型。
 */

/**
 * 認証情報（JPO_API_USERNAME / JPO_API_PASSWORD）が未設定のため、
 * 特許情報取得API連携機能が無効化されている場合に投げるエラー。
 *
 * この機能は申請中の認証情報が到着するまでオプション扱いであり、
 * このエラーはネットワーク呼び出しを一切行わずに送出される。
 */
export class JpoNotConfiguredError extends Error {
  constructor(message = "特許庁 特許情報取得APIの認証情報が設定されていません。") {
    super(message);
    this.name = "JpoNotConfiguredError";
  }
}

/**
 * 特許情報取得APIへのリクエスト（トークン取得・データ取得）が
 * 失敗した場合、または未確定のAPI仕様に依存する処理を実行できない場合に投げるエラー。
 */
export class JpoRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JpoRequestError";
  }
}
