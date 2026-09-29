"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type IconName = "goals" | "today" | "members" | "ai";

const MENU: { href: string; label: string; icon: IconName }[] = [
  { href: "/goals", label: "ゴール一覧", icon: "goals" },
  { href: "/today", label: "今日のToDo", icon: "today" },
  { href: "/team", label: "メンバー", icon: "members" },
  { href: "/ai-context", label: "AIコンテキスト", icon: "ai" },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 22,
    height: 22,
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

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* モバイル用開閉ボタン */}
      <button
        type="button"
        aria-label="メニューを開く"
        onClick={() => setOpen((v) => !v)}
        className="md:hidden fixed top-3 left-3 z-30 rounded-lg bg-ink px-3 py-2 text-white shadow"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-20 w-40 shrink-0 flex flex-col",
          "bg-ink text-slate-200 transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="px-3 py-5 border-b border-white/10 text-center">
          <div className="text-sm font-bold text-white leading-tight">
            進捗管理AI
          </div>
        </div>

        {/* 2列アイコングリッド */}
        <nav className="flex-1 p-2">
          <div className="grid grid-cols-2 gap-2">
            {MENU.map((m) => {
              const active = isActive(m.href);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setOpen(false)}
                  className={[
                    "flex flex-col items-center justify-center gap-1.5 rounded-lg py-3 px-1 text-center",
                    active
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5",
                  ].join(" ")}
                >
                  <span
                    className={active ? "text-brand" : "text-slate-300"}
                    aria-hidden
                  >
                    <Icon name={m.icon} />
                  </span>
                  <span className="text-[11px] leading-tight">{m.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="px-3 py-3 border-t border-white/10 text-[10px] text-slate-400 text-center">
          Addness着想のローカル版
        </div>
      </aside>
    </>
  );
}
