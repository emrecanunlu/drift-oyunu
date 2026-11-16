// Runs before `npm start` and `npm run controller` (prestart / precontroller).
// Fresh clone or package-lock changed after a pull → install dependencies automatically.
// Uses only Node built-ins, so it works before `npm install` has ever run.
import { existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`Node.js ${process.version} eski. 22 veya üstü gerekli: https://nodejs.org`);
  process.exit(1);
}

const lock = join(root, "package-lock.json");
const installed = join(root, "node_modules", ".package-lock.json");
const needsInstall =
  !existsSync(installed) ||
  (existsSync(lock) && statSync(lock).mtimeMs > statSync(installed).mtimeMs);

if (needsInstall) {
  console.log("== Drift: paketler kuruluyor (ilk çalıştırma veya güncelleme) ==");
  execSync("npm install", { cwd: root, stdio: "inherit" });
}
