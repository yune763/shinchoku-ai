"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CollectionReport,
  CollectionReportMeta,
  CollectionTopic,
  GENRES,
  classifyGenre,
  stripSymbols,
  isRealTopic,
} from "@/lib/collection-shared";

function condense(text: string, max = 140): string {
  const t = stripSymbols(text);
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// 年→月→日 のツリーを日付一覧から構築（新しい順）。
interface DayNode {
  date: string;
  day: string;
  topicCount: number;
}
interface MonthNode {
  month: string;
  days: DayNode[];
  total: number;
}
interface YearNode {
  year: string;
  months: MonthNode[];
  total: number;
}

function buildTree(reports: CollectionReportMeta[]): YearNode[] {
  const years = new Map<string, Map<string, DayNode[]>>();
  for (const r of reports) {
    const [y, m, d] = r.date.split("-");
    if (!y || !m || !d) continue;
    if (!years.has(y)) years.set(y, new Map());
    const months = years.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push({ date: r.date, day: d, topicCount: r.topicCount });
  }
  const desc = (a: string, b: string) => b.localeCompare(a);
  return [...years.keys()].sort(desc).map((year) => {
    const months = [...years.get(year)!.keys()].sort(desc).map((month) => {
      const days = years
        .get(year)!
        .get(month)!
        .sort((a, b) => desc(a.day, b.day));
      return {
        month,
        days,
        total: days.reduce((s, d) => s + d.topicCount, 0),
      };
    });
    return {
      year,
      months,
      total: months.reduce((s, m) => s + m.total, 0),
    };
  });
}

function Pill({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={[
        "ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        active ? "bg-white/25 text-white" : "bg-slate-100 text-ink-muted",
      ].join(" ")}
    >
      {n}
    </span>
  );
}

export function CollectionExplorer({
  reports,
  apiBase = "/api/collection",
  heading = "情報収集アーカイブ",
}: {
  reports: CollectionReportMeta[];
  apiBase?: string;
  heading?: string;
}) {
  const tree = useMemo(() => buildTree(reports), [reports]);
  const [selectedDate, setSelectedDate] = useState(reports[0]?.date ?? "");
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [genre, setGenre] = useState("all");
  const [minStars, setMinStars] = useState(0);
  const [media, setMedia] = useState("all");

  const initialYM = selectedDate.split("-");
  const [openYears, setOpenYears] = useState<Set<string>>(
    new Set(initialYM[0] ? [initialYM[0]] : []),
  );
  const [openMonths, setOpenMonths] = useState<Set<string>>(
    new Set(
      initialYM[0] && initialYM[1] ? [`${initialYM[0]}-${initialYM[1]}`] : [],
    ),
  );

  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${apiBase}/${selectedDate}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setReport(d.report ?? null);
          setMedia("all"); // 日を替えたら媒体フィルタはリセット
        }
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  // 媒体（情報収集先）の候補：その日のソースlabelから作る。
  const mediaOptions = useMemo(() => {
    if (!report) return [];
    const set = new Set<string>();
    report.topics.filter(isRealTopic).forEach((t) =>
      t.sources.forEach((s) => {
        const l = stripSymbols(s.label || "");
        if (l) set.add(l);
      }),
    );
    return [...set].sort((a, b) => a.localeCompare(b, "ja"));
  }, [report]);

  // フィルタ（キーワード・ジャンル・注目度・媒体）。
  const filtered: CollectionTopic[] = useMemo(() => {
    if (!report) return [];
    const kw = keyword.trim().toLowerCase();
    return report.topics.filter(isRealTopic).filter((t) => {
      if (t.stars < minStars) return false;
      if (genre !== "all" && classifyGenre(t) !== genre) return false;
      if (
        media !== "all" &&
        !t.sources.some((s) => stripSymbols(s.label || "") === media)
      )
        return false;
      if (kw) {
        const hay = (
          t.title +
          " " +
          t.summary +
          " " +
          t.section +
          " " +
          t.sources.map((s) => s.label + " " + s.title).join(" ")
        ).toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [report, keyword, genre, minStars, media]);

  const genreGroups = useMemo(() => {
    const buckets = new Map<string, CollectionTopic[]>();
    for (const t of filtered) {
      const key = classifyGenre(t);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(t);
    }
    for (const list of buckets.values()) list.sort((a, b) => b.stars - a.stars);
    return GENRES.map((g) => ({ ...g, items: buckets.get(g.key) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [filtered]);

  const selMeta = reports.find((r) => r.date === selectedDate);

  return (
    <div className="flex min-h-screen">
      {/* 左：年→月→日 ツリー */}
      <aside className="sticky top-0 h-screen w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-gradient-to-b from-slate-50 to-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <h2 className="text-sm font-bold text-ink">{heading}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            年 / 月 / 日で辿る
          </p>
        </div>
        <nav className="p-3 text-sm">
          {tree.map((y) => {
            const yOpen = openYears.has(y.year);
            return (
              <div key={y.year} className="mb-1">
                <button
                  type="button"
                  onClick={() => setOpenYears((s) => toggle(s, y.year))}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 font-bold text-ink transition-colors hover:bg-slate-100"
                >
                  <span
                    className={[
                      "text-[10px] text-ink-muted transition-transform",
                      yOpen ? "rotate-90" : "",
                    ].join(" ")}
                  >
                    ▶
                  </span>
                  <span className="tracking-wide">{y.year}</span>
                  <span className="text-xs font-normal text-ink-muted">年</span>
                  <Pill n={y.total} />
                </button>

                {yOpen && (
                  <div className="ml-3 mt-0.5 border-l border-slate-200 pl-2">
                    {y.months.map((m) => {
                      const mKey = `${y.year}-${m.month}`;
                      const mOpen = openMonths.has(mKey);
                      return (
                        <div key={mKey} className="mb-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMonths((s) => toggle(s, mKey))
                            }
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-semibold text-ink-soft transition-colors hover:bg-slate-100"
                          >
                            <span
                              className={[
                                "text-[10px] text-ink-muted transition-transform",
                                mOpen ? "rotate-90" : "",
                              ].join(" ")}
                            >
                              ▶
                            </span>
                            {Number(m.month)}
                            <span className="text-xs font-normal text-ink-muted">
                              月
                            </span>
                            <Pill n={m.total} />
                          </button>

                          {mOpen && (
                            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                              {m.days.map((d) => {
                                const active = d.date === selectedDate;
                                const dow = new Date(
                                  d.date + "T00:00:00",
                                ).toLocaleDateString("ja-JP", {
                                  weekday: "short",
                                });
                                return (
                                  <li key={d.date}>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedDate(d.date)}
                                      className={[
                                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                                        active
                                          ? "bg-brand text-white shadow-sm"
                                          : "text-ink-soft hover:bg-white hover:shadow-sm",
                                      ].join(" ")}
                                    >
                                      <span
                                        className={[
                                          "grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold tabular-nums",
                                          active
                                            ? "bg-white/20 text-white"
                                            : "bg-slate-100 text-ink-soft",
                                        ].join(" ")}
                                      >
                                        {Number(d.day)}
                                      </span>
                                      <span className="text-xs">
                                        {Number(d.day)}日
                                        <span
                                          className={
                                            active
                                              ? "ml-1 text-white/70"
                                              : "ml-1 text-ink-muted"
                                          }
                                        >
                                          ({dow})
                                        </span>
                                      </span>
                                      <Pill n={d.topicCount} active={active} />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* 右：検索・フィルタ・記事 */}
      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-ink">
                {selMeta
                  ? stripSymbols(selMeta.title) || selMeta.title
                  : "情報収集"}
              </h1>
              {selMeta?.summary && (
                <p className="mt-1 text-sm text-ink-muted">{selMeta.summary}</p>
              )}
            </div>

            {/* 右上：注目度（★）の見かた */}
            <aside className="shrink-0 rounded-card border border-amber-200 bg-amber-50/70 p-3 sm:w-72">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
                <span aria-hidden>★</span>
                注目度（★）の見かた
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-900/90">
                <strong>①出来事の重大さ</strong>（新モデル・破壊的変更・料金改定など）、
                <strong>②公式発表かどうか</strong>、
                <strong>③どれだけ多くの媒体が報じたか</strong>
                を総合して、AIが<strong>1〜5</strong>で付けています。
                ★が多いほど「業務・開発インパクトが大きい／一次情報に近い」出来事です。
              </p>
            </aside>
          </header>

          {/* 検索＋プルダウン */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="キーワード検索（タイトル・概要・情報源）"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="all">すべてのジャンル</option>
              {GENRES.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
            <select
              value={media}
              onChange={(e) => setMedia(e.target.value)}
              className="max-w-[200px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value="all">すべての媒体</option>
              {mediaOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={minStars}
              onChange={(e) => setMinStars(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              <option value={0}>注目度：すべて</option>
              <option value={1}>注目度 1 以上</option>
              <option value={2}>注目度 2 以上</option>
              <option value={3}>注目度 3 以上</option>
              <option value={4}>注目度 4 のみ</option>
            </select>
          </div>

          <p className="mt-3 text-xs text-ink-muted">
            {loading
              ? "読み込み中…"
              : `該当 ${filtered.length} 件 / ${genreGroups.length} ジャンル`}
            <span className="ml-2">注目度（★）の基準は右上を参照</span>
          </p>

          {/* 記事（ジャンル別） */}
          <div className="mt-6 space-y-8">
            {!loading && genreGroups.length === 0 && (
              <p className="py-10 text-center text-ink-muted">
                条件に合う記事がありません。
              </p>
            )}
            {genreGroups.map((g) => (
              <section key={g.key}>
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
      </div>
    </div>
  );
}
