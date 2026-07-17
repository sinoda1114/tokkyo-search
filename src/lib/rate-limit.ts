/**
 * 課金を伴う外部API呼び出し（BigQuery/Gemini）を保護するための、固定ウィンドウ方式の
 * シンプルなレート制限。追加のnpm依存（Upstash等の外部有料サービス）を避けるため、
 * プロセス内メモリ（Mapオブジェクト）に状態を保持する。
 *
 * 既知の制約: 単一プロセス・単一インスタンスでの運用を前提としている。
 * サーバーレス環境（Vercel等）で複数インスタンスに水平分散すると、インスタンスごとに
 * 別々のカウントを持つため、実質的な上限がインスタンス数倍に緩くなる。
 * 現状のアクセス規模では許容範囲と判断しているが、将来的に本格的な分散レート制限が
 * 必要になった場合は、Redis等の外部ストアへの置き換えを検討すること。
 */

/** レート制限の上限に達した場合に投げるエラー。呼び出し元でHTTP 429へ変換する想定。 */
export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

export interface RateLimitOptions {
  /** ウィンドウ内で許可する最大リクエスト数 */
  limit: number;
  /** ウィンドウの長さ（ミリ秒） */
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

function isExpired(entry: RateLimitEntry, now: number): boolean {
  return now - entry.windowStart >= entry.windowMs;
}

/**
 * 期限切れになったウィンドウのエントリを掃除する。メモリリーク防止のため、
 * 呼び出しのたびに軽く（Map全件スキャンだが、キー数はIP単位程度で小さい想定）実行する。
 */
function cleanupExpiredEntries(now: number): void {
  for (const [key, entry] of store) {
    if (isExpired(entry, now)) {
      store.delete(key);
    }
  }
}

/**
 * `key`ごとに`windowMs`のウィンドウ内で`limit`回を超えたリクエストがあれば
 * `RateLimitExceededError`を投げる。制限内であれば何も返さず処理を継続させる。
 */
export function checkRateLimit(key: string, options: RateLimitOptions): void {
  const { limit, windowMs } = options;
  const now = Date.now();

  cleanupExpiredEntries(now);

  const entry = store.get(key);

  if (!entry || isExpired(entry, now)) {
    store.set(key, { count: 1, windowStart: now, windowMs });
    return;
  }

  if (entry.count >= limit) {
    const windowSeconds = Math.ceil(windowMs / 1000);
    throw new RateLimitExceededError(
      `リクエストが多すぎます。しばらく待ってから再度お試しください（上限: ${windowSeconds}秒あたり${limit}回）`,
    );
  }

  store.set(key, { count: entry.count + 1, windowStart: entry.windowStart, windowMs: entry.windowMs });
}

/**
 * テスト専用: レート制限の内部状態を初期化する。
 * 本番コードから呼び出さないこと（テストファイルの`beforeEach`等での利用を想定）。
 */
export function resetRateLimitStoreForTests(): void {
  store.clear();
}
