import {
  getGoal,
  updateGoal,
  addLog,
  listGoals,
  createGoal,
  syncAncestorStatus,
} from "@/lib/store";
import { runClaudeText } from "@/lib/claude-text";
import { Goal, GOAL_STATUS, GoalStatus, LOG_KIND } from "@/lib/types";

// 作業ログを1本受け取り、ゴール（または該当する子ゴール）へ反映する中核ロジック。
// API ルート（外部ツールからのPOST）とサーバー内の定期同期の両方から使う。
// 宛先は呼び出し側が repoPath 一致で決める（ここでは goalId を受け取るだけ）。
// 「完了」への自動切替はしない（done_candidate は in_progress + 進捗100% +「完了候補」に留める）。

export interface IngestResult {
  ok: boolean;
  estimated: boolean;
  appliedTo?: string;
  progress?: number;
  status?: GoalStatus;
  forecast?: string;
  summary?: string;
  addedSubtasks?: number;
  criteriaUpdated?: boolean;
  error?: string;
}

export async function ingestWorklog(
  goalId: string,
  log: string,
  source = "Claude Code",
): Promise<IngestResult> {
  if (!log.trim()) return { ok: false, estimated: false, error: "作業ログが空です" };

  const goal = await getGoal(goalId);
  if (!goal) return { ok: false, estimated: false, error: "ゴールが見つかりません" };

  // 1. 作業ログを記録。
  await addLog(goalId, {
    kind: LOG_KIND.aiResult,
    author: source,
    body: `【作業ログ】\n${log.trim().slice(0, 4000)}`,
  }).catch(() => null);

  // 2. 対象ゴールの既存の子ゴール（AIが反映先を特定するために渡す）。
  const existingChildren = (await listGoals()).filter((g) => g.parentId === goalId);

  // 3. AIで進捗・状態・反映先・完了基準の変更・新規子タスクを算出。
  const est = await estimate(goal, existingChildren, log).catch(() => null);
  if (!est) return { ok: true, estimated: false };

  // 4. 作業ログから新たに判明した子タスクを子ゴールとして追加（既存タイトルは除外）。
  const addedSubtasks = await addNewChildGoals(goalId, existingChildren, est.subtasks);

  // 5. 反映先を決める。親ゴールで、AIが進めた既存の子ゴールを特定できた場合はその子に、
  //    それ以外（葉ゴール等）は対象ゴール自身に反映する。
  const refreshed = await listGoals();
  const children = refreshed.filter((g) => g.parentId === goalId);
  const targetChild =
    est.targetChildTitle && children.length > 0
      ? matchChild(children, est.targetChildTitle)
      : null;
  const applyTo = targetChild ?? goal;
  const applyHasChildren = refreshed.some((g) => g.parentId === applyTo.id);

  // 6. 反映内容を組み立てる。
  const patch: Record<string, unknown> = {};

  // 進捗は「葉（子もステップも無い）」のときだけ上書き。親は子から自動集約される。
  const applyIsLeaf = applyTo.steps.length === 0 && !applyHasChildren;
  if (applyIsLeaf && typeof est.progress === "number") {
    patch.progress = Math.max(0, Math.min(100, Math.round(est.progress)));
  }

  // ルート（最上位の親）ゴールか。ルートの完了確定は人が行う。
  const isRoot = !applyTo.parentId;

  // 状態の自動遷移。
  let nextStatus = nextStatusFrom(applyTo.status, est.status);

  // 完了見込み。
  let forecast = est.forecast ? est.forecast.slice(0, 200) : "";
  if (est.status === "done_candidate") {
    if (applyIsLeaf) patch.progress = 100;
    if (isRoot) {
      // 最上位ゴールは自動完了させず、完了候補として人の確認を促す。
      forecast = `完了候補（確認待ち）${forecast ? ` / ${forecast}` : ""}`.slice(0, 200);
    } else {
      // いずれかの子ゴール（parentIdあり）は、実装完了なら自動で「完了」にする。
      nextStatus = GOAL_STATUS.done;
    }
  }
  if (nextStatus && nextStatus !== applyTo.status) patch.status = nextStatus;
  if (forecast) patch.forecast = forecast;

  // 人とのやり取りで更新された完了基準があれば反映。
  if (est.completionCriteria && est.completionCriteria.trim()) {
    patch.completionCriteria = est.completionCriteria.trim().slice(0, 2000);
  }

  if (Object.keys(patch).length > 0) {
    await updateGoal(applyTo.id, patch);
  }

  // 子ゴールを完了にした場合は、祖先の状態を再計算して伝播させる
  // （子が全部完了した中間の親は自動完了／最上位は人の確認待ちに留める）。
  if (patch.status === GOAL_STATUS.done) {
    await syncAncestorStatus(applyTo.id).catch(() => null);
  }

  // 親に子ゴールへ反映した場合、親も「進行中」にしておく（未着手のままにしない）。
  if (targetChild && goal.status === GOAL_STATUS.notStarted) {
    await updateGoal(goal.id, { status: GOAL_STATUS.inProgress }).catch(() => null);
  }

  // 7. 反映結果をログに残す。
  const appliedTo = targetChild ? `子ゴール「${targetChild.title}」` : goal.title;
  await addLog(applyTo.id, {
    kind: LOG_KIND.aiResult,
    author: "進捗AI",
    body:
      `[${appliedTo}] 進捗${est.progress ?? "—"}% / 状態: ${nextStatus ? statusLabel(nextStatus) : statusLabel(applyTo.status)} / 完了見込み: ${forecast || "不明"}` +
      (est.summary ? `\n${est.summary}` : "") +
      (est.completionCriteria ? `\n完了基準を更新しました。` : "") +
      (addedSubtasks > 0 ? `\n子タスクを${addedSubtasks}件追加しました。` : ""),
  }).catch(() => null);

  return {
    ok: true,
    estimated: true,
    appliedTo,
    progress: (patch.progress as number) ?? applyTo.progress,
    status: nextStatus ?? applyTo.status,
    forecast,
    summary: est.summary ?? "",
    addedSubtasks,
    criteriaUpdated: !!est.completionCriteria,
  };
}

// 既存子ゴールの中から、AIが指定したタイトルに最も近いものを選ぶ（完全一致→部分一致）。
function matchChild(children: Goal[], title: string): Goal | null {
  const want = title.trim().toLowerCase();
  if (!want) return null;
  const exact = children.find((c) => c.title.trim().toLowerCase() === want);
  if (exact) return exact;
  const partial = children.find(
    (c) =>
      c.title.trim().toLowerCase().includes(want) ||
      want.includes(c.title.trim().toLowerCase()),
  );
  return partial ?? null;
}

// 状態の前進のみ許可する遷移。「完了」へは自動で切り替えない（done_candidate は in_progress 扱い）。
function nextStatusFrom(
  current: GoalStatus,
  suggested: Estimate["status"],
): GoalStatus | null {
  if (current === GOAL_STATUS.done) return null; // 既に完了は触らない
  switch (suggested) {
    case "blocked":
      return GOAL_STATUS.blocked;
    case "in_progress":
    case "done_candidate":
      return GOAL_STATUS.inProgress;
    case "not_started":
      // 作業ログが来ている時点で着手済みとみなす。後退はさせない。
      return current === GOAL_STATUS.notStarted ? GOAL_STATUS.inProgress : null;
    default:
      return null;
  }
}

function statusLabel(s: GoalStatus): string {
  const map: Record<GoalStatus, string> = {
    [GOAL_STATUS.notStarted]: "未着手",
    [GOAL_STATUS.inProgress]: "進行中",
    [GOAL_STATUS.blocked]: "停滞",
    [GOAL_STATUS.done]: "完了",
  };
  return map[s] ?? s;
}

// 作業ログから判明した新タスクを子ゴールとして追加する（既存タイトルは除外）。戻り値は追加件数。
async function addNewChildGoals(
  parentId: string,
  existingChildren: Goal[],
  subtasks: { title: string; purpose?: string }[],
): Promise<number> {
  if (!subtasks.length) return 0;
  const existing = new Set(existingChildren.map((g) => g.title.trim().toLowerCase()));
  let count = 0;
  for (const t of subtasks) {
    const title = (t.title || "").trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (existing.has(key)) continue;
    existing.add(key);
    await createGoal({
      parentId,
      title: title.slice(0, 120),
      desire: "",
      purpose: (t.purpose || "").slice(0, 200),
      currentStatus: "作業ログから自動追加",
      completionCriteria: "",
      status: GOAL_STATUS.notStarted,
      assignee: "",
      reviewer: "",
      salesPerson: "",
      dueDate: null,
      kpi: "",
      forecast: "",
      repoPath: "",
      previewCommand: "",
      previewUrl: "",
      estimatedHours: 0,
      progress: 0,
    }).catch(() => null);
    count += 1;
  }
  return count;
}

interface Estimate {
  progress: number | null;
  forecast: string;
  summary: string;
  status: "not_started" | "in_progress" | "blocked" | "done_candidate" | null;
  targetChildTitle: string | null;
  completionCriteria: string | null;
  subtasks: { title: string; purpose?: string }[];
}

// ゴール＋既存子ゴール＋作業ログから、進捗・状態・反映先・完了基準の変更・新規子タスクをAIで算出する。
async function estimate(
  goal: Goal,
  children: Goal[],
  log: string,
): Promise<Estimate | null> {
  const recent = [...goal.logs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((l) => `- ${l.createdAt.slice(0, 10)} ${l.author}: ${l.body.slice(0, 120)}`)
    .join("\n");

  const lines: string[] = [];
  lines.push("次のゴールと最新の『作業ログ』をもとに、進捗と状態を評価し、反映内容を決めてください。");
  lines.push("作業ログには [人] で始まる人間の指示・やり取りも含まれます。");
  lines.push("");
  lines.push("# ゴール");
  lines.push(`タイトル: ${goal.title}`);
  if (goal.purpose) lines.push(`目的: ${goal.purpose}`);
  if (goal.completionCriteria) lines.push(`現在の完了の基準:\n${goal.completionCriteria}`);
  lines.push("");
  if (children.length > 0) {
    lines.push("# このゴールの既存の子ゴール（この中で“進めた”ものがあればタイトルを返す）");
    for (const c of children) {
      lines.push(`- ${c.title}（状態: ${c.status} / 進捗: ${c.progress}%）`);
    }
    lines.push("");
  }
  lines.push("# これまでの経緯（新しい順）");
  lines.push(recent || "（記録なし）");
  lines.push("");
  lines.push("# 最新の作業ログ");
  lines.push(log.trim().slice(0, 6000));
  lines.push("");
  lines.push("# 判定してほしいこと");
  lines.push("- progress: 完了の基準に対する達成度から進捗％(0-100の整数)。");
  lines.push(
    "- status: 今の状態。まだ完了していなければ in_progress、着手の形跡が無ければ not_started、依存待ち等で止まっていれば blocked、完了の基準を満たしたと判断できるなら done_candidate。（完了確定は人が行うので done は使わない）",
  );
  lines.push("- forecast: 残作業からの完了見込み（例: 『残り約2時間』『10/4完了見込み』）。");
  lines.push("- summary: 現状の1行要約。");
  lines.push(
    "- targetChildTitle: 既存子ゴールのうち、この作業で主に進んだものがあれば、そのタイトルを“既存一覧と同じ表記で”。該当しなければ null。",
  );
  lines.push(
    "- completionCriteria: 作業中の[人]とのやり取りで完了の基準が“変更・明確化”された場合のみ、更新後の完了基準の全文。変更が無ければ null（勝手に作文しない）。",
  );
  lines.push(
    "- subtasks: 作業ログで新たに判明した、着手可能で具体的な小タスク（既存ゴールと重複・粒度が大きすぎるものは除く）。無ければ空配列。",
  );
  lines.push("");
  lines.push(
    '出力は次のJSONのみ（前置き・説明・コードフェンス不要）: {"progress": <0-100>, "status": "in_progress", "forecast": "", "summary": "", "targetChildTitle": null, "completionCriteria": null, "subtasks": [{"title": "", "purpose": ""}]}',
  );

  const raw = await runClaudeText(lines.join("\n"), { timeoutMs: 90_000 });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const subtasks = Array.isArray(obj.subtasks)
      ? (obj.subtasks as unknown[])
          .map((s) => {
            if (s && typeof s === "object") {
              const o = s as { title?: unknown; purpose?: unknown };
              return {
                title: typeof o.title === "string" ? o.title : "",
                purpose: typeof o.purpose === "string" ? o.purpose : undefined,
              };
            }
            if (typeof s === "string") return { title: s };
            return { title: "" };
          })
          .filter((s) => s.title.trim())
          .slice(0, 20)
      : [];
    const statusRaw = typeof obj.status === "string" ? obj.status : "";
    const status = (
      ["not_started", "in_progress", "blocked", "done_candidate"].includes(statusRaw)
        ? statusRaw
        : null
    ) as Estimate["status"];
    return {
      progress: typeof obj.progress === "number" ? obj.progress : null,
      forecast: typeof obj.forecast === "string" ? obj.forecast.trim() : "",
      summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
      status,
      targetChildTitle:
        typeof obj.targetChildTitle === "string" && obj.targetChildTitle.trim()
          ? obj.targetChildTitle.trim()
          : null,
      completionCriteria:
        typeof obj.completionCriteria === "string" && obj.completionCriteria.trim()
          ? obj.completionCriteria.trim()
          : null,
      subtasks,
    };
  } catch {
    return null;
  }
}
