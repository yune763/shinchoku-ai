import { NextRequest, NextResponse } from "next/server";
import { getProposal, proposalToText, deriveProcessTasks } from "@/lib/proposals";
import { createGoal, addLog, listGoals, updateGoal } from "@/lib/store";
import { generatePlanDraft } from "@/lib/generate";
import { GOAL_STATUS, LOG_KIND } from "@/lib/types";

export const dynamic = "force-dynamic";

// 「この提案を実装する」= 提案をゴールとして起票し、提案内容をログに連携する。
// 外部リンクではなく、進捗管理AIの実データ（store.json）に書き込む。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  if (!id) {
    return NextResponse.json({ error: "提案idが必要です" }, { status: 400 });
  }

  const p = await getProposal(id);
  if (!p) {
    return NextResponse.json({ error: "提案が見つかりません" }, { status: 404 });
  }

  // 同じタイトルのゴールが既にあれば重複起票せず、それを返す。
  const existing = (await listGoals()).find((g) => g.title === p.title);
  if (existing) {
    return NextResponse.json({ goalId: existing.id, already: true });
  }

  const goal = await createGoal({
    parentId: null,
    title: p.title,
    desire: p.sub ?? "",
    purpose: "",
    currentStatus: `開発提案から起票（${p.date} / 種類: ${p.kind}）`,
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
  });

  // ゴールに目的・完了の基準の下書きを入れる（記事＝ゴールなので中身を補う）。
  const plan = generatePlanDraft(goal);
  await updateGoal(goal.id, {
    purpose: p.sub || plan.purpose,
    completionCriteria: plan.completionCriteria,
  });

  // 提案の全文をゴールのログへ（AIが続きから動くための文脈）。
  await addLog(goal.id, {
    kind: LOG_KIND.comment,
    author: "開発提案",
    body: proposalToText(p),
  });
  if (p.source) {
    await addLog(goal.id, {
      kind: LOG_KIND.comment,
      author: "開発提案",
      body: `情報源: ${p.source}`,
    });
  }

  // ゴールに向かう「過程タスク」を子ゴールとして自動作成する。
  const processTasks = deriveProcessTasks(p);
  for (const title of processTasks) {
    await createGoal({
      parentId: goal.id,
      title,
      desire: "",
      purpose: `「${p.title}」の達成に必要な工程`,
      currentStatus: "",
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
    });
  }

  await addLog(goal.id, {
    kind: LOG_KIND.comment,
    author: "システム",
    body: `過程タスクを自動作成しました（${processTasks.length}件）: ${processTasks.join(" / ")}`,
  });

  return NextResponse.json(
    { goalId: goal.id, already: false, createdTasks: processTasks.length },
    { status: 201 },
  );
}
