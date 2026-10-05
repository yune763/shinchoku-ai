import { NextRequest } from "next/server";

// 取り込みAPI（proposals/collection）の共有トークン認証。
// クラウドから push する場合、取り込みAPIはインターネットに公開されるため、
// 環境変数 INGEST_TOKEN を設定しておくと、一致するトークンを持つリクエストだけを許可する。
//
// - INGEST_TOKEN 未設定: 認証なし（ローカル開発のみで使う前提）。
// - INGEST_TOKEN 設定済: 次のいずれかでトークンを渡す必要がある。
//     Authorization: Bearer <token>
//     x-ingest-token: <token>
//
// 戻り値が null なら許可、文字列ならその理由で拒否（401）。
export function checkIngestAuth(req: NextRequest): string | null {
  const expected = process.env.INGEST_TOKEN?.trim();
  if (!expected) return null; // 未設定なら従来どおり誰でも可（ローカル用）

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const header = req.headers.get("x-ingest-token")?.trim() ?? "";
  const provided = bearer || header;

  if (!provided) return "認証トークンがありません";
  // タイミング攻撃を避けるため長さが違えば即不一致、同じなら定数時間比較。
  if (!timingSafeEqual(provided, expected)) return "認証トークンが一致しません";
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
