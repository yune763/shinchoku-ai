import { NextRequest } from "next/server";

// 認証トークン。環境変数 API_TOKEN が設定されている場合のみ認証を有効化する。
// 未設定ならローカル開発として素通し（従来どおり動く）。
export function authEnabled(): boolean {
  return !!process.env.API_TOKEN && process.env.API_TOKEN.length > 0;
}

/**
 * リクエストを許可してよいか判定する。
 * - ブラウザUIからの同一オリジン fetch は許可（sec-fetch-site: same-origin）。
 * - 外部（他PCのAI・curl・スクリプト）は Bearer トークン必須。
 * ※ 本格運用ではログイン認証の追加を推奨（このトークン方式は小規模チーム/LAN向け）。
 */
export function isAuthorized(req: NextRequest): boolean {
  if (!authEnabled()) return true;

  const token = process.env.API_TOKEN;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${token}`) return true;

  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return true;

  return false;
}
