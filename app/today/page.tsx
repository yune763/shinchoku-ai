import { listGoals } from "@/lib/store";
import { getCurrentUser } from "@/lib/session";
import { GOAL_STATUS, TODO_CATEGORY, type TodoCategory } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { TodoBoard, type BoardTodo } from "@/components/TodoBoard";

export const dynamic = "force-dynamic";

// 今日のToDo：自分の未完了ToDoを4カテゴリ（今すぐ/今日中/保留/明日以降）の列で管理する。
export default async function TodayPage() {
  const [goals, me] = await Promise.all([listGoals(), getCurrentUser()]);
  const meName = me?.displayName ?? "";

  // 自分の「今日のToDo専用(todoOnly)」で未完了のもの（＝各列の「＋」で足す個人ToDo）。
  const todos: BoardTodo[] = goals
    .filter(
      (g) =>
        g.todoOnly &&
        g.status !== GOAL_STATUS.done &&
        g.assignee === meName,
    )
    .map((g) => ({
      id: g.id,
      title: g.title,
      // 未分類は「今すぐやること」に入れる。
      category: (g.todoCategory ?? TODO_CATEGORY.now) as TodoCategory,
      dueDate: g.dueDate,
    }));

  return (
    <div className="p-6 md:p-10">
      <PageHeader
        title="今日のToDo"
        desc="やることを「今すぐ／今日中／保留／明日以降」の4つに分けて管理します。各列の「＋」で追加できます。"
      />
      <TodoBoard todos={todos} assignee={meName} />
    </div>
  );
}
