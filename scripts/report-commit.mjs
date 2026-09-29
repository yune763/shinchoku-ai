#!/usr/bin/env node
// git の post-commit から呼ばれ、直近コミットを進捗管理AIへ送る。
// 失敗してもコミットは止めない（例外は握りつぶす）。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8" }).trim();
}

function readEnvToken() {
  if (process.env.SHINCHOKU_TOKEN) return process.env.SHINCHOKU_TOKEN;
  // プロジェクト直下の .env から API_TOKEN を拾う（あれば）。
  for (const name of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(path.join(process.cwd(), name), "utf8");
      const m = raw.match(/^API_TOKEN=(.+)$/m);
      if (m && m[1].trim()) return m[1].trim();
    } catch {
      // ない場合は無視
    }
  }
  return "";
}

async function main() {
  const url =
    (process.env.SHINCHOKU_URL || "http://localhost:3000").replace(/\/$/, "") +
    "/api/dev/commit";

  const payload = {
    hash: git("rev-parse HEAD"),
    subject: git("log -1 --pretty=%s"),
    body: git("log -1 --pretty=%b"),
    author: git("log -1 --pretty=%an"),
    branch: git("rev-parse --abbrev-ref HEAD"),
    files: git("diff-tree --no-commit-id --name-only -r HEAD")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };

  const headers = { "Content-Type": "application/json" };
  const token = readEnvToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (data.matchedBy === "none") {
    console.log("[進捗管理AI] 作業中ゴール未設定のため未記録（アプリで『作業中にする』を押すか [goal:<id>] を付けてください）");
  } else if (data.matchedGoalId) {
    console.log(
      `[進捗管理AI] コミットを記録しました → ゴール ${data.matchedGoalId}` +
        (data.advancedStep ? `（ステップ「${data.advancedStep}」を完了）` : ""),
    );
  }
}

main().catch(() => {
  // サーバー未起動などは黙って無視（コミットは成功させる）。
  console.log("[進捗管理AI] 記録スキップ（アプリ未起動の可能性）");
});
