import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "./blob";

// 社内チャット：チャンネル（全員参加のグループ）と DM（1:1）。
// 会話メタは1ファイル、メッセージは会話ごとに別ファイルへ保存（肥大化を分散）。

const CONVERSATIONS_KEY = "chat/conversations.json";
const MESSAGES_KEY = (convId: string) => `chat/messages/${convId}.json`;
// Firestore 1ドキュメント上限(約1MiB)を避けるため会話あたりの保持件数を上限化。
const MAX_MESSAGES_PER_CONV = 500;

export type ConversationKind = "channel" | "dm";

export interface Conversation {
  id: string;
  kind: ConversationKind;
  name: string; // channel名。DMは空（相手名を表示側で解決）
  memberIds: string[]; // DMは[a,b]。channelは空（＝全員）
  createdBy: string;
  createdAt: string;
}

export interface ChatMessageTask {
  state: "suggested" | "added" | "dismissed";
  goalId?: string; // タスク化で作られた/紐づいたゴールID
  target?: "today" | "goal"; // 今日のToDoとして新規 or 既存ゴールへ
  auto?: boolean; // 学習による自動追加か
}

export interface StoredMessage {
  id: string;
  convId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  task?: ChatMessageTask;
}

async function readConversations(): Promise<Conversation[]> {
  const arr = await readJson<Conversation[]>(CONVERSATIONS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

async function writeConversations(list: Conversation[]): Promise<void> {
  await writeJson(CONVERSATIONS_KEY, list);
}

// 初回に既定チャンネル #一般 を用意する。
export async function ensureDefaultChannels(createdBy = "system"): Promise<void> {
  const all = await readConversations();
  if (all.some((c) => c.kind === "channel")) return;
  all.push({
    id: `ch-${randomUUID().slice(0, 8)}`,
    kind: "channel",
    name: "一般",
    memberIds: [],
    createdBy,
    createdAt: new Date().toISOString(),
  });
  await writeConversations(all);
}

export async function createChannel(
  name: string,
  createdBy: string,
): Promise<Conversation> {
  const clean = name.trim().replace(/^#/, "");
  if (!clean) throw new Error("チャンネル名は必須です");
  const all = await readConversations();
  if (all.some((c) => c.kind === "channel" && c.name === clean)) {
    const existing = all.find((c) => c.kind === "channel" && c.name === clean)!;
    return existing;
  }
  const conv: Conversation = {
    id: `ch-${randomUUID().slice(0, 8)}`,
    kind: "channel",
    name: clean,
    memberIds: [],
    createdBy,
    createdAt: new Date().toISOString(),
  };
  all.push(conv);
  await writeConversations(all);
  return conv;
}

// DMの会話IDは2者のIDをソートして決定的に作る（重複作成を防ぐ）。
function dmId(a: string, b: string): string {
  return "dm-" + [a, b].sort().join("__");
}

export async function getOrCreateDm(
  userA: string,
  userB: string,
): Promise<Conversation> {
  const id = dmId(userA, userB);
  const all = await readConversations();
  const found = all.find((c) => c.id === id);
  if (found) return found;
  const conv: Conversation = {
    id,
    kind: "dm",
    name: "",
    memberIds: [userA, userB].sort(),
    createdBy: userA,
    createdAt: new Date().toISOString(),
  };
  all.push(conv);
  await writeConversations(all);
  return conv;
}

export async function getConversation(
  convId: string,
): Promise<Conversation | null> {
  return (await readConversations()).find((c) => c.id === convId) ?? null;
}

// 指定ユーザーが閲覧できる会話（channel全部 + 自分が属するDM）。
export async function listConversationsFor(
  userId: string,
): Promise<Conversation[]> {
  const all = await readConversations();
  return all.filter(
    (c) => c.kind === "channel" || c.memberIds.includes(userId),
  );
}

export function canAccess(conv: Conversation, userId: string): boolean {
  return conv.kind === "channel" || conv.memberIds.includes(userId);
}

async function readMessages(convId: string): Promise<StoredMessage[]> {
  const arr = await readJson<StoredMessage[]>(MESSAGES_KEY(convId), []);
  return Array.isArray(arr) ? arr : [];
}

async function writeMessages(
  convId: string,
  list: StoredMessage[],
): Promise<void> {
  // 上限を超えたら古いものから切り詰める。
  const trimmed =
    list.length > MAX_MESSAGES_PER_CONV
      ? list.slice(list.length - MAX_MESSAGES_PER_CONV)
      : list;
  await writeJson(MESSAGES_KEY(convId), trimmed);
}

export async function listMessages(convId: string): Promise<StoredMessage[]> {
  return readMessages(convId);
}

export async function sendMessage(
  convId: string,
  senderId: string,
  senderName: string,
  text: string,
): Promise<StoredMessage> {
  const clean = text.trim();
  if (!clean) throw new Error("本文が空です");
  const list = await readMessages(convId);
  const msg: StoredMessage = {
    id: randomUUID(),
    convId,
    senderId,
    senderName,
    text: clean,
    createdAt: new Date().toISOString(),
  };
  list.push(msg);
  await writeMessages(convId, list);
  return msg;
}

// 既読状態：ユーザーごとに「会話ID → 最後に読んだ時刻(ISO)」を1ファイルで保持する。
const READS_KEY = (userId: string) => `chat/reads/${userId}.json`;

async function readReadState(userId: string): Promise<Record<string, string>> {
  const obj = await readJson<Record<string, string>>(READS_KEY(userId), {});
  return obj && typeof obj === "object" ? obj : {};
}

// 指定会話を「今読んだ」ことにする（既定は現在時刻）。
export async function markConversationRead(
  userId: string,
  convId: string,
  at?: string,
): Promise<void> {
  const state = await readReadState(userId);
  state[convId] = at ?? new Date().toISOString();
  await writeJson(READS_KEY(userId), state);
}

// 未読の「トーク（会話）数」を返す。未読メッセージ件数ではなく、
// 他人からの未読メッセージが1件以上ある会話の数を数える。
export async function countUnreadConversations(userId: string): Promise<number> {
  const convs = await listConversationsFor(userId);
  const reads = await readReadState(userId);
  let count = 0;
  for (const conv of convs) {
    const lastRead = reads[conv.id];
    const messages = await readMessages(conv.id);
    const hasUnread = messages.some(
      (m) => m.senderId !== userId && (!lastRead || m.createdAt > lastRead),
    );
    if (hasUnread) count++;
  }
  return count;
}

export async function updateMessageTask(
  convId: string,
  messageId: string,
  task: ChatMessageTask,
): Promise<StoredMessage | null> {
  const list = await readMessages(convId);
  const m = list.find((x) => x.id === messageId);
  if (!m) return null;
  m.task = task;
  await writeMessages(convId, list);
  return m;
}
