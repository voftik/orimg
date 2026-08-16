// Real-API smoke test (~$0.04). Run explicitly with: SMOKE=1 node test/smoke.real.mjs
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.SMOKE !== "1") {
  process.stdout.write("SMOKE=1 not set — skipping real-API smoke test\n");
  process.exit(0);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "dist", "cli.js");

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const result = await runCli([
  "generate",
  "-m",
  "google/gemini-2.5-flash-image",
  "-p",
  "a red circle on a white background",
  "--resolution",
  "1K",
  "--task",
  "smoke test",
  "--json",
]);

if (result.code !== 0) {
  process.stderr.write(`smoke FAILED: exit ${result.code}\n${result.stdout}\n${result.stderr}\n`);
  process.exit(1);
}

const envelope = JSON.parse(result.stdout);
const image = envelope.data.images[0];
if (image === undefined) {
  process.stderr.write("smoke FAILED: no image in envelope\n");
  process.exit(1);
}

const buf = await readFile(image.path);
const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
if (!isPng) {
  process.stderr.write(`smoke FAILED: ${image.path} is not a PNG\n`);
  process.exit(1);
}

const manifest = JSON.parse(await readFile(envelope.data.manifest, "utf8"));
const cost = manifest.totals.cost_usd;

process.stdout.write(`smoke OK: ${image.path} (${buf.length} bytes, cost $${cost})\n`);
process.stdout.write(`gallery: ${envelope.data.gallery}\n`);
