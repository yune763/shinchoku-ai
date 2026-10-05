import { NextRequest, NextResponse } from "next/server";
import { getGoal, updateGoal } from "@/lib/store";
import { runClaudeText } from "@/lib/claude-text";
import { Goal } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ゴール内容から『完了の基準（Acceptance Criteria）』を自動算出する。
// 第三者が Yes/No で判定できる条件を箇条書きで生成し、ゴールに保存する。
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "ゴールが見つかりません" }, { status: 404 });

  try {
    const criteria = await generateCriteria(goal);
    if (!criteria.trim()) {
      return NextResponse.json(
        { error: "完了基準を生成できませんでした" },
        { status: 502 },
      );
    }
    await updateGoal(id, { completionCriteria: criteria });
    return NextResponse.json({ completionCriteria: criteria });
  } catch (e) {
    const message = e instanceof Error ? e.message : "生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function generateCriteria(goal: Goal): Promise<string> {
  const lines: string[] = [];
  lines.push(
    "次のゴールについて、『完了の基準（Acceptance Criteria）』を作成してください。",
  );
  lines.push(
    "第三者が Yes/No で判定できる、具体的で検証可能な条件を3〜7個。曖昧な表現（使いやすい・高品質・ちゃんと動く 等）は禁止。",
  );
  lines.push(
    "良い例：『CSVをアップロードできる』『1000件までエラーなく処理できる』『APIエラー時にユーザーへエラーメッセージが表示される』『指定の5ケースのテストが通る』。",
  );
  lines.push("");
  lines.push(`# ゴール`);
  lines.push(`タイトル: ${goal.title}`);
  if (goal.desire) lines.push(`したいこと: ${goal.desire}`);
  if (goal.purpose) lines.push(`目的: ${goal.purpose}`);
  if (goal.currentStatus) lines.push(`現状: ${goal.currentStatus}`);
  lines.push("");
  lines.push(
    "出力は箇条書き（各行『- 』始まり）のみ。前置き・説明・コードフェンスは不要。",
  );

  const raw = await runClaudeText(lines.join("\n"), { timeoutMs: 90_000 });
  return normalizeCriteria(raw);
}

// 応答から箇条書き行だけを取り出して整形する。
function normalizeCriteria(raw: string): string {
  const bullets = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-・*•]/.test(l))
    .map((l) => "- " + l.replace(/^[-・*•]\s*/, "").trim())
    .filter((l) => l.length > 2);
  if (bullets.length > 0) return bullets.slice(0, 7).join("\n");
  // 箇条書きが取れなければ、非空行を素直に使う。
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 7)
    .map((l) => (l.startsWith("-") ? l : "- " + l))
    .join("\n");
}
