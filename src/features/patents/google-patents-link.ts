/**
 * 特許公開番号からGoogle Patentsの詳細ページURLを組み立てる純粋関数。
 * BigQuery/DBに一切依存しない（テスト容易性のため分離）。
 */

const GOOGLE_PATENTS_BASE_URL = "https://patents.google.com/patent/";

/**
 * 例: "JP-2020123456-A" → "https://patents.google.com/patent/JP2020123456A"
 * ハイフンをすべて除去して連結する。
 */
export function buildGooglePatentsUrl(publicationNumber: string): string {
  const trimmed = publicationNumber.trim();
  if (trimmed === "") {
    throw new Error("publicationNumber は必須です");
  }
  const normalized = trimmed.replace(/-/g, "");
  return `${GOOGLE_PATENTS_BASE_URL}${normalized}`;
}
