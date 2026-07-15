const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const http = require("node:http");

let mainWindow;
let serverProcess;
let localAppOrigin;
let serverReady = false;
let startupFailureShown = false;
let isQuitting = false;
let startupTimer;
const serverLogTail = [];
const STARTUP_TIMEOUT_MS = 45000;
const HEALTH_TIMEOUT_MS = 2500;
const HEALTH_POLL_MS = 500;
const HEALTH_READY_TIMEOUT_MS = 15000;

function appendServerLog(stream, chunk) {
  const redacted = chunk
    .toString()
    .replace(
      /\b(password|passphrase|api[-_\s]?key|token|secret|cookie|authorization)\s*[:=]\s*\S+/gi,
      "$1=[redacted]"
    )
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of redacted) {
    serverLogTail.push(`[${stream}] ${line.slice(0, 500)}`);
  }
  while (serverLogTail.length > 20) {
    serverLogTail.shift();
  }
}

function recentServerLogs() {
  return serverLogTail.length > 0
    ? `\n\nRecent server output:\n${serverLogTail.join("\n")}`
    : "";
}

function showStartupFailure(title, message) {
  if (startupFailureShown || isQuitting) return;
  startupFailureShown = true;
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = undefined;
  }
  dialog.showErrorBox(title, `${message}${recentServerLogs()}`);
}

function requestHealth(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Health check returned HTTP ${response.statusCode}`));
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed?.ok === true);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.setTimeout(HEALTH_TIMEOUT_MS, () => {
      request.destroy(new Error("Health check timed out"));
    });
    request.on("error", reject);
  });
}

async function waitForHealth(origin) {
  const healthUrl = `${origin.replace(/\/$/, "")}/api/health`;
  const deadline = Date.now() + HEALTH_READY_TIMEOUT_MS;
  let lastError;

  while (Date.now() < deadline) {
    try {
      if (await requestHealth(healthUrl)) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, HEALTH_POLL_MS));
  }

  throw lastError || new Error("Health check did not become ready");
}

function ensureDesktopSecrets(userDataPath) {
  const secretsPath = path.join(userDataPath, "secrets.json");
  if (fs.existsSync(secretsPath)) {
    return JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
  }

  const secrets = {
    jwtSecret: crypto.randomBytes(32).toString("base64url"),
    credentialEncryptionKey: crypto.randomBytes(32).toString("base64url"),
  };
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), "utf-8");
  return secrets;
}

function createWindow() {
  const iconPath = path.join(app.getAppPath(), "desktop", "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    title: "Nationale Hulpgids Reach-Out",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (localAppOrigin && !url.startsWith(localAppOrigin)) {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(
    "data:text/html;charset=utf-8,<body style='font-family:Segoe UI, sans-serif;display:grid;place-items:center;height:100vh;margin:0'><main><h2>Starting Nationale Hulpgids Reach-Out...</h2><p>The local app server is preparing your dashboard.</p></main></body>"
  );
}

function startServer() {
  const appPath = app.getAppPath();
  const userDataPath = app.getPath("userData");
  const secrets = ensureDesktopSecrets(userDataPath);
  const serverPath = path.join(appPath, "dist", "index.js");
  const publicDir = path.join(appPath, "dist", "public");

  if (!fs.existsSync(serverPath) || !fs.existsSync(publicDir)) {
    dialog.showErrorBox(
      "Build missing",
      "The application files are missing. Please run the Windows installer build again."
    );
    app.quit();
    return;
  }

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: appPath,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      LOCAL_DESKTOP_MODE: "1",
      PORT: process.env.PORT || "39410",
      HOST: "127.0.0.1",
      PUBLIC_DIR: publicDir,
      LOCAL_DATA_DIR: userDataPath,
      JWT_SECRET: process.env.JWT_SECRET || secrets.jwtSecret,
      CREDENTIAL_ENCRYPTION_KEY:
        process.env.CREDENTIAL_ENCRYPTION_KEY ||
        secrets.credentialEncryptionKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", chunk => {
    appendServerLog("stdout", chunk);
    const output = chunk.toString();
    const match = output.match(/Server running on (http:\/\/[^\s]+)/);
    if (match?.[1] && mainWindow) {
      localAppOrigin = new URL(match[1]).origin;
      waitForHealth(localAppOrigin)
        .then(() => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          serverReady = true;
          if (startupTimer) {
            clearTimeout(startupTimer);
            startupTimer = undefined;
          }
          mainWindow.loadURL(match[1]);
        })
        .catch(error => {
          showStartupFailure(
            "App server not ready",
            `The local app server started but did not pass its health check: ${error.message}. Restart the application to try again.`
          );
          app.quit();
        });
    }
  });

  serverProcess.stderr.on("data", chunk => {
    appendServerLog("stderr", chunk);
    console.error(chunk.toString());
  });

  serverProcess.on("exit", code => {
    if (isQuitting) return;
    if (!serverReady) {
      showStartupFailure(
        "App server failed to start",
        `The local app server exited before the dashboard was ready (exit code ${code ?? "unknown"}). Restart the application to try again.`
      );
      app.quit();
      return;
    }
    if (code !== 0 && mainWindow) {
      showStartupFailure(
        "App server stopped",
        "The local app server stopped unexpectedly. Restart the application to try again."
      );
    }
  });

  startupTimer = setTimeout(() => {
    showStartupFailure(
      "App server startup timed out",
      "The local app server did not become ready in time. Restart the application to try again."
    );
    app.quit();
  }, STARTUP_TIMEOUT_MS);
}

app.whenReady().then(() => {
  app.on("web-contents-created", (_event, contents) => {
    contents.session.setPermissionRequestHandler(
      (_webContents, _permission, callback) => {
        callback(false);
      }
    );
  });

  createWindow();
  startServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = undefined;
  }
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
