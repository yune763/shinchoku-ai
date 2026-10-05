import { NextRequest, NextResponse } from "next/server";
import {
  getGoal,
  listGoals,
  updateGoal,
  childrenOf,
  deleteGoal,
  addLog,
} from "@/lib/store";
import { breakdownGoal, createChildTree } from "@/lib/breakdown";
import { runClaudeText } from "@/lib/claude-text";
import { Goal, LOG_KIND } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Claude Code との相談結果（テキスト）を受け取り、
// ・完了の基準（Acceptance Criteria）を更新
// ・その方針に沿って子ゴールを生成/更新
// する。システムは会話を自動取得できないため、ユーザーが貼り付けた内容を使う。
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const text: string = typeof body?.text === "string" ? body.text : "";
  const generateChildren: boolean = body?.generateChildren !== false;
  const replaceChildren: boolean = body?.replaceChildren === true;

  if (!text.trim()) {
    return NextResponse.json({ error: "相談結果のテキストを入力してください" }, { status: 400 });
  }

  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "ゴールが見つかりません" }, { status: 404 });

  try {
    // 相談結果を記録として残す。
    await addLog(id, {
      kind: LOG_KIND.comment,
      author: "相談結果",
      body: text.trim().slice(0, 4000),
    }).catch(() => null);

    // 1. 完了の基準を更新（相談結果を文脈に）。
    const criteria = await deriveCriteria(goal, text);
    if (criteria.trim()) {
      await updateGoal(id, { completionCriteria: criteria });
    }

    // 2. 子ゴールを生成/更新。
    let childrenCreated = 0;
    let childrenNote = "子ゴールは更新しませんでした。";
    if (generateChildren) {
      const existing = childrenOf(id, await listGoals());
      if (existing.length > 0 && replaceChildren) {
        for (const c of existing) await deleteGoal(c.id);
      }
      const after = childrenOf(id, await listGoals());
      if (after.length === 0) {
        const tasks = await breakdownGoal(goal, { context: text });
        childrenCreated = await createChildTree(id, goal.title, tasks);
        childrenNote = `子ゴールを${childrenCreated}件生成しました。`;
      } else {
        childrenNote =
          "既に子ゴールがあるため作成をスキップしました（置き換えるには『既存の子ゴールを置き換える』を有効にしてください）。";
      }
    }

    return NextResponse.json({
      ok: true,
      completionCriteria: criteria,
      childrenCreated,
      note: childrenNote,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "反映に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 相談結果＋ゴールから完了の基準（Yes/No判定可能）を導く。
async function deriveCriteria(goal: Goal, text: string): Promise<string> {
  const lines: string[] = [];
  lines.push(
    "次のゴールと『相談で詰めた方針』をもとに、完了の基準（Acceptance Criteria）を作成してください。",
  );
  lines.push(
    "第三者が Yes/No で判定できる具体的で検証可能な条件を3〜7個。曖昧な表現（使いやすい・高品質・ちゃんと動く 等）は禁止。",
  );
  lines.push("");
  lines.push(`# ゴール`);
  lines.push(`タイトル: ${goal.title}`);
  if (goal.desire) lines.push(`したいこと: ${goal.desire}`);
  if (goal.purpose) lines.push(`目的: ${goal.purpose}`);
  lines.push("");
  lines.push("# 相談で詰めた方針");
  lines.push(text.trim().slice(0, 6000));
  lines.push("");
  lines.push("出力は箇条書き（各行『- 』始まり）のみ。前置き・説明・コードフェンスは不要。");

  const raw = await runClaudeText(lines.join("\n"), { timeoutMs: 90_000 });
  const bullets = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-・*•]/.test(l))
    .map((l) => "- " + l.replace(/^[-・*•]\s*/, "").trim())
    .filter((l) => l.length > 2);
  if (bullets.length > 0) return bullets.slice(0, 7).join("\n");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 7)
    .map((l) => (l.startsWith("-") ? l : "- " + l))
    .join("\n");
}
