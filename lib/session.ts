import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { readBlobRaw, writeBlobRaw } from "./blob";
import { getUserById, type PublicUser } from "./accounts";

// 署名付きCookieによる軽量セッション。
// トークン = base64url(payload).HMAC(payload)。payload = { uid, exp }。
// 署名用シークレットは blob に1度だけ生成して永続化する（env不要）。
const COOKIE_NAME = "shinchoku_session";
const SECRET_KEY = "chat/session-secret.txt";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30日

let cachedSecret: string | null = null;

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const existing = await readBlobRaw(SECRET_KEY);
  if (existing && existing.length >= 32) {
    cachedSecret = existing;
    return existing;
  }
  const secret = randomBytes(48).toString("hex");
  await writeBlobRaw(SECRET_KEY, secret);
  cachedSecret = secret;
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function createSessionToken(userId: string): Promise<string> {
  const secret = await getSecret();
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload, secret)}`;
}

async function verifyToken(token: string): Promise<string | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const secret = await getSecret();
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { uid: string; exp: number };
    if (!uid || typeof exp !== "number") return null;
    if (exp < Math.floor(Date.now() / 1000)) return null;
    return uid;
  } catch {
    return null;
  }
}

// Server Component / Route Handler から現在のログインユーザーを取得する。
// 承認済み(approved)のユーザーのみ有効。却下/承認待ちは未ログイン扱い。
export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const uid = await verifyToken(token);
  if (!uid) return null;
  const user = await getUserById(uid);
  if (!user || user.status !== "approved") return null;
  return user;
}

// 管理者のみ取得（承認操作のガードに使う）。
export async function getCurrentAdmin(): Promise<PublicUser | null> {
  const user = await getCurrentUser();
  return user && user.role === "admin" ? user : null;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // 本番(https)のみ Secure。ローカルdev(http)では付けないとCookieが保存されない。
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}
