import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import {
  getGoal,
  listGoals,
  addLog,
  updateGoal,
  updateStep,
  childrenOf,
  ancestorsOf,
  syncAncestorStatus,
} from "./store";
import { setActiveGoal, setPendingRun, getSettings } from "./settings";
import { buildImplementPrompt } from "./prompt";
import { ensureBreakdown } from "./breakdown";
import { GOAL_STATUS, LOG_KIND, Goal, STEP_ACTOR } from "./types";

// Claude Code(headless)を進捗管理AIから起動し、実行状況をメモリで管理する。
// フロントは GET でこの状態をポーリングしてライブ表示、完了時に ai_result ログを残す。

// 作業フォルダ(repoPath)が未設定／不在のときに投げる。UI側でフォルダ指定BOXを出す合図。
export class RepoPathMissingError extends Error {
  constructor(public readonly targetTitle: string) {
    super("作業フォルダ(repoPath)が未設定です");
    this.name = "RepoPathMissingError";
  }
}

export const RUN_STATUS = {
  running: "running",
  done: "done",
  error: "error",
} as const;
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

export interface RunState {
  goalId: string; // 押されたゴール（ポーリングのキー）
  targetGoalId: string; // 実際に実装する対象（親なら未完了の子へ委譲）
  targetTitle: string; // 対象ゴールのタイトル（表示用）
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  repoPath: string;
  // ライブ表示用の出力バッファ（アシスタントのテキストと節目イベント）。
  output: string;
  result: string; // Claudeの最終結果テキスト
  error: string | null;
  exitCode: number | null;
  // 実行中のライブ進捗推定(0–100)。ツール使用・応答の活動量から漸近的に増やす。
  // 完了時に100。確定値ではなく「動いていること」を見せるための推定。
  liveProgress: number;
}

interface RunEntry extends RunState {
  child: ChildProcessWithoutNullStreams | null;
  prompt: string; // 再開（リトライ）時に再投入する指示文
  attempts: number; // 予期せぬ停止からの再試行回数
  // 親ゴールから押された連続実装か。true のとき、対象の子が完了するたび
  // 「押された親(goalId)配下の次の未完了の子」へ自動で進み、親の理想形まで実装しきる。
  sequence: boolean;
  // 現在の対象の実装を開始した時刻(ms)。経過時間ベースのライブ進捗に使う。
  targetStartedMs: number;
  // 最後に出力/イベントがあった時刻(ms)。応答が途絶えたゾンビ実行の検出に使う。
  lastActivityMs: number;
}

// 予期せぬ停止（クラッシュ・非0終了）からの自動再開の上限。
const MAX_ATTEMPTS = 5;
const RETRY_DELAY_MS = 4000;

// これだけ出力が途絶えたら「応答なし（ゾンビ）」とみなして回収する。
// PCスリープ等でプロセスが死んでも close イベントが来ないケースへの対処。
const STALE_RUN_MS = 300_000; // 5分

// HMR(dev)でモジュールが再読込されても実行中プロセスを失わないよう global に保持。
const g = globalThis as unknown as { __claudeRuns?: Map<string, RunEntry> };
const runs: Map<string, RunEntry> = g.__claudeRuns ?? new Map();
g.__claudeRuns = runs;

// stream-json のイベント上限（暴走時のバッファ肥大を防ぐ）。
const MAX_OUTPUT_CHARS = 200_000;

// ライブ進捗の上限（完了するまでは100未満に留める）と、起動直後の初期値。
const LIVE_PROGRESS_CEILING = 90;
const LIVE_PROGRESS_START = 5;

// 活動イベントごとに、上限へ漸近する形で進捗を少し進める。
function bumpProgress(entry: RunEntry, weight: number): void {
  const room = LIVE_PROGRESS_CEILING - entry.liveProgress;
  if (room <= 0) return;
  entry.liveProgress = Math.min(
    LIVE_PROGRESS_CEILING,
    Math.round(entry.liveProgress + room * weight),
  );
}

// 読み取り時のライブ進捗：実際の活動（ツール使用・応答）で積み上げた値のみを返す。
// 時間だけでは増やさない（止まっているのに数値が上がって「動いているように見える」誤解を防ぐ）。
// さらに、一定時間 無活動なら増加を止めている＝フリーズ表示になる（entry.liveProgress が更新されないため）。
function liveProgressNow(entry: RunEntry): number {
  return Math.min(
    LIVE_PROGRESS_CEILING,
    Math.max(entry.liveProgress, LIVE_PROGRESS_START),
  );
}

function publicState(e: RunEntry): RunState {
  const { child: _child, ...rest } = e;
  void _child;
  return rest;
}

export function getRun(goalId: string): RunState | null {
  const e = runs.get(goalId);
  return e ? publicState(e) : null;
}

export function isRunning(goalId: string): boolean {
  return runs.get(goalId)?.status === RUN_STATUS.running;
}

// 応答が途絶えた「ゾンビ実行」を回収する。
// プロセスが死んでも close イベントが来ないと status=running のまま残り、
// 自動再開(anyRunning)をブロックし、対象の再実行(targetIsRunning)も妨げる。
// 実装中マーカー(pendingRun)は残すので、この後 resumePendingRun が続きから再開できる。
export function reapStaleRuns(): number {
  const now = Date.now();
  let reaped = 0;
  for (const [key, e] of runs) {
    // 旧実行は lastActivityMs が無いので startedAt で代替する。
    const last = e.lastActivityMs || Date.parse(e.startedAt) || 0;
    if (e.status === RUN_STATUS.running && (!last || now - last > STALE_RUN_MS)) {
      try {
        e.child?.kill();
      } catch {
        // 既に死んでいれば無視。
      }
      e.child = null;
      runs.delete(key);
      reaped += 1;
    }
  }
  return reaped;
}

// いずれかの実行が進行中か（ゴールツリーの自動更新トリガに使う）。
export function anyRunning(): boolean {
  for (const e of runs.values()) {
    if (e.status === RUN_STATUS.running) return true;
  }
  return false;
}

// 対象ゴール（委譲先の子）が既に実行中か。二重起動の防止に使う。
function targetIsRunning(targetId: string): boolean {
  for (const e of runs.values()) {
    if (e.status === RUN_STATUS.running && e.targetGoalId === targetId) {
      return true;
    }
  }
  return false;
}

// 実行中の対象ゴール（id＋タイトル）。ツリーの「実行中」表示に使う。
export function runningTargets(): { goalId: string; title: string }[] {
  const seen = new Set<string>();
  const out: { goalId: string; title: string }[] = [];
  for (const e of runs.values()) {
    if (e.status === RUN_STATUS.running && !seen.has(e.targetGoalId)) {
      seen.add(e.targetGoalId);
      out.push({ goalId: e.targetGoalId, title: e.targetTitle });
    }
  }
  return out;
}

// 実行中の対象ゴール(id)→ライブ進捗(0–100) のマップ。サーバー描画で葉の進捗に上書きする。
export function runningProgress(): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of runs.values()) {
    if (e.status === RUN_STATUS.running) {
      out.set(e.targetGoalId, liveProgressNow(e));
    }
  }
  return out;
}

// ゴール配列に、実行中の対象ゴールのライブ進捗を重ねた新しい配列を返す（永続化しない）。
// 葉の progress をライブ値に引き上げると、computeProgress で親にも自然に波及する。
export function overlayLiveProgress(goals: Goal[]): Goal[] {
  const live = runningProgress();
  if (live.size === 0) return goals;
  return goals.map((g) => {
    const lp = live.get(g.id);
    if (lp === undefined) return g;
    // 実行中はステータスを進行中として見せ、進捗は現値とライブ値の大きい方。
    return {
      ...g,
      status: g.status === GOAL_STATUS.done ? g.status : GOAL_STATUS.inProgress,
      progress: Math.max(g.progress ?? 0, lp),
    };
  });
}

function append(entry: RunEntry, text: string): void {
  entry.lastActivityMs = Date.now(); // 活動あり＝生存シグナル
  entry.output += text;
  if (entry.output.length > MAX_OUTPUT_CHARS) {
    entry.output = "…(省略)…\n" + entry.output.slice(-MAX_OUTPUT_CHARS);
  }
}

// stream-json の1行を解釈して、人が読める形でバッファへ足す。
function handleEvent(entry: RunEntry, line: string): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  let ev: Record<string, unknown>;
  try {
    ev = JSON.parse(trimmed);
  } catch {
    append(entry, trimmed + "\n");
    return;
  }
  const type = ev.type as string | undefined;
  if (type === "assistant" || type === "user") {
    const msg = ev.message as { content?: unknown } | undefined;
    const content = msg?.content;
    if (Array.isArray(content)) {
      for (const block of content as Array<Record<string, unknown>>) {
        if (block.type === "text" && typeof block.text === "string") {
          append(entry, block.text + "\n");
          bumpProgress(entry, 0.04); // 応答テキストは小さめに進める
        } else if (block.type === "tool_use") {
          append(entry, `\n[ツール: ${String(block.name)}]\n`);
          bumpProgress(entry, 0.08); // 実作業(ツール使用)は大きめに進める
        }
      }
    }
  } else if (type === "result") {
    const r = ev.result;
    if (typeof r === "string") entry.result = r;
  }
}

/**
 * ゴールの指示文で Claude Code(headless)を起動する。
 * 既に実行中なら null を返す（多重起動を防ぐ）。
 */
export async function startRun(
  goalId: string,
  opts?: { rerun?: boolean },
): Promise<RunState | null> {
  // まず応答の途絶えたゾンビ実行を回収してから判定する（再実行・再開を妨げないため）。
  reapStaleRuns();
  if (isRunning(goalId)) return null;

  const pressed = await getGoal(goalId);
  if (!pressed) return null;
  let all0 = await listGoals();

  // 完了済みゴールは通常実装では走らせない（子・親どちらも）。
  // 代わりに null を返し、UIに「再実行」を促すアナウンスを出させる。
  // ※ 完了済みの子を黙って再実装してしまい案内が出ない問題への対処。
  if (!opts?.rerun && pressed.status === GOAL_STATUS.done) {
    return null;
  }

  // 再実行：完了状態を巻き戻して、同じタスクをもう一度最初から走らせる。
  if (opts?.rerun) {
    await resetForRerun(goalId, all0);
    all0 = await listGoals();
    await addLog(goalId, {
      kind: LOG_KIND.aiResult,
      author: "Claude Code",
      body: "再実装を開始しました（完了状態を巻き戻して最初から実行します）。",
    }).catch(() => null);
  }

  // 親ゴールは単独で実装しない：子ゴールを順に実装して親の理想形を作る。
  // 子がまだ無いルートゴールは、まず子タスクへ自動分解してから順次実装する。
  let kids = childrenOf(goalId, all0);
  if (kids.length === 0 && pressed.parentId === null) {
    await ensureBreakdown(pressed).catch(() => null);
    all0 = await listGoals();
    kids = childrenOf(goalId, all0);
  }

  // 子があるゴールは「連続実装モード」：未完了の末端の子から順に、最後まで実装しきる。
  const sequence = kids.length > 0;
  if (sequence) {
    const firstLeaf = firstIncompleteLeaf(goalId, all0);
    if (!firstLeaf) {
      // 子がすべて完了済み → 親を完了にして終了（やることがない）。
      await updateGoal(goalId, { status: GOAL_STATUS.done }).catch(() => null);
      await syncAncestorStatus(goalId);
      return null;
    }
  }
  const target = sequence
    ? (firstIncompleteLeaf(goalId, all0) as Goal)
    : pressed;
  const targetId = target.id;
  const redirected = targetId !== goalId;

  // 別ゴール経由でも、同じ対象を二重に実装しないようにする。
  if (targetIsRunning(targetId)) return null;

  // repoPath は 対象→祖先 の順で解決（子はrepoPathが空のことが多い）。
  const repoPath = (resolveRepoPath(target, all0) || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!repoPath || !existsSync(repoPath)) {
    // UI側でフォルダ指定BOXを出し、指定後に再実行できるようにする。
    throw new RepoPathMissingError(target.title);
  }

  // 実装開始 → 対象ゴールを「進行中」にし、作業中（現在地）に設定する。
  await updateGoal(targetId, { status: GOAL_STATUS.inProgress });
  // 子が進行中なら親（祖先）も進行中に伝播させる。
  await syncAncestorStatus(targetId);
  await setActiveGoal(targetId);
  if (redirected) {
    await addLog(goalId, {
      kind: LOG_KIND.aiResult,
      author: "Claude Code",
      body: `未完了の子ゴール「${target.title}」から実装を開始します。`,
    }).catch(() => null);
  }

  // 子ゴール自体が「親に向かうタスク単位」。ロードマップの自動生成はしない
  // （汎用ステップの重複や『人』ステップでの停止を避けるため）。

  const all = await listGoals();
  const goalForPrompt = (await getGoal(targetId)) ?? target;
  const prompt = buildImplementPrompt(goalForPrompt, all);

  const entry: RunEntry = {
    goalId,
    targetGoalId: targetId,
    targetTitle: target.title,
    status: RUN_STATUS.running,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    repoPath,
    output: "",
    result: "",
    error: null,
    exitCode: null,
    liveProgress: LIVE_PROGRESS_START,
    child: null,
    prompt,
    attempts: 0,
    sequence,
    targetStartedMs: 0,
    lastActivityMs: Date.now(),
  };
  runs.set(goalId, entry);

  // クラッシュ後に続きから再開できるよう「実装中」を永続化する。
  // 押されたゴール(goalId)を保存することで、親ゴールなら再開時に連続実装を続けられる。
  await setPendingRun(goalId);

  launch(entry);
  return publicState(entry);
}

// claude(headless)を1回起動し、イベント配線する。予期せぬ停止時は続きから再試行する。
function launch(entry: RunEntry): void {
  entry.attempts += 1;
  // 新しい対象の初回起動時に、経過時間ベース進捗の起点を打つ（リトライでは維持）。
  if (entry.attempts === 1) entry.targetStartedMs = Date.now();
  entry.lastActivityMs = Date.now(); // 起動＝活動あり
  entry.status = RUN_STATUS.running;
  entry.exitCode = null;

  // headless実行。stream-json は --verbose 必須。権限確認はスキップ（個人開発向け）。
  const bin = process.env.CLAUDE_BIN || "claude";
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  // 実装の品質を上げるため、既定で強いモデルを使う（CLAUDE_MODEL で変更・空で既定）。
  const model = process.env.CLAUDE_MODEL ?? "opus";
  if (model) args.push("--model", model);

  // Windowsでは claude が .cmd のことがあるため shell 経由で解決させる。
  const child = spawn(bin, args, {
    cwd: entry.repoPath,
    shell: true,
    windowsHide: true,
    env: process.env,
  }) as ChildProcessWithoutNullStreams;
  entry.child = child;

  // 指示文は標準入力から渡す（引数長・エスケープの問題を避ける）。
  child.stdin.write(entry.prompt);
  child.stdin.end();

  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      handleEvent(entry, line);
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    append(entry, chunk);
  });

  const onFail = (reason: string) => {
    entry.child = null;
    // 予期せぬ停止：上限まで「続きから」再開する（成功=完了ではないので pending は維持）。
    if (entry.attempts < MAX_ATTEMPTS) {
      append(
        entry,
        `\n[予期せぬ停止(${reason})。${RETRY_DELAY_MS / 1000}秒後に続きから再開します… ${entry.attempts}/${MAX_ATTEMPTS}]\n`,
      );
      setTimeout(() => {
        if (runs.get(entry.goalId) === entry) launch(entry);
      }, RETRY_DELAY_MS);
    } else {
      entry.status = RUN_STATUS.error;
      entry.error = `${reason}（再試行上限${MAX_ATTEMPTS}回に到達）`;
      entry.finishedAt = new Date().toISOString();
      void finalize(entry);
    }
  };

  child.on("error", (err) => {
    onFail(err.message);
  });

  child.on("close", (code) => {
    if (buf.trim()) handleEvent(entry, buf);
    entry.exitCode = code;
    if (code === 0) {
      entry.status = RUN_STATUS.done;
      entry.liveProgress = 100;
      entry.finishedAt = new Date().toISOString();
      void finalize(entry);
    } else {
      onFail(`終了コード ${code}`);
    }
  });
}

// クラッシュ等で中断した実装を、アプリ再訪時に続きから再開する。
export async function resumePendingRun(): Promise<void> {
  if (anyRunning()) return;
  const { pendingRunGoalId } = await getSettings();
  if (!pendingRunGoalId) return;
  const goal = await getGoal(pendingRunGoalId);
  if (!goal || goal.status === GOAL_STATUS.done) {
    await setPendingRun(null);
    return;
  }
  try {
    await startRun(pendingRunGoalId);
  } catch {
    // 再開できない場合は次の機会に委ねる（マーカーは維持）。
  }
}

// 実行終了時の後処理。ログ記録＋（成功時）AI作業ぶんの完了反映を行う。
async function finalize(entry: RunEntry): Promise<void> {
  entry.child = null;
  const ok = entry.status === RUN_STATUS.done;
  const summary = entry.result || entry.output.slice(-4000) || "(出力なし)";
  const head = ok
    ? "【Claude Code 実行結果】"
    : `【Claude Code 実行エラー】${entry.error ?? ""}`;
  const target = entry.targetGoalId;
  await addLog(target, {
    kind: LOG_KIND.aiResult,
    author: "Claude Code",
    body: `${head}\n\n${summary}`,
  }).catch(() => null);

  if (!ok) {
    // 再試行上限に達した失敗：進行中のまま人が確認。ここで pending を解除し、
    // 自動再開の無限ループを防ぐ（サーバークラッシュ時は finalize 自体が走らず
    // pending が残るため、アプリ再訪時に自動再開される）。
    await setPendingRun(null).catch(() => {});
    return;
  }

  try {
    const goal = await getGoal(target);
    if (!goal) return;

    // AIステップのみ完了にする（人の作業は自動で完了扱いにしない）。
    for (const s of goal.steps) {
      if (!s.done && s.actor === STEP_ACTOR.ai) {
        await updateStep(target, s.id, { done: true });
      }
    }

    const after = await getGoal(target);
    const remaining = after ? after.steps.filter((s) => !s.done) : [];
    const humanRemaining = remaining.filter((s) => s.actor === STEP_ACTOR.human);

    let targetDone = false;
    if (!after || after.steps.length === 0 || remaining.length === 0) {
      // すべて完了 → ゴール完了。
      await updateGoal(target, { status: GOAL_STATUS.done });
      targetDone = true;
    } else if (humanRemaining.length > 0) {
      // 人の作業が残っている → ここで止める（連続実装も中断して人待ち）。
      await addLog(target, {
        kind: LOG_KIND.aiResult,
        author: "Claude Code",
        body: `AIの作業は完了しました。次は人の作業が必要です: ${humanRemaining
          .map((s) => s.title)
          .join(" / ")}`,
      }).catch(() => null);
      await setPendingRun(null);
      await clearActiveIfMatches(target);
      await syncAncestorStatus(target);
      return;
    }
    // 上記以外（AIステップが残る想定薄いケース）は pending 維持で続きから。

    // 子の完了/進行を親（祖先）へ伝播。
    await syncAncestorStatus(target);

    // 連続実装モード：対象の子が完了したら、押された親配下の次の未完了の子へ自動で進む。
    if (targetDone && entry.sequence) {
      const advanced = await advanceToNextLeaf(entry);
      if (advanced) return; // 次の子を実行中。pending は次の対象で維持される。
      // すべての子が完了 → 押された親ゴールを完了にして締めくくる。
      await updateGoal(entry.goalId, { status: GOAL_STATUS.done }).catch(() => null);
      await syncAncestorStatus(entry.goalId);
      await addLog(entry.goalId, {
        kind: LOG_KIND.aiResult,
        author: "Claude Code",
        body: "配下のすべての子ゴールの実装が完了しました。親ゴールを完了にしました。",
      }).catch(() => null);
    }

    if (targetDone) {
      // 連続実装でも最後まで来たらマーカーを解除。
      await setPendingRun(null);
      await clearActiveIfMatches(target);
    }
  } catch {
    // 反映失敗は致命的ではないので握りつぶす。
  }
}

// 作業中ゴールが対象と一致していれば解除する（完了後に「作業中」表示を残さない）。
async function clearActiveIfMatches(goalId: string): Promise<void> {
  const { activeGoalId } = await getSettings();
  if (activeGoalId === goalId) await setActiveGoal(null);
}

// 連続実装：押された親(entry.goalId)配下の「次の未完了の末端の子」へ対象を切り替えて再実行する。
// 同じ RunEntry（＝UIのポーリングキー）を使い回し、対象ゴールだけを差し替える。
// 進める子が無ければ false（＝親の実装が完了）。
async function advanceToNextLeaf(entry: RunEntry): Promise<boolean> {
  const all = await listGoals();
  const next = firstIncompleteLeaf(entry.goalId, all);
  if (!next) return false;

  const repoPath = (resolveRepoPath(next, all) || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!repoPath || !existsSync(repoPath)) return false;

  // 対象を次の子へ切り替える（UIは targetTitle の変化で進行を表示する）。
  entry.targetGoalId = next.id;
  entry.targetTitle = next.title;
  entry.repoPath = repoPath;
  entry.status = RUN_STATUS.running;
  entry.finishedAt = null;
  entry.error = null;
  entry.result = "";
  entry.attempts = 0;
  entry.liveProgress = LIVE_PROGRESS_START; // 次の子ゴール用にライブ進捗をリセット

  await updateGoal(next.id, { status: GOAL_STATUS.inProgress });
  await syncAncestorStatus(next.id);
  await setActiveGoal(next.id);
  // 連続実装の再開に備え、押された親ゴールを「実装中」として保持する。
  await setPendingRun(entry.goalId);

  const goalForPrompt = (await getGoal(next.id)) ?? next;
  entry.prompt = buildImplementPrompt(goalForPrompt, all);
  append(
    entry,
    `\n\n════════════════════════════════════\n[次の子ゴール「${next.title}」の実装に進みます]\n`,
  );
  launch(entry);
  return true;
}

// 再実行のため、対象（親なら配下すべて）の完了状態を巻き戻す。
// AIステップの完了を解除し、「完了」ゴールを未着手に戻す（人のステップは触らない）。
async function resetForRerun(goalId: string, all: Goal[]): Promise<void> {
  const ids = [goalId, ...descendantIds(goalId, all)];
  for (const id of ids) {
    const g = await getGoal(id);
    if (!g) continue;
    for (const s of g.steps) {
      if (s.done && s.actor === STEP_ACTOR.ai) {
        await updateStep(id, s.id, { done: false }).catch(() => null);
      }
    }
    if (g.status === GOAL_STATUS.done) {
      await updateGoal(id, {
        status: GOAL_STATUS.notStarted,
        progress: 0,
      }).catch(() => null);
    }
  }
}

// 指定ゴール配下の子孫IDを全階層ぶん集める。
function descendantIds(goalId: string, all: Goal[]): string[] {
  const out: string[] = [];
  for (const k of childrenOf(goalId, all)) {
    out.push(k.id, ...descendantIds(k.id, all));
  }
  return out;
}

// 未完了の末端の子孫ゴールを、上から順（深さ優先）に1つ探す。
function firstIncompleteLeaf(goalId: string, all: Goal[]): Goal | null {
  for (const k of childrenOf(goalId, all)) {
    const grand = childrenOf(k.id, all);
    if (grand.length === 0) {
      if (k.status !== GOAL_STATUS.done) return k;
    } else {
      const found = firstIncompleteLeaf(k.id, all);
      if (found) return found;
    }
  }
  return null;
}

// 対象→祖先の順で repoPath を解決（子はrepoPathが空でも親のフォルダで動かす）。
function resolveRepoPath(goal: Goal, all: Goal[]): string {
  if (goal.repoPath && goal.repoPath.trim()) return goal.repoPath;
  const chain = ancestorsOf(goal.id, all); // 上位→直近の親
  for (let i = chain.length - 1; i >= 0; i--) {
    if (chain[i].repoPath && chain[i].repoPath.trim()) return chain[i].repoPath;
  }
  return "";
}
