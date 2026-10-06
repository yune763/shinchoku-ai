import { NextRequest, NextResponse } from "next/server";

// 現在のパスをヘッダに載せて、RootLayout（サーバ）が認証ガードの判定に使えるようにする。
// 認証の本判定は layout 側（getCurrentユーザー）で行う（ここでは軽量にパスを渡すだけ）。
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // 静的アセット・画像・API 以外のページ遷移に適用。
  // API はそれぞれ独自に認証（セッション or APIトークン）するため除外。
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
