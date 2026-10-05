import { NextRequest, NextResponse } from "next/server";
import { getGoal, updateGoal, addLog } from "@/lib/store";
import { runClaudeText } from "@/lib/claude-text";
import { Goal, LOG_KIND } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Claude Code の「作業ログ」を受け取り、
// ・ログをゴールに記録
// ・AIが『進捗％』と『完了見込み』を算出してゴールへ反映
// する。外部ツール（scripts/作業ログ取得.mjs 等）から送られてくる想定。
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const log: string = typeof body?.log === "string" ? body.log : "";
  const source: string =
    typeof body?.source === "string" ? body.source : "Claude Code";

  if (!log.trim()) {
    return NextResponse.json({ error: "作業ログ(log)が必要です" }, { status: 400 });
  }

  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "ゴールが見つかりません" }, { status: 404 });

  // 1. 作業ログを記録。
  await addLog(id, {
    kind: LOG_KIND.aiResult,
    author: source,
    body: `【作業ログ】\n${log.trim().slice(0, 4000)}`,
  }).catch(() => null);

  // 2. AIで進捗％・完了見込みを算出。
  const est = await estimate(goal, log).catch(() => null);
  if (!est) {
    return NextResponse.json({ ok: true, estimated: false });
  }

  // 3. ゴールへ反映。進捗はステップが無いゴールのみ上書き（親はcomputeProgressで集約）。
  const patch: Record<string, unknown> = {};
  if (goal.steps.length === 0 && typeof est.progress === "number") {
    patch.progress = Math.max(0, Math.min(100, Math.round(est.progress)));
  }
  if (est.forecast) patch.forecast = est.forecast.slice(0, 200);
  if (Object.keys(patch).length > 0) {
    await updateGoal(id, patch);
  }
  await addLog(id, {
    kind: LOG_KIND.aiResult,
    author: "進捗AI",
    body: `進捗${est.progress ?? "—"}% / 完了見込み: ${est.forecast || "不明"}${est.summary ? `\n${est.summary}` : ""}`,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    estimated: true,
    progress: patch.progress ?? goal.progress,
    forecast: est.forecast ?? "",
    summary: est.summary ?? "",
  });
}

interface Estimate {
  progress: number | null;
  forecast: string;
  summary: string;
}

// ゴール＋作業ログから、進捗％・完了見込み・1行要約をAIで算出する。
async function estimate(goal: Goal, log: string): Promise<Estimate | null> {
  const recent = [...goal.logs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((l) => `- ${l.createdAt.slice(0, 10)} ${l.author}: ${l.body.slice(0, 120)}`)
    .join("\n");

  const lines: string[] = [];
  lines.push(
    "次のゴールと最新の『作業ログ』をもとに、現在の進捗を評価してください。",
  );
  lines.push("");
  lines.push("# ゴール");
  lines.push(`タイトル: ${goal.title}`);
  if (goal.purpose) lines.push(`目的: ${goal.purpose}`);
  if (goal.completionCriteria)
    lines.push(`完了の基準:\n${goal.completionCriteria}`);
  lines.push("");
  lines.push("# これまでの経緯（新しい順）");
  lines.push(recent || "（記録なし）");
  lines.push("");
  lines.push("# 最新の作業ログ");
  lines.push(log.trim().slice(0, 6000));
  lines.push("");
  lines.push(
    "完了の基準に対する達成度から進捗％(0-100)を見積り、残作業から完了見込み(例: 『残り約2時間』『10/4完了見込み』)を推定してください。",
  );
  lines.push(
    "出力は次のJSONのみ（前置き・説明・コードフェンス不要）: {\"progress\": <0-100の整数>, \"forecast\": \"完了見込みの短い文\", \"summary\": \"現状の1行要約\"}",
  );

  const raw = await runClaudeText(lines.join("\n"), { timeoutMs: 90_000 });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as {
      progress?: unknown;
      forecast?: unknown;
      summary?: unknown;
    };
    return {
      progress: typeof obj.progress === "number" ? obj.progress : null,
      forecast: typeof obj.forecast === "string" ? obj.forecast.trim() : "",
      summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
    };
  } catch {
    return null;
  }
}
