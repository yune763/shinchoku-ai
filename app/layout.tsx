import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { ChatPanel } from "@/components/ChatPanel";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "進捗管理AI",
  description: "ゴールベースの進捗管理。文脈を貯め、AIに続きを頼む。",
};

// ログイン不要で見せるパス（認証ページのみ）。
const PUBLIC_PATHS = ["/login"];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname") || "";
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const user = await getCurrentUser();

  // 未ログインで保護ページ → ログインへ。ログイン済みで /login → トップへ。
  if (!user && !isPublic) redirect("/login");
  if (user && isPublic) redirect("/goals");

  return (
    <html lang="ja">
      <body>
        {user ? (
          <>
            <TopNav />
            {/* 右下に常駐するチャットボタンと重ならないよう、下部に余白を確保 */}
            <main className="min-h-screen pl-24 pb-24">{children}</main>
            <ChatPanel />
          </>
        ) : (
          // ログインページなどはナビなしで表示。
          <main className="min-h-screen">{children}</main>
        )}
      </body>
    </html>
  );
}
