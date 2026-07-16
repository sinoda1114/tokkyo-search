/**
 * 特許庁「特許情報取得API」の出願番号表記ゆらぎを正規化するユーティリティ。
 *
 * API仕様上、出願番号は「西暦4桁＋年間通番6桁」の10桁数字（例: "2020008423"）で
 * 指定する必要がある（出典: 特許庁「特許情報取得API 利用の手引き」第1.4版）。
 * このモジュールは、ユーザー入力や特許庁APIレスポンスに含まれる表記ゆらぎ
 * （「特願」プレフィックス、ハイフン、全角文字、末尾の「号」等）を吸収し、
 * API呼び出しに使える正規形へ変換する純粋関数のみを提供する。
 *
 * BigQuery側の patents.publicationNumber（例: "JP-2020123456-A"）とは無関係の、
 * 独立した「出願番号」専用の正規化関数である。
 */

const FULLWIDTH_DIGIT_OFFSET = 0xff10 - 0x30; // '０'(U+FF10) と '0'(U+0030) の差分

// 全角・半角を問わず、様々な種類のハイフン/ダッシュ文字を除去対象とする。
const HYPHEN_LIKE_CHARS_PATTERN = /[-‐‑‒–—―−－ー]/g;
const WHITESPACE_CHARS_PATTERN = /[\s　]/g;
const APPLICATION_NUMBER_PREFIX_PATTERN = /^特願/;
const APPLICATION_NUMBER_SUFFIX_PATTERN = /号$/;
const APPLICATION_NUMBER_LENGTH = 10;
const MIN_VALID_APPLICATION_YEAR = 1990;

function toHalfWidthDigits(input: string): string {
  return input.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - FULLWIDTH_DIGIT_OFFSET),
  );
}

/**
 * 出願番号の表記ゆらぎを吸収し、「西暦4桁＋年間通番6桁」の10桁数字に正規化する。
 *
 * 対応する入力例:
 * - "特願2020-123456" → "2020123456"
 * - "2020-123456" → "2020123456"
 * - "2020123456"（既に正規形）→ "2020123456"（そのまま、冪等）
 * - 全角数字・全角ハイフン・全角スペース・末尾の「号」を含む表記も許容する。
 *
 * @throws {Error} 数字以外の文字が残る、桁数が10桁でない、年部分が明らかに不正
 *   な範囲である等、出願番号として妥当と判断できない入力の場合。
 */
export function normalizeApplicationNumber(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(`出願番号が空です: "${String(input)}"`);
  }

  let normalized = toHalfWidthDigits(input);
  normalized = normalized.replace(WHITESPACE_CHARS_PATTERN, "");
  normalized = normalized.replace(APPLICATION_NUMBER_PREFIX_PATTERN, "");
  normalized = normalized.replace(HYPHEN_LIKE_CHARS_PATTERN, "");
  normalized = normalized.replace(APPLICATION_NUMBER_SUFFIX_PATTERN, "");

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`出願番号の形式が不正です（数字以外の文字が含まれています）: "${input}"`);
  }

  if (normalized.length !== APPLICATION_NUMBER_LENGTH) {
    throw new Error(
      `出願番号の形式が不正です（西暦4桁+通番6桁の${APPLICATION_NUMBER_LENGTH}桁である必要があります）: "${input}" → "${normalized}"`,
    );
  }

  const year = Number(normalized.slice(0, 4));
  const maxValidYear = new Date().getFullYear() + 1;
  if (year < MIN_VALID_APPLICATION_YEAR || year > maxValidYear) {
    throw new Error(`出願番号の年部分が不正です: "${input}" → 年="${year}"`);
  }

  return normalized;
}
