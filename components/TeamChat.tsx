"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NewGoalForm } from "@/components/NewGoalForm";

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
  const [newGoalTitle, setNewGoalTitle] = useState<string | null>(null); // 新規ゴールモーダルの初期タイトル
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
    <div className="flex h-screen bg-[#FBF5EC]">
      {/* 左：チャット一覧 (1/4) */}
      <aside className="flex w-1/4 min-w-[200px] flex-col border-r border-amber-100 bg-[#FDF8F1]">
        <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
          <span className="text-sm font-bold text-ink">💬 チャット</span>
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
                "mb-0.5 flex w-full items-center gap-1 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                c.id === activeId
                  ? "bg-brand text-white shadow-sm"
                  : "text-ink-soft hover:bg-amber-100/60",
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
                "mb-0.5 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                c.id === activeId
                  ? "bg-brand text-white shadow-sm"
                  : "text-ink-soft hover:bg-amber-100/60",
              ].join(" ")}
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-amber-300 to-rose-300 text-[10px] font-bold text-white">
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
      <section className="flex w-2/4 flex-col bg-[#FBF5EC]">
        <header className="border-b border-amber-100 bg-[#FDF8F1] px-5 py-3">
          <h1 className="text-sm font-bold text-ink">
            {active
              ? (active.kind === "channel" ? "# " : "💌 ") + active.name
              : "—"}
          </h1>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 && (
            <div className="py-16 text-center text-sm text-ink-muted">
              <div className="text-4xl">🌱</div>
              <p className="mt-2">まだメッセージがありません。</p>
              <p className="text-xs text-ink-muted/80">
                さいしょのひとことを送ってみましょう
              </p>
            </div>
          )}
          {messages.map((m) => {
            const mine = m.senderId === me.id;
            return (
              <div key={m.id}>
                <div className={mine ? "text-right" : "text-left"}>
                  <div className="mb-0.5 text-[11px] text-ink-muted">
                    {mine ? "あなた" : m.senderName}・{fmtTime(m.createdAt)}
                  </div>
                </div>
                <div
                  className={[
                    "flex items-start gap-1",
                    mine ? "justify-end" : "justify-start",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "max-w-[80%] whitespace-pre-wrap px-4 py-2.5 text-left text-sm shadow-sm",
                      mine
                        ? "rounded-[20px] rounded-br-md bg-gradient-to-br from-brand to-brand-fg text-white"
                        : "rounded-[20px] rounded-bl-md border border-amber-100 bg-white text-ink",
                    ].join(" ")}
                  >
                    {m.text}
                  </div>
                  <button
                    onClick={() => {
                      setMenuFor(menuFor === m.id ? "" : m.id);
                      setGoalPickerFor("");
                    }}
                    aria-label="タスク操作"
                    className="mt-1 grid h-7 w-6 shrink-0 place-items-center rounded-full text-base leading-none text-ink-muted hover:bg-amber-100/70"
                  >
                    ⋮
                  </button>
                </div>

                {/* 三点メニューの中身（通常ブロックで開くので見切れない） */}
                {menuFor === m.id && (
                  <>
                    {/* メニュー以外をクリックで閉じる透明オーバーレイ */}
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => {
                        setMenuFor("");
                        setGoalPickerFor("");
                      }}
                    />
                    <div
                      className={
                        mine ? "relative z-40 mt-1 flex justify-end" : "relative z-40 mt-1"
                      }
                    >
                      <div className="w-52 rounded-2xl border border-amber-100 bg-[#FFFDF9] p-1.5 text-left shadow-[0_10px_30px_rgba(180,140,90,0.18)]">
                        {m.task?.state === "added" && m.task.target === "today" ? (
                          <div className="flex w-full items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-left text-[12px] font-medium text-emerald-700">
                            📅 今日のToDoに追加済み
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              toTask(m.id, "add", "today");
                              setMenuFor("");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-ink-soft transition-colors hover:bg-amber-50"
                          >
                            📅 今日のToDoに追加
                          </button>
                        )}
                        <button
                          onClick={() =>
                            setGoalPickerFor(goalPickerFor === m.id ? "" : m.id)
                          }
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-ink-soft transition-colors hover:bg-amber-50"
                        >
                          🎯 ゴールに追加 ▾
                        </button>
                        {goalPickerFor === m.id && (
                          <div className="mt-1 space-y-1 px-1 pb-1">
                            <button
                              onClick={() => {
                                setNewGoalTitle(m.text);
                                setMenuFor("");
                                setGoalPickerFor("");
                              }}
                              className="block w-full rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-left text-[11px] font-semibold text-brand transition-colors hover:bg-brand/10"
                            >
                              ✨ 新規ゴールとして作成
                            </button>
                            <select
                              autoFocus
                              onChange={(e) => {
                                if (e.target.value) {
                                  toTask(m.id, "add", "goal", e.target.value);
                                  setMenuFor("");
                                }
                              }}
                              defaultValue=""
                              className="w-full rounded-xl border border-slate-200 px-2 py-1.5 text-[11px]"
                            >
                              <option value="" disabled>
                                既存ゴールに追加…
                              </option>
                              {goals.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {m.task?.state === "suggested" && (
                          <button
                            onClick={() => {
                              toTask(m.id, "dismiss");
                              setMenuFor("");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] text-ink-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
                          >
                            🗑 候補を却下
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* 入力 */}
        <div className="border-t border-amber-100 bg-[#FDF8F1] p-3">
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
              placeholder="メッセージを入力…（⌘/Ctrl+Enterで送信）"
              className="flex-1 resize-none rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={send}
              disabled={!draft.trim()}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
            >
              送信 ✈
            </button>
          </div>
        </div>
      </section>

      {/* 右：タスク一覧 (1/4) */}
      <aside className="flex w-1/4 min-w-[200px] flex-col border-l border-amber-100 bg-[#FDF8F1]">
        <div className="border-b border-amber-100 px-4 py-3">
          <span className="text-sm font-bold text-ink">🗒 タスク</span>
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

      {/* チャットから「新規ゴールとして作成」したときのモーダル（新しいゴールを置くと同機能） */}
      {newGoalTitle !== null && (
        <NewGoalForm
          goals={[]}
          forceOpen
          initialTitle={newGoalTitle}
          onClose={() => setNewGoalTitle(null)}
          onCreated={() => {
            setNewGoalTitle(null);
            loadTasks();
          }}
        />
      )}
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
