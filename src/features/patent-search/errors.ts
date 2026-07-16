/** 検索実行に関するエラー型。 */

/**
 * 検索実行の入力が不正な場合（選択された検索語が存在しない等）に投げる。
 * BigQueryへの問い合わせを一切行わずに送出される。
 */
export class SearchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchValidationError";
  }
}
