import { PageHeader } from "@/components/ui";
import { AppsManager } from "@/components/AppsManager";
import { listApps } from "@/lib/apps-store";

export const dynamic = "force-dynamic";

// 自主制作アプリの一覧管理。
export default async function AppsPage() {
  const apps = await listApps();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="p-6 md:p-8 w-full">
        <PageHeader
          title="自主制作アプリ"
          desc="自分たちで作ったアプリの本体URL・連動ツール・APIキー・格納先などを一元管理します。"
        />
        <AppsManager initialApps={apps} />
      </div>
    </div>
  );
}
