import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/TopNav";

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
        <main className="min-h-screen pt-14">{children}</main>
      </body>
    </html>
  );
}
