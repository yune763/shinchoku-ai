import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { readJson, writeJson } from "./blob";

// 社内チャット用のユーザーアカウント（メール＋パスワード）。
// パスワードは scrypt でハッシュ化して保存する（平文は保存しない）。
// 保存先は blob 層（ローカル=ファイル / クラウド=Firestore）。
const USERS_KEY = "chat/users.json";

export type UserRole = "admin" | "member";
export type UserStatus = "pending" | "approved" | "rejected";

// Claude Code 連携を行うべきアカウント（初期連携済み）。
const CLAUDE_LINKED_BOOTSTRAP_EMAIL = "nejigane.y@gmail.com";

export interface Account {
  id: string;
  email: string; // 小文字で正規化して保存
  lastName: string; // 氏
  firstName: string; // 名
  displayName: string; // 「氏 名」。表示用（氏名から合成）
  salt: string; // hex
  hash: string; // hex（scrypt）
  role: UserRole; // admin=承認できる / member=一般
  status: UserStatus; // pending=承認待ち / approved=利用可 / rejected=却下
  claudeLinked: boolean; // Claude Code CLI 連携済みか（直接実装の可否）
  avatar?: string; // アイコン画像(data URL / 小さめにリサイズして保存)
  createdAt: string;
  decidedAt?: string; // 承認/却下された日時
  decidedBy?: string; // 承認/却下した管理者のID
}

// 画面・API で返す安全な形（ハッシュ等は除外）。
export interface PublicUser {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  claudeLinked: boolean;
  avatar?: string;
  createdAt?: string;
}

// 「氏 名」で表示名を合成する。
export function composeDisplayName(lastName: string, firstName: string): string {
  return [lastName.trim(), firstName.trim()].filter(Boolean).join(" ");
}

export function toPublic(a: Account): PublicUser {
  return {
    id: a.id,
    email: a.email,
    lastName: a.lastName ?? "",
    firstName: a.firstName ?? "",
    displayName: a.displayName || composeDisplayName(a.lastName ?? "", a.firstName ?? ""),
    role: a.role,
    status: a.status,
    claudeLinked: !!a.claudeLinked,
    avatar: a.avatar || undefined,
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
  lastName: string;
  firstName: string;
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
  const lastName = input.lastName.trim();
  const firstName = input.firstName.trim();
  const displayName = composeDisplayName(lastName, firstName);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "メールアドレスの形式が不正です" };
  }
  if (!lastName || !firstName) {
    return { ok: false, error: "氏・名の両方を入力してください" };
  }
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
    lastName,
    firstName,
    displayName,
    salt,
    hash: hashPassword(input.password, salt),
    role: isFirst ? "admin" : "member",
    status: isFirst ? "approved" : "pending",
    // nejigane のアカウントは初期から連携済み。他は未連携（管理者が後で連携）。
    claudeLinked: email === CLAUDE_LINKED_BOOTSTRAP_EMAIL,
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

// Claude Code 連携フラグを切り替える（直接実装の可否）。
export async function setClaudeLinked(
  userId: string,
  linked: boolean,
): Promise<PublicUser | null> {
  const all = await readAll();
  const a = all.find((u) => u.id === userId);
  if (!a) return null;
  a.claudeLinked = linked;
  await writeAll(all);
  return toPublic(a);
}

// 本人がアイコン画像を設定/削除する。dataUrl が空なら削除。
// 画像はクライアント側で小さくリサイズした data URL を想定（肥大化防止のため上限チェック）。
const MAX_AVATAR_CHARS = 400_000; // data URL の最大長(約300KB相当)
export async function setAvatar(
  userId: string,
  dataUrl: string,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const clean = (dataUrl || "").trim();
  if (clean) {
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(clean)) {
      return { ok: false, error: "画像ファイルを指定してください" };
    }
    if (clean.length > MAX_AVATAR_CHARS) {
      return { ok: false, error: "画像が大きすぎます（小さい画像を選んでください）" };
    }
  }
  const all = await readAll();
  const a = all.find((u) => u.id === userId);
  if (!a) return { ok: false, error: "アカウントが見つかりません" };
  a.avatar = clean || undefined;
  await writeAll(all);
  return { ok: true, user: toPublic(a) };
}

// 本人がパスワードを変更する（現在のパスワード確認つき）。
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (newPassword.length < 6) {
    return { ok: false, error: "新しいパスワードは6文字以上にしてください" };
  }
  const all = await readAll();
  const a = all.find((u) => u.id === userId);
  if (!a) return { ok: false, error: "アカウントが見つかりません" };
  if (!verifyPassword(currentPassword, a.salt, a.hash)) {
    return { ok: false, error: "現在のパスワードが違います" };
  }
  a.salt = randomBytes(16).toString("hex");
  a.hash = hashPassword(newPassword, a.salt);
  await writeAll(all);
  return { ok: true };
}
