import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getReport,
  GENRES,
  classifyGenre,
  stripSymbols,
  isRealTopic,
  CollectionTopic,
} from "@/lib/collection";

export const dynamic = "force-dynamic";

function condense(text: string, max = 140): string {
  const t = stripSymbols(text);
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export default async function CollectionDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const report = await getReport(date);
  if (!report) notFound();

  // 実データのみを5ジャンルへ振り分け。各ジャンル内は重要度の高い順。
  const topics = report.topics.filter(isRealTopic);
  const buckets = new Map<string, CollectionTopic[]>();
  for (const t of topics) {
    const key = classifyGenre(t);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => b.stars - a.stars);
  }
  const genres = GENRES.map((g) => ({ ...g, items: buckets.get(g.key) ?? [] }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/collection"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink-soft shadow-sm transition-colors hover:border-brand hover:text-brand"
      >
        <span aria-hidden>←</span> 情報収集の一覧へ
      </Link>

      <header className="mt-4 border-b-2 border-ink pb-5">
        <h1 className="text-2xl font-bold text-ink">
          {stripSymbols(report.title) || report.title}
        </h1>
        {report.summary && (
          <p className="mt-2 text-sm text-ink-muted">{report.summary}</p>
        )}
        <p className="mt-2 text-xs text-ink-muted">
          {topics.length} 件の記事を {genres.length} ジャンルに整理しています。
          <span className="ml-2">
            「注目度」＝情報収集システムがつけたスコア（最大4。高いほど公式発表・主要ソースで注目度が高い）
          </span>
        </p>
      </header>

      <div className="mt-8 space-y-10">
        {genres.map((g) => (
          <section key={g.key}>
            {/* ジャンル見出し（幅いっぱいの帯・絵文字なし） */}
            <div className="rounded-card bg-ink px-5 py-3 text-white">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold">{g.label}</h2>
                <span className="shrink-0 text-sm text-slate-300">
                  {g.items.length} 件
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-300">{g.lead}</p>
            </div>

            <ul className="mt-4 space-y-4">
              {g.items.map((t, i) => (
                <li
                  key={i}
                  className="rounded-card border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-ink">
                      {stripSymbols(t.title) || t.title}
                    </h3>
                    {t.stars > 0 && (
                      <span
                        className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600"
                        title={`注目度 ${t.stars}／4`}
                      >
                        注目度 {t.stars}
                      </span>
                    )}
                  </div>
                  {t.summary && (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                      {condense(t.summary)}
                    </p>
                  )}
                  {t.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {t.sources.map((s, j) => (
                        <a
                          key={j}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand hover:underline"
                        >
                          {stripSymbols(s.label || s.title || "ソース") ||
                            "ソース"}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
