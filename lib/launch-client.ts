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
  tool: "claude" | "cursor" | "chatgpt",
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

  // ChatGPT：アプリ（無ければブラウザ）を開き、相談文を入力欄へ。
  if (tool === "chatgpt") {
    const prompt = d.prompt as string | undefined;
    // リモート：サーバーが開けないので、ブラウザをこちらで開き相談文をコピー＆表示。
    if (d.remote) {
      const url = (d.url as string) || "https://chatgpt.com/";
      if (prompt) {
        try {
          await navigator.clipboard.writeText(prompt);
        } catch {
          /* モーダルから手動コピーできる */
        }
      }
      window.open(url, "_blank", "noopener");
      return {
        message:
          "ChatGPT をブラウザで開きました。相談文をコピー済みです。入力欄に貼り付けて送信してください。",
        prompt,
      };
    }
    // ローカル(Windows)：アプリに自動入力できたか、ブラウザを開いたか。
    if (d.mode === "app") {
      return {
        message:
          "ChatGPT アプリの新規チャットに相談文を入力しました。内容を確認して送信してください。",
      };
    }
    if (d.mode === "browser") {
      return {
        message:
          "ChatGPT をブラウザで開き、新規チャットの入力欄に相談文を入れました。内容を確認して送信してください。（入っていなければ Ctrl+V で貼り付け）",
        prompt,
      };
    }
    // Mac：アクセシビリティ未許可で自動入力できなかった。設定を開いて案内。
    if (d.mode === "denied") {
      return {
        message:
          "自動入力には『アクセシビリティ』の許可が必要です。開いた設定で、進捗管理AI（またはElectron）をオンにしてから、もう一度押してください。相談文はクリップボードにあります（⌘Vで貼り付け可）。",
        prompt,
      };
    }
    // 失敗時：相談文をモーダルで表示して手動で進められるように。
    return {
      message: "ChatGPT を開けませんでした。相談文を表示します。",
      prompt,
    };
  }

  // Claude（相談）：
  //  - 自動入力できた(launched) → Claudeアプリの入力欄に直接入っているのでモーダルは出さない。
  //  - 自動入力できない(Macで未許可/アプリ無し等) → 相談文をモーダル表示してコピーできるようにする。
  const prompt = d.prompt as string | undefined;
  if (d.launched) {
    return {
      message:
        "Claude（デスクトップ）の入力欄に相談文を入れました。内容を確認して送信してください。",
    };
  }
  // 自動入力できなかった場合はクリップボードにもコピーしておく（モーダルでも手動コピー可）。
  if (prompt) {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      /* モーダルから手動コピーできる */
    }
  }
  return {
    message: "相談文を表示しました。コピーして貼り付けてください。",
    prompt,
  };
}
