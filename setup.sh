#!/bin/bash
# 進捗管理AI — メンバー用 自動セットアップ (macOS)
# 使い方(メンバー): ターミナルを開いて次の1行を実行するだけ。
#   curl -fsSL https://raw.githubusercontent.com/yune763/shinchoku-ai/main/setup.sh | bash
#
# この1本で以下をまとめて行う:
#   1. 必要ソフト（Homebrew / Node.js / Git / Claude CLI）の用意
#   2. 本体の取得(git clone)と依存インストール(npm install)
#   3. 共有DB(Firestore)接続設定(.env)の作成
#   4. デスクトップに「進捗管理AIを起動 / 更新」ランチャーを作成

set -e

REPO_URL="https://github.com/yune763/shinchoku-ai.git"
INSTALL_DIR="$HOME/shinchoku-ai"
DESKTOP="$HOME/Desktop"

say()  { printf "\n==> %s\n" "$1"; }
ok()   { printf "    [OK] %s\n" "$1"; }
warn() { printf "    [!] %s\n" "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

echo "============================================="
echo "  進捗管理AI メンバー用セットアップ (macOS)"
echo "============================================="

# 1) 必要ソフト -------------------------------------------------
# Homebrew（Node導入に使用）
if ! have brew; then
  say "Homebrew をインストールします（パスワードを求められたら入力）..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" < /dev/tty
  # Apple Silicon / Intel の両対応で brew をパスに通す
  if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
  if [ -x /usr/local/bin/brew ]; then eval "$(/usr/local/bin/brew shellenv)"; fi
else
  ok "Homebrew は既にあります"
fi

# Git（通常は標準で入っている）
if ! have git; then
  say "Git をインストールします..."
  brew install git
else
  ok "Git は既にあります"
fi

# Node.js
if ! have node; then
  say "Node.js をインストールします..."
  brew install node
else
  ok "Node.js は既にあります"
fi

# Claude CLI
if have claude; then
  ok "Claude CLI は既にあります"
else
  say "Claude CLI をインストールします..."
  npm install -g "@anthropic-ai/claude-code" || warn "Claude CLI の導入に失敗しました（後で再実行してください）"
fi

# 2) 本体の取得 -------------------------------------------------
if [ -d "$INSTALL_DIR/.git" ]; then
  say "既存のインストールを更新します ($INSTALL_DIR)"
  git -C "$INSTALL_DIR" pull --ff-only
else
  say "進捗管理AIを取得します -> $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

say "依存パッケージをインストールします（少し時間がかかります）..."
( cd "$INSTALL_DIR" && npm install )
ok "本体の準備ができました"

# 連携（MCP登録＋フック）を自動設定：Claude Code / Cursor から作業ログを自動反映できるようにする。
say "Claude Code / Cursor 連携を設定します..."
( cd "$INSTALL_DIR" && node scripts/setup-integration.mjs --base "http://localhost:3000" ) || warn "連携設定でエラー（後で手動実行可）"

# 3) 接続設定(.env) --------------------------------------------
ENV_FILE="$INSTALL_DIR/.env"
if [ -f "$ENV_FILE" ]; then
  ok ".env は既にあります（設定は変更しません）"
else
  say "共有データベース(Firestore)の接続設定を作成します"
  echo "    管理者から受け取った『FIREBASE_SERVICE_ACCOUNT』の値（1行のJSON）を貼り付けてEnter。"
  echo "    まだ無ければ空のままEnter（後で .env に設定できます）。"
  printf "FIREBASE_SERVICE_ACCOUNT: "
  read -r FB < /dev/tty || FB=""
  {
    echo "# 共有データベース(Firestore)。全メンバーで同じ値にすると情報が共有されます。"
    echo "FIREBASE_SERVICE_ACCOUNT=$FB"
    echo "FIRESTORE_COLLECTION=shinchoku"
  } > "$ENV_FILE"
  if [ -z "$FB" ]; then
    warn ".env を作成しました（Firebaseキーは未設定）。後で設定してください: $ENV_FILE"
  else
    ok ".env を作成しました（共有DBに接続します）"
  fi
fi

# 4) 起動 / 更新ランチャー -------------------------------------
say "デスクトップにランチャーを作成します"
START="$DESKTOP/進捗管理AIを起動.command"
UPDATE="$DESKTOP/進捗管理AIを更新.command"

cat > "$START" <<EOF
#!/bin/bash
cd "$INSTALL_DIR"
( sleep 6; open http://localhost:3000 ) &
npm run dev
EOF
chmod +x "$START"

cat > "$UPDATE" <<EOF
#!/bin/bash
cd "$INSTALL_DIR"
echo "進捗管理AI を更新しています..."
git pull --ff-only && npm install
echo "更新が完了しました。ウィンドウを閉じて、起動し直してください。"
read -r -p "Enterで閉じる..." _
EOF
chmod +x "$UPDATE"
ok "デスクトップに『進捗管理AIを起動』『進捗管理AIを更新』を作成しました"

echo ""
echo "============================================="
echo "  セットアップ完了！"
echo "============================================="
echo "次の手順:"
echo "  1) 初回のみ Claude にログイン（Maxプラン）: ターミナルで  claude  と入力し指示に従う"
echo "  2) デスクトップの『進捗管理AIを起動.command』をダブルクリック"
echo "     （初回は右クリック→『開く』で実行許可が必要な場合があります）"
echo "  3) ブラウザで http://localhost:3000 が開きます"
echo ""
echo "インストール先: $INSTALL_DIR"
