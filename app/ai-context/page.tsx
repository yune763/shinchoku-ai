"use client";

import { useCallback, useEffect, useState } from "react";

interface Me {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "member";
  status: string;
}
interface User {
  id: string;
  displayName: string;
  email: string;
  role: "admin" | "member";
  status: string;
  claudeLinked: boolean;
  createdAt?: string;
}
interface MemberRequest {
  id: string;
  userId: string;
  userName: string;
  kind: string;
  note: string;
  status: "open" | "done";
  createdAt: string;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function ApprovalPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<User[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [requests, setRequests] = useState<MemberRequest[]>([]);
  const [myRequests, setMyRequests] = useState<MemberRequest[]>([]);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("要望");
  const [msg, setMsg] = useState("");
  // メンバー一覧は既定で収納し、ボタンで開閉する。
  const [showMembers, setShowMembers] = useState(false);

  const loadAdmin = useCallback(async () => {
    const { ok, data } = await api("/api/admin/applications");
    if (ok) {
      setPending(data.pending ?? []);
      setMembers(data.members ?? []);
      setRequests(data.requests ?? []);
    }
  }, []);

  const loadMine = useCallback(async () => {
    const { ok, data } = await api("/api/requests");
    if (ok) setMyRequests(data.requests ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await api("/api/auth/me");
      setMe(data.user);
      if (data.user?.role === "admin") await loadAdmin();
      await loadMine();
    })();
  }, [loadAdmin, loadMine]);

  async function decide(userId: string, decision: "approved" | "rejected") {
    await api("/api/admin/applications", {
      method: "POST",
      body: JSON.stringify({ action: "decide", userId, decision }),
    });
    await loadAdmin();
  }
  async function changeRole(userId: string, role: "admin" | "member") {
    const { ok, data } = await api("/api/admin/applications", {
      method: "POST",
      body: JSON.stringify({ action: "role", userId, role }),
    });
    if (!ok) setMsg(data.error || "変更できません");
    await loadAdmin();
  }
  async function changeClaude(userId: string, linked: boolean) {
    await api("/api/admin/applications", {
      method: "POST",
      body: JSON.stringify({ action: "claude", userId, linked }),
    });
    await loadAdmin();
  }
  async function resolveReq(requestId: string) {
    await api("/api/admin/applications", {
      method: "POST",
      body: JSON.stringify({ action: "resolveRequest", requestId }),
    });
    await loadAdmin();
  }
  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const { ok, data } = await api("/api/requests", {
      method: "POST",
      body: JSON.stringify({ kind, note }),
    });
    if (!ok) {
      setMsg(data.error || "送信に失敗しました");
      return;
    }
    setNote("");
    setMsg("申請を送信しました。");
    await loadMine();
    if (me?.role === "admin") await loadAdmin();
  }

  if (!me) {
    return <div className="p-10 text-ink-muted">読み込み中…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <header>
        <h1 className="text-2xl font-bold text-ink">申請・承認</h1>
        <p className="mt-1 text-sm text-ink-muted">
          新規登録の承認や、管理者への申請・要望をここで扱います。
          あなたの役割：
          <span className="font-semibold">
            {me.role === "admin" ? "管理者" : "メンバー"}
          </span>
        </p>
      </header>

      {msg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {msg}
        </p>
      )}

      {/* 管理者：登録申請の承認 */}
      {me.role === "admin" && (
        <section className="rounded-card border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-ink">
            登録申請（承認待ち {pending.length} 件）
          </h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">承認待ちはありません。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pending.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{u.displayName}</div>
                    <div className="text-xs text-ink-muted">{u.email}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => decide(u.id, "approved")}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      承認
                    </button>
                    <button
                      onClick={() => decide(u.id, "rejected")}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-ink-soft hover:border-red-400 hover:text-red-600"
                    >
                      却下
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* メンバー一覧（役割の変更）をボタンで開閉・収納 */}
          <div className="mt-4 border-t border-slate-200 pt-4">
            <button
              onClick={() => setShowMembers((v) => !v)}
              aria-expanded={showMembers}
              className="flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-ink-soft hover:border-brand hover:text-brand"
            >
              <span>
                メンバー一覧（役割の変更）・
                {members.filter((u) => u.status === "approved").length} 名
              </span>
              <span className="text-xs">{showMembers ? "▲ 閉じる" : "▼ 開く"}</span>
            </button>

            {showMembers && (
              <ul className="mt-3 space-y-2">
                {members
                  .filter((u) => u.status === "approved")
                  .map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-ink">
                          {u.displayName}
                          {u.id === me.id && (
                            <span className="ml-1 text-xs text-ink-muted">（あなた）</span>
                          )}
                        </div>
                        <div className="text-xs text-ink-muted">{u.email}</div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            u.role === "admin"
                              ? "bg-brand/10 text-brand"
                              : "bg-slate-100 text-ink-muted",
                          ].join(" ")}
                        >
                          {u.role === "admin" ? "管理者" : "メンバー"}
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            u.claudeLinked
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-ink-muted",
                          ].join(" ")}
                          title="Claude Code 連携（直接実装の可否）"
                        >
                          {u.claudeLinked ? "Claude連携済" : "Claude未連携"}
                        </span>
                        {u.role === "member" ? (
                          <button
                            onClick={() => changeRole(u.id, "admin")}
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:border-brand hover:text-brand"
                          >
                            管理者にする
                          </button>
                        ) : (
                          <button
                            onClick={() => changeRole(u.id, "member")}
                            className="rounded border border-slate-300 px-2 py-1 text-xs hover:border-red-400 hover:text-red-600"
                          >
                            管理者を外す
                          </button>
                        )}
                        <button
                          onClick={() => changeClaude(u.id, !u.claudeLinked)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs hover:border-brand hover:text-brand"
                        >
                          {u.claudeLinked ? "連携を外す" : "Claude連携にする"}
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 管理者：メンバーからの申請・要望 */}
      {me.role === "admin" && (
        <section className="rounded-card border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-bold text-ink">メンバーからの申請・要望</h2>
          {requests.filter((r) => r.status === "open").length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">未対応の申請はありません。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {requests
                .filter((r) => r.status === "open")
                .map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-amber-700">
                        {r.kind}
                      </span>
                      <button
                        onClick={() => resolveReq(r.id)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-ink-soft hover:border-brand hover:text-brand"
                      >
                        対応済みにする
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                      {r.note}
                    </p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {r.userName}・{new Date(r.createdAt).toLocaleString("ja-JP")}
                    </p>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {/* 全員：管理者への申請・要望を送る */}
      <section className="rounded-card border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink">管理者へ申請・要望を送る</h2>
        <form onSubmit={submitRequest} className="mt-3 space-y-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="要望">要望</option>
            <option value="権限申請">権限申請（管理者になりたい等）</option>
            <option value="不具合">不具合報告</option>
            <option value="その他">その他</option>
          </select>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            required
            placeholder="申請内容を入力"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            申請を送る
          </button>
        </form>

        {myRequests.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-ink-muted">あなたの申請履歴</h3>
            <ul className="mt-2 space-y-1.5">
              {myRequests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="truncate text-ink-soft">
                    [{r.kind}] {r.note}
                  </span>
                  <span
                    className={
                      r.status === "done"
                        ? "shrink-0 text-xs text-emerald-600"
                        : "shrink-0 text-xs text-amber-600"
                    }
                  >
                    {r.status === "done" ? "対応済み" : "未対応"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
