import { spawn } from "node:child_process";
import os from "node:os";

// claude CLI(Max定額)を1回呼び、テキスト応答を返す共通ヘルパー。
// 会話/分解など「文章で答えさせたい」用途で使う（ファイル操作は伴わない）。
// プロジェクト直下だと .mcp.json / CLAUDE.md の読み込み・MCP接続で遅くなるため、
// 中立フォルダ(OSのtemp)で実行して起動を速くする。
export function runClaudeText(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const bin = process.env.CLAUDE_BIN || "claude";
    const child = spawn(
      bin,
      ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
      { cwd: os.tmpdir(), shell: true, windowsHide: true, env: process.env },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("応答がタイムアウトしました"));
    }, timeoutMs);

    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (err += c.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) {
        reject(new Error(err.trim() || `claude 終了コード ${code}`));
        return;
      }
      try {
        const j = JSON.parse(out);
        resolve(typeof j.result === "string" ? j.result : out);
      } catch {
        resolve(out);
      }
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}
