"use client";

// タスク行の吹き出しアイコン。押すと、そのタスクを主題にAIチャットを開く。
export function TaskChatButton({
  goalId,
  title,
}: {
  goalId: string;
  title: string;
}) {
  function open(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent("shinchoku:chat", { detail: { goalId, title } }),
    );
  }

  return (
    <button
      onClick={open}
      aria-label="このタスクについてAIと話す"
      title="このタスクについてAIと話す"
      className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-ink-muted dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-brand"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
