"use client";

import { useState } from "react";

// 1行インストールコマンドと setup スクリプトの場所（GitHub raw）。
const WIN_INSTALL_CMD =
  "irm https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1 | iex";
const SETUP_PS1_URL =
  "https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1";
const MAC_INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.sh | bash";
const SETUP_SH_URL =
  "https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.sh";

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 手動コピー */
    }
  }
  return (
    <div className="flex items-stretch gap-2">
      <code className="flex-1 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100 dark:bg-slate-950">
        {text}
      </code>
      <button
        onClick={copy}
        className="shrink-0 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-white"
      >
        {copied ? "コピー済" : "コピー"}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
        {n}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="font-semibold text-ink dark:text-slate-100">{title}</div>
        <div className="mt-1 text-sm text-ink-soft dark:text-slate-300">{children}</div>
      </div>
    </div>
  );
}

type OS = "win" | "mac";

export default function InstallPage() {
  const [os, setOs] = useState<OS>("win");
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  async function applyUpdate() {
    if (updating) return;
    setUpdating(true);
    setUpdateMsg("更新を確認しています…");
    try {
      const res = await fetch("/api/app/update", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setUpdateMsg(d.error ?? "更新に失敗しました");
      else if (d.alreadyLatest) setUpdateMsg("すでに最新です。");
      else if (d.needInstall && d.installError)
        setUpdateMsg("コードは更新しましたが、依存の再インストールに失敗しました。デスクトップの『進捗管理AIを更新』を実行してください。");
      else if (d.needInstall)
        setUpdateMsg("最新に更新しました（依存も再インストール済み）。アプリを起動し直すと反映されます。");
      else setUpdateMsg("最新に更新しました。起動し直すと反映されます。");
    } catch {
      setUpdateMsg("通信に失敗しました（この機能はローカル起動版でのみ使えます）");
    } finally {
      setUpdating(false);
    }
  }

  const isWin = os === "win";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-10">
      <header>
        <h1 className="text-2xl font-bold text-ink dark:text-white">アプリ導入</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-slate-400">
          各自のPCで進捗管理AIを動かすための手順です。データは共有DBに集約されるので、
          ローカルで動かしても全員で同じ情報を共有できます。
        </p>
      </header>

      {/* OS 切り替え */}
      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1">
        <button
          onClick={() => setOs("win")}
          className={[
            "rounded-lg px-5 py-2 text-sm font-semibold transition-colors",
            isWin ? "bg-brand text-white" : "text-ink-soft dark:text-slate-300",
          ].join(" ")}
        >
          Windows
        </button>
        <button
          onClick={() => setOs("mac")}
          className={[
            "rounded-lg px-5 py-2 text-sm font-semibold transition-colors",
            !isWin ? "bg-brand text-white" : "text-ink-soft dark:text-slate-300",
          ].join(" ")}
        >
          Mac
        </button>
      </div>

      {/* 事前に用意するもの */}
      <section className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2">
        <h2 className="text-sm font-bold text-ink dark:text-white">事前に用意するもの</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft dark:text-slate-300">
          <li>
            <strong>共有DBの鍵</strong>（<code className="text-xs">FIREBASE_SERVICE_ACCOUNT</code>・1行JSON）
            …管理者から安全に受け取る
          </li>
          <li>
            <strong>ログイン用アカウント</strong>…アプリで新規登録 → 管理者が「申請・承認」で承認
          </li>
          <li>
            （AI機能を使う人のみ）<strong>Claude の Maxプラン</strong>アカウント
          </li>
        </ul>
      </section>

      {/* 導入手順 */}
      <section className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <h2 className="text-sm font-bold text-ink dark:text-white">
          導入手順（{isWin ? "Windows" : "Mac"}）
        </h2>

        {/* STEP 1: インストール */}
        <Step n={1} title="本体をインストール">
          {isWin ? (
            <div className="space-y-2">
              <p>次のどちらかでインストールします（必要ソフト・本体・連携設定まで自動）。</p>
              <div className="rounded-lg border border-brand/30 bg-brand/5 dark:bg-brand/10 p-3 space-y-2">
                <div className="text-xs font-semibold">かんたん（ボタン）</div>
                <a
                  href="/shinchoku-install.cmd"
                  download="進捗管理AI-インストール.cmd"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
                >
                  ⬇ インストーラをダウンロード
                </a>
                <p className="text-xs text-ink-muted dark:text-slate-400">
                  ダウンロード後ダブルクリック → SmartScreen「詳細情報→実行」→ UAC「はい」
                </p>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-ink-muted dark:text-slate-400">
                  うまくいかない場合：PowerShellに1行貼る
                </summary>
                <div className="mt-2 space-y-1">
                  <CopyBox text={WIN_INSTALL_CMD} />
                  <p className="text-xs text-ink-muted dark:text-slate-400">
                    中身：{" "}
                    <a href={SETUP_PS1_URL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      setup.ps1
                    </a>
                  </p>
                </div>
              </details>
            </div>
          ) : (
            <div className="space-y-2">
              <p>「ターミナル」を開き（Spotlightで「terminal」）、次の1行を貼り付けて Enter（必要ソフト・本体・連携設定まで自動）。</p>
              <CopyBox text={MAC_INSTALL_CMD} />
              <details className="text-xs">
                <summary className="cursor-pointer text-ink-muted dark:text-slate-400">
                  インストーラファイルから入れたい場合
                </summary>
                <div className="mt-2 space-y-1">
                  <a
                    href="/shinchoku-install.command"
                    download="進捗管理AI-インストール.command"
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                  >
                    ⬇ インストーラをダウンロード
                  </a>
                  <p className="text-ink-muted dark:text-slate-400">
                    ※「開いていません」と出たら、ターミナルで <code>bash</code> + 半角スペース →
                    ファイルをドラッグ＆ドロップ → Enter。
                  </p>
                  <p className="text-ink-muted dark:text-slate-400">
                    中身：{" "}
                    <a href={SETUP_SH_URL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      setup.sh
                    </a>
                  </p>
                </div>
              </details>
            </div>
          )}
        </Step>

        {/* STEP 2: 鍵の入力 */}
        <Step n={2} title="共有DBの鍵を入力">
          インストールの途中で <code className="text-xs">FIREBASE_SERVICE_ACCOUNT</code> を聞かれたら、
          管理者から受け取った値（1行JSON）を貼り付けて Enter。
          {!isWin && "（Homebrew導入時にMacのパスワードを求められることがあります）"}
        </Step>

        {/* STEP 3: Claudeログイン */}
        <Step n={3} title="初回だけ：Claude にログイン（AI機能を使う人）">
          {isWin ? "PowerShell" : "ターミナル"}で <code className="text-xs">claude</code>{" "}
          と入力し、Maxアカウントでログイン。
        </Step>

        {/* STEP 4: 再起動 */}
        <Step n={4} title="Claude Code / Cursor を再起動">
          連携（MCP・作業ログ自動送信）が有効になります。
        </Step>

        {/* STEP 5: 起動とログイン */}
        <Step n={5} title="起動してログイン">
          デスクトップの「進捗管理AIを起動
          {isWin ? "" : ".command（初回は右クリック→開く）"}」をダブルクリック →
          ブラウザで <code className="text-xs">http://localhost:3000</code> を開く →
          登録済みアカウントでログイン（未登録なら新規登録→管理者が承認）。
        </Step>
      </section>

      {/* 共有キーの注意 */}
      <section className="rounded-card border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-2">
        <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">
          共有DBキー（FIREBASE_SERVICE_ACCOUNT）について
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
          <li>全メンバーが<strong>同じ値</strong>にすると、ゴール・メンバー・ツール管理などが共有されます。</li>
          <li>設定値は各PCの <code className="text-xs">.env</code> に保存され、<strong>更新しても消えません</strong>。</li>
          <li>
            鍵が未設定だと<strong>共有データが見えず、ログインも失敗</strong>します。
            <code className="text-xs">http://localhost:3000/api/health</code> の
            <code className="text-xs">backend</code> が <code className="text-xs">firestore</code> なら接続OK、
            <code className="text-xs">file</code> なら鍵未設定です。
          </li>
          <li>機密情報です。パスワードマネージャ等で安全に配布してください。</li>
        </ul>
      </section>

      {/* 日々の使い方 */}
      <section className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-bold text-ink dark:text-white">日々の使い方（開発の流れ）</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft dark:text-slate-300">
          <li>新しいゴールを設定（マイゴール）</li>
          <li>子ゴール・完了基準を自動生成</li>
          <li>「Claude Codeに聞く」でプロンプト作成（相談）</li>
          <li>実装するゴールを「作業中にする」に設定</li>
          <li>Claude Code / Cursor で実装</li>
          <li>
            一区切りで<strong>作業ログが自動で進捗管理AIへ</strong>送られ、
            進捗%・完了見込み・新しい子タスクが自動更新
            <span className="block text-xs text-ink-muted dark:text-slate-400">
              （Claude Code＝Stopフック / Cursor＝submit_worklog を自動呼び出し）
            </span>
          </li>
        </ol>
        <p className="text-xs text-ink-muted dark:text-slate-400">
          ※使うときはアプリを起動しておく（作業ログの送信先が localhost のため）。
          ゴールに「作業フォルダ(repoPath)」を設定しておくと照合が正確になります。
        </p>
      </section>

      {/* 更新 */}
      <section className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-bold text-ink dark:text-white">更新（プログラム修正後）</h2>
        <p className="text-sm text-ink-soft dark:text-slate-300">
          管理者が修正したら、各自が最新版へ更新できます。
        </p>
        <button
          onClick={applyUpdate}
          disabled={updating}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {updating ? "更新中…" : "最新に更新する"}
        </button>
        {updateMsg && <p className="text-sm text-ink-muted dark:text-slate-400">{updateMsg}</p>}
        <p className="text-xs text-ink-muted dark:text-slate-400">
          ※更新後はアプリを起動し直すと反映されます。うまくいかない場合はデスクトップの「進捗管理AIを更新
          {isWin ? "" : ".command"}」を実行してください。
        </p>
      </section>
    </div>
  );
}
