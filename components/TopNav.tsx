"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type IconName =
  | "goals"
  | "today"
  | "members"
  | "ai"
  | "more"
  | "analytics"
  | "idea"
  | "news"
  | "sns"
  | "chat"
  | "approve"
  | "account"
  | "tools";

const MENU: { href: string; label: string; icon: IconName }[] = [
  { href: "/goals", label: "ゴール一覧", icon: "goals" },
  { href: "/team", label: "メンバー進捗", icon: "members" },
  { href: "/chat", label: "チャット", icon: "chat" },
  { href: "/today", label: "今日のToDo", icon: "today" },
  { href: "/proposals", label: "開発提案", icon: "idea" },
  { href: "/collection", label: "情報収集", icon: "news" },
  { href: "/sns-collection", label: "SNS情報収集", icon: "sns" },
  { href: "/ai-context", label: "申請・承認", icon: "approve" },
];

// 「その他」に畳み込むサブメニュー。
const MORE_MENU: { href: string; label: string; icon: IconName }[] = [
  { href: "/account", label: "アカウント情報", icon: "account" },
  { href: "/analytics", label: "アナリティクス", icon: "analytics" },
  { href: "/tools", label: "ツール管理", icon: "tools" },
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
    case "more": // 三点（その他）
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
    case "analytics": // 棒グラフ（アナリティクス）
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    case "idea": // 電球（開発提案）
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1.3 1.5 1.5 2.5h5c.2-1 .7-1.7 1.5-2.5A6 6 0 0 0 12 3z" />
        </svg>
      );
    case "news": // 新聞（情報収集）
      return (
        <svg {...common}>
          <path d="M4 5h13v14H5a1 1 0 0 1-1-1V5z" />
          <path d="M17 8h3v9a2 2 0 0 1-2 2M7 9h7M7 13h7M7 17h4" />
        </svg>
      );
    case "tools": // クレジットカード（課金ツール管理）
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18M7 15h4" />
        </svg>
      );
    case "account": // 人＋歯車（アカウント情報）
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" />
        </svg>
      );
    case "approve": // チェックバッジ（申請・承認）
      return (
        <svg {...common}>
          <path d="M12 3l2.1 1.4 2.5-.3 1 2.3 2.3 1-.3 2.5L21 12l-1.4 2.1.3 2.5-2.3 1-1 2.3-2.5-.3L12 21l-2.1-1.4-2.5.3-1-2.3-2.3-1 .3-2.5L3 12l1.4-2.1-.3-2.5 2.3-1 1-2.3 2.5.3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "chat": // 吹き出し（チャット）
      return (
        <svg {...common}>
          <path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
          <path d="M7 9h10M7 12h7" />
        </svg>
      );
    case "sns": // 吹き出し＋共有（SNS情報収集）
      return (
        <svg {...common}>
          <path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
          <circle cx="8" cy="9.5" r="1" />
          <circle cx="11.5" cy="9.5" r="1" />
          <circle cx="15" cy="9.5" r="1" />
        </svg>
      );
  }
}

export function TopNav() {
  const pathname = usePathname();
  const [openMore, setOpenMore] = useState(false);
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const moreActive = MORE_MENU.some((m) => isActive(m.href));

  return (
    <aside className="fixed top-0 left-0 z-30 h-screen w-24 bg-ink text-slate-200 border-r border-white/10 flex flex-col">
      <Link
        href="/goals"
        className="min-h-16 flex items-center justify-center text-center font-bold text-white text-[11px] leading-tight px-2 py-2 border-b border-white/10"
      >
        AX事業部
        <br />
        進捗・ツール管理
      </Link>

      {/* アイコン＋ページ名・縦1列 */}
      <nav className="flex-1 flex flex-col items-stretch gap-1 p-2">
        {MENU.map((m) => {
          const active = isActive(m.href);
          return (
            <Link
              key={m.href}
              href={m.href}
              aria-label={m.label}
              title={m.label}
              className={[
                "flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-colors",
                active
                  ? "bg-brand text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              <Icon name={m.icon} />
              <span className="text-[10px] leading-tight text-center">
                {m.label}
              </span>
            </Link>
          );
        })}

        {/* その他（展開でサブメニュー） */}
        <div className="relative mt-auto">
          <button
            type="button"
            onClick={() => setOpenMore((v) => !v)}
            aria-label="その他"
            title="その他"
            className={[
              "w-full flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-colors",
              moreActive || openMore
                ? "bg-brand text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            <Icon name="more" />
            <span className="text-[10px] leading-tight text-center">その他</span>
          </button>

          {openMore && (
            <>
              {/* 外側クリックで閉じる */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setOpenMore(false)}
              />
              <div className="absolute left-full bottom-0 ml-2 z-40 w-44 rounded-xl bg-ink text-slate-200 border border-white/10 shadow-xl p-1">
                {MORE_MENU.map((m) => {
                  const active = isActive(m.href);
                  return (
                    <Link
                      key={m.href}
                      href={m.href}
                      onClick={() => setOpenMore(false)}
                      className={[
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        active
                          ? "bg-brand text-white"
                          : "hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      <Icon name={m.icon} />
                      <span>{m.label}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </nav>
    </aside>
  );
}
