"use client";

import { useMemo, useState } from "react";

// ── 完了件数の面グラフ（横軸: 日/週/月/年 切替、縦軸: 完了件数） ──

const PERIODS = [
  { key: "day", label: "日", buckets: 14 },
  { key: "week", label: "週", buckets: 12 },
  { key: "month", label: "月", buckets: 12 },
  { key: "year", label: "年", buckets: 5 },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

interface Bucket {
  label: string;
  count: number;
}

// 期間ごとにバケットの開始時刻と表示ラベルを作り、完了日を数える。
function bucketize(dates: Date[], period: PeriodKey, count: number): Bucket[] {
  const now = new Date();
  const out: { start: number; end: number; label: string }[] = [];

  for (let i = count - 1; i >= 0; i--) {
    let start: Date;
    let end: Date;
    let label: string;
    if (period === "day") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      label = `${start.getMonth() + 1}/${start.getDate()}`;
    } else if (period === "week") {
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const day = (base.getDay() + 6) % 7; // 月曜始まり
      const monday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - day - i * 7);
      start = monday;
      end = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
      label = `${start.getMonth() + 1}/${start.getDate()}`;
    } else if (period === "month") {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      label = `${start.getMonth() + 1}月`;
    } else {
      start = new Date(now.getFullYear() - i, 0, 1);
      end = new Date(start.getFullYear() + 1, 0, 1);
      label = `${start.getFullYear()}`;
    }
    out.push({ start: start.getTime(), end: end.getTime(), label });
  }

  return out.map((b) => ({
    label: b.label,
    count: dates.filter((d) => {
      const t = d.getTime();
      return t >= b.start && t < b.end;
    }).length,
  }));
}

export function CompletionChart({ completions }: { completions: string[] }) {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const dates = useMemo(
    () =>
      completions
        .map((s) => new Date(s))
        .filter((d) => !Number.isNaN(d.getTime())),
    [completions],
  );
  const cfg = PERIODS.find((p) => p.key === period)!;
  const buckets = useMemo(
    () => bucketize(dates, period, cfg.buckets),
    [dates, period, cfg.buckets],
  );

  // SVG座標系。左に軸ラベル用の余白を確保。
  const W = 640;
  const H = 240;
  const padL = 34;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxRaw = Math.max(1, ...buckets.map((b) => b.count));
  const maxY = niceMax(maxRaw);
  const n = buckets.length;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxY) * innerH;

  const linePts = buckets.map((b, i) => `${x(i)},${y(b.count)}`);
  const areaPath =
    n > 0
      ? `M ${x(0)},${padT + innerH} L ${linePts.join(" L ")} L ${x(n - 1)},${padT + innerH} Z`
      : "";
  const linePath = n > 0 ? `M ${linePts.join(" L ")}` : "";

  // 横軸ラベルは間引いて表示（込み合い回避）。
  const labelEvery = Math.ceil(n / 7);
  const gridLines = 4;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold dark:text-white">完了件数の推移</h2>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={[
                "px-3 py-1.5 transition-colors",
                period === p.key
                  ? "bg-brand text-white"
                  : "text-ink-muted dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="完了件数の推移">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* 横グリッド＋Y軸目盛り */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (maxY / gridLines) * i;
          const yy = y(v);
          return (
            <g key={i}>
              <line
                x1={padL}
                y1={yy}
                x2={W - padR}
                y2={yy}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={yy + 3}
                textAnchor="end"
                className="fill-slate-400 text-[9px]"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="url(#areaFill)" />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#4f46e5"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {buckets.map((b, i) => (
          <circle key={i} cx={x(i)} cy={y(b.count)} r={2.5} fill="#4f46e5" />
        ))}

        {/* X軸ラベル */}
        {buckets.map((b, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[9px]"
            >
              {b.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

// Y軸の最大値をきりのいい値へ丸める。
function niceMax(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}

// ── 見積時間ごとの件数割合ドーナツ ──

export interface TimeSlice {
  label: string; // 例: "0.5時間"
  count: number;
}

const DONUT_COLORS = [
  "#4f46e5",
  "#6366f1",
  "#818cf8",
  "#a5b4fc",
  "#c7d2fe",
  "#94a3b8",
  "#cbd5e1",
  "#64748b",
];

export function TimeDonut({
  slices,
  title = "見積時間の割合",
  vertical = false,
}: {
  slices: TimeSlice[];
  title?: string;
  vertical?: boolean;
}) {
  const total = slices.reduce((acc, s) => acc + s.count, 0);
  const R = 60;
  const C = 2 * Math.PI * R;
  const stroke = 22;

  let acc = 0;
  const segments = slices.map((s, i) => {
    const frac = total > 0 ? s.count / total : 0;
    const seg = {
      color: DONUT_COLORS[i % DONUT_COLORS.length],
      dash: frac * C,
      offset: -acc * C,
      pct: Math.round(frac * 100),
    };
    acc += frac;
    return seg;
  });

  return (
    <div>
      <h2 className="font-semibold dark:text-white mb-3">{title}</h2>
      {total === 0 ? (
        <p className="text-sm text-ink-muted dark:text-slate-400">
          完了したタスクがまだありません。
        </p>
      ) : (
        <div
          className={
            vertical
              ? "flex flex-col items-center gap-4"
              : "flex items-center gap-5"
          }
        >
          <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0">
            <g transform="translate(80,80) rotate(-90)">
              <circle
                r={R}
                fill="none"
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeWidth={stroke}
              />
              {segments.map((seg, i) => (
                <circle
                  key={i}
                  r={R}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${seg.dash} ${C - seg.dash}`}
                  strokeDashoffset={seg.offset}
                />
              ))}
            </g>
            <text
              x="80"
              y="76"
              textAnchor="middle"
              className="fill-ink dark:fill-white text-[22px] font-bold"
            >
              {total}
            </text>
            <text
              x="80"
              y="94"
              textAnchor="middle"
              className="fill-slate-400 text-[10px]"
            >
              件
            </text>
          </svg>

          <ul className="flex-1 w-full space-y-1.5 text-sm">
            {slices.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm shrink-0"
                  style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                <span className="flex-1 dark:text-slate-300">{s.label}</span>
                <span className="tabular-nums text-ink-muted dark:text-slate-400">
                  {segments[i].pct}%
                </span>
                <span className="tabular-nums text-xs text-slate-400 w-10 text-right">
                  {s.count}件
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
