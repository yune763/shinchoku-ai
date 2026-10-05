import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { ChatPanel } from "@/components/ChatPanel";

export const metadata: Metadata = {
  title: "進捗管理AI",
  description: "ゴールベースの進捗管理。文脈を貯め、AIに続きを頼む。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <TopNav />
        {/* 右下に常駐するチャットボタンと重ならないよう、下部に余白を確保 */}
        <main className="min-h-screen pl-24 pb-24">{children}</main>
        <ChatPanel />
      </body>
    </html>
  );
}
