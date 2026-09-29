"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "goals" | "today" | "members" | "ai";

const MENU: { href: string; label: string; icon: IconName }[] = [
  { href: "/goals", label: "ゴール一覧", icon: "goals" },
  { href: "/today", label: "今日のToDo", icon: "today" },
  { href: "/team", label: "メンバー", icon: "members" },
  { href: "/ai-context", label: "AIコンテキスト", icon: "ai" },
];

// シンプルな線アイコン一式（塗りは currentColor）。
function Icon({ name }: { name: IconName }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "goals": // 旗（ゴール）
      return (
        <svg {...common}>
          <path d="M6 21V4" />
          <path d="M6 4h11l-2 3.5L17 11H6" />
        </svg>
      );
    case "today": // チェックリスト
      return (
        <svg {...common}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6l1 1 1.5-2M4 12l1 1 1.5-2M4 18l1 1 1.5-2" />
        </svg>
      );
    case "members": // 人（複数）
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <path d="M16.5 5.6a3.2 3.2 0 0 1 0 6.3M20.5 19c0-2.6-1.6-4.4-3.8-4.9" />
        </svg>
      );
    case "ai": // スパーク（AI）
      return (
        <svg {...common}>
          <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
          <path d="M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
        </svg>
      );
  }
}

export function TopNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="fixed top-0 inset-x-0 z-30 h-16 bg-ink text-slate-200 border-b border-white/10">
      <div className="h-full max-w-6xl mx-auto px-5 flex items-center justify-between">
        <Link href="/goals" className="font-bold text-white text-lg whitespace-nowrap">
          進捗管理AI
        </Link>

        {/* アイコンのみ・横1列 */}
        <nav className="flex items-center gap-2">
          {MENU.map((m) => {
            const active = isActive(m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                aria-label={m.label}
                title={m.label}
                className={[
                  "flex items-center justify-center h-11 w-11 rounded-xl transition-colors",
                  active
                    ? "bg-brand text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <Icon name={m.icon} />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
