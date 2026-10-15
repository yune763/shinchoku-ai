// デスクトップアプリとして起動するElectronメインプロセス。
// Next.js サーバーを自前で起動し、独立ウィンドウで表示する（ブラウザ不要）。
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

// macOS/Linux で Finder などGUIから起動すると、シェルのPATHを引き継がず node/npm が
// 見つからないことがある（サーバーが起動せずタイムアウトする原因）。代表的な場所を補う。
if (process.platform !== "win32") {
  const extra = [
    "/opt/homebrew/bin", // Homebrew (Apple Silicon)
    "/usr/local/bin", // Homebrew (Intel) / Node公式pkg
    path.join(os.homedir(), ".volta", "bin"),
    path.join(os.homedir(), ".npm-global", "bin"),
    path.join(os.homedir(), ".asdf", "shims"), // asdf
    "/opt/local/bin", // MacPorts
  ];
  // nvm 利用時の現行バージョン(~/.nvm/versions/node/*/bin)も拾う。
  try {
    const nvmBase = path.join(os.homedir(), ".nvm", "versions", "node");
    if (fs.existsSync(nvmBase)) {
      for (const v of fs.readdirSync(nvmBase)) {
        extra.push(path.join(nvmBase, v, "bin"));
      }
    }
  } catch {
    /* noop */
  }
  const parts = (process.env.PATH || "").split(":");
  for (const p of extra) if (p && !parts.includes(p)) parts.push(p);
  process.env.PATH = parts.filter(Boolean).join(":");
}

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;
const isDev = process.env.ELECTRON_DEV === "1";

let serverProcess = null;

// 指定URLが応答するまで待つ。
function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http
        .get(url, (res) => {
          res.destroy();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) reject(new Error("server timeout"));
          else setTimeout(tryOnce, 500);
        });
    };
    tryOnce();
  });
}

function startServer() {
  const projectRoot = path.resolve(__dirname, "..");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  // 本番ビルド(.next)があれば start(高速)、無ければ dev(ビルド不要)で起動する。
  const hasBuild = fs.existsSync(path.join(projectRoot, ".next", "BUILD_ID"));
  const script = isDev ? "dev" : hasBuild ? "start" : "dev";
  serverProcess = spawn(npm, ["run", script], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(PORT) },
    // コンソールを出さない（アプリとして起動するため）。
    stdio: "ignore",
    windowsHide: true,
    shell: process.platform === "win32",
  });
  serverProcess.on("exit", (code) => {
    if (code && code !== 0) console.error(`server exited: ${code}`);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "進捗管理AI",
    backgroundColor: "#0f172a",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });

  // 外部リンクは既定ブラウザで開く。
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  try {
    await waitForServer(URL);
    await win.loadURL(`${URL}/goals`);
  } catch {
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<h2 style='font-family:sans-serif'>サーバーの起動に失敗しました。ターミナルのログを確認してください。</h2>",
        ),
    );
  }
}

app.whenReady().then(async () => {
  startServer();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
