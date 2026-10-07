"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Me {
  id: string;
  email: string;
  displayName: string;
}
interface Conversation {
  id: string;
  kind: "channel" | "dm";
  name: string;
  memberIds: string[];
}
interface MsgTask {
  state: "suggested" | "added" | "dismissed";
  goalId?: string;
  target?: "today" | "goal";
  auto?: boolean;
}
interface Message {
  id: string;
  convId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  task?: MsgTask;
}
interface TaskItem {
  id: string;
  title: string;
  assignee: string;
  dueDate: string | null;
  status: string;
}
interface UserLite {
  id: string;
  displayName: string;
  email: string;
}

const POLL_MS = 3000;

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function TeamChat() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [today, setToday] = useState<TaskItem[]>([]);
  const [upcoming, setUpcoming] = useState<TaskItem[]>([]);
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);
  const [stats, setStats] = useState<{
    totalPos: number;
    totalNeg: number;
    autoEnabled: boolean;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [users, setUsers] = useState<UserLite[]>([]);
  const [showNewDm, setShowNewDm] = useState(false);
  const [goalPickerFor, setGoalPickerFor] = useState<string>("");
  const [menuFor, setMenuFor] = useState<string>(""); // 三点メニューを開いているメッセージID
  const bottomRef = useRef<HTMLDivElement>(null);
  // 直近で既読化した (会話ID:最新メッセージID) を覚え、同じ状態での重複書き込みを防ぐ。
  const lastMarkedRef = useRef<string>("");

  // 会話を既読にし、サイドバーの未読バッジへ更新を通知する。
  const markRead = useCallback(async (convId: string) => {
    if (!convId) return;
    await api("/api/teamchat/read", {
      method: "POST",
      body: JSON.stringify({ convId }),
    });
    window.dispatchEvent(new Event("shinchoku:unread-changed"));
  }, []);

  // 認証チェック＋初期ロード。
  useEffect(() => {
    (async () => {
      const { data } = await api("/api/auth/me");
      if (!data.user) {
        router.push("/login");
        return;
      }
      setMe(data.user);
      await loadConvs();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConvs = useCallback(async () => {
    const { data } = await api("/api/teamchat/conversations");
    const list: Conversation[] = data.conversations ?? [];
    setConvs(list);
    setActiveId((cur) => cur || list[0]?.id || "");
  }, []);

  const loadMessages = useCallback(async (convId: string) => {
    if (!convId) return;
    const { data } = await api(
      `/api/teamchat/messages?conv=${encodeURIComponent(convId)}`,
    );
    setMessages(data.messages ?? []);
  }, []);

  const loadTasks = useCallback(async () => {
    const { data } = await api("/api/teamchat/tasks");
    setToday(data.today ?? []);
    setUpcoming(data.upcoming ?? []);
    setGoals(data.goals ?? []);
    setStats(data.stats ?? null);
  }, []);

  // アクティブ会話が変わったら読み込み＋ポーリング。
  useEffect(() => {
    if (!activeId) return;
    loadMessages(activeId);
    loadTasks();
    const t = setInterval(() => {
      loadMessages(activeId);
      loadTasks();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [activeId, loadMessages, loadTasks]);

  // メッセージが増えたら最下部へ。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  // 表示中の会話は既読にする。最新メッセージが変わったときだけ既読化を実行する。
  useEffect(() => {
    if (!activeId || !me) return;
    const last = messages[messages.length - 1];
    if (!last) return;
    const key = `${activeId}:${last.id}`;
    if (lastMarkedRef.current === key) return;
    lastMarkedRef.current = key;
    // 自分の送信が最新なら未読は発生しないのでサーバー書き込みは不要。
    if (last.senderId === me.id) return;
    markRead(activeId);
  }, [messages, activeId, me, markRead]);

  async function send() {
    const text = draft.trim();
    if (!text || !activeId) return;
    setDraft("");
    await api("/api/teamchat/messages", {
      method: "POST",
      body: JSON.stringify({ convId: activeId, text }),
    });
    await loadMessages(activeId);
    await loadTasks();
  }

  async function toTask(
    messageId: string,
    action: "add" | "dismiss",
    target: "today" | "goal" = "today",
    goalId?: string,
  ) {
    await api("/api/teamchat/to-task", {
      method: "POST",
      body: JSON.stringify({
        convId: activeId,
        messageId,
        action,
        target,
        goalId,
      }),
    });
    setGoalPickerFor("");
    await loadMessages(activeId);
    await loadTasks();
  }

  async function createChannel() {
    const name = window.prompt("チャンネル名（例: 開発）");
    if (!name) return;
    await api("/api/teamchat/conversations", {
      method: "POST",
      body: JSON.stringify({ action: "channel", name }),
    });
    await loadConvs();
  }

  async function openDmPicker() {
    const { data } = await api("/api/teamchat/users");
    setUsers(data.users ?? []);
    setShowNewDm(true);
  }

  async function startDm(userId: string) {
    const { data } = await api("/api/teamchat/conversations", {
      method: "POST",
      body: JSON.stringify({ action: "dm", userId }),
    });
    setShowNewDm(false);
    await loadConvs();
    if (data.conversation?.id) setActiveId(data.conversation.id);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const active = convs.find((c) => c.id === activeId);
  const channels = convs.filter((c) => c.kind === "channel");
  const dms = convs.filter((c) => c.kind === "dm");

  if (!me) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* 左：チャット一覧 (1/4) */}
      <aside className="flex w-1/4 min-w-[200px] flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-bold text-ink">チャット</span>
          <button
            onClick={logout}
            className="text-xs text-ink-muted hover:text-brand"
            title={me.displayName + " / ログアウト"}
          >
            {me.displayName}・ログアウト
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="mb-1 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-ink-muted">チャンネル</span>
            <button onClick={createChannel} className="text-xs text-brand hover:underline">
              ＋作成
            </button>
          </div>
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={[
                "mb-0.5 flex w-full items-center gap-1 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                c.id === activeId ? "bg-brand text-white" : "text-ink-soft hover:bg-white",
              ].join(" ")}
            >
              <span className="opacity-60">#</span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}

          <div className="mt-3 mb-1 flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-ink-muted">ダイレクト</span>
            <button onClick={openDmPicker} className="text-xs text-brand hover:underline">
              ＋新規
            </button>
          </div>
          {dms.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={[
                "mb-0.5 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                c.id === activeId ? "bg-brand text-white" : "text-ink-soft hover:bg-white",
              ].join(" ")}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-300 text-[10px] text-white">
                {c.name.slice(0, 1)}
              </span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          {showNewDm && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
              <div className="mb-1 px-1 text-xs font-semibold text-ink-muted">
                相手を選ぶ
              </div>
              {users.length === 0 && (
                <p className="px-1 py-2 text-xs text-ink-muted">
                  他のメンバーがいません
                </p>
              )}
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startDm(u.id)}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                >
                  {u.displayName}
                </button>
              ))}
              <button
                onClick={() => setShowNewDm(false)}
                className="mt-1 w-full px-2 py-1 text-xs text-ink-muted hover:underline"
              >
                閉じる
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* 中央：チャット詳細 (2/4) */}
      <section className="flex w-2/4 flex-col">
        <header className="border-b border-slate-200 px-5 py-3">
          <h1 className="text-sm font-bold text-ink">
            {active ? (active.kind === "channel" ? "# " : "") + active.name : "—"}
          </h1>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-ink-muted">
              まだメッセージがありません。
            </p>
          )}
          {messages.map((m) => {
            const mine = m.senderId === me.id;
            return (
              <div key={m.id} className={mine ? "text-right" : "text-left"}>
                <div className="mb-0.5 text-[11px] text-ink-muted">
                  {mine ? "あなた" : m.senderName}・{fmtTime(m.createdAt)}
                </div>
                <div
                  className={[
                    "inline-block max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-left text-sm",
                    mine ? "bg-brand text-white" : "bg-slate-100 text-ink",
                  ].join(" ")}
                >
                  {m.text}
                </div>

                {/* タスク化の状態・操作 */}
                <div className={mine ? "mt-1" : "mt-1"}>
                  {m.task?.state === "added" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      ✓ タスク化{m.task.auto ? "（自動・学習）" : "済み"}
                    </span>
                  )}
                  {m.task?.state === "dismissed" && (
                    <span className="text-[11px] text-ink-muted">候補を却下</span>
                  )}
                  {(!m.task || m.task.state === "suggested") && (
                    <div
                      className={[
                        "inline-flex items-center gap-1.5",
                        mine ? "flex-row-reverse" : "",
                      ].join(" ")}
                    >
                      {m.task?.state === "suggested" && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          タスク候補
                        </span>
                      )}
                      {/* 三点リーダー：中に「今日のToDoに追加 / ゴールに追加」を収納 */}
                      <div className="relative">
                        <button
                          onClick={() => {
                            setMenuFor(menuFor === m.id ? "" : m.id);
                            setGoalPickerFor("");
                          }}
                          aria-label="タスク操作"
                          className="grid h-6 w-6 place-items-center rounded-full text-ink-muted hover:bg-slate-100"
                        >
                          ⋯
                        </button>
                        {menuFor === m.id && (
                          <>
                            <div
                              className="fixed inset-0 z-30"
                              onClick={() => {
                                setMenuFor("");
                                setGoalPickerFor("");
                              }}
                            />
                            <div className="absolute z-40 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 text-left shadow-lg right-0">
                              <button
                                onClick={() => {
                                  toTask(m.id, "add", "today");
                                  setMenuFor("");
                                }}
                                className="block w-full rounded px-3 py-2 text-left text-[12px] text-ink-soft hover:bg-slate-100"
                              >
                                今日のToDoに追加
                              </button>
                              <button
                                onClick={() =>
                                  setGoalPickerFor(
                                    goalPickerFor === m.id ? "" : m.id,
                                  )
                                }
                                className="block w-full rounded px-3 py-2 text-left text-[12px] text-ink-soft hover:bg-slate-100"
                              >
                                ゴールに追加 ▾
                              </button>
                              {goalPickerFor === m.id && (
                                <select
                                  autoFocus
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      toTask(m.id, "add", "goal", e.target.value);
                                      setMenuFor("");
                                    }
                                  }}
                                  defaultValue=""
                                  className="mt-1 w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]"
                                >
                                  <option value="" disabled>
                                    追加先ゴールを選択…
                                  </option>
                                  {goals.map((g) => (
                                    <option key={g.id} value={g.id}>
                                      {g.title}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {m.task?.state === "suggested" && (
                                <button
                                  onClick={() => {
                                    toTask(m.id, "dismiss");
                                    setMenuFor("");
                                  }}
                                  className="block w-full rounded px-3 py-2 text-left text-[12px] text-ink-muted hover:bg-slate-100 hover:text-red-600"
                                >
                                  候補を却下
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* 入力 */}
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="メッセージ（⌘/Ctrl+Enterで送信）"
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              送信
            </button>
          </div>
        </div>
      </section>

      {/* 右：タスク一覧 (1/4) */}
      <aside className="flex w-1/4 min-w-[200px] flex-col border-l border-slate-200 bg-slate-50">
        <div className="border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-bold text-ink">タスク</span>
          {stats && (
            <p className="mt-0.5 text-[11px] text-ink-muted">
              学習: 追加{stats.totalPos}・却下{stats.totalNeg}／
              {stats.autoEnabled ? "自動追加 有効" : "自動追加はまだ"}
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <TaskGroup label="今日" items={today} />
          <div className="mt-4">
            <TaskGroup label="明日以降" items={upcoming} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function TaskGroup({ label, items }: { label: string; items: TaskItem[] }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-ink-muted">{label}</span>
        <span className="text-[11px] text-ink-muted">{items.length}</span>
      </div>
      {items.length === 0 && (
        <p className="px-1 py-2 text-[11px] text-ink-muted">なし</p>
      )}
      <ul className="space-y-1.5">
        {items.map((t) => (
          <li
            key={t.id}
            className="rounded-lg border border-slate-200 bg-white p-2.5"
          >
            <a
              href={`/goals/${t.id}`}
              className="block text-sm text-ink hover:text-brand"
            >
              {t.title}
            </a>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-muted">
              <span>{t.assignee || "未割当"}</span>
              {t.dueDate && <span>・{t.dueDate}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
