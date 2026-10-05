import { promises as fs } from "node:fs";
import path from "node:path";

// 保存抽象レイヤー。
// - 環境変数 UPSTASH_REDIS_REST_URL / _TOKEN があれば Upstash Redis(REST) に保存（クラウドで永続）。
// - 無ければ従来どおり data/<name> にファイル保存（ローカル開発はこれまで通り）。
// 各ストアは「JSON丸ごと読む/書く」だけなので、ファイル名をキーに1対1で対応させる。

const DATA_DIR = path.join(process.cwd(), "data");
const REST_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const USE_REMOTE = !!(REST_URL && REST_TOKEN);

const KEY_PREFIX = "shinchoku:";

export function blobBackend(): "redis" | "file" {
  return USE_REMOTE ? "redis" : "file";
}

// name は "store.json" のようなファイル名相当のキー。
export async function readBlobRaw(name: string): Promise<string | null> {
  if (USE_REMOTE) {
    const res = await fetch(`${REST_URL}/get/${KEY_PREFIX}${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${REST_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`blob read ${name}: redis ${res.status}`);
    const body = (await res.json()) as { result: string | null };
    return body.result ?? null;
  }
  try {
    return await fs.readFile(path.join(DATA_DIR, name), "utf8");
  } catch {
    return null;
  }
}

export async function writeBlobRaw(name: string, raw: string): Promise<void> {
  if (USE_REMOTE) {
    const res = await fetch(`${REST_URL}/set/${KEY_PREFIX}${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REST_TOKEN}` },
      body: raw,
    });
    if (!res.ok) throw new Error(`blob write ${name}: redis ${res.status}`);
    return;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, name), raw, "utf8");
}

// JSONとして読み書きする薄いヘルパ。存在しなければ fallback を返す。
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const raw = await readBlobRaw(name);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, data: unknown): Promise<void> {
  await writeBlobRaw(name, JSON.stringify(data, null, 2));
}

// 既存データが無いときだけ初期値を書き込む（seed用）。
export async function ensureJson<T>(name: string, initial: () => T): Promise<void> {
  const raw = await readBlobRaw(name);
  if (raw == null) {
    await writeJson(name, initial());
  }
}
