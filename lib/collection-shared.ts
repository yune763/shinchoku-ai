// 情報収集の型・分類ロジック（node:fs を含まない＝クライアントでも利用可）。

export interface CollectionSource {
  label: string;
  title: string;
  url: string;
}

export interface CollectionTopic {
  section: string;
  title: string;
  stars: number;
  reason: string;
  summary: string;
  sources: CollectionSource[];
}

export interface CollectionReport {
  date: string;
  title: string;
  summary: string;
  topicCount: number;
  topics: CollectionTopic[];
}

export type CollectionReportMeta = Omit<CollectionReport, "topics">;

// ── ジャンル振り分け（5パターン） ──
export interface Genre {
  key: string;
  label: string;
  lead: string;
  test?: RegExp;
}

export const GENRES: Genre[] = [
  {
    key: "devtools",
    label: "開発ツール・コーディング",
    lead: "Copilot・Cursor・Claude Code など、開発を助けるAIツールの動き。",
    test: /copilot|cursor|claude ?code|vs ?code|jetbrains|ide|github|コード|コーディング|開発ツール|プログラ|\bsdk\b|デバッグ/i,
  },
  {
    key: "models",
    label: "主要AIプロダクト・モデル",
    lead: "ChatGPT・Claude・Gemini など主要AIサービスと新モデルの発表。",
    test: /chatgpt|openai|\bgpt\b|claude|anthropic|gemini|google|grok|\bllm\b|モデル|o1|o3/i,
  },
  {
    key: "business",
    label: "企業・ビジネス・市場",
    lead: "資金調達・買収・市場や人材など、AIをめぐるビジネスの話題。",
    test: /調達|資金|出資|買収|\bipo\b|売上|企業|市場|ビジネス|案件|フリーランス|採用|求人|投資|スタートアップ|億円|万ドル/i,
  },
  {
    key: "research",
    label: "研究・技術・活用事例",
    lead: "研究・設計・技術解説や、現場での活用事例・ノウハウ。",
    test: /研究|論文|設計|アーキ|技術|教材|ロードマップ|活用|事例|手法|ベンチマーク|評価|セキュリティ|運用|自動化/i,
  },
  {
    key: "other",
    label: "その他・注目トピック",
    lead: "上記に当てはまらない、その他の注目トピック。",
  },
];

export const GENRE_BY_KEY: Record<string, Genre> = Object.fromEntries(
  GENRES.map((g) => [g.key, g]),
);

export function classifyGenre(topic: CollectionTopic): string {
  const text = `${topic.title} ${topic.section}`;
  for (const g of GENRES) {
    if (g.test && g.test.test(text)) return g.key;
  }
  return "other";
}

// 表示テキストから絵文字・記号（■など）を取り除く。
export function stripSymbols(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}️☀-➿]/gu, "")
    .replace(/[■◆●▶□★☆【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 情報収集システムの内部項目（記事ではない）を除外する。
export function isRealTopic(topic: CollectionTopic): boolean {
  return !/WAITING_FOR_HUMAN|未設定のため/.test(topic.section + topic.title);
}
