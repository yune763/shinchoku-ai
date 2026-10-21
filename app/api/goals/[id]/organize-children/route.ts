import { NextResponse } from "next/server";
import { getGoal, listGoals, updateGoal, addLog } from "@/lib/store";
import { runClaudeText } from "@/lib/claude-text";
import { LOG_KIND, type Goal } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 直下の子ゴール群をAIが見て、「他の子の配下に入れられるもの」を入れ子（孫ゴール）に
// 再編する。既存の削除・新規作成はしない（親子の付け替えだけ）。
// ツリー表示は既定で収納されるので、入れ子化＝自動的に「配下に収納」される。
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const goal = await getGoal(id);
  if (!goal) return NextResponse.json({ error: "ゴールが見つかりません" }, { status: 404 });

  const all = await listGoals();
  const children = all.filter((g) => g.parentId === id);
  if (children.length < 2) {
    return NextResponse.json({ ok: true, moved: 0, note: "整理対象の子ゴールがありません" });
  }

  const proposal = await proposeNesting(goal, children).catch(() => null);
  if (!proposal) {
    return NextResponse.json({ ok: true, moved: 0, note: "整理案を作成できませんでした" });
  }

  // タイトル → 子ゴール の対応（完全一致→部分一致）。
  const byTitle = (title: string): Goal | null => {
    const want = title.trim().toLowerCase();
    if (!want) return null;
    return (
      children.find((c) => c.title.trim().toLowerCase() === want) ??
      children.find(
        (c) =>
          c.title.trim().toLowerCase().includes(want) ||
          want.includes(c.title.trim().toLowerCase()),
      ) ??
      null
    );
  };

  // 希望する新しい親（子ID → 親ID）。親が自分・不明・現状のゴール直下ならスキップ。
  const desired = new Map<string, string>();
  for (const p of proposal) {
    const child = byTitle(p.child);
    const parent = p.parent ? byTitle(p.parent) : null;
    if (!child || !parent) continue;
    if (child.id === parent.id) continue; // 自分を親にしない
    desired.set(child.id, parent.id);
  }

  // 循環を防ぐ：child→parent をたどって自分に戻るなら不採用。
  const parentOf = (cid: string): string | undefined => desired.get(cid);
  const wouldCycle = (childId: string, parentId: string): boolean => {
    let cur: string | undefined = parentId;
    const seen = new Set<string>([childId]);
    while (cur) {
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = parentOf(cur);
    }
    return false;
  };

  let moved = 0;
  for (const [childId, parentId] of desired) {
    if (wouldCycle(childId, parentId)) continue;
    const child = children.find((c) => c.id === childId);
    if (!child || child.parentId === parentId) continue;
    await updateGoal(childId, { parentId }).catch(() => null);
    moved += 1;
  }

  if (moved > 0) {
    await addLog(id, {
      kind: LOG_KIND.aiResult,
      author: "進捗AI",
      body: `子ゴールを入れ子に整理しました（${moved}件を他の子ゴールの配下へ移動）。`,
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, moved });
}

interface NestItem {
  child: string;
  parent: string | null;
}

// AIに、子ゴール群の入れ子構造（どれをどれの配下にするか）を提案させる。
async function proposeNesting(goal: Goal, children: Goal[]): Promise<NestItem[] | null> {
  const list = children
    .map((c) => `- ${c.title}${c.purpose ? `（目的: ${c.purpose}）` : ""}`)
    .join("\n");

  const prompt = [
    `親ゴール「${goal.title}」の直下にある子ゴール群を、意味的な包含関係で入れ子（親子）に整理してください。`,
    "ある子ゴールが別の子ゴールの一部（下位の作業）であれば、その配下に入れます。",
    "独立しているものは親ゴール直下のまま（parent は null）。",
    "新しいゴールの作成・既存の削除はしないでください（並べ替え＝親子付けのみ）。",
    "",
    "# 子ゴール一覧",
    list,
    "",
    "出力は次のJSONのみ（前置き・説明・コードフェンス不要）。child/parent は上の一覧と同じ表記で：",
    '{"nesting": [{"child": "子ゴールのタイトル", "parent": "配下に入れる先の子ゴールのタイトル or null"}]}',
  ].join("\n");

  const raw = await runClaudeText(prompt, { timeoutMs: 90_000 });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as { nesting?: unknown };
    if (!Array.isArray(obj.nesting)) return null;
    return (obj.nesting as unknown[])
      .map((n) => {
        if (n && typeof n === "object") {
          const o = n as { child?: unknown; parent?: unknown };
          return {
            child: typeof o.child === "string" ? o.child : "",
            parent: typeof o.parent === "string" && o.parent.trim() ? o.parent : null,
          };
        }
        return { child: "", parent: null };
      })
      .filter((n) => n.child.trim());
  } catch {
    return null;
  }
}
