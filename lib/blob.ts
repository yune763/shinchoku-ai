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

const KEY_PREFIX = "shinchoku:";

export function blobBackend(): "firestore" | "redis" | "file" {
  if (USE_FIRESTORE) return "firestore";
  if (USE_UPSTASH) return "redis";
  return "file";
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
  if (USE_FIRESTORE) {
    const db = await getFirestore();
    const snap = await db.collection(FS_COLLECTION).doc(docId(name)).get();
    if (!snap.exists) return null;
    const data = snap.data() as { raw?: string } | undefined;
    return data?.raw ?? null;
  }
  if (USE_UPSTASH) {
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

// 秘密情報を出さずに保存バックエンドの健全性を返す（/api/health 用）。
export async function diagnose(): Promise<{
  backend: string;
  ok: boolean;
  detail: string;
  projectId?: string;
}> {
  const backend = blobBackend();
  try {
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
      await readBlobRaw("__healthcheck__");
      return { backend, ok: true, detail: "firestore read OK", projectId };
    }
    await readBlobRaw("__healthcheck__");
    return { backend, ok: true, detail: `${backend} read OK` };
  } catch (e) {
    return { backend, ok: false, detail: (e as Error).message };
  }
}
