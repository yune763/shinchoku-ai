"use client";

import { useEffect, useState } from "react";

interface Me {
  id: string;
  email: string;
  lastName: string;
  firstName: string;
  displayName: string;
  role: "admin" | "member";
  claudeLinked: boolean;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [origin, setOrigin] = useState("");

  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [claudeMsg, setClaudeMsg] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      const { data } = await api("/api/auth/me");
      setMe(data.user);
    })();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg("");
    setPwErr("");
    const { ok, data } = await api("/api/account/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: cur, newPassword: next }),
    });
    if (!ok) {
      setPwErr(data.error || "変更できませんでした");
      return;
    }
    setPwMsg("パスワードを変更しました。");
    setCur("");
    setNext("");
  }

  async function setClaude(linked: boolean) {
    setClaudeMsg("");
    const { ok, data } = await api("/api/account/claude", {
      method: "POST",
      body: JSON.stringify({ linked }),
    });
    if (ok) {
      setMe(data.user);
      setClaudeMsg(
        linked
          ? "連携を有効にしました。下の手順でお使いのPCのClaude Codeを接続してください。"
          : "連携を解除しました。",
      );
    }
  }

  if (!me) return <div className="p-10 text-ink-muted">読み込み中…</div>;

  const connectCmd = `node scripts/connect.mjs ${origin} "${me.displayName}"`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-10">
      <h1 className="text-2xl font-bold text-ink">アカウント情報</h1>

      {/* ログイン情報 */}
      <section className="rounded-card border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink">ログイン情報</h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">氏名</dt>
            <dd className="font-medium text-ink">{me.displayName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">メールアドレス</dt>
            <dd className="font-medium text-ink">{me.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">役割</dt>
            <dd className="font-medium text-ink">
              {me.role === "admin" ? "管理者" : "メンバー"}
            </dd>
          </div>
        </dl>
      </section>

      {/* パスワード再設定 */}
      <section className="rounded-card border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-ink">パスワードの再設定</h2>
        <form onSubmit={changePassword} className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold text-ink-soft">現在のパスワード</label>
            <input
              type="password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-soft">新しいパスワード（6文字以上）</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={6}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </div>
          {pwMsg && <p className="text-sm text-emerald-600">{pwMsg}</p>}
          {pwErr && <p className="text-sm text-red-600">{pwErr}</p>}
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
          >
            パスワードを変更
          </button>
        </form>
      </section>

      {/* Claude Code 連携 */}
      <section className="rounded-card border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-ink">Claude Code 連携</h2>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              me.claudeLinked
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-ink-muted",
            ].join(" ")}
          >
            {me.claudeLinked ? "連携済み" : "未連携"}
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          連携すると、このアカウントでシステムからの直接実装（AIに実装を依頼）が使えます。
          連携しなくてもシステムは通常どおり利用できます。
        </p>

        <div className="mt-3 flex gap-2">
          {me.claudeLinked ? (
            <button
              onClick={() => setClaude(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-ink-soft hover:border-red-400 hover:text-red-600"
            >
              連携を解除する
            </button>
          ) : (
            <button
              onClick={() => setClaude(true)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              連携する
            </button>
          )}
        </div>
        {claudeMsg && (
          <p className="mt-2 text-sm text-emerald-600">{claudeMsg}</p>
        )}

        {me.claudeLinked && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-ink-soft">
              お使いのPCのClaude Codeを接続する手順
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ink-muted">
              <li>このリポジトリ（進捗管理AI）をPCに用意し、ターミナルで開く。</li>
              <li>
                次のコマンドを実行（あなたの表示名で登録されます）:
                <pre className="mt-1 overflow-x-auto rounded bg-ink px-2 py-1.5 text-[11px] text-slate-100">
                  {connectCmd}
                </pre>
              </li>
              <li>Claude Code / Cursor を再起動すると、このシステムに接続されます。</li>
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
