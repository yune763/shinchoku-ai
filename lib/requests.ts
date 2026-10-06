import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./blob";

// メンバーから管理者への申請・要望（登録承認とは別の自由申請）。
// 例: 管理者権限がほしい / 情報の追加依頼 など。管理者が「対応済み」にできる。
const REQUESTS_KEY = "chat/requests.json";

export type RequestStatus = "open" | "done";

export interface MemberRequest {
  id: string;
  userId: string;
  userName: string;
  kind: string; // 申請種別（例: 権限申請・要望・その他）
  note: string;
  status: RequestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

async function readAll(): Promise<MemberRequest[]> {
  const arr = await readJson<MemberRequest[]>(REQUESTS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}
async function writeAll(list: MemberRequest[]): Promise<void> {
  await writeJson(REQUESTS_KEY, list);
}

export async function createRequest(input: {
  userId: string;
  userName: string;
  kind: string;
  note: string;
}): Promise<MemberRequest> {
  const note = input.note.trim();
  if (!note) throw new Error("申請内容は必須です");
  const all = await readAll();
  const req: MemberRequest = {
    id: randomUUID(),
    userId: input.userId,
    userName: input.userName,
    kind: input.kind.trim() || "要望",
    note,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  all.unshift(req);
  await writeAll(all);
  return req;
}

export async function listRequests(): Promise<MemberRequest[]> {
  return readAll();
}

export async function listRequestsByUser(
  userId: string,
): Promise<MemberRequest[]> {
  return (await readAll()).filter((r) => r.userId === userId);
}

export async function resolveRequest(
  id: string,
  adminId: string,
): Promise<MemberRequest | null> {
  const all = await readAll();
  const r = all.find((x) => x.id === id);
  if (!r) return null;
  r.status = "done";
  r.decidedAt = new Date().toISOString();
  r.decidedBy = adminId;
  await writeAll(all);
  return r;
}
