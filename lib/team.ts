import { promises as fs } from "node:fs";
import path from "node:path";
import { Goal } from "./types";
import { memberConfig, syncEnabled } from "./config";

// 共有フォルダに書き出す1メンバー分のスナップショット。
export interface MemberSnapshot {
  memberId: string;
  memberName: string;
  updatedAt: string;
  goals: Goal[];
}

function membersDir(): string {
  return path.join(memberConfig().syncDir, "members");
}

// 自分の進捗を共有フォルダへ書き出す（同期はOneDrive等が担う）。
// 失敗しても本体の動作は止めない（best-effort）。
export async function exportSnapshot(goals: Goal[]): Promise<void> {
  if (!syncEnabled()) return;
  const { id, name } = memberConfig();
  try {
    const dir = membersDir();
    await fs.mkdir(dir, { recursive: true });
    const snapshot: MemberSnapshot = {
      memberId: id,
      memberName: name,
      updatedAt: new Date().toISOString(),
      goals,
    };
    // 一時ファイル→リネームで壊れたJSONが同期されるのを防ぐ。
    const finalPath = path.join(dir, `${id}.json`);
    const tmpPath = path.join(dir, `.${id}.tmp.json`);
    await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf8");
    await fs.rename(tmpPath, finalPath);
  } catch {
    // 共有フォルダが一時的に使えない等は無視（次回書き込みで復旧）。
  }
}

// 全メンバーのスナップショットを読み込む（自分含む）。
export async function readTeam(): Promise<MemberSnapshot[]> {
  if (!syncEnabled()) return [];
  try {
    const dir = membersDir();
    const files = await fs.readdir(dir);
    const snapshots: MemberSnapshot[] = [];
    for (const f of files) {
      if (!f.endsWith(".json") || f.startsWith(".")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        const snap = JSON.parse(raw) as MemberSnapshot;
        if (snap && Array.isArray(snap.goals)) snapshots.push(snap);
      } catch {
        // 壊れた/書き込み途中のファイルはスキップ。
      }
    }
    snapshots.sort((a, b) => a.memberName.localeCompare(b.memberName));
    return snapshots;
  } catch {
    return [];
  }
}
