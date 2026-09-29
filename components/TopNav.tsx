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

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "goals":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="0.8" fill="currentColor" />
        </svg>
      );
    case "today":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
          <path d="M9 15l2 2 4-4" />
        </svg>
      );
    case "members":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
          <path d="M16 6a3 3 0 0 1 0 6M21 20c0-2.5-1.5-4-3.5-4.5" />
        </svg>
      );
    case "ai":
      return (
        <svg {...common}>
          <rect x="6" y="7" width="12" height="11" rx="2" />
          <path d="M12 7V4M9 12h.01M15 12h.01M9 15h6M4 11v3M20 11v3" />
        </svg>
      );
  }
}

export function TopNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="fixed top-0 inset-x-0 z-30 h-14 bg-ink text-slate-200 border-b border-white/10">
      <div className="h-full max-w-6xl mx-auto px-4 flex items-center gap-4">
        <Link href="/goals" className="font-bold text-white whitespace-nowrap">
          進捗管理AI
        </Link>

        {/* 横並び1列のメニュー */}
        <nav className="flex items-center gap-1 overflow-x-auto">
          {MENU.map((m) => {
            const active = isActive(m.href);
            return (
              <Link
                key={m.href}
                href={m.href}
                className={[
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap",
                  active
                    ? "bg-white/10 text-white font-semibold"
                    : "text-slate-300 hover:bg-white/5",
                ].join(" ")}
              >
                <span className={active ? "text-brand" : "text-slate-300"} aria-hidden>
                  <Icon name={m.icon} />
                </span>
                {m.label}
                {active && (
                  <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-brand" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
