// scripts/copy-apps-json.js
import fs from "fs";
import path from "path";

const src = path.resolve("electron/apps.json");
const destDir = path.resolve("dist-electron");
const dest = path.join(destDir, "apps.json");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("apps.json copiado a dist-electron/");
