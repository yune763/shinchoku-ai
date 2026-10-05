import { listReports } from "@/lib/collection";
import { CollectionExplorer } from "@/components/CollectionExplorer";

export const dynamic = "force-dynamic";

// 情報収集：左に年→月→日ツリー、右に検索＋ジャンル/注目度フィルタ＋記事。
export default async function CollectionPage() {
  const reports = await listReports();

  if (reports.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center text-ink-muted">
        まだ収集記事がありません。
      </div>
    );
  }

  return <CollectionExplorer reports={reports} />;
}
