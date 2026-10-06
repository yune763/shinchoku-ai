import { readJson, writeJson } from "./blob";

// チャットメッセージを「タスクにすべきか」学習・判定する軽量分類器。
// 外部MLなし。手動タスク化(正例)/却下(負例)からトークンの重みを学習する。
// 初期は依頼を示すキーワードのヒューリスティックで「提案」、
// 学習が進むと確度の高いものを「自動追加」に昇格させる。

const RULES_KEY = "chat/task-rules.json";

interface TokenStat {
  pos: number; // タスク化された回数
  neg: number; // 却下された回数
}
interface Rules {
  tokens: Record<string, TokenStat>;
  totalPos: number;
  totalNeg: number;
}

// 依頼・ToDoを示す語（学習前のベース信号）。
const CUE_WORDS = [
  "お願い", "おねがい", "ください", "下さい", "まで", "までに", "対応", "確認",
  "修正", "作成", "作って", "やって", "やっておいて", "準備", "連絡", "提出",
  "予約", "手配", "申請", "共有して", "まとめて", "送って", "チェック", "レビュー",
  "タスク", "todo", "対応して", "直して", "設定", "更新して", "依頼",
];

const MIN_TRAIN_FOR_AUTO = 5; // 正例がこれ以上たまると自動追加を許可
const SUGGEST_THRESHOLD = 0.55;
const AUTO_THRESHOLD = 0.8;

export type TaskDecision = "auto" | "suggest" | "none";

async function readRules(): Promise<Rules> {
  const r = await readJson<Rules>(RULES_KEY, {
    tokens: {},
    totalPos: 0,
    totalNeg: 0,
  });
  if (!r.tokens) r.tokens = {};
  return r;
}

async function writeRules(r: Rules): Promise<void> {
  await writeJson(RULES_KEY, r);
}

// 日本語は文字bigram、英数は単語に分割（日英両対応）。
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  for (const w of lower.match(/[a-z0-9]{2,}/g) ?? []) out.add("w:" + w);
  const jp = lower.match(/[぀-ヿ一-龯]+/g) ?? [];
  for (const run of jp) {
    if (run.length === 1) out.add("j:" + run);
    for (let i = 0; i < run.length - 1; i++) out.add("j:" + run.slice(i, i + 2));
  }
  return [...out];
}

function cueScore(text: string): number {
  const lower = text.toLowerCase();
  const hits = CUE_WORDS.filter((w) => lower.includes(w)).length;
  // 1語で0.5、2語で0.68、3語以上で0.8程度に逓増。
  return hits === 0 ? 0 : Math.min(0.8, 0.5 + 0.15 * (hits - 1) + 0.05 * hits);
}

// 学習済みトークン重みからの確率っぽいスコア（0..1）。
function learnedScore(text: string, rules: Rules): number {
  const toks = tokenize(text);
  if (rules.totalPos + rules.totalNeg === 0) return 0;
  let logits = 0;
  let evidence = 0;
  for (const t of toks) {
    const s = rules.tokens[t];
    if (!s) continue;
    const total = s.pos + s.neg;
    if (total < 1) continue;
    // ラプラス平滑化した「正例率」を中心0に寄せた寄与。
    const p = (s.pos + 1) / (total + 2);
    logits += p - 0.5;
    evidence += 1;
  }
  if (evidence === 0) return 0;
  // 平均寄与を 0..1 に写像。
  const avg = logits / evidence; // -0.5..0.5
  return Math.max(0, Math.min(1, 0.5 + avg));
}

export interface ScoreResult {
  score: number;
  decision: TaskDecision;
  trained: boolean;
}

export async function scoreMessage(text: string): Promise<ScoreResult> {
  const rules = await readRules();
  const trained = rules.totalPos >= MIN_TRAIN_FOR_AUTO;
  const base = cueScore(text);
  const learned = learnedScore(text, rules);
  // 学習が進むほど学習スコアを重視する。
  const w = Math.min(0.7, (rules.totalPos + rules.totalNeg) / 40);
  const score = Math.max(base * (1 - w) + learned * w, learned, base * 0.9);
  let decision: TaskDecision = "none";
  if (trained && score >= AUTO_THRESHOLD) decision = "auto";
  else if (score >= SUGGEST_THRESHOLD) decision = "suggest";
  return { score: Number(score.toFixed(3)), decision, trained };
}

// 正例/負例を学習に反映する。
export async function recordFeedback(
  text: string,
  positive: boolean,
): Promise<void> {
  const rules = await readRules();
  for (const t of tokenize(text)) {
    const s = rules.tokens[t] ?? { pos: 0, neg: 0 };
    if (positive) s.pos += 1;
    else s.neg += 1;
    rules.tokens[t] = s;
  }
  if (positive) rules.totalPos += 1;
  else rules.totalNeg += 1;
  await writeRules(rules);
}

export async function learningStats(): Promise<{
  totalPos: number;
  totalNeg: number;
  autoEnabled: boolean;
}> {
  const r = await readRules();
  return {
    totalPos: r.totalPos,
    totalNeg: r.totalNeg,
    autoEnabled: r.totalPos >= MIN_TRAIN_FOR_AUTO,
  };
}
