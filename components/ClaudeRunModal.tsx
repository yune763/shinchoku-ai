"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Run {
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt: string | null;
  repoPath: string;
  targetGoalId?: string;
  targetTitle?: string;
  output: string;
  result: string;
  error: string | null;
  exitCode: number | null;
}

const STATUS_LABEL: Record<Run["status"], string> = {
  running: "実行中…",
  done: "完了",
  error: "エラー",
};

const POLL_MS = 1500;

/**
 * 進捗管理AIのタスクから Claude Code(headless)を起動し、
 * 実行状況をライブ表示するモーダル。完了時はゴールのログに結果が残る。
 */
export function ClaudeRunModal({
  goalId,
  onClose,
  autoStart = true,
}: {
  goalId: string;
  onClose: () => void;
  autoStart?: boolean; // false: 起動せず既存の実行ログを見るだけ
}) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [epoch, setEpoch] = useState(0); // 再実行時にポーリングを再開するためのトリガ
  const [needRepo, setNeedRepo] = useState(false); // 作業フォルダ未設定の状態
  const [doneNotice, setDoneNotice] = useState<string | null>(null); // 完了済み→再実行の案内
  const [pickedPath, setPickedPath] = useState<string | null>(null); // 選択した作業フォルダ
  const [savingRepo, setSavingRepo] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);
  const startedOnce = useRef(false);
  const postFailed = useRef(false);
  const lastRerun = useRef(false); // フォルダ指定後、直前の実行モード(通常/再実行)で再試行する

  // 起動 → 状況ポーリング。
  // StrictMode(dev)で effect が2回走っても、POSTは1回・ポーリングは毎マウントで開始する。
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      let data: { run?: Run | null } | null = null;
      try {
        const res = await fetch(`/api/goals/${goalId}/run`);
        data = await res.json();
      } catch {
        // 一時的な失敗はリトライで回復させる。
      }
      if (!active) return;
      if (data?.run) setRun(data.run);
      if (data?.run?.status === "running") {
        timer = setTimeout(poll, POLL_MS);
      } else if (!data?.run && autoStart) {
        // 起動直後で未登録なら少し待って再取得。
        timer = setTimeout(poll, POLL_MS);
      } else if (data?.run) {
        router.refresh(); // 完了/エラー → ログを反映
      }
      // 閲覧モードで run が無い場合は、そのまま「履歴なし」を表示して停止。
    }

    async function begin() {
      // 起動リクエストは1回だけ（多重起動防止）。閲覧モードでは起動しない。
      if (!startedOnce.current) {
        startedOnce.current = true;
        if (autoStart)
        try {
          const res = await fetch(`/api/goals/${goalId}/run`, {
            method: "POST",
          });
          const data = await res.json();
          // 作業フォルダ未設定 → フォルダ指定BOXを出す。
          if (!res.ok && data.needRepo) {
            lastRerun.current = false;
            setStarting(false);
            setNeedRepo(true);
            return;
          }
          // 完了済み → 「再実行」を促す案内を出して停止する。
          if (!res.ok && data.canRerun) {
            setStarting(false);
            setDoneNotice(
              data.error ??
                "このゴールは完了済みです。もう一度走らせるには「再実行」を押してください。",
            );
            return;
          }
          // 409 で既存の実行がある場合のみポーリングへ。それ以外のエラー
          //（未設定など）はメッセージを出して停止する。
          if (!res.ok && !(res.status === 409 && data.run)) {
            postFailed.current = true;
            setStarting(false);
            setError(data.error ?? "起動に失敗しました");
            return;
          }
        } catch {
          postFailed.current = true;
          setStarting(false);
          setError("起動に失敗しました（サーバーに接続できません）");
          return;
        }
      }
      if (!active) return;
      if (postFailed.current) {
        setStarting(false);
        return;
      }
      setStarting(false);
      poll();
    }

    begin();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [goalId, router, autoStart, epoch]);

  // 完了/エラー後に「再実行」：完了状態を巻き戻して同じタスクをもう一度走らせる。
  async function handleRerun() {
    if (running || rerunning) return;
    setRerunning(true);
    setError(null);
    setDoneNotice(null);
    try {
      const res = await fetch(`/api/goals/${goalId}/run?rerun=1`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok && data.needRepo) {
        lastRerun.current = true;
        setRerunning(false);
        setNeedRepo(true);
        return;
      }
      if (!res.ok && res.status !== 409) {
        setError(data.error ?? "再実行に失敗しました");
        setRerunning(false);
        return;
      }
    } catch {
      setError("再実行に失敗しました（サーバーに接続できません）");
      setRerunning(false);
      return;
    }
    // 再実行は起動した。ログはユーザーが任意のタイミングで「実行ログを見る」で開くため、
    // ここではモーダルを閉じる（ポーリングはしない）。
    setRerunning(false);
    router.refresh();
    onClose();
  }

  // Windows ネイティブの「フォルダーの参照」ダイアログ（エクスプローラー）を開いて選ぶ。
  async function pickFolderNative() {
    setSavingRepo(true);
    setError(null);
    try {
      const res = await fetch("/api/fs/pick", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "フォルダ選択に失敗しました");
        setSavingRepo(false);
        return;
      }
      if (d.canceled || !d.path) {
        // キャンセル時は何もしない（案内のまま）。
        setSavingRepo(false);
        return;
      }
      // パスを表示するだけ。保存＆実行は「実装開始する」ボタンで行う。
      setPickedPath(d.path);
      setSavingRepo(false);
    } catch {
      setError("フォルダ選択に失敗しました（サーバーに接続できません）");
      setSavingRepo(false);
    }
  }

  // フォルダ指定BOXで作業フォルダを選んだら、ゴールに保存してから実行を再試行する。
  async function handleFolderSelect(path: string) {
    setSavingRepo(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: path }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "作業フォルダの保存に失敗しました");
        setSavingRepo(false);
        setNeedRepo(false);
        return;
      }
    } catch {
      setError("作業フォルダの保存に失敗しました（サーバーに接続できません）");
      setSavingRepo(false);
      setNeedRepo(false);
      return;
    }
    setSavingRepo(false);
    setNeedRepo(false);
    router.refresh();
    // 直前の実行モードで再試行する。
    if (lastRerun.current) {
      void handleRerun();
    } else {
      startedOnce.current = false;
      postFailed.current = false;
      setError(null);
      setStarting(true);
      setEpoch((e) => e + 1); // 通常実行を再試行（begin が再POSTする）
    }
  }

  // 出力が伸びたら自動で最下部へ。
  useEffect(() => {
    if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [run?.output]);

  const running = run?.status === "running";

  return (
    <>
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col rounded-card bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="min-w-0">
            <h2 className="font-semibold dark:text-white">
              {autoStart ? "Claude Code で実装" : "実行ログ"}
            </h2>
            <p className="text-xs text-ink-muted dark:text-slate-400 break-all">
              {run?.targetGoalId && run.targetGoalId !== goalId && run.targetTitle
                ? `対象（子ゴール）: ${run.targetTitle} ／ 作業フォルダ: ${run.repoPath}`
                : run?.repoPath
                  ? `作業フォルダ: ${run.repoPath}`
                  : pickedPath
                    ? `作業フォルダ: ${pickedPath}`
                    : "このゴールの指示文でheadless実行します。"}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {run && (
              <span
                className={[
                  "text-xs font-medium rounded-full px-2.5 py-1",
                  run.status === "running"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                    : run.status === "done"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
                ].join(" ")}
              >
                {running && (
                  <span className="inline-block w-2 h-2 mr-1.5 rounded-full bg-current animate-pulse" />
                )}
                {STATUS_LABEL[run.status]}
              </span>
            )}
            <button
              onClick={onClose}
              className="text-ink-muted hover:text-ink text-xl leading-none"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {needRepo ? (
            <div className="text-sm space-y-2">
              <p className="font-medium dark:text-white">作業フォルダを指定してください</p>
              <p className="text-ink-muted dark:text-slate-400">
                このゴールには Claude Code を動かす作業フォルダ（repoPath）が設定されていません。
                下のボタンでフォルダを指定すると、保存してそのまま実装を開始します。
              </p>
              <button
                onClick={pickFolderNative}
                disabled={savingRepo}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingRepo && !pickedPath ? "選択中…" : "エクスプローラーで選ぶ"}
              </button>
              {pickedPath && (
                <>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2">
                    <span className="text-ink-muted dark:text-slate-400">選択したフォルダ: </span>
                    <span className="font-mono break-all dark:text-slate-200">
                      {pickedPath}
                    </span>
                  </div>
                  <button
                    onClick={() => handleFolderSelect(pickedPath)}
                    disabled={savingRepo}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {savingRepo ? "開始中…" : "このフォルダで実装開始する"}
                  </button>
                </>
              )}
              <p className="text-[11px] text-ink-muted dark:text-slate-500">
                ※「エクスプローラーで選ぶ」は、このPCのデスクトップに Windows のフォルダー選択ダイアログを表示します。
              </p>
            </div>
          ) : doneNotice ? (
            <div className="text-sm space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-green-600 text-lg leading-none">✓</span>
                <p className="font-medium dark:text-white">{doneNotice}</p>
              </div>
              <p className="text-ink-muted dark:text-slate-400">
                下の「再実行」を押すと、完了状態を巻き戻して同じ内容をもう一度最初から実装します
                （親ゴールの場合は配下の子ゴールも順に実装し直します）。
              </p>
              <button
                onClick={handleRerun}
                disabled={rerunning}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {rerunning ? "再実行を起動中…" : "再実行する"}
              </button>
            </div>
          ) : error ? (
            <div className="text-sm text-red-600 space-y-2">
              <p>{error}</p>
              <p className="text-ink-muted dark:text-slate-400">
                ゴールの「文脈を編集」で作業フォルダ（repoPath）を設定し、実行マシンに
                Claude Code CLI（<code>claude</code>）が入っているか確認してください。
              </p>
            </div>
          ) : starting && !run ? (
            <p className="text-sm text-ink-muted">
              {autoStart ? "起動中…" : "読み込み中…"}
            </p>
          ) : !run ? (
            <p className="text-sm text-ink-muted dark:text-slate-400">
              このタスクの実行ログはまだありません。「Claude Codeで実装」を実行すると、ここに内容が表示されます。
            </p>
          ) : (
            <pre
              ref={preRef}
              className="text-xs whitespace-pre-wrap font-mono bg-slate-50 dark:bg-slate-950 rounded-lg p-4 dark:text-slate-200 border border-slate-200 dark:border-slate-800 min-h-[8rem] max-h-[55vh] overflow-auto"
            >
              {run?.output || "（出力待ち…）"}
            </pre>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800">
          <span className="text-xs text-ink-muted dark:text-slate-500">
            {running
              ? "実行が終わると結果はこのゴールのログに記録されます。"
              : run
                ? "結果はログに記録されました。"
                : ""}
          </span>
          <div className="flex items-center gap-2">
            {!running && !starting && !needRepo && (run || error) && (
              <button
                onClick={handleRerun}
                disabled={rerunning}
                className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
              >
                {rerunning ? "再実行を起動中…" : "再実行"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
            >
              {running ? "バックグラウンドで続行（閉じる）" : "閉じる"}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
