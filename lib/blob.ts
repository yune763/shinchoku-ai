import { promises as fs } from "node:fs";
import path from "node:path";

// 保存抽象レイヤー。保存先は環境変数で自動選択する（優先順位: Firestore → Upstash → ローカルファイル）。
// 各ストアは「JSON丸ごと読む/書く」だけなので、ファイル名をキーに1対1で対応させる。
//   - Firestore : FIREBASE_SERVICE_ACCOUNT（サービスアカウント鍵JSONの文字列）があれば使用。
//   - Upstash   : UPSTASH_REDIS_REST_URL / _TOKEN があれば使用。
//   - ファイル  : どちらも無ければ data/<name>（ローカル開発はこれまで通り）。

const DATA_DIR = path.join(process.cwd(), "data");

// ── Upstash (REST) ──
const REST_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const USE_UPSTASH = !!(REST_URL && REST_TOKEN);

// ── Firestore ──
const FIREBASE_SA = process.env.FIREBASE_SERVICE_ACCOUNT || "";
const USE_FIRESTORE = !!FIREBASE_SA;
// 保存先コレクション名（1ドキュメント=1キー、フィールド raw に JSON文字列を入れる）。
const FS_COLLECTION = process.env.FIRESTORE_COLLECTION || "shinchoku";

// ── Turso (libSQL) ──
// 読み取り無料枠が桁違いに大きい。1テーブル kv(key, raw) に JSON文字列を保存する。
const TURSO_URL = (process.env.TURSO_DATABASE_URL || "").trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN || "").trim();
const USE_TURSO = !!(TURSO_URL && TURSO_TOKEN);

const KEY_PREFIX = "shinchoku:";

// ── 読み取りの短時間キャッシュ（全ストア共通） ──
// Firestore/Upstash は読み取りに課金・クォータがあるため、短い間隔での
// 連続読み取り（通知バッジのポーリング、1リクエスト内の複数ストア読み取り等）を
// 同一スナップショットで吸収する。書き込み時は必ず該当キーを無効化する。
const READ_CACHE_TTL_MS = 30000;
const readCache = new Map<string, { raw: string | null; at: number }>();

function getCached(name: string): { raw: string | null } | null {
  const hit = readCache.get(name);
  if (hit && Date.now() - hit.at < READ_CACHE_TTL_MS) return { raw: hit.raw };
  return null;
}
function setCached(name: string, raw: string | null): void {
  readCache.set(name, { raw, at: Date.now() });
}

export function blobBackend(): "turso" | "firestore" | "redis" | "file" {
  if (USE_TURSO) return "turso";
  if (USE_FIRESTORE) return "firestore";
  if (USE_UPSTASH) return "redis";
  return "file";
}

// Turso(libSQL) クライアントは遅延初期化。初回に kv テーブルを用意する。
let tursoClient: import("@libsql/client").Client | null = null;
let tursoReady: Promise<unknown> | null = null;
async function getTurso() {
  if (!tursoClient) {
    const { createClient } = await import("@libsql/client");
    tursoClient = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  }
  if (!tursoReady) {
    tursoReady = tursoClient.execute(
      "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, raw TEXT, updated_at TEXT)",
    );
  }
  await tursoReady;
  return tursoClient;
}

// Firestore クライアントは遅延初期化（使うときだけ firebase-admin を読み込む）。
let firestorePromise: Promise<import("firebase-admin/firestore").Firestore> | null = null;
async function getFirestore() {
  if (!firestorePromise) {
    firestorePromise = (async () => {
      const { getApps, initializeApp, cert } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      if (!getApps().length) {
        const credentials = JSON.parse(FIREBASE_SA) as {
          project_id?: string;
          projectId?: string;
        };
        initializeApp({
          credential: cert(credentials as Parameters<typeof cert>[0]),
          projectId: credentials.project_id || credentials.projectId,
        });
      }
      return getFirestore();
    })();
  }
  return firestorePromise;
}

// Firestore のドキュメントIDに使えない文字（"/"）を避ける。
function docId(name: string): string {
  return name.replace(/\//g, "__");
}

// name は "store.json" のようなファイル名相当のキー。
export async function readBlobRaw(name: string): Promise<string | null> {
  const cached = getCached(name);
  if (cached) return cached.raw;

  let raw: string | null;
  if (USE_TURSO) {
    const db = await getTurso();
    const rs = await db.execute({
      sql: "SELECT raw FROM kv WHERE key = ?",
      args: [name],
    });
    raw = rs.rows.length ? ((rs.rows[0].raw as string | null) ?? null) : null;
  } else if (USE_FIRESTORE) {
    const db = await getFirestore();
    const snap = await db.collection(FS_COLLECTION).doc(docId(name)).get();
    const data = snap.exists
      ? (snap.data() as { raw?: string } | undefined)
      : undefined;
    raw = data?.raw ?? null;
  } else if (USE_UPSTASH) {
    const res = await fetch(`${REST_URL}/get/${KEY_PREFIX}${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${REST_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`blob read ${name}: redis ${res.status}`);
    const body = (await res.json()) as { result: string | null };
    raw = body.result ?? null;
  } else {
    try {
      raw = await fs.readFile(path.join(DATA_DIR, name), "utf8");
    } catch {
      raw = null;
    }
  }
  setCached(name, raw);
  return raw;
}

export async function writeBlobRaw(name: string, raw: string): Promise<void> {
  // 書き込んだ内容を即キャッシュへ反映（直後の読み取りはDBに行かず最新を返す）。
  setCached(name, raw);
  if (USE_TURSO) {
    const db = await getTurso();
    await db.execute({
      sql: "INSERT INTO kv (key, raw, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET raw = excluded.raw, updated_at = excluded.updated_at",
      args: [name, raw, new Date().toISOString()],
    });
    return;
  }
  if (USE_FIRESTORE) {
    const db = await getFirestore();
    // raw は JSON文字列として1フィールドに保存（ネスト配列などFirestoreの型制約を回避）。
    // 注意: Firestoreの1ドキュメント上限は約1MiB。巨大化したらチャンク分割/DB移行を検討。
    await db
      .collection(FS_COLLECTION)
      .doc(docId(name))
      .set({ raw, updatedAt: new Date().toISOString() });
    return;
  }
  if (USE_UPSTASH) {
    const res = await fetch(`${REST_URL}/set/${KEY_PREFIX}${encodeURIComponent(name)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REST_TOKEN}` },
      body: raw,
    });
    if (!res.ok) throw new Error(`blob write ${name}: redis ${res.status}`);
    return;
  }
  const target = path.join(DATA_DIR, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, raw, "utf8");
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

// 秘密情報を出さずに保存バックエンドの健全性を返す（/api/health 用）。
export async function diagnose(): Promise<{
  backend: string;
  ok: boolean;
  detail: string;
  projectId?: string;
}> {
  const backend = blobBackend();
  try {
    // Turso が最優先。実際に使うバックエンドで疎通確認する（Firestoreへの無駄読みを避ける）。
    if (USE_TURSO) {
      await readBlobRaw("healthcheck");
      return { backend, ok: true, detail: "turso read OK" };
    }
    if (USE_FIRESTORE) {
      // JSONとして解釈できるか（最頻出の失敗点）を先に確認。
      let projectId: string | undefined;
      try {
        const parsed = JSON.parse(FIREBASE_SA) as { project_id?: string };
        projectId = parsed.project_id;
      } catch (e) {
        return {
          backend,
          ok: false,
          detail: `FIREBASE_SERVICE_ACCOUNT がJSONとして解釈できません（改行/引用符の混入が疑われます）: ${(e as Error).message}`,
        };
      }
      // 実際にFirestoreへ読みに行く（認証・権限の確認）。
      await readBlobRaw("healthcheck");
      return { backend, ok: true, detail: "firestore read OK", projectId };
    }
    await readBlobRaw("healthcheck");
    return { backend, ok: true, detail: `${backend} read OK` };
  } catch (e) {
    return { backend, ok: false, detail: (e as Error).message };
  }
}
