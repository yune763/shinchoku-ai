// 開発ツール（Claude / Cursor）を開くためのクライアント側ヘルパー。
//
// サーバーが利用者PC上（localhost, win32）で動いているときは、サーバーが直接
// Claude/Cursor を起動し指示文まで入力する（従来挙動）。
// Render などリモート(Linux)にデプロイした版では、サーバーは利用者PCを操作できないため、
// API からは remote:true と起動用データが返る。その場合はブラウザ側で起動する：
//   - cursor: cursor://file/<作業フォルダ> プロトコルで Cursor を開く（この端末にCursorが必要）
//   - claude: 指示文をクリップボードへコピーし、Claude(claude.ai)を新規タブで開く
//
// 戻り値: 画面に表示する通知メッセージ。claude の相談文は prompt にも返す
// （環境に左右されず、呼び出し側でモーダル表示＆コピーできるようにするため）。
export interface LaunchResult {
  message: string;
  prompt?: string;
}

export async function launchTool(
  goalId: string,
  tool: "claude" | "cursor",
): Promise<LaunchResult> {
  let res: Response;
  try {
    res = await fetch(`/api/goals/${goalId}/open-claude?tool=${tool}`, {
      method: "POST",
    });
  } catch {
    return { message: "サーバーに接続できません" };
  }
  const d = await res.json().catch(() => ({}) as Record<string, unknown>);

  if (!res.ok) {
    return { message: (d.error as string) ?? "起動に失敗しました" };
  }

  // Cursor：起動のみ（相談文なし）。
  if (tool === "cursor") {
    if (d.remote) {
      const repoPath = d.repoPath as string | undefined;
      if (!repoPath) {
        return { message: "作業フォルダが未設定です。先に作業フォルダを指定してください。" };
      }
      const uri = encodeURI(`cursor://file/${repoPath.replace(/\\/g, "/")}`);
      window.location.href = uri;
      return { message: "Cursor を開いています（この端末に Cursor が必要です）" };
    }
    return { message: "Cursor を開きました" };
  }

  // Claude（相談）：相談文を必ず返す。クリップボードにもコピーしておく（任意）。
  const prompt = d.prompt as string | undefined;
  if (prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      /* コピー不可でもモーダルから手動コピーできる */
    }
  }
  const message = d.launched
    ? "Claude（デスクトップ）に入力しました。下の相談文はコピーにも使えます。"
    : "相談文を表示しました。コピーして Claude / Claude Code / Cursor に貼り付けてください。";
  return { message, prompt };
}
