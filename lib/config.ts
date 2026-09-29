// メンバー（このPC）とチーム共有の設定。環境変数から読む。
// 共有は「共有フォルダ同期方式」：各PCが自分のスナップショットを
// TEAM_SYNC_DIR に書き出し、全員がそれを読み合う（サーバー・API送信なし）。
export interface MemberConfig {
  id: string; // このPC/メンバーの一意ID（英数・ハイフン推奨）
  name: string; // 表示名
  syncDir: string; // 共有フォルダ（OneDrive/Dropbox/Git等の同期フォルダ）。未設定なら単独動作。
}

export function memberConfig(): MemberConfig {
  return {
    id: (process.env.MEMBER_ID || "local").trim(),
    name: (process.env.MEMBER_NAME || "自分").trim(),
    syncDir: (process.env.TEAM_SYNC_DIR || "").trim(),
  };
}

export function syncEnabled(): boolean {
  return memberConfig().syncDir.length > 0;
}
