import { existsSync, mkdirSync, rmSync, cpSync } from "node:fs";
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

run("npm", ["run", "prepare:ocr"]);
run("npm", ["run", "build"]);

rmSync(packageDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(packageDir, { recursive: true });

cpSync(resolve(root, "dist"), packageDir, { recursive: true });
cpSync(resolve(root, "LOCAL_RUN_README.txt"), resolve(packageDir, "LOCAL_RUN_README.txt"));

if (!existsSync(resolve(packageDir, "index.html"))) {
  throw new Error("Local package is missing index.html");
}

run("zip", ["-r", "privacyblur-local.zip", "privacyblur-local"], {
  cwd: releaseDir,
});

console.log(`Local package created: ${zipPath}`);
