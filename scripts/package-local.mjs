import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, cpSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = resolve(root, "release");
const packageDir = resolve(releaseDir, "privacyblur-local");
const zipPath = resolve(releaseDir, "privacyblur-local.zip");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

run("npm", ["run", "build"]);

rmSync(packageDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(packageDir, { recursive: true });

cpSync(resolve(root, "dist"), packageDir, { recursive: true });
cpSync(resolve(root, "LOCAL_RUN_README.txt"), resolve(packageDir, "LOCAL_RUN_README.txt"));
inlineAppEntry();
writeFileSync(resolve(packageDir, "Start-PrivacyBlur.command"), createMacLauncher(), "utf8");
writeFileSync(resolve(packageDir, "Start-PrivacyBlur.bat"), createWindowsLauncher(), "utf8");
chmodSync(resolve(packageDir, "Start-PrivacyBlur.command"), 0o755);

if (!existsSync(resolve(packageDir, "index.html"))) {
  throw new Error("Local package is missing index.html");
}

run("zip", ["-r", "privacyblur-local.zip", "privacyblur-local", "-x", "*/.DS_Store"], {
  cwd: releaseDir,
});

console.log(`Local package created: ${zipPath}`);

function inlineAppEntry() {
  const htmlPath = resolve(packageDir, "index.html");
  const html = readFileSync(htmlPath, "utf8");
  const cssMatch = html.match(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/);
  const jsMatch = html.match(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/);
  if (!cssMatch || !jsMatch) throw new Error("Could not locate built assets to inline");

  const css = readFileSync(resolve(packageDir, cssMatch[1]), "utf8");
  const js = readFileSync(resolve(packageDir, jsMatch[1]), "utf8");
  const inlined = html
    .replace(cssMatch[0], `<style>${css}</style>`)
    .replace(jsMatch[0], "")
    .replace("</body>", `    <script>${js}</script>\n  </body>`);

  writeFileSync(htmlPath, inlined, "utf8");
  rmSync(resolve(packageDir, "assets"), { recursive: true, force: true });
}

function createMacLauncher() {
  return `#!/bin/zsh
cd "$(dirname "$0")"
PORT=8765
URL="http://127.0.0.1:$PORT/"
echo "正在启动 PrivacyBlur 本地版..."
echo "如果浏览器没有自动打开，请访问: $URL"
python3 -m http.server "$PORT" >/tmp/privacyblur-local.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM
sleep 1
open "$URL"
echo "本地服务运行中。关闭此窗口会停止 PrivacyBlur 本地版。"
wait $SERVER_PID
`;
}

function createWindowsLauncher() {
  return `@echo off
cd /d "%~dp0"
set PORT=8765
set URL=http://127.0.0.1:%PORT%/
echo 正在启动 PrivacyBlur 本地版...
echo 如果浏览器没有自动打开，请访问: %URL%
start "" "%URL%"
py -m http.server %PORT%
if errorlevel 1 python -m http.server %PORT%
pause
`;
}
