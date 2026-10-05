import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export const dynamic = "force-dynamic";

// サーバー(＝このPC)のフォルダを一覧して、作業フォルダをGUIで選べるようにする。
// ローカル運用前提（localhost）。ファイル内容は返さず、ディレクトリ名だけを返す。
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("path");
  const target = raw && raw.trim() ? raw.trim() : os.homedir();

  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "フォルダではありません" }, { status: 400 });
    }
    const entries = await fs.readdir(target, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: path.join(target, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parent = path.dirname(target);
    return NextResponse.json({
      path: target,
      parent: parent && parent !== target ? parent : null,
      home: os.homedir(),
      dirs,
    });
  } catch {
    return NextResponse.json(
      { error: "フォルダを開けません", path: target },
      { status: 400 },
    );
  }
}
