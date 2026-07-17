import { NextResponse, type NextRequest } from "next/server";

/**
 * サイト全体へのBasic認証ゲート。アプリのビジネスロジック（Server Actions /
 * Route Handlers / features配下）には一切依存せず、リクエストがルーティングに
 * 入る前段でのみ完結する。外す場合はこのファイルを削除するだけでよい。
 *
 * BASIC_AUTH_USER / BASIC_AUTH_PASSWORD が未設定の場合は認証をスキップする
 * （ローカル開発を妨げないため）。本番運用時は必ず両方を設定すること。
 */
export default function proxy(request: NextRequest): NextResponse {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const providedUser = decoded.slice(0, separatorIndex);
    const providedPassword = decoded.slice(separatorIndex + 1);
    if (providedUser === user && providedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="tokko-search"' },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
