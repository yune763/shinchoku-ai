import { NextRequest, NextResponse } from "next/server";
import { createGoal, listGoals } from "@/lib/store";
import { goalInputSchema } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const goals = await listGoals();
  return NextResponse.json({ goals });
}

// 作成を直列化して、同時/連続リクエストでの重複作成を防ぐ（同一インスタンス内）。
let createChain: Promise<unknown> = Promise.resolve();
function withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = createChain.then(fn, fn);
  createChain = run.catch(() => {});
  return run;
}

// 直近に作られた「同一タイトル・同一親」のゴールは重複とみなす時間窓(ミリ秒)。
const DEDUP_WINDOW_MS = 15_000;

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = goalInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 作成は直列化し、その中で「直近の同一ゴール」をチェックして重複を防ぐ。
  const { goal, deduped } = await withCreateLock(async () => {
    const all = await listGoals();
    const now = Date.now();
    const title = input.title.trim();
    const parentId = input.parentId ?? null;
    const dup = all.find(
      (g) =>
        g.title.trim() === title &&
        (g.parentId ?? null) === parentId &&
        now - new Date(g.createdAt).getTime() < DEDUP_WINDOW_MS,
    );
    if (dup) return { goal: dup, deduped: true };
    const created = await createGoal(input);
    return { goal: created, deduped: false };
  });

  return NextResponse.json({ goal, deduped }, { status: deduped ? 200 : 201 });
}
