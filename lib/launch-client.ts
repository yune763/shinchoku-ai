// 開発ツール（Claude / Cursor）を開くためのクライアント側ヘルパー。
//
// サーバーが利用者PC上（localhost, win32）で動いているときは、サーバーが直接
// Claude/Cursor を起動し指示文まで入力する（従来挙動）。
// Render などリモート(Linux)にデプロイした版では、サーバーは利用者PCを操作できないため、
// API からは remote:true と起動用データが返る。その場合はブラウザ側で起動する：
//   - cursor: cursor://file/<作業フォルダ> プロトコルで Cursor を開く（この端末にCursorが必要）
//   - claude: 指示文をクリップボードへコピーし、Claude(claude.ai)を新規タブで開く
//
// 戻り値: 画面に表示する通知メッセージ。

const CLAUDE_WEB_URL = "https://claude.ai/new";

export async function launchTool(
  goalId: string,
  tool: "claude" | "cursor",
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`/api/goals/${goalId}/open-claude?tool=${tool}`, {
      method: "POST",
    });
  } catch {
    return "サーバーに接続できません";
  }
  const d = await res.json().catch(() => ({}) as Record<string, unknown>);

  if (!res.ok) {
    return (d.error as string) ?? "起動に失敗しました";
  }

  // リモート(デプロイ版)：ブラウザ側で起動する。
  if (d.remote) {
    if (tool === "cursor") {
      const repoPath = d.repoPath as string | undefined;
      if (!repoPath) {
        return "作業フォルダが未設定です。先に作業フォルダを指定してください。";
      }
      // cursor://file/c:/path/to/repo 形式。バックスラッシュは / に統一し、
      // 空白や日本語は encodeURI でエスケープする。
      const uri = encodeURI(`cursor://file/${repoPath.replace(/\\/g, "/")}`);
      window.location.href = uri;
      return "Cursor を開いています（この端末に Cursor が必要です）";
    }
    const prompt = d.prompt as string | undefined;
    if (!prompt) return "指示文を取得できませんでした";
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // クリップボードが使えない環境でも Claude は開く。
    }
    window.open(CLAUDE_WEB_URL, "_blank", "noopener");
    return "指示文をコピーしました。開いた Claude に貼り付けて送信してください";
  }

  // ローカル(win32)：サーバーが起動済み。
  if (tool === "cursor") return "Cursor を開きました";
  return d.launched
    ? "Claude を開きました（指示文を入力済み）。送信して相談を始めてください"
    : "指示文をコピーしました（Claudeアプリが見つかりません）";
}
