#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");

if (!existsSync(cli)) {
  process.stderr.write("dist/cli.js not found — run `npm run build` first\n");
  process.exit(1);
}

const child = spawn(process.execPath, [cli, "setup", ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code, signal) => {
  process.exit(signal !== null ? 1 : (code ?? 1));
});
child.on("error", (err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
