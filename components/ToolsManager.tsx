"use client";

import { useEffect, useState } from "react";
import {
  Tool,
  BillingCycle,
  BILLING_CYCLE_LABEL,
  monthlyEquivalent,
} from "@/lib/tools-shared";

const input =
  "w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm dark:text-white";

function yen(amount: number, currency: string) {
  if (currency === "JPY" || !currency) return `¥${amount.toLocaleString("ja-JP")}`;
  return `${amount.toLocaleString()} ${currency}`;
}

type Draft = Omit<Tool, "id" | "createdAt" | "updatedAt"> & { id?: string };

const EMPTY: Draft = {
  name: "",
  member: "",
  account: "",
  password: "",
  url: "",
  plan: "",
  amount: 0,
  currency: "JPY",
  cycle: "monthly",
  nextBilling: null,
  connected: false,
  connectionNote: "",
  notes: "",
};

export function ToolsManager({ initialTools }: { initialTools: Tool[] }) {
  const [tools, setTools] = useState<Tool[]>(initialTools);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const [members, setMembers] = useState<string[]>([]);
  const [meName, setMeName] = useState("");
  const [filterMember, setFilterMember] = useState(""); // "" = 全員

  // チームのメンバー名を取得（登録者の候補・既定値に使う）。
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/team");
        const d = await res.json();
        const names: string[] = [];
        if (d?.me?.name) {
          setMeName(d.me.name);
          names.push(d.me.name);
        }
        for (const m of d?.members ?? []) {
          if (m?.memberName && !names.includes(m.memberName)) names.push(m.memberName);
        }
        setMembers(names);
      } catch {
        /* メンバー取得不可でも手入力で登録できる */
      }
    })();
  }, []);

  async function reload() {
    const res = await fetch("/api/tools");
    const d = await res.json().catch(() => ({ tools: [] }));
    setTools(d.tools ?? []);
  }

  // 登録者の選択肢（チーム＋実データに現れるメンバー）。
  const memberOptions = Array.from(
    new Set([...members, ...tools.map((t) => t.member).filter(Boolean)]),
  );

  async function remove(t: Tool) {
    if (!confirm(`「${t.name}」を削除しますか？`)) return;
    await fetch(`/api/tools/${t.id}`, { method: "DELETE" });
    await reload();
  }

  // ── 絞り込み（メンバー別） ──
  const shown = filterMember
    ? tools.filter((t) => t.member === filterMember)
    : tools;

  // ── サマリ（表示対象ベース） ──
  const monthlyTotal = shown.reduce((s, t) => s + monthlyEquivalent(t), 0);
  const connectedCount = shown.filter((t) => t.connected).length;

  // ── メンバー別 月額内訳（全データ） ──
  const perMember = memberOptions
    .map((name) => ({
      name,
      monthly: tools
        .filter((t) => t.member === name)
        .reduce((s, t) => s + monthlyEquivalent(t), 0),
      count: tools.filter((t) => t.member === name).length,
    }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.monthly - a.monthly);
  const unassigned = tools.filter((t) => !t.member);

  return (
    <div className="space-y-5">
      {/* セキュリティ警告 */}
      <div className="rounded-card border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
        ⚠ パスワードはこのPC内の <code>data/tools.json</code>{" "}
        に平文で保存されます（gitには含めません）。機密性の高いものは専用のパスワードマネージャの利用を推奨します。
      </div>

      {/* サマリ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile
          label={filterMember ? `登録ツール（${filterMember}）` : "登録ツール"}
          value={`${shown.length}件`}
        />
        <SummaryTile label="月額合計（概算）" value={yen(monthlyTotal, "JPY")} />
        <SummaryTile label="年額換算" value={yen(monthlyTotal * 12, "JPY")} />
        <SummaryTile label="システム連携済み" value={`${connectedCount}件`} />
      </div>

      {/* メンバー別 月額内訳 */}
      {perMember.length > 0 && (
        <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="text-xs text-ink-muted dark:text-slate-400 mb-2">
            メンバー別 月額（概算）
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm dark:text-slate-200">
            {perMember.map((m) => (
              <span key={m.name} className="tabular-nums">
                {m.name}：<strong>{yen(m.monthly, "JPY")}</strong>
                <span className="text-ink-muted text-xs">（{m.count}件）</span>
              </span>
            ))}
            {unassigned.length > 0 && (
              <span className="tabular-nums text-ink-muted">
                未割当：{unassigned.length}件
              </span>
            )}
          </div>
        </div>
      )}

      {/* ツールバー：メンバー絞り込み＋追加 */}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm dark:text-slate-300">
          <span className="text-ink-muted text-xs">メンバー絞り込み</span>
          <select
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-sm dark:text-white"
          >
            <option value="">全員</option>
            {memberOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setEditing({ ...EMPTY, member: meName })}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          ＋ ツールを追加
        </button>
      </div>

      {/* テーブル */}
      <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        {shown.length === 0 ? (
          <div className="p-8 text-center text-ink-muted dark:text-slate-400 text-sm">
            {tools.length === 0
              ? "まだ登録がありません。「＋ ツールを追加」から登録してください。"
              : "該当するツールがありません。"}
          </div>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="text-xs text-ink-muted dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <Th>ツール名</Th>
                <Th>登録者</Th>
                <Th>アカウント / ID</Th>
                <Th>パスワード</Th>
                <Th>プラン</Th>
                <Th>課金額</Th>
                <Th>次回請求</Th>
                <Th>連携</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <Td>
                    <div className="font-medium dark:text-slate-200">{t.name}</div>
                    {t.url && (
                      <a
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand hover:underline"
                      >
                        ログイン
                      </a>
                    )}
                  </Td>
                  <Td>{t.member || "—"}</Td>
                  <Td>{t.account || "—"}</Td>
                  <Td>
                    {t.password ? (
                      <span className="flex items-center gap-2">
                        <span className="font-mono">
                          {showPw[t.id] ? t.password : "••••••••"}
                        </span>
                        <button
                          onClick={() =>
                            setShowPw((s) => ({ ...s, [t.id]: !s[t.id] }))
                          }
                          className="text-[11px] text-brand hover:underline"
                        >
                          {showPw[t.id] ? "隠す" : "表示"}
                        </button>
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{t.plan || "—"}</Td>
                  <Td>
                    {t.amount > 0 ? (
                      <>
                        {yen(t.amount, t.currency)}
                        <span className="text-[11px] text-ink-muted ml-1">
                          /{BILLING_CYCLE_LABEL[t.cycle]}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{t.nextBilling || "—"}</Td>
                  <Td>
                    {t.connected ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-[11px]"
                        title={t.connectionNote || "連携済み"}
                      >
                        ● 連携済み
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 px-2 py-0.5 text-[11px]">
                        ○ 未連携
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditing({ ...t })}
                        className="text-brand hover:underline text-xs"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => remove(t)}
                        className="text-red-600 hover:underline text-xs"
                      >
                        削除
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <ToolEditModal
          draft={editing}
          memberOptions={memberOptions}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="text-xs text-ink-muted dark:text-slate-400">{label}</div>
      <div className="text-xl font-bold tabular-nums mt-1 dark:text-white">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left font-medium px-3 py-2">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top dark:text-slate-300">{children}</td>;
}

function ToolEditModal({
  draft,
  memberOptions,
  onClose,
  onSaved,
}: {
  draft: Draft;
  memberOptions: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Draft>(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!v.id;

  async function save() {
    if (!v.name.trim()) {
      setError("ツール名は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    const body = {
      name: v.name,
      member: v.member,
      account: v.account,
      password: v.password,
      url: v.url,
      plan: v.plan,
      amount: Number(v.amount) || 0,
      currency: v.currency || "JPY",
      cycle: v.cycle,
      nextBilling: v.nextBilling || null,
      connected: v.connected,
      connectionNote: v.connectionNote,
      notes: v.notes,
    };
    const res = await fetch(isEdit ? `/api/tools/${v.id}` : "/api/tools", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError("保存に失敗しました");
      setSaving(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-auto rounded-card bg-white dark:bg-slate-900 shadow-xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold dark:text-white">
          {isEdit ? "ツールを編集" : "ツールを追加"}
        </h2>

        <Field label="ツール名 *">
          <input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus />
        </Field>
        <Field label="登録者 / 利用メンバー">
          <input
            className={input}
            list="tool-members"
            value={v.member}
            onChange={(e) => setV({ ...v, member: e.target.value })}
            placeholder="登録するメンバー名"
          />
          <datalist id="tool-members">
            {memberOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="アカウント名 / ID">
            <input className={input} value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} />
          </Field>
          <Field label="パスワード">
            <input className={input} value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          </Field>
        </div>
        <Field label="ログインURL">
          <input className={input} value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="プラン">
            <input className={input} value={v.plan} onChange={(e) => setV({ ...v, plan: e.target.value })} placeholder="Pro など" />
          </Field>
          <Field label="課金周期">
            <select
              className={input}
              value={v.cycle}
              onChange={(e) => setV({ ...v, cycle: e.target.value as BillingCycle })}
            >
              <option value="monthly">月額</option>
              <option value="yearly">年額</option>
              <option value="once">買い切り</option>
              <option value="other">その他</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="課金額">
            <input
              type="number"
              min={0}
              className={input}
              value={v.amount}
              onChange={(e) => setV({ ...v, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="通貨">
            <input className={input} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })} />
          </Field>
        </div>
        <Field label="次回請求日">
          <input
            type="date"
            className={input}
            value={v.nextBilling ?? ""}
            onChange={(e) => setV({ ...v, nextBilling: e.target.value || null })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm dark:text-slate-200">
          <input
            type="checkbox"
            checked={v.connected}
            onChange={(e) => setV({ ...v, connected: e.target.checked })}
          />
          このシステムに連携している
        </label>
        {v.connected && (
          <Field label="連携の内容">
            <input
              className={input}
              value={v.connectionNote}
              onChange={(e) => setV({ ...v, connectionNote: e.target.value })}
              placeholder="例: APIキーを .env に設定 / MCP連携 など"
            />
          </Field>
        )}
        <Field label="備考">
          <textarea className={input} rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-ink-muted">
            キャンセル
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-ink-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
