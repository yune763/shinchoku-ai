#!/usr/bin/env node
// 進捗管理AI の MCP サーバー。
// 他PCの Claude Code / Codex などが、中央の進捗データ（REST API）に
// つないで「現在地の把握・続きからの作業・記録の書き戻し」をできるようにする。
//
// 使い方（接続する側のPC）:
//   環境変数:
//     SHINCHOKU_BASE_URL = http://<ホストIP>:3000   （中央サーバーのURL）
//     SHINCHOKU_TOKEN    = <API_TOKEN>               （認証を有効にしている場合）
//   claude mcp add shinchoku -- node /path/to/mcp/server.mjs
//   （または .mcp.json に登録。README参照）

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.SHINCHOKU_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const TOKEN = process.env.SHINCHOKU_TOKEN || "";

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`API ${res.status} ${path}: ${JSON.stringify(body)}`);
  }
  return body;
}

function jsonContent(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({
  name: "shinchoku-ai",
  version: "1.0.0",
});

// 全体コンテキスト：どこから始めるか（recommendedNext / waitingForHuman）を取得。
server.tool(
  "get_context",
  "進捗管理AIの全体コンテキストを取得する。まずこれを呼び、recommendedNext[0] を対象ゴールに決める。",
  {},
  async () => jsonContent(await api("/api/context")),
);

// ゴール一覧（タイトルとIDの確認用）。
server.tool(
  "list_goals",
  "全ゴールの一覧（id・タイトル・状態・進捗）を取得する。",
  {},
  async () => {
    const { goals } = await api("/api/goals");
    const slim = goals.map((g) => ({
      id: g.id,
      title: g.title,
      status: g.status,
      progress: g.progress,
      parentId: g.parentId,
      assignee: g.assignee,
    }));
    return jsonContent(slim);
  },
);

// ゴール個別コンテキスト＋そのまま従える指示文（prompt）。
server.tool(
  "get_goal",
  "指定ゴールのコンテキスト・ステップ・続きから作業するための指示文(prompt)を取得する。",
  { goalId: z.string().describe("対象ゴールのID") },
  async ({ goalId }) => jsonContent(await api(`/api/goals/${goalId}/context`)),
);

// 作業結果・コメント・成果物を記録する。
server.tool(
  "add_log",
  "ゴールに記録（AI結果・コメント・成果物）を残す。作業を進めたら必ず呼ぶ。",
  {
    goalId: z.string(),
    body: z.string().describe("記録する内容"),
    kind: z
      .enum(["ai_result", "comment", "deliverable"])
      .default("ai_result")
      .describe("記録の種別"),
    author: z.string().default("Claude Code").describe("記録者名"),
  },
  async ({ goalId, body, kind, author }) =>
    jsonContent(
      await api(`/api/goals/${goalId}/logs`, {
        method: "POST",
        body: JSON.stringify({ body, kind, author }),
      }),
    ),
);

// ステップを完了/未完了にする（進捗が自動更新される）。
server.tool(
  "set_step_done",
  "ゴールのステップを完了/未完了にする。進捗は自動再計算される。",
  {
    goalId: z.string(),
    stepId: z.string(),
    done: z.boolean().default(true),
  },
  async ({ goalId, stepId, done }) =>
    jsonContent(
      await api(`/api/goals/${goalId}/steps/${stepId}`, {
        method: "PATCH",
        body: JSON.stringify({ done }),
      }),
    ),
);

// 現状・状態などを更新する。
server.tool(
  "update_goal",
  "ゴールの現状(currentStatus)や状態(status)などを更新する。",
  {
    goalId: z.string(),
    currentStatus: z.string().optional(),
    status: z
      .enum(["not_started", "in_progress", "blocked", "done"])
      .optional(),
    progress: z.number().min(0).max(100).optional(),
  },
  async ({ goalId, ...patch }) => {
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    );
    return jsonContent(
      await api(`/api/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify(clean),
      }),
    );
  },
);

// 作業中ゴールを設定する（以後このゴールにコミットが自動記録される）。
server.tool(
  "set_active_goal",
  "作業中ゴールを設定/解除する。設定すると、以後のgitコミットがこのゴールへ自動記録される。",
  { goalId: z.string().nullable().describe("対象ゴールのID。null で解除") },
  async ({ goalId }) =>
    jsonContent(
      await api(`/api/active`, {
        method: "PUT",
        body: JSON.stringify({ activeGoalId: goalId }),
      }),
    ),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[shinchoku-ai mcp] connected to ${BASE_URL}${TOKEN ? " (token set)" : ""}`);
