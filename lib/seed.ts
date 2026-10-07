import { randomUUID } from "node:crypto";
import { Goal, GOAL_STATUS, LOG_KIND, STEP_ACTOR, Step } from "./types";

// ステップ生成ヘルパ。
function step(
  title: string,
  actor: (typeof STEP_ACTOR)[keyof typeof STEP_ACTOR],
  done: boolean,
  note = "",
  links: { label: string; url: string }[] = [],
): Step {
  return {
    id: randomUUID(),
    title,
    actor,
    done,
    note,
    links,
    createdAt: "2026-09-20T00:00:00.000Z",
    doneAt: done ? "2026-09-22T00:00:00.000Z" : null,
  };
}

// 資料の例（新サービスを届ける）を初期データとして投入する。
// 初回起動時に「見て分かる」状態にするためのサンプル。
export function seedGoals(): Goal[] {
  const t = "2026-09-29T09:00:00.000Z";
  const mk = (
    partial: Partial<Goal> & Pick<Goal, "title">,
  ): Goal => ({
    id: partial.id ?? randomUUID(),
    parentId: partial.parentId ?? null,
    title: partial.title,
    desire: partial.desire ?? "",
    purpose: partial.purpose ?? "",
    currentStatus: partial.currentStatus ?? "",
    completionCriteria: partial.completionCriteria ?? "",
    status: partial.status ?? GOAL_STATUS.notStarted,
    assignee: partial.assignee ?? "",
    reviewer: partial.reviewer ?? "",
    salesPerson: partial.salesPerson ?? "",
    dueDate: partial.dueDate ?? null,
    kpi: partial.kpi ?? "",
    forecast: partial.forecast ?? "",
    repoPath: partial.repoPath ?? "",
    previewCommand: partial.previewCommand ?? "",
    previewUrl: partial.previewUrl ?? "",
    estimatedHours: partial.estimatedHours ?? 0,
    progress: partial.progress ?? 0,
    todoOnly: partial.todoOnly ?? false,
    steps: partial.steps ?? [],
    logs: partial.logs ?? [],
    review: partial.review ?? null,
    createdAt: t,
    updatedAt: t,
  });

  const company = mk({
    title: "【2026年下期】新サービスを届ける",
    purpose: "新サービスで新規顧客を獲得し、下期の売上目標を達成する",
    currentStatus: "企画は固まり、各部署のプロジェクトを立ち上げた段階",
    completionCriteria: "新規10社と契約し、導入後30日の定着率60%以上を達成する",
    status: GOAL_STATUS.inProgress,
    assignee: "経営",
    dueDate: "2026-12-31",
    progress: 40,
  });

  const sales = mk({
    parentId: company.id,
    title: "【営業】新規10社と契約する",
    purpose: "新サービスの初期顧客を確保する",
    currentStatus: "提案準備を進行中。既存顧客への紹介はこれから",
    completionCriteria: "新規10社と契約締結",
    status: GOAL_STATUS.inProgress,
    assignee: "営業部",
    dueDate: "2026-12-25",
    progress: 38,
  });

  const proposal = mk({
    parentId: sales.id,
    title: "提案を準備する",
    purpose: "商談で使える提案一式を揃える",
    currentStatus: "方針は決定済み。提案書の初稿を作成中",
    completionCriteria: "提案書・商談準備・想定Q&Aが揃っている",
    status: GOAL_STATUS.inProgress,
    assignee: "田中",
    dueDate: "2026-10-10",
    progress: 50,
  });

  const decidePolicy = mk({
    parentId: proposal.id,
    title: "提案の方針を決める",
    purpose: "ターゲットと訴求軸を確定する",
    currentStatus: "完了",
    completionCriteria: "課題→提案→導入の骨子が合意されている",
    status: GOAL_STATUS.done,
    assignee: "田中",
    progress: 100,
    logs: [
      {
        id: randomUUID(),
        kind: LOG_KIND.comment,
        author: "田中",
        body: "ターゲットは従業員50-300名の企業。訴求軸は『導入30分・専門知識不要』に決定。",
        createdAt: "2026-09-20T04:00:00.000Z",
      },
    ],
  });

  const draft = mk({
    parentId: proposal.id,
    title: "提案書の初稿を作る",
    desire: "商談でそのまま使える、課題→提案→導入の流れの提案書がほしい",
    purpose: "商談に持っていける提案書をつくる",
    currentStatus: "構成は『課題→提案→導入』で確定。見出しと本文を作成中",
    completionCriteria: "10ページ程度の提案書ドラフトが完成し、レビュー可能な状態",
    status: GOAL_STATUS.inProgress,
    assignee: "田中",
    dueDate: "2026-10-03",
    steps: [
      step("ターゲットと訴求軸を決める", STEP_ACTOR.human, true, "誰に何を伝えるかを確定"),
      step("構成（課題→提案→導入）を固める", STEP_ACTOR.ai, true),
      step("見出しと本文のドラフトを書く", STEP_ACTOR.ai, false, "AIに依頼して初稿を生成"),
      step("社内レビューを受ける", STEP_ACTOR.human, false, "上長に確認をもらう"),
      step("完了レビューを記録する", STEP_ACTOR.human, false),
    ],
    logs: [
      {
        id: randomUUID(),
        kind: LOG_KIND.comment,
        author: "田中",
        body: "構成を『課題→提案→導入』で固めた。次は見出しと本文をAIに依頼する。",
        createdAt: "2026-09-25T02:00:00.000Z",
      },
    ],
  });

  const marketing = mk({
    parentId: company.id,
    title: "【マーケ】新サービスの価値を伝える",
    purpose: "見込み客に価値を届け、商談を創出する",
    currentStatus: "ホームページ原稿と事例インタビューを準備中",
    completionCriteria: "LP公開・事例3件公開",
    status: GOAL_STATUS.inProgress,
    assignee: "マーケ部",
    dueDate: "2026-11-30",
    progress: 20,
  });

  const lp = mk({
    parentId: marketing.id,
    title: "ホームページの原稿をまとめる",
    purpose: "サービスの価値が伝わるLP原稿をつくる",
    currentStatus: "未着手。まずコピーの骨子から",
    completionCriteria: "ファーストビュー〜CTAまでの原稿が揃う",
    status: GOAL_STATUS.notStarted,
    assignee: "佐藤",
    dueDate: "2026-11-10",
    progress: 0,
  });

  const dev = mk({
    parentId: company.id,
    title: "【開発】初回セットアップを30分以内にする",
    purpose: "導入のハードルを下げ、定着率を上げる",
    currentStatus: "オンボーディング画面を設計中",
    completionCriteria: "新規登録から初期設定完了まで30分以内",
    status: GOAL_STATUS.inProgress,
    assignee: "開発部",
    dueDate: "2026-12-15",
    progress: 35,
  });

  return [
    company,
    sales,
    proposal,
    decidePolicy,
    draft,
    marketing,
    lp,
    dev,
  ];
}
