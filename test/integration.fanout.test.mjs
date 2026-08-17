import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockServer } from "./mock-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "dist", "cli.js");

async function makeSandbox() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "orimg-it-")));
  const cwd = path.join(root, "cwd");
  const configDir = path.join(root, "config");
  const cacheDir = path.join(root, "cache");
  await mkdir(cwd, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
  return { root, cwd, configDir, cacheDir };
}

function runCli(args, { cwd, env = {}, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        OPENROUTER_API_KEY: "test-key",
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

function baseEnv(sandbox, mock) {
  return {
    ORIMG_BASE_URL: mock.url,
    ORIMG_CONFIG_DIR: sandbox.configDir,
    ORIMG_CACHE_DIR: sandbox.cacheDir,
  };
}

async function writeJobs(sandbox, jobs, extra = {}) {
  const file = path.join(sandbox.cwd, "jobs.json");
  await writeFile(file, JSON.stringify({ schema_version: 1, task: "test batch", ...extra, jobs }));
  return file;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test("happy path: 4 jobs fan out, files + manifest + gallery, exit 0", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(
      sandbox,
      [
        { model: "mock/good-model", prompt: "a red circle" },
        { model: "mock/good-model-b", prompt: "a blue square", n: 2 },
        { model: "mock/good-model", prompt: "a green triangle" },
        { model: "mock/good-model-b", prompt: "a yellow star", seed: 7 },
      ],
      { defaults: { aspect_ratio: "1:1", resolution: "1K", n: 1 } },
    );

    const result = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });

    assert.equal(result.code, 0, result.stderr);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.schema_version, 1);
    assert.equal(envelope.success, true);
    assert.equal(envelope.error, null);

    const { data } = envelope;
    assert.equal(data.totals.images, 5);
    assert.equal(data.totals.failed, 0);
    assert.ok(Math.abs(data.totals.cost_usd - 0.16) < 1e-9);
    assert.equal(data.images.length, 5);
    assert.ok(data.batch_dir.startsWith(path.join(sandbox.cwd, "ai-images")));
    assert.match(path.basename(data.batch_dir), /^\d{8}-\d{6}-test-batch$/);

    for (const image of data.images) {
      assert.ok(path.isAbsolute(image.path), "image paths are absolute");
      const buf = await readFile(image.path);
      assert.deepEqual(buf.subarray(0, 4), PNG_MAGIC);
    }

    const dedupNames = data.images.map((i) => path.basename(i.path));
    assert.equal(new Set(dedupNames).size, 5, "file names are unique");
    assert.ok(dedupNames.includes("test-batch-good-model-1.png"));
    assert.ok(dedupNames.includes("test-batch-good-model-1-2.png"), "duplicate model gets -2 suffix");

    assert.ok(await exists(data.manifest));
    const manifest = JSON.parse(await readFile(data.manifest, "utf8"));
    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.task, "test batch");
    assert.equal(manifest.jobs.length, 4);
    assert.ok(manifest.jobs.every((j) => j.status === "ok" && j.via === "images"));

    assert.ok(await exists(data.gallery));
    const gallery = await readFile(data.gallery, "utf8");
    assert.ok(gallery.includes("mock/good-model"));
    assert.ok(gallery.includes("test-batch-good-model-1.png"));
  } finally {
    await mock.close();
  }
});

test("partial failure: 1 of 4 fails, exit 0, failed[1], gallery from 3", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [
      { model: "mock/good-model", prompt: "a red circle" },
      { model: "mock/fail-500-model", prompt: "a broken one" },
      { model: "mock/good-model-b", prompt: "a blue square" },
      { model: "mock/good-model", prompt: "a green triangle" },
    ]);

    const result = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });

    assert.equal(result.code, 0, result.stderr);
    const { data, success } = JSON.parse(result.stdout);
    assert.equal(success, true);
    assert.equal(data.totals.images, 3);
    assert.equal(data.failed.length, 1);
    assert.equal(data.failed[0].model, "mock/fail-500-model");
    assert.equal(data.failed[0].code, "HTTP_500");
    assert.equal(data.failed[0].retries, 0, "500 is not retried");

    const gallery = await readFile(data.gallery, "utf8");
    assert.equal((gallery.match(/<img src="test-batch/g) ?? []).length, 3);
    assert.ok(gallery.includes("HTTP_500"));
  } finally {
    await mock.close();
  }
});

test("strict mode turns partial success into exit 4", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [
      { model: "mock/good-model", prompt: "a red circle" },
      { model: "mock/fail-500-model", prompt: "a broken one" },
    ]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json", "--strict"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 4);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.success, true, "images were still produced");
    assert.equal(envelope.data.totals.images, 1);
  } finally {
    await mock.close();
  }
});

test("all jobs fail: exit 4, envelope success=false with per-model errors", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [
      { model: "mock/fail-500-model", prompt: "a broken one" },
      { model: "mock/always-429-model", prompt: "a throttled one" },
    ]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json", "--retries", "2"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 4);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.success, false);
    assert.equal(envelope.error.code, "ALL_FAILED");
    assert.equal(envelope.data.failed.length, 2);

    const throttled = envelope.data.failed.find((f) => f.model === "mock/always-429-model");
    assert.equal(throttled.code, "HTTP_429");
    assert.equal(throttled.retries, 2, "429 was retried up to --retries");
    assert.equal(mock.state.attempts.get("mock/always-429-model"), 3, "1 attempt + 2 retries");
  } finally {
    await mock.close();
  }
});

test("429 with Retry-After is retried and then succeeds", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [{ model: "mock/rate-limit-model", prompt: "eventually fine" }]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 0, result.stderr);
    const { data } = JSON.parse(result.stdout);
    assert.equal(data.totals.images, 1);
    assert.equal(data.failed.length, 0);
    assert.equal(mock.state.attempts.get("mock/rate-limit-model"), 2, "first attempt 429, second succeeds");

    const manifest = JSON.parse(await readFile(data.manifest, "utf8"));
    assert.equal(manifest.jobs[0].retries, 1);
  } finally {
    await mock.close();
  }
});

test("model missing from /images falls back to chat/completions", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [{ model: "mock/not-in-images-model", prompt: "via chat" }]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 0, result.stderr);
    const { data } = JSON.parse(result.stdout);
    assert.equal(data.totals.images, 1);

    const manifest = JSON.parse(await readFile(data.manifest, "utf8"));
    assert.equal(manifest.jobs[0].via, "chat-fallback");

    const routes = mock.state.requests.map((r) => r.route);
    assert.ok(routes.includes("POST /api/v1/images"));
    assert.ok(routes.includes("POST /api/v1/chat/completions"));

    const buf = await readFile(data.images[0].path);
    assert.deepEqual(buf.subarray(0, 4), PNG_MAGIC);
  } finally {
    await mock.close();
  }
});

test("model unknown everywhere fails with INVALID_MODEL and a hint", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [{ model: "mock/invalid-model", prompt: "nowhere" }]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 4);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.data.failed[0].code, "INVALID_MODEL");
    assert.match(envelope.data.failed[0].error, /orimg models --search/);
  } finally {
    await mock.close();
  }
});

test("missing API key exits 3 before any fan-out request", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [{ model: "mock/good-model", prompt: "a red circle" }]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: { ...baseEnv(sandbox, mock), OPENROUTER_API_KEY: "" },
    });
    assert.equal(result.code, 3);
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.success, false);
    assert.equal(envelope.error.code, "AUTH");
    assert.equal(mock.state.requests.length, 0, "no requests were made");
  } finally {
    await mock.close();
  }
});

test("invalid jobs file exits 2 with validation details", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = path.join(sandbox.cwd, "bad.json");
    await writeFile(jobsFile, JSON.stringify({ schema_version: 1, jobs: [{ model: "a/b" }] }));
    const result = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 2);
    const envelope = JSON.parse(result.stderr);
    assert.equal(envelope.error.code, "VALIDATION");
    assert.match(envelope.error.message, /"prompt" must be a non-empty string/);
    assert.equal(mock.state.requests.length, 0);
  } finally {
    await mock.close();
  }
});

test("dry run validates, estimates cost from models cache, generates nothing", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [
      { model: "mock/good-model", prompt: "a red circle", n: 2 },
      { model: "mock/good-model-b", prompt: "a blue square" },
      { model: "mock/unpriced-model", prompt: "no price known" },
    ]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json", "--dry-run"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 0, result.stderr);
    const { data } = JSON.parse(result.stdout);
    assert.equal(data.dry_run, true);
    assert.equal(data.totals.images, 4);
    assert.ok(Math.abs(data.totals.estimated_cost_usd - 0.11) < 1e-9, "0.04*2 + 0.03");
    assert.equal(data.totals.estimate_complete, false, "unpriced model has null estimate");
    assert.equal(data.jobs[2].estimated_cost_usd, null);

    const generation = mock.state.requests.filter((r) => r.route === "POST /api/v1/images");
    assert.equal(generation.length, 0, "no images were generated");
  } finally {
    await mock.close();
  }
});

test("jobs from stdin with '-' work", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const result = await runCli(["generate", "--jobs", "-", "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
      input: JSON.stringify({
        schema_version: 1,
        task: "stdin batch",
        jobs: [{ model: "mock/good-model", prompt: "from stdin" }],
      }),
    });
    assert.equal(result.code, 0, result.stderr);
    const { data } = JSON.parse(result.stdout);
    assert.equal(data.totals.images, 1);
  } finally {
    await mock.close();
  }
});

test("quick mode -m/-p with input reference encodes local file as data url", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const refPath = path.join(sandbox.cwd, "ref.png");
    await writeFile(refPath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

    const result = await runCli(
      ["generate", "-m", "mock/good-model", "-p", "an edit of the reference", "--ref", "ref.png", "--ref", "https://example.com/other.png", "--json"],
      { cwd: sandbox.cwd, env: baseEnv(sandbox, mock) },
    );
    assert.equal(result.code, 0, result.stderr);

    const imageRequest = mock.state.requests.find((r) => r.route === "POST /api/v1/images");
    assert.equal(imageRequest.body.input_references[0].type, "image_url");
    assert.ok(
      imageRequest.body.input_references[0].image_url.url.startsWith("data:image/png;base64,"),
      "local path becomes data url",
    );
    assert.equal(imageRequest.body.input_references[1].image_url.url, "https://example.com/other.png", "http url passes through");

    const manifest = JSON.parse(await readFile(JSON.parse(result.stdout).data.manifest, "utf8"));
    assert.deepEqual(
      manifest.jobs[0].params.input_references,
      ["ref.png", "https://example.com/other.png"],
      "manifest keeps original refs, not base64",
    );
  } finally {
    await mock.close();
  }
});

test("select copies the chosen image and records it in the manifest", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [
      { model: "mock/good-model", prompt: "a red circle" },
      { model: "mock/good-model-b", prompt: "a blue square" },
    ]);
    const genResult = await runCli(["generate", "--jobs", jobsFile, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    const { data } = JSON.parse(genResult.stdout);

    const dest = path.join(sandbox.cwd, "public", "hero.png");
    const selectResult = await runCli(["select", data.batch_dir, "good-model-b", "--to", dest, "--json"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(selectResult.code, 0, selectResult.stderr);
    const selection = JSON.parse(selectResult.stdout);
    assert.equal(selection.data.model, "mock/good-model-b");
    assert.equal(selection.data.to, dest);
    assert.ok(await exists(dest));

    const manifest = JSON.parse(await readFile(data.manifest, "utf8"));
    assert.equal(manifest.chosen.to, dest);
    assert.equal(manifest.chosen.file, path.basename(selection.data.from));
  } finally {
    await mock.close();
  }
});

test("models command lists, searches and caches", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const env = baseEnv(sandbox, mock);
    const first = await runCli(["models", "--json"], { cwd: sandbox.cwd, env });
    assert.equal(first.code, 0, first.stderr);
    const firstData = JSON.parse(first.stdout).data;
    assert.equal(firstData.source, "api");
    assert.equal(firstData.count, 5);

    const second = await runCli(["models", "--search", "good", "--json"], { cwd: sandbox.cwd, env });
    const secondData = JSON.parse(second.stdout).data;
    assert.equal(secondData.source, "cache", "second call hits 24h cache");
    assert.equal(secondData.count, 2);

    const modelCalls = mock.state.requests.filter((r) => r.route === "GET /api/v1/images/models");
    assert.equal(modelCalls.length, 1);

    const detail = await runCli(["models", "mock/good-model", "--json"], { cwd: sandbox.cwd, env });
    assert.equal(JSON.parse(detail.stdout).data.model.id, "mock/good-model");

    const missing = await runCli(["models", "mock/nope", "--json"], { cwd: sandbox.cwd, env });
    assert.equal(missing.code, 2);
    assert.match(JSON.parse(missing.stderr).error.message, /--search/);
  } finally {
    await mock.close();
  }
});

test("--no-gallery skips gallery generation", async () => {
  const sandbox = await makeSandbox();
  const mock = await startMockServer();
  try {
    const jobsFile = await writeJobs(sandbox, [{ model: "mock/good-model", prompt: "a red circle" }]);
    const result = await runCli(["generate", "--jobs", jobsFile, "--json", "--no-gallery"], {
      cwd: sandbox.cwd,
      env: baseEnv(sandbox, mock),
    });
    assert.equal(result.code, 0);
    const { data } = JSON.parse(result.stdout);
    assert.equal(data.gallery, null);
    assert.ok(!(await exists(path.join(data.batch_dir, "index.html"))));
  } finally {
    await mock.close();
  }
});
