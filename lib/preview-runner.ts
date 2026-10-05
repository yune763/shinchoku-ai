import { spawn, ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { getGoal } from "./store";

// 実装物（Webアプリ）を repoPath で起動し、ブラウザで開けるようにする。
// 起動状態はメモリで管理し、フロントはポーリングして「準備完了→開く」を出す。

export const PREVIEW_STATUS = {
  starting: "starting",
  ready: "ready",
  stopped: "stopped",
  error: "error",
} as const;
export type PreviewStatus =
  (typeof PREVIEW_STATUS)[keyof typeof PREVIEW_STATUS];

export interface PreviewState {
  goalId: string;
  status: PreviewStatus;
  url: string;
  command: string;
  repoPath: string;
  output: string;
  error: string | null;
  startedAt: string;
}

interface PreviewEntry extends PreviewState {
  child: ChildProcess | null;
}

const g = globalThis as unknown as { __previews?: Map<string, PreviewEntry> };
const previews: Map<string, PreviewEntry> = g.__previews ?? new Map();
g.__previews = previews;

const READY_TIMEOUT_MS = 60_000;
const MAX_OUTPUT = 40_000;

function pub(e: PreviewEntry): PreviewState {
  const { child: _c, ...rest } = e;
  void _c;
  return rest;
}

export function getPreview(goalId: string): PreviewState | null {
  const e = previews.get(goalId);
  return e ? pub(e) : null;
}

export async function startPreview(goalId: string): Promise<PreviewState> {
  const existing = previews.get(goalId);
  if (
    existing &&
    (existing.status === PREVIEW_STATUS.starting ||
      existing.status === PREVIEW_STATUS.ready)
  ) {
    return pub(existing);
  }

  const goal = await getGoal(goalId);
  if (!goal) throw new Error("ゴールが見つかりません");
  const repoPath = (goal.repoPath || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!repoPath || !existsSync(repoPath)) {
    throw new Error("作業フォルダ(repoPath)が未設定か存在しません");
  }
  const url = (goal.previewUrl || "").trim();
  if (!url) {
    throw new Error("プレビューURL（例 http://localhost:5173）を設定してください");
  }
  const command = (goal.previewCommand || "").trim() || "npm run dev";

  const entry: PreviewEntry = {
    goalId,
    status: PREVIEW_STATUS.starting,
    url,
    command,
    repoPath,
    output: "",
    error: null,
    startedAt: new Date().toISOString(),
    child: null,
  };
  previews.set(goalId, entry);

  const child = spawn(command, {
    cwd: repoPath,
    shell: true,
    windowsHide: true,
    env: process.env,
  });
  entry.child = child;

  const onData = (c: Buffer) => {
    entry.output += c.toString();
    if (entry.output.length > MAX_OUTPUT) {
      entry.output = "…(省略)…\n" + entry.output.slice(-MAX_OUTPUT);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", (err) => {
    entry.status = PREVIEW_STATUS.error;
    entry.error = err.message;
  });
  child.on("close", () => {
    entry.child = null;
    if (entry.status !== PREVIEW_STATUS.error) {
      entry.status = PREVIEW_STATUS.stopped;
    }
  });

  // URL が応答したら ready にする。
  void waitReady(entry);
  return pub(entry);
}

async function waitReady(entry: PreviewEntry): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (entry.status === PREVIEW_STATUS.stopped || entry.status === PREVIEW_STATUS.error) {
      return;
    }
    try {
      // どんな応答でも「立ち上がった」とみなす。
      await fetch(entry.url, { signal: AbortSignal.timeout(2500) });
      entry.status = PREVIEW_STATUS.ready;
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (entry.status === PREVIEW_STATUS.starting) {
    entry.status = PREVIEW_STATUS.error;
    entry.error = "起動を確認できませんでした（コマンド・URL・ポートを確認してください）";
  }
}

export function stopPreview(goalId: string): boolean {
  const entry = previews.get(goalId);
  if (!entry || !entry.child) {
    if (entry) entry.status = PREVIEW_STATUS.stopped;
    return false;
  }
  const pid = entry.child.pid;
  try {
    if (process.platform === "win32" && pid) {
      // シェル経由の子プロセスツリーごと終了させる。
      spawn("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } else {
      entry.child.kill();
    }
  } catch {
    // 失敗しても状態は停止扱いにする。
  }
  entry.status = PREVIEW_STATUS.stopped;
  entry.child = null;
  return true;
}
