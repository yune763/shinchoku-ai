import { Goal, GOAL_STATUS, LOG_KIND } from "./types";
import { runClaudeText } from "./claude-text";
import { createGoal, addLog, childrenOf, listGoals } from "./store";

// ゴールを、それに向かう「子タスク（過程）」へ分解する。
// AI(claude)で具体的な子タスクを作り、失敗時は無難な標準工程にフォールバックする。

export interface ChildTask {
  title: string;
  note?: string;
  purpose?: string; // 親ゴールのどの完了基準に貢献するか
  criteria?: string; // 第三者がYes/Noで判定できる完了基準（2〜5個）
  verify?: string; // 検証方法（テスト・実行コマンド・確認手順）
  deps?: string; // 依存（先に終わっている必要がある子ゴール）
  children?: ChildTask[]; // 大きめのタスクは、さらに小さな孫タスクへ分割
}

const MAX_TASKS = 8;
const MAX_CHILDREN = 6;
const MAX_DEPTH = 2; // 子＋孫まで
const FALLBACK: ChildTask[] = [
  { title: "要件定義・整理", note: "何を満たせば完了かを具体化する" },
  { title: "設計・段取りを決める", note: "完了の基準から逆算して手順を決める" },
  { title: "実装・制作を進める", note: "本体の作業を進める" },
  { title: "テスト・動作確認", note: "主要な正常系と異常系を確認する" },
  { title: "リリース・共有", note: "成果物を共有し次のアクションにつなぐ" },
];

export async function breakdownGoal(
  goal: Goal,
  opts?: { context?: string },
): Promise<ChildTask[]> {
  try {
    const raw = await runClaudeText(buildPrompt(goal, opts?.context), {
      timeoutMs: 90_000,
    });
    const tasks = parseTasks(raw, 1);
    if (tasks.length > 0) return tasks.slice(0, MAX_TASKS);
  } catch {
    // フォールバックへ。
  }
  return FALLBACK;
}

// 子タスク（必要なら孫タスクも）を再帰的に子ゴールとして作成する。
export async function createChildTree(
  parentId: string,
  rootTitle: string,
  tasks: ChildTask[],
): Promise<number> {
  let count = 0;
  for (const t of tasks) {
    // 完了基準＝criteria＋検証方法。現状メモ＝note＋依存。
    const completionCriteria = [
      t.criteria ? t.criteria : "",
      t.verify ? `検証方法: ${t.verify}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const currentStatus = [
      t.note ? t.note : "",
      t.deps ? `依存: ${t.deps}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const child = await createGoal({
      parentId,
      title: t.title,
      desire: "",
      purpose: t.purpose ? t.purpose : `「${rootTitle}」の達成に必要な工程`,
      currentStatus,
      completionCriteria,
      status: GOAL_STATUS.notStarted,
      assignee: "",
      dueDate: null,
      kpi: "",
      forecast: "",
      repoPath: "",
      previewCommand: "",
      previewUrl: "",
      estimatedHours: 0,
      progress: 0,
    });
    count += 1;
    if (t.children && t.children.length > 0) {
      count += await createChildTree(child.id, rootTitle, t.children);
    }
  }
  return count;
}

// ゴールにまだ子が無ければ自動分解して子ゴールを生成する（既に子があれば何もしない）。
// 戻り値は作成した子孫の数（0なら分解しなかった）。
export async function ensureBreakdown(goal: Goal): Promise<number> {
  const all = await listGoals();
  if (childrenOf(goal.id, all).length > 0) return 0;
  const tasks = await breakdownGoal(goal);
  const created = await createChildTree(goal.id, goal.title, tasks);
  const summary = tasks
    .map((t) =>
      t.children && t.children.length > 0
        ? `${t.title}(+${t.children.length})`
        : t.title,
    )
    .join(" / ");
  await addLog(goal.id, {
    kind: LOG_KIND.comment,
    author: "AI",
    body: `実装のため子タスクを自動生成しました（計${created}件）: ${summary}`,
  }).catch(() => null);
  return created;
}

function buildPrompt(goal: Goal, context?: string): string {
  const lines: string[] = [];
  lines.push(
    "あなたはエンジニアリングリードです。次の親ゴールを『検証可能な形で確実に満たす』ための子タスク（実行単位の工程）に分解してください。",
  );
  if (context && context.trim()) {
    lines.push("");
    lines.push(
      "# 相談で詰めた方針（最優先の前提。これに沿って分解すること）",
    );
    lines.push(context.trim().slice(0, 6000));
  }
  lines.push("");
  lines.push("# 分解ルール（各子タスクはすべて満たすこと。満たせないものは作らない）");
  lines.push(
    "0. まず『親ゴールが完全に達成された状態』を想定し、完成状態→必要機能→必要実装→子タスクの順で逆算する。",
  );
  lines.push(
    "1. 子タスクは『作業内容』ではなく『達成状態』で定義する（悪い例『認証機能を対応する』／良い例『メール＋パスワードのログインを実装し正常系・異常系テストを通過させる』）。1子タスク＝1責務。意味のある検証可能な成果を単位にし、過度な細分化（ファイル1個作成等）も避ける。3〜7個程度。",
  );
  lines.push("2. 各子タスクは次を必ず持つ:");
  lines.push("   - title: 具体的な成果を表すタイトル（動詞で始める）");
  lines.push("   - purpose: 何を達成するか／親ゴールのどの完了基準に紐づくか");
  lines.push(
    "   - criteria: 第三者が Yes/No で判定できる Acceptance Criteria を2〜7個（例：「〇〇のテストが通る」「△△を入力すると□□が返る」）。1つの文字列に改行や『/』区切りでまとめる。曖昧表現（対応する・改善する・いい感じに）は禁止",
  );
  lines.push(
    "   - verify: 検証方法（自動テスト・API実行・UI操作・DB確認・build・lint・typecheck のいずれか）",
  );
  lines.push("   - deps: 先に完了している必要がある子タスク（無ければ空文字）");
  lines.push(
    "3. 親ゴールの Acceptance Criteria すべてが、いずれかの子タスクでカバーされるようにする（Coverage。漏れがあれば子タスクを追加）。",
  );
  lines.push(
    "4. 『設計』『調査』だけの子タスクを作る場合も、成果物（設計メモ・比較表など）を criteria に明記する。",
  );
  lines.push(
    "5. 大きめ・複雑な子タスクは、さらに小さな孫タスク(children)に分割してよい（2階層まで）。過剰分割は避ける。",
  );
  lines.push(
    "6. 出力前に自己レビューする：Coverage（親基準を全てカバー）/ Dependency（順序の矛盾なし）/ Granularity（大きすぎ・細かすぎなし）/ Ambiguity（曖昧表現なし）/ Verification（全子に検証方法あり）。",
  );
  lines.push("");
  lines.push(`# 親ゴール`);
  lines.push(`タイトル: ${goal.title}`);
  if (goal.desire) lines.push(`したいこと: ${goal.desire}`);
  if (goal.purpose) lines.push(`目的: ${goal.purpose}`);
  if (goal.completionCriteria)
    lines.push(`完了の基準: ${goal.completionCriteria}`);
  lines.push("");
  lines.push(
    "出力は次のJSON配列のみ（説明・前置き・コードフェンスは一切不要）:",
  );
  lines.push(
    '[{"title":"動詞で始める子タスク名","purpose":"親のどの基準に貢献するか","criteria":"Yes/No判定できる基準を2〜5個(改行や/区切り)","verify":"テスト/実行コマンド/確認手順","deps":"依存する子タスク名(無ければ空)","note":"補足(任意)","children":[{"title":"孫タスク名","purpose":"...","criteria":"...","verify":"..."}]}]',
  );
  return lines.join("\n");
}

function parseTasks(raw: string, depth: number): ChildTask[] {
  // 応答からJSON配列部分だけを取り出す。
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  const slice = raw.slice(start, end + 1);
  try {
    const arr = JSON.parse(slice);
    return normalize(arr, depth);
  } catch {
    return [];
  }
}

// 任意の配列を ChildTask[] に整形。depth<MAX_DEPTH のときだけ children を再帰的に取り込む。
function normalize(arr: unknown, depth: number): ChildTask[] {
  if (!Array.isArray(arr)) return [];
  const limit = depth === 1 ? MAX_TASKS : MAX_CHILDREN;
  const out: ChildTask[] = [];
  for (const x of arr) {
    const item = x as {
      title?: unknown;
      note?: unknown;
      purpose?: unknown;
      criteria?: unknown;
      verify?: unknown;
      deps?: unknown;
      children?: unknown;
    };
    if (!item || typeof item.title !== "string" || !item.title.trim()) continue;
    const str = (v: unknown, max: number) =>
      typeof v === "string" ? v.trim().slice(0, max) : "";
    const task: ChildTask = {
      title: item.title.trim().slice(0, 80),
      note: str(item.note, 200),
      purpose: str(item.purpose, 200),
      criteria: str(item.criteria, 400),
      verify: str(item.verify, 300),
      deps: str(item.deps, 200),
    };
    if (depth < MAX_DEPTH && Array.isArray(item.children)) {
      const kids = normalize(item.children, depth + 1);
      if (kids.length > 0) task.children = kids;
    }
    out.push(task);
    if (out.length >= limit) break;
  }
  return out;
}
