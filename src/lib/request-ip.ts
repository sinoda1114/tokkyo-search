const FALLBACK_CLIENT_IP = "unknown";

/**
 * Next.jsのRequestからクライアントIPアドレスを取得する。
 * Vercel環境ではリバースプロキシが`x-forwarded-for`を付与するため、
 * その先頭要素（クライアントに最も近いIP）を採用する。
 * 取得できない場合（ローカル開発等）は固定文字列にフォールバックする点に注意
 * （フォールバック時はレート制限のキーが全リクエストで共通化される）。
 */
export function getRequestIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return FALLBACK_CLIENT_IP;
}
