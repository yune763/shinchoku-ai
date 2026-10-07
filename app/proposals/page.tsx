import {
  listProposals,
  PROPOSAL_KIND_LABEL,
  ProposalBodyItem,
  ProposalSection,
} from "@/lib/proposals";
import { listGoals } from "@/lib/store";
import { ProposalImplementButton } from "@/components/ProposalImplementButton";

export const dynamic = "force-dynamic";

// 種類ごとのバッジ配色。
const KIND_BADGE: Record<string, string> = {
  new: "bg-blue-50 text-blue-700",
  improve: "bg-emerald-50 text-emerald-700",
  ai: "bg-purple-50 text-purple-700",
  other: "bg-amber-50 text-amber-700",
};

function BodyItem({ item }: { item: ProposalBodyItem }) {
  if (typeof item === "string") {
    return <p className="my-2 leading-relaxed text-ink-soft">{item}</p>;
  }
  if ("callout" in item) {
    return (
      <div className="my-2 rounded-lg border border-brand/20 bg-brand-bg px-4 py-3 text-sm text-ink-soft">
        {item.callout}
      </div>
    );
  }
  if ("list" in item) {
    return (
      <ul className="my-2 list-disc pl-5 text-ink-soft">
        {item.list.map((x, i) => (
          <li key={i} className="my-1">
            {x}
          </li>
        ))}
      </ul>
    );
  }
  if ("steps" in item) {
    return (
      <ol className="my-2 list-decimal pl-5 text-ink-soft">
        {item.steps.map((x, i) => (
          <li key={i} className="my-1">
            {x}
          </li>
        ))}
      </ol>
    );
  }
  if ("metrics" in item) {
    return (
      <div className="my-2 flex flex-wrap gap-3">
        {item.metrics.map((m, i) => (
          <div
            key={i}
            className="rounded-card border border-slate-200 bg-white px-4 py-2"
          >
            <div className="text-lg font-bold text-brand">{m.n}</div>
            <div className="text-xs text-ink-muted">{m.l}</div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function Section({ section }: { section: ProposalSection }) {
  return (
    <section className="mt-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-brand">
        {section.h}
      </h3>
      {(section.body ?? []).map((item, i) => (
        <BodyItem key={i} item={item} />
      ))}
    </section>
  );
}

export default async function ProposalsPage() {
  const [proposals, goals] = await Promise.all([listProposals(), listGoals()]);
  const titleToGoal = new Map(goals.map((g) => [g.title, g.id]));

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold text-ink">開発提案</h1>
        <p className="mt-2 text-sm text-ink-muted">
          情報収集→開発提案システムが作成した提案です。「この提案を実装する」を押すと、
          提案がゴールとして起票され、内容が文脈（ログ）として引き継がれます。
        </p>
        <p className="mt-1 text-xs text-ink-muted">全 {proposals.length} 件</p>
      </header>

      {proposals.length === 0 ? (
        <p className="mt-10 text-center text-ink-muted">
          まだ提案がありません。情報収集ルーチンが提案を追加するとここに並びます。
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {proposals.map((p) => {
            const existingGoalId = titleToGoal.get(p.title) ?? null;
            return (
              <li
                key={p.id}
                className="relative flex flex-col rounded-card border border-slate-200 bg-white p-5 pb-24 shadow-sm"
              >
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={[
                      "rounded-full px-2.5 py-0.5 font-semibold",
                      KIND_BADGE[p.kind] ?? KIND_BADGE.other,
                    ].join(" ")}
                  >
                    {PROPOSAL_KIND_LABEL[p.kind] ?? "その他"}
                  </span>
                  <span className="text-ink-muted">{p.date}</span>
                </div>

                <h2 className="mt-2 text-lg font-bold text-ink">{p.title}</h2>
                {p.sub && (
                  <p className="mt-1 text-sm text-ink-soft">{p.sub}</p>
                )}
                {p.source && (
                  <div className="mt-3 rounded-lg border border-slate-200 border-l-2 border-l-brand bg-slate-50 px-3 py-2 text-xs text-ink-muted">
                    <span className="font-semibold text-brand">情報源</span>{" "}
                    {p.source}
                  </div>
                )}

                <div className="absolute bottom-4 right-4">
                  <ProposalImplementButton
                    proposalId={p.id}
                    existingGoalId={existingGoalId}
                  />
                </div>

                {(p.sections ?? []).length > 0 && (
                  <details className="mt-3 pr-24">
                    <summary className="cursor-pointer text-sm font-medium text-brand">
                      提案の詳細を見る
                    </summary>
                    <div className="mt-1">
                      {p.sections.map((sec, i) => (
                        <Section key={i} section={sec} />
                      ))}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
