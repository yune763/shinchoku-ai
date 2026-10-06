import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { readJson, writeJson } from "./blob";

// 社内チャット用のユーザーアカウント（メール＋パスワード）。
// パスワードは scrypt でハッシュ化して保存する（平文は保存しない）。
// 保存先は blob 層（ローカル=ファイル / クラウド=Firestore）。
const USERS_KEY = "chat/users.json";

export interface Account {
  id: string;
  email: string; // 小文字で正規化して保存
  displayName: string;
  salt: string; // hex
  hash: string; // hex（scrypt）
  createdAt: string;
}

// 画面・API で返す安全な形（ハッシュ等は除外）。
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

export function toPublic(a: Account): PublicUser {
  return { id: a.id, email: a.email, displayName: a.displayName };
}

async function readAll(): Promise<Account[]> {
  const arr = await readJson<Account[]>(USERS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

async function writeAll(list: Account[]): Promise<void> {
  await writeJson(USERS_KEY, list);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  // N=16384 相当（scryptSync 既定）。社内小規模向けに十分。
  return scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password: string, salt: string, hash: string): boolean {
  const calc = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(hash, "hex");
  if (calc.length !== expected.length) return false;
  return timingSafeEqual(calc, expected);
}

export async function listUsers(): Promise<PublicUser[]> {
  return (await readAll()).map(toPublic);
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const a = (await readAll()).find((u) => u.id === id);
  return a ? toPublic(a) : null;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export async function registerUser(
  input: RegisterInput,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "メールアドレスの形式が不正です" };
  }
  if (!displayName) return { ok: false, error: "表示名は必須です" };
  if (input.password.length < 6) {
    return { ok: false, error: "パスワードは6文字以上にしてください" };
  }
  const all = await readAll();
  if (all.some((u) => u.email === email)) {
    return { ok: false, error: "このメールアドレスは既に登録されています" };
  }
  const salt = randomBytes(16).toString("hex");
  const account: Account = {
    id: randomUUID(),
    email,
    displayName,
    salt,
    hash: hashPassword(input.password, salt),
    createdAt: new Date().toISOString(),
  };
  all.push(account);
  await writeAll(all);
  return { ok: true, user: toPublic(account) };
}

export async function authenticate(
  email: string,
  password: string,
): Promise<PublicUser | null> {
  const norm = normalizeEmail(email);
  const a = (await readAll()).find((u) => u.email === norm);
  if (!a) return null;
  if (!verifyPassword(password, a.salt, a.hash)) return null;
  return toPublic(a);
}
