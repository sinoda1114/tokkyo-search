const BYTES_PER_GIB = 1024 ** 3;

/**
 * BigQueryのクエリ見積もりコストが上限を超えた場合に投げるエラー。
 * 実クエリを実行する前のガードとして使う（無料枠超過の事故防止）。
 */
export class BigQueryCostLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BigQueryCostLimitError";
  }
}

function toGib(bytes: number): string {
  return (bytes / BYTES_PER_GIB).toFixed(2);
}

/**
 * 見積もりスキャン量が上限を超えていないか検証する。
 * BigQueryクライアントに依存しない純粋関数（テスト容易性のため分離）。
 */
export function assertWithinBudget(estimatedBytes: number, maxBytesBilled: number): void {
  if (estimatedBytes > maxBytesBilled) {
    throw new BigQueryCostLimitError(
      `見積もりスキャン量 ${toGib(estimatedBytes)}GB が上限 ${toGib(maxBytesBilled)}GB を超えています`,
    );
  }
}
