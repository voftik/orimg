import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockServer, PX_B64 } from "./mock-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "dist", "cli.js");

async function makeSandbox() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "orimg-a1-")));
  const cwd = path.join(root, "cwd");
  const configDir = path.join(root, "config");
  const cacheDir = path.join(root, "cache");
  await mkdir(cwd, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  return { root, cwd, configDir, cacheDir };
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

// Issue #3: symlink inside the batch must not smuggle files from outside.
test("select refuses a symlink that resolves outside the batch directory", async () => {
  const sandbox = await makeSandbox();
  const batch = path.join(sandbox.cwd, "batch");
  await mkdir(batch, { recursive: true });
  await writeFile(path.join(sandbox.root, "outside.txt"), "outside-sentinel");
  await symlink(path.join("..", "..", "outside.txt"), path.join(batch, "inside.png"));
  await writeFile(
    path.join(batch, "manifest.json"),
    JSON.stringify({
      schema_version: 1,
      task: "t",
      batch_dir: batch,
      jobs: [
        {
          model: "mock/good-model",
          prompt: "p",
          params: {},
          status: "ok",
          files: ["inside.png"],
          cost_usd: 0,
          duration_ms: 1,
          via: "images",
          retries: 0,
        },
      ],
    }),
  );
  const dest = path.join(sandbox.cwd, "copied.txt");
  const r = await runCli(["select", batch, "inside.png", "--to", dest, "--json"], { cwd: sandbox.cwd });
  assert.equal(r.code, 2, `expected validation failure, got ${r.code}: ${r.stdout} ${r.stderr}`);
  assert.match(r.stderr, /outside the batch directory/);
});

// Issue #5: seed must not be recorded when the chat fallback (which cannot send it) served the job.
test("chat fallback does not record an unapplied seed in manifest or envelope", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const jobs = path.join(sandbox.cwd, "jobs.json");
    await writeFile(
      jobs,
      JSON.stringify({
        schema_version: 1,
        task: "seed honesty",
        jobs: [{ model: "mock/chat-only-model", prompt: "x", seed: 42, aspect_ratio: "16:9" }],
      }),
    );
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--no-gallery"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 0, r.stderr);
    const envelope = JSON.parse(r.stdout);
    const image = envelope.data.images[0];
    assert.equal(image.via, "chat-fallback");
    assert.equal(image.seed, undefined, "envelope must not claim an unapplied seed");
    assert.equal(image.params.seed, undefined);
    const manifest = JSON.parse(await readFile(envelope.data.manifest, "utf8"));
    assert.equal(manifest.jobs[0].seed, undefined, "manifest must not claim an unapplied seed");
  } finally {
    await mock.close();
  }
});

// Issue #5 control: the images endpoint still records the seed it actually sent.
test("images endpoint keeps recording the applied seed", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const jobs = path.join(sandbox.cwd, "jobs.json");
    await writeFile(
      jobs,
      JSON.stringify({ schema_version: 1, jobs: [{ model: "mock/good-model", prompt: "x", seed: 7 }] }),
    );
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--no-gallery"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 0, r.stderr);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.data.images[0].seed, 7);
  } finally {
    await mock.close();
  }
});

// Issue #1: doctor must verify the key and fail on rejection or unreachable API.
test("doctor verifies the key against /key and exits 0 when healthy", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const r = await runCli(["doctor", "--json"], { cwd: sandbox.cwd, env: baseEnv(sandbox, mock) });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.success, true);
    assert.equal(envelope.data.api_key.valid, true);
  } finally {
    await mock.close();
  }
});

test("doctor exits 3 and reports invalid when the API rejects the key", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const r = await runCli(["doctor", "--json"], {
      cwd: sandbox.cwd,
      env: { ...baseEnv(sandbox, mock), OPENROUTER_API_KEY: "bad-key" },
    });
    assert.equal(r.code, 3, r.stdout + r.stderr);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.success, false);
    assert.equal(envelope.data.api_key.valid, false);
  } finally {
    await mock.close();
  }
});

test("doctor exits non-zero when the API is unreachable", async () => {
  const sandbox = await makeSandbox();
  const r = await runCli(["doctor", "--json"], {
    cwd: sandbox.cwd,
    env: {
      ORIMG_BASE_URL: "http://127.0.0.1:9",
      ORIMG_CONFIG_DIR: sandbox.configDir,
      ORIMG_CACHE_DIR: sandbox.cacheDir,
    },
  });
  assert.equal(r.code, 1, r.stdout + r.stderr);
  const envelope = JSON.parse(r.stdout);
  assert.equal(envelope.success, false);
  assert.equal(envelope.data.api.reachable, false);
});

// Issue #2: dry-run estimates from per-endpoint pricing, including refs and high-res variants.
test("dry-run estimates cost from per-endpoint pricing records", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    await writeFile(path.join(sandbox.cwd, "ref.png"), Buffer.from(PX_B64, "base64"));
    const jobs = path.join(sandbox.cwd, "jobs.json");
    await writeFile(
      jobs,
      JSON.stringify({
        schema_version: 1,
        jobs: [
          { model: "mock/good-model", prompt: "a", input_references: ["./ref.png"] },
          { model: "mock/good-model", prompt: "b", resolution: "2K" },
          { model: "mock/unpriced-model", prompt: "c" },
        ],
      }),
    );
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--dry-run"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 0, r.stderr);
    const { data } = JSON.parse(r.stdout);
    assert.equal(data.jobs[0].estimated_cost_usd, 0.043, "base 0.04 + one input ref 0.003");
    assert.equal(data.jobs[1].estimated_cost_usd, 0.08, "2K hits the high_resolution variant (top tier)");
    assert.equal(data.jobs[2].estimated_cost_usd, null);
    assert.equal(data.totals.estimate_complete, false);
    const generation = mock.state.requests.filter((q) => q.route === "POST /api/v1/images");
    assert.equal(generation.length, 0);
  } finally {
    await mock.close();
  }
});

// Issue #9: parameters outside the model's declared support surface as warnings before spending.
test("dry-run warns about parameters the model does not support", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const jobs = path.join(sandbox.cwd, "jobs.json");
    await writeFile(
      jobs,
      JSON.stringify({
        schema_version: 1,
        jobs: [{ model: "mock/good-model", prompt: "a", resolution: "4K", n: 4, aspect_ratio: "21:9" }],
      }),
    );
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--dry-run"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 0, r.stderr);
    const { data } = JSON.parse(r.stdout);
    const warnings = data.jobs[0].warnings.join("\n");
    assert.match(warnings, /"resolution": "4K" is not in/);
    assert.match(warnings, /"aspect_ratio": "21:9" is not in/);
    assert.equal(data.totals.warnings >= 2, true);
  } finally {
    await mock.close();
  }
});

// Issue #9: unknown job fields must fail validation instead of vanishing silently.
test("unknown job fields are a validation error, not silently dropped", async () => {
  const sandbox = await makeSandbox();
  const jobs = path.join(sandbox.cwd, "jobs.json");
  await writeFile(
    jobs,
    JSON.stringify({
      schema_version: 1,
      jobs: [{ model: "mock/good-model", prompt: "a", thinking_level: "high", web_search: true }],
    }),
  );
  const r = await runCli(["generate", "--jobs", jobs, "--json", "--dry-run"], { cwd: sandbox.cwd });
  assert.equal(r.code, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /unknown field \\?"thinking_level\\?"/);
  assert.match(r.stderr, /unknown field \\?"web_search\\?"/);
});
