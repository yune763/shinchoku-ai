import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

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
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 md:ml-40">{children}</main>
        </div>
      </body>
    </html>
  );
}
