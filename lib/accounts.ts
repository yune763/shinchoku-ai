import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { readJson, writeJson } from "./blob";

// 社内チャット用のユーザーアカウント（メール＋パスワード）。
// パスワードは scrypt でハッシュ化して保存する（平文は保存しない）。
// 保存先は blob 層（ローカル=ファイル / クラウド=Firestore）。
const USERS_KEY = "chat/users.json";

export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "approved" | "rejected";

export interface Account {
  id: string;
  email: string; // 小文字で正規化して保存
  displayName: string;
  salt: string; // hex
  hash: string; // hex（scrypt）
  role: UserRole; // admin=承認できる / member=一般
  status: UserStatus; // pending=承認待ち / approved=利用可 / rejected=却下
  createdAt: string;
  decidedAt?: string; // 承認/却下された日時
  decidedBy?: string; // 承認/却下した管理者のID
}

// 画面・API で返す安全な形（ハッシュ等は除外）。
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: string;
}

export function toPublic(a: Account): PublicUser {
  return {
    id: a.id,
    email: a.email,
    displayName: a.displayName,
    role: a.role,
    status: a.status,
    createdAt: a.createdAt,
  };
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

// 新規登録＝申請。最初の1人だけ管理者として自動承認（ブートストラップ）。
// 2人目以降は status=pending（承認待ち）で作られ、管理者の承認までログイン不可。
export async function registerUser(
  input: RegisterInput,
): Promise<
  | { ok: true; user: PublicUser; autoApproved: boolean }
  | { ok: false; error: string }
> {
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
  const isFirst = all.length === 0;
  const salt = randomBytes(16).toString("hex");
  const account: Account = {
    id: randomUUID(),
    email,
    displayName,
    salt,
    hash: hashPassword(input.password, salt),
    role: isFirst ? "admin" : "member",
    status: isFirst ? "approved" : "pending",
    createdAt: new Date().toISOString(),
  };
  all.push(account);
  await writeAll(all);
  return { ok: true, user: toPublic(account), autoApproved: isFirst };
}

export type AuthResult =
  | { ok: true; user: PublicUser }
  | { ok: false; reason: "invalid" | "pending" | "rejected" };

export async function authenticate(
  email: string,
  password: string,
): Promise<AuthResult> {
  const norm = normalizeEmail(email);
  const a = (await readAll()).find((u) => u.email === norm);
  if (!a || !verifyPassword(password, a.salt, a.hash)) {
    return { ok: false, reason: "invalid" };
  }
  if (a.status === "pending") return { ok: false, reason: "pending" };
  if (a.status === "rejected") return { ok: false, reason: "rejected" };
  return { ok: true, user: toPublic(a) };
}

// ── 管理（承認・却下・役割変更）。呼び出し側で管理者かを確認すること ──
export async function listPendingUsers(): Promise<PublicUser[]> {
  return (await readAll()).filter((u) => u.status === "pending").map(toPublic);
}

export async function decideUser(
  userId: string,
  decision: "approved" | "rejected",
  adminId: string,
): Promise<PublicUser | null> {
  const all = await readAll();
  const a = all.find((u) => u.id === userId);
  if (!a) return null;
  a.status = decision;
  a.decidedAt = new Date().toISOString();
  a.decidedBy = adminId;
  await writeAll(all);
  return toPublic(a);
}

export async function setRole(
  userId: string,
  role: UserRole,
): Promise<PublicUser | null> {
  const all = await readAll();
  const a = all.find((u) => u.id === userId);
  if (!a) return null;
  a.role = role;
  await writeAll(all);
  return toPublic(a);
}
