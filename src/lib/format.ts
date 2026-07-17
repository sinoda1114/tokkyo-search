/** 日時・バイト数の表示フォーマットを行う共通ユーティリティ。案件詳細・検索実行結果・LLMログ等、複数画面から参照する。 */

const BYTES_PER_GIB = 1024 ** 3;

/**
 * DateをJST（Asia/Tokyo）固定で表示用文字列に変換する。
 * タイムゾーンを明示しないtoLocaleStringは実行環境のシステムタイムゾーンに従うため、
 * UTCで動くサーバー（Vercel等）では表示が9時間ずれる。常に日本時間で見せたいのでここで固定する。
 */
export function formatDateTime(value: Date): string {
  return value.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

/** BigQueryのbytesBilledをGiB表示（小数点以下3桁）に変換する。未計測（null/undefined）時はfallbackを返す。 */
export function formatBytesBilled(bytes: number | null | undefined, fallback = "不明"): string {
  if (bytes === null || bytes === undefined) {
    return fallback;
  }
  return `${(bytes / BYTES_PER_GIB).toFixed(3)} GB`;
}
