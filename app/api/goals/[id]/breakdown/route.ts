import { NextRequest, NextResponse } from "next/server";
import { getGoal, addLog, childrenOf, listGoals } from "@/lib/store";
import { breakdownGoal, createChildTree } from "@/lib/breakdown";
import { LOG_KIND } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// ゴールを子タスク（＋必要なら孫タスク）に自動分解して作成する。
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  // すでに子がある場合は重複作成しない。
  const all = await listGoals();
  if (childrenOf(id, all).length > 0) {
    return NextResponse.json({ created: 0, already: true });
  }

  const tasks = await breakdownGoal(goal);
  const created = await createChildTree(id, goal.title, tasks);

  const summary = tasks
    .map((t) =>
      t.children && t.children.length > 0
        ? `${t.title}(+${t.children.length})`
        : t.title,
    )
    .join(" / ");
  await addLog(id, {
    kind: LOG_KIND.comment,
    author: "AI",
    body: `子タスク（必要に応じて孫も）を自動生成しました（計${created}件）: ${summary}`,
  }).catch(() => null);

  return NextResponse.json({ created, tasks }, { status: 201 });
}
