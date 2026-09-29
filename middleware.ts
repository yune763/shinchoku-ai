import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";

// /api/* を認証で保護する（API_TOKEN 設定時のみ有効）。
export function middleware(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: "認証が必要です（Authorization: Bearer <API_TOKEN>）" },
      { status: 401 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
