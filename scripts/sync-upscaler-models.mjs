/**
 * Copy ESRGAN-slim TF.js weights into public/ for same-origin loading under CSP.
 * Run after upgrading @upscalerjs/esrgan-slim.
 */
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "node_modules/@upscalerjs/esrgan-slim/models");
const destRoot = join(root, "public/models/esrgan-slim");

for (const scale of ["x2", "x4"]) {
  const from = join(srcRoot, scale);
  const to = join(destRoot, scale);
  mkdirSync(to, { recursive: true });
  cpSync(join(from, "model.json"), join(to, "model.json"));
  cpSync(join(from, "group1-shard1of1.bin"), join(to, "group1-shard1of1.bin"));
  console.log("synced", scale);
}
