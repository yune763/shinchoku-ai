// デスクトップアプリとして起動するElectronメインプロセス。
// Next.js サーバーを自前で起動し、独立ウィンドウで表示する（ブラウザ不要）。
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;
const isDev = process.env.ELECTRON_DEV === "1";

let serverProcess = null;

// 指定URLが応答するまで待つ。
function waitForServer(url, timeoutMs = 60000) {
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
  // 既に起動済みなら再利用。
  const projectRoot = path.resolve(__dirname, "..");
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const script = isDev ? "dev" : "start";
  serverProcess = spawn(npm, ["run", script], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "inherit",
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
      "data:text/html," +
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
