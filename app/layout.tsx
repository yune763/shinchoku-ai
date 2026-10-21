import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { ChatPanel } from "@/components/ChatPanel";
import { WorklogAutoSync } from "@/components/WorklogAutoSync";
import { MemberModeProvider } from "@/components/MemberMode";
import { getCurrentUser } from "@/lib/session";
import { isMemberMode } from "@/lib/config";

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
  const memberMode = isMemberMode();

  // 未ログインで保護ページ → ログインへ。ログイン済みで /login → トップへ。
  if (!user && !isPublic) redirect("/login");
  if (user && isPublic) redirect("/goals");

  return (
    <html lang="ja">
      <body>
        {user ? (
          <MemberModeProvider value={memberMode}>
            <TopNav />
            {/* 右下に常駐するチャットボタンと重ならないよう、下部に余白を確保 */}
            <main className="min-h-screen pl-24 pb-24">{children}</main>
            <ChatPanel />
            {/* アプリが開いている間、作業ログを自動で取り込む（Stopフック不要） */}
            <WorklogAutoSync />
          </MemberModeProvider>
        ) : (
          // ログインページなどはナビなしで表示。
          <main className="min-h-screen">{children}</main>
        )}
      </body>
    </html>
  );
}
