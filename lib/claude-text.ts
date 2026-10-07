import { spawn } from "node:child_process";
import os from "node:os";

// claude CLI(Max定額)を1回呼び、テキスト応答を返す共通ヘルパー。
// 会話/分解など「文章で答えさせたい」用途で使う（ファイル操作は伴わない）。
//
// 実行環境で自動フォールバック：
//   - ローカル(Max定額)   : claude CLI を spawn（コスト0・既定）
//   - デプロイ(Render等)   : CLI が無いので Anthropic API(従量)にフォールバック
//     （ANTHROPIC_API_KEY が設定されている場合のみ）
// これにより、Cursor/手入力の作業ログからの進捗算出などがデプロイ版でも動く。
const API_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const ANTHROPIC_VERSION = "2023-06-01";

export async function runClaudeText(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  try {
    return await runViaCli(prompt, opts);
  } catch (cliErr) {
    // CLI が使えない（デプロイ環境など）ときは API にフォールバック。
    if (process.env.ANTHROPIC_API_KEY) {
      return await runViaApi(prompt, opts);
    }
    throw cliErr;
  }
}

function runViaCli(
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

// Anthropic Messages API を1回叩いてテキストを返す（デプロイ環境向けフォールバック）。
async function runViaApi(
  prompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: API_MODEL,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    // text ブロックを連結して返す。
    return (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("")
      .trim();
  } finally {
    clearTimeout(timer);
  }
}
