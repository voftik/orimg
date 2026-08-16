import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockServer, PX_B64 } from "./mock-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "dist", "cli.js");

async function makeSandbox() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "orimg-fix-")));
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

test("transient network reset is retried and succeeds", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    const jobs = path.join(sandbox.cwd, "jobs.json");
    await writeFile(
      jobs,
      JSON.stringify({
        schema_version: 1,
        task: "reset retry",
        jobs: [{ model: "mock/reset-once-model", prompt: "x" }],
      }),
    );
    const r = await runCli(["generate", "--jobs", jobs, "--json", "--no-gallery"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(r.code, 0, r.stderr);
    const envelope = JSON.parse(r.stdout);
    assert.equal(envelope.data.images.length, 1);
    assert.equal(envelope.data.failed.length, 0);
    const manifest = JSON.parse(await readFile(envelope.data.manifest, "utf8"));
    assert.equal(manifest.jobs[0].retries, 1);
  } finally {
    await mock.close();
  }
});

test("chat fallback carries refs and image_config, drops unsupported params from record", async () => {
  const mock = await startMockServer();
  const sandbox = await makeSandbox();
  try {
    await writeFile(path.join(sandbox.cwd, "ref.png"), Buffer.from(PX_B64, "base64"));
    const jobs = path.join(sandbox.cwd, "jobs.json");
    await writeFile(
      jobs,
      JSON.stringify({
        schema_version: 1,
        task: "fallback params",
        jobs: [
          {
            model: "mock/chat-only-model",
            prompt: "edit it",
            aspect_ratio: "16:9",
            resolution: "2K",
            quality: "high",
            input_references: ["./ref.png"],
          },
        ],
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
    assert.equal(image.params.aspect_ratio, "16:9");
    assert.equal(image.params.quality, undefined);

    const chatReq = mock.state.requests.find((q) => q.route === "POST /api/v1/chat/completions");
    assert.ok(chatReq, "chat completions request was made");
    assert.equal(chatReq.body.image_config.aspect_ratio, "16:9");
    assert.equal(chatReq.body.image_config.image_size, "2K");
    const content = chatReq.body.messages[0].content;
    assert.ok(Array.isArray(content), "content is multimodal");
    assert.equal(content[0].type, "text");
    assert.equal(content[1].type, "image_url");
    assert.match(content[1].image_url.url, /^data:image\/png;base64,/);
  } finally {
    await mock.close();
  }
});

test("select refuses manifest entries that escape the batch directory", async () => {
  const sandbox = await makeSandbox();
  const batch = path.join(sandbox.cwd, "batch");
  await mkdir(batch, { recursive: true });
  await writeFile(path.join(sandbox.root, "evil.png"), Buffer.from(PX_B64, "base64"));
  await writeFile(
    path.join(batch, "manifest.json"),
    JSON.stringify({
      schema_version: 1,
      task: "t",
      batch_dir: batch,
      created: new Date().toISOString(),
      jobs: [
        {
          model: "mock/good-model",
          prompt: "p",
          params: {},
          status: "ok",
          files: ["../../evil.png"],
          cost_usd: 0,
          duration_ms: 1,
          via: "images",
          retries: 0,
        },
      ],
      totals: { cost_usd: 0, images: 1, failed: 0 },
    }),
  );
  const dest = path.join(sandbox.cwd, "out.png");
  const r = await runCli(["select", batch, "mock/good-model", "--to", dest, "--json"], { cwd: sandbox.cwd });
  assert.equal(r.code, 2, `expected validation failure, got ${r.code}: ${r.stdout} ${r.stderr}`);
  assert.match(r.stderr, /outside the batch directory/);
});
