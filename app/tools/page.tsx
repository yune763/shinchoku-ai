import { PageHeader } from "@/components/ui";
import { ToolsManager } from "@/components/ToolsManager";
import { listTools } from "@/lib/tools-store";

export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const tools = await listTools();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="p-6 md:p-8 w-full">
        <PageHeader
          title="ツール管理"
          desc="課金中のツールのアカウント・課金額・システム連携の有無を一元管理します。"
        />
        <ToolsManager initialTools={tools} />
      </div>
    </div>
  );
}
