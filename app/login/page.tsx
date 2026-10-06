"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login"
          ? { email, password }
          : { email, password, displayName };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "失敗しました");
        return;
      }
      // 新規登録で承認待ちの場合はログインさせず、案内を出す。
      if (mode === "register" && data.status === "pending") {
        setNotice(
          data.message ||
            "申請を受け付けました。管理者の承認後にログインできます。",
        );
        setMode("login");
        setPassword("");
        return;
      }
      // 承認済み（管理者初回）またはログイン成功 → アプリへ。
      router.push("/goals");
      router.refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="rounded-card border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-ink">
          {mode === "login" ? "ログイン" : "新規登録"}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {mode === "register"
            ? "新規登録は管理者への申請です。承認後にログインできます。"
            : "進捗管理AIを使うにはログインが必要です。"}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "register" && (
            <div>
              <label className="text-xs font-semibold text-ink-soft">表示名</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
                placeholder="山田太郎"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-ink-soft">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-soft">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="6文字以上"
            />
          </div>

          {notice && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "処理中…" : mode === "login" ? "ログイン" : "登録してはじめる"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
          className="mt-4 text-sm text-brand hover:underline"
        >
          {mode === "login"
            ? "アカウントがない方はこちら（新規登録）"
            : "すでにアカウントがある方はこちら（ログイン）"}
        </button>
      </div>
    </div>
  );
}
