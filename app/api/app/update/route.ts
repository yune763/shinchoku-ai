import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// ローカル起動版で、git pull により本体を最新へ更新する。
// デプロイ(Render等)やgitチェックアウトでない環境では無効。
export async function POST() {
  const cwd = process.cwd();

  // デプロイ環境では無効化（Render は RENDER 環境変数を持つ）。
  if (process.env.RENDER) {
    return NextResponse.json(
      { error: "デプロイ版では更新できません（ローカル起動版で使用してください）" },
      { status: 400 },
    );
  }
  if (!existsSync(path.join(cwd, ".git"))) {
    return NextResponse.json(
      { error: "gitで取得した本体ではないため更新できません" },
      { status: 400 },
    );
  }

  const out = await run("git pull --ff-only", cwd).catch((e) => ({
    error: e instanceof Error ? e.message : "git pull に失敗しました",
  }));
  if ("error" in out) {
    return NextResponse.json({ error: out.error }, { status: 500 });
  }

  const text = `${out.stdout}\n${out.stderr}`;
  const alreadyLatest = /Already up to date|最新です/i.test(out.stdout);
  // package.json / lock が変わったなら依存の再インストールが必要。
  const needInstall = /package(-lock)?\.json|pnpm-lock|yarn\.lock/i.test(text);

  return NextResponse.json({ ok: true, alreadyLatest, needInstall });
}

function run(
  cmd: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: 120_000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
