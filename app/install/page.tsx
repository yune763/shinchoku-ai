"use client";

import { useState } from "react";

// 1行インストールコマンドと setup.ps1 の場所（GitHub raw）。
const INSTALL_CMD =
  "irm https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1 | iex";
const SETUP_URL =
  "https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.ps1";
// macOS 用（ターミナルに貼って実行）
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
      /* クリップボード不可環境では手動コピー */
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

export default function InstallPage() {
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  async function applyUpdate() {
    if (updating) return;
    setUpdating(true);
    setUpdateMsg("更新を確認しています…");
    try {
      const res = await fetch("/api/app/update", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpdateMsg(d.error ?? "更新に失敗しました");
      } else if (d.alreadyLatest) {
        setUpdateMsg("すでに最新です。");
      } else if (d.needInstall && d.installError) {
        setUpdateMsg(
          "コードは更新しましたが、依存の再インストールに失敗しました。デスクトップの『進捗管理AIを更新』を実行してください。",
        );
      } else if (d.needInstall) {
        setUpdateMsg(
          "最新に更新しました（依存も再インストール済み）。アプリを起動し直すと反映されます。",
        );
      } else {
        setUpdateMsg("最新に更新しました。起動し直すと反映されます。");
      }
    } catch {
      setUpdateMsg("通信に失敗しました（この機能はローカル起動版でのみ使えます）");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <header>
        <h1 className="text-2xl font-bold text-ink dark:text-white">アプリ導入</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-slate-400">
          各自のPCで進捗管理AIを動かすためのインストール／更新を行います。
          データは共有DBに集約されるので、ローカルで動かしても全員で同じ情報を共有できます。
        </p>
      </header>

      {/* インストール */}
      <section className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-bold text-ink dark:text-white">
          1. インストール
        </h2>
        <div className="text-xs font-semibold text-ink-muted dark:text-slate-400">
          Windows の方
        </div>

        {/* かんたん：インストーラをダウンロードしてダブルクリック */}
        <div className="rounded-lg border border-brand/30 bg-brand/5 dark:bg-brand/10 p-4 space-y-2">
          <div className="text-sm font-semibold text-ink dark:text-slate-100">
            かんたん導入（おすすめ）
          </div>
          <a
            href="/shinchoku-install.cmd"
            download="進捗管理AI-インストール.cmd"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            ⬇ インストーラをダウンロード
          </a>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft dark:text-slate-300">
            <li>上のボタンでインストーラを保存</li>
            <li>
              ダウンロードした{" "}
              <code className="text-xs">進捗管理AI-インストール.cmd</code>{" "}
              を<strong>ダブルクリック</strong>（必要ソフトと本体を自動で用意）
            </li>
            <li>
              「WindowsによってPCが保護されました」と出たら「詳細情報」→「実行」を選択
            </li>
            <li>
              途中で <code className="text-xs">FIREBASE_SERVICE_ACCOUNT</code>{" "}
              を聞かれたら管理者から受け取った値を貼り付け
            </li>
            <li>完了後、デスクトップの「進捗管理AIを起動」をダブルクリック</li>
          </ol>
        </div>

        {/* 上級者向け：1行コマンド */}
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-muted dark:text-slate-400">
            うまくいかない場合：PowerShellに1行貼って実行する方法
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-ink-soft dark:text-slate-300">
              スタートメニューで「PowerShell」を開き、次の1行を貼り付けて Enter:
            </p>
            <CopyBox text={INSTALL_CMD} />
            <p className="text-xs text-ink-muted dark:text-slate-400">
              スクリプトの中身：{" "}
              <a
                href={SETUP_URL}
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                setup.ps1 を開く
              </a>
            </p>
          </div>
        </details>

        {/* macOS */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-2">
          <div className="text-xs font-semibold text-ink-muted dark:text-slate-400">
            Mac の方
          </div>

          {/* かんたん＆確実：ターミナルに1行貼る */}
          <div className="rounded-lg border border-brand/30 bg-brand/5 dark:bg-brand/10 p-4 space-y-2">
            <div className="text-sm font-semibold text-ink dark:text-slate-100">
              かんたん導入（おすすめ・確実）
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-soft dark:text-slate-300">
              <li>
                「ターミナル」を開く（Spotlight で「terminal」と検索 →
                ターミナル.app）
              </li>
              <li>
                次の1行をコピーして貼り付け、Enter（Homebrew・Node.js・Git・Claude
                CLI・本体を自動で用意）:
                <div className="mt-2">
                  <CopyBox text={MAC_INSTALL_CMD} />
                </div>
              </li>
              <li>
                途中で <code className="text-xs">FIREBASE_SERVICE_ACCOUNT</code>{" "}
                を聞かれたら貼り付け（Homebrew導入時にMacのパスワード入力を求められることがあります）
              </li>
              <li>
                完了後、デスクトップの「進捗管理AIを起動.command」をダブルクリック（初回は右クリック →「開く」）
              </li>
            </ol>
          </div>

          {/* 補助：インストーラファイル */}
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted dark:text-slate-400">
              ファイルから入れたい方（インストーラをダウンロード）
            </summary>
            <div className="mt-2 space-y-2">
              <a
                href="/shinchoku-install.command"
                download="進捗管理AI-インストール.command"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
              >
                ⬇ インストーラをダウンロード
              </a>
              <p className="text-xs text-ink-muted dark:text-slate-400">
                ※ダウンロードした <code className="text-[11px]">.command</code>{" "}
                は、Macの仕様で<strong>ダブルクリックだと「開いていません／開けません」</strong>と出ることがあります。
                その場合は次の方法で実行してください：
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-soft dark:text-slate-300">
                <li>ターミナルを開く</li>
                <li>
                  <code className="text-[11px]">bash</code>{" "}
                  と入力して<strong>半角スペース</strong>を1つ入れる
                </li>
                <li>
                  ダウンロードした{" "}
                  <code className="text-[11px]">進捗管理AI-インストール.command</code>{" "}
                  を<strong>ターミナルにドラッグ＆ドロップ</strong>して Enter
                </li>
              </ol>
              <p className="text-xs text-ink-muted dark:text-slate-400">
                スクリプトの中身：{" "}
                <a
                  href={SETUP_SH_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                >
                  setup.sh を開く
                </a>
              </p>
            </div>
          </details>
        </div>
      </section>

      {/* 共有キーの注意 */}
      <section className="rounded-card border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-5 space-y-2">
        <h2 className="text-sm font-bold text-amber-800 dark:text-amber-300">
          共有DBキー（FIREBASE_SERVICE_ACCOUNT）について
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300">
          <li>
            全メンバーが<strong>同じ値</strong>を設定すると、ゴール・メンバー・ツール管理などが共有されます。
          </li>
          <li>
            設定値は各PCの <code className="text-xs">.env</code>{" "}
            に保存され、<strong>更新しても消えません</strong>（再入力は不要）。
          </li>
          <li>機密情報です。パスワードマネージャ等で安全に配布してください。</li>
        </ul>
      </section>

      {/* 更新 */}
      <section className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <h2 className="text-sm font-bold text-ink dark:text-white">
          2. 更新（プログラム修正後）
        </h2>
        <p className="text-sm text-ink-soft dark:text-slate-300">
          管理者がプログラムを修正したら、各自が最新版へ更新できます。
        </p>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink-muted dark:text-slate-400">
            方法A：このアプリから更新（ローカル起動版のみ）
          </div>
          <button
            onClick={applyUpdate}
            disabled={updating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {updating ? "更新中…" : "最新に更新する"}
          </button>
          {updateMsg && (
            <p className="text-sm text-ink-muted dark:text-slate-400">{updateMsg}</p>
          )}
          <p className="text-xs text-ink-muted dark:text-slate-400">
            ※更新後はアプリを起動し直すと反映されます。依存パッケージの変更があった場合は下記Bを実行してください。
          </p>
        </div>

        <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
          <div className="text-xs font-semibold text-ink-muted dark:text-slate-400">
            方法B：デスクトップから更新（確実）
          </div>
          <p className="text-sm text-ink-soft dark:text-slate-300">
            デスクトップの「進捗管理AIを更新」をダブルクリック（最新取得＋依存の再インストールまで行います）。
            ショートカットが無い場合は、再度インストールの1行を実行すれば更新されます。
          </p>
        </div>
      </section>
    </div>
  );
}
