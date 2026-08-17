import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockServer } from "./mock-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CLI = path.join(ROOT, "dist", "cli.js");

async function makeSandbox() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "orimg-a2-")));
  const cwd = path.join(root, "cwd");
  const configDir = path.join(root, "config");
  const cacheDir = path.join(root, "cache");
  const home = path.join(root, "home");
  await mkdir(cwd, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  await mkdir(home, { recursive: true });
  return { root, cwd, configDir, cacheDir, home };
}

function runCli(args, { cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, OPENROUTER_API_KEY: "test-key", ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end();
  });
}

function baseEnv(sandbox, mock) {
  return { ORIMG_BASE_URL: mock.url, ORIMG_CONFIG_DIR: sandbox.configDir, ORIMG_CACHE_DIR: sandbox.cacheDir };
}

async function writeJobs(sandbox, jobs) {
  const file = path.join(sandbox.cwd, "jobs.json");
  await writeFile(file, JSON.stringify({ schema_version: 1, jobs }));
  return file;
}

// Issue #4: C1 control sequences from server error messages must not reach output.
test("server error messages are stripped of C1 control sequences", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const jobs = await writeJobs(sandbox, [{ model: "mock/c1-error-model", prompt: "x" }]);
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--no-gallery"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 4, r.stdout + r.stderr);
    assert.ok(!r.stdout.includes("\u009b") && !r.stderr.includes("\u009b"), "CSI byte must be stripped");
    assert.match(r.stdout + r.stderr, /nope/, "the readable part of the message survives");
  } finally {
    await mock.close();
  }
});

// Issue #6: a body-read timeout after an HTTP retry keeps the real retry count.
test("body-read timeout preserves the accumulated retry count", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const jobs = await writeJobs(sandbox, [{ model: "mock/retry-then-slow-body-model", prompt: "x" }]);
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--no-gallery", "--timeout", "1", "--retries", "1"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 4, r.stdout + r.stderr);
    const envelope = JSON.parse(r.stdout);
    const failedRow = envelope.data?.failed?.[0];
    assert.ok(failedRow, `expected failed[] in ${r.stdout}`);
    assert.equal(failedRow.code, "TIMEOUT");
    assert.equal(failedRow.retries, 1, "the 429 retry before the stalled body must be counted");
  } finally {
    await mock.close();
  }
});

// Issue #18: 503 and 529 are retried per Retry-After and succeed.
test("503 and 529 responses are retried and recorded", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const jobs = await writeJobs(sandbox, [
      { model: "mock/fail-503-once-model", prompt: "a" },
      { model: "mock/fail-529-once-model", prompt: "b" },
    ]);
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--no-gallery"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 0, r.stderr);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.data.failed.length, 0);
    const manifest = JSON.parse(await readFile(envelope.data.manifest, "utf8"));
    assert.equal(manifest.jobs[0].retries, 1);
    assert.equal(manifest.jobs[1].retries, 1);
  } finally {
    await mock.close();
  }
});

// Issue #7: a corrupt manifest entry is a validation error, not an internal crash.
test("select reports corrupt manifest entries as validation errors", async () => {
  const sandbox = await makeSandbox();
  const batch = path.join(sandbox.cwd, "batch");
  await mkdir(batch, { recursive: true });
  await writeFile(
    path.join(batch, "manifest.json"),
    JSON.stringify({
      schema_version: 1,
      task: "t",
      batch_dir: batch,
      jobs: [{ model: "mock/good-model", prompt: "p", status: "ok", files: "not-an-array" }, null, 42],
    }),
  );
  const r = await runCli(["select", batch, "good", "--to", path.join(sandbox.cwd, "out.png"), "--json"], {
    cwd: sandbox.cwd,
  });
  assert.equal(r.code, 2, `expected validation error, got ${r.code}: ${r.stdout} ${r.stderr}`);
  assert.match(r.stderr, /VALIDATION/);
});

// Issue #8: the conventional --help form works on every subcommand.
test("subcommands accept --help and -h with exit 0", async () => {
  const sandbox = await makeSandbox();
  for (const args of [["generate", "--help"], ["models", "-h"], ["select", "--help"], ["setup", "--help"], ["doctor", "-h"]]) {
    const r = await runCli(args, { cwd: sandbox.cwd });
    assert.equal(r.code, 0, `${args.join(" ")} exited ${r.code}`);
    assert.match(r.stdout, /orimg (generate|models|select|setup|doctor)/);
  }
});

// Issue #18: setup installs the bundled skill into both agent directories (sandboxed HOME).
test("setup --yes installs and --remove uninstalls the skill in a sandbox HOME", async () => {
  const sandbox = await makeSandbox();
  const env = { HOME: sandbox.home };
  const r = await runCli(["setup", "--yes", "--json"], { cwd: sandbox.cwd, env });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  const claudeSkill = path.join(sandbox.home, ".claude", "skills", "image-generation", "SKILL.md");
  const codexSkill = path.join(sandbox.home, ".agents", "skills", "image-generation", "SKILL.md");
  const content = await readFile(claudeSkill, "utf8");
  assert.match(content, /<!-- orimg-skill v\d+\.\d+\.\d+ -->/, "version marker appended");
  await stat(codexSkill);

  const r2 = await runCli(["setup", "--yes", "--json"], { cwd: sandbox.cwd, env });
  const envelope2 = JSON.parse(r2.stdout);
  assert.ok(envelope2.data.targets.every((t) => t.action === "up-to-date"), "second run is idempotent");

  const r3 = await runCli(["setup", "--remove", "--json"], { cwd: sandbox.cwd, env });
  assert.equal(r3.code, 0, r3.stderr);
  await assert.rejects(stat(claudeSkill));
});

// Issue #18: the publishable tarball must contain the CLI, the full skill, license and docs.
test("npm pack tarball contains every file the package promises", async () => {
  const r = await new Promise((resolve, reject) => {
    const child = spawn("npm", ["pack", "--dry-run", "--json"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
  });
  assert.equal(r.code, 0);
  const [report] = JSON.parse(r.stdout);
  const files = report.files.map((f) => f.path);
  for (const required of [
    "dist/cli.js",
    "dist/index.js",
    "skill/SKILL.md",
    "skill/references/prompt-principles.md",
    "skill/references/model-guide.md",
    "skill/references/api-parameters.md",
    "skill/references/seedream-5-pro.md",
    "skill/references/gemini-3-pro-image.md",
    "skill/references/gpt-5-image.md",
    "skill/references/grok-imagine-2.md",
    "LICENSE",
    "README.md",
    "package.json",
  ]) {
    assert.ok(files.includes(required), `tarball is missing ${required}`);
  }
});
