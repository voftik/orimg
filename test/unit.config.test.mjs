import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig, parseDotEnv, maskApiKey, DEFAULT_BASE_URL } from "../dist/index.js";

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "orimg-config-"));
}

test("parseDotEnv handles comments, export, quotes", () => {
  const parsed = parseDotEnv(
    [
      "# a comment",
      "",
      "OPENROUTER_API_KEY=plain-key",
      'QUOTED="with spaces"',
      "SINGLE='single quoted'",
      "export EXPORTED=yes",
      "  SPACED  =  padded  ",
      "INVALID LINE",
      "=nokey",
    ].join("\n"),
  );
  assert.equal(parsed.OPENROUTER_API_KEY, "plain-key");
  assert.equal(parsed.QUOTED, "with spaces");
  assert.equal(parsed.SINGLE, "single quoted");
  assert.equal(parsed.EXPORTED, "yes");
  assert.equal(parsed.SPACED, "padded");
  assert.equal(Object.keys(parsed).length, 5);
});

test("defaults apply when nothing is configured", async () => {
  const cwd = await tempDir();
  const configDir = path.join(await tempDir(), "none");
  const config = await loadConfig({}, { env: {}, cwd, configDir });
  assert.equal(config.apiKey, undefined);
  assert.equal(config.apiKeySource, null);
  assert.equal(config.baseUrl, DEFAULT_BASE_URL);
  assert.equal(config.out, "./ai-images");
  assert.equal(config.concurrency, 4);
  assert.equal(config.timeout, 180);
  assert.equal(config.retries, 2);
});

test("config file is the last step of the cascade (apiKey/outDir/models/timeout/retries)", async () => {
  const cwd = await tempDir();
  const configDir = await tempDir();
  await writeFile(
    path.join(configDir, "config.json"),
    JSON.stringify({
      apiKey: "sk-or-v1-file-key-77b",
      outDir: "./from-config",
      models: ["mock/one", "mock/two"],
      timeout: 60,
      retries: 5,
    }),
  );
  const config = await loadConfig({}, { env: {}, cwd, configDir });
  assert.equal(config.apiKey, "sk-or-v1-file-key-77b");
  assert.equal(config.apiKeySource, "config-file");
  assert.equal(config.out, "./from-config");
  assert.deepEqual(config.models, ["mock/one", "mock/two"]);
  assert.equal(config.timeout, 60);
  assert.equal(config.retries, 5);
});

test(".env overrides config file", async () => {
  const cwd = await tempDir();
  const configDir = await tempDir();
  await writeFile(path.join(configDir, "config.json"), JSON.stringify({ apiKey: "file-key" }));
  await writeFile(path.join(cwd, ".env"), "OPENROUTER_API_KEY=dotenv-key\n");
  const config = await loadConfig({}, { env: {}, cwd, configDir });
  assert.equal(config.apiKey, "dotenv-key");
  assert.equal(config.apiKeySource, "dotenv");
});

test("env overrides .env", async () => {
  const cwd = await tempDir();
  const configDir = await tempDir();
  await writeFile(path.join(cwd, ".env"), "OPENROUTER_API_KEY=dotenv-key\n");
  const config = await loadConfig({}, { env: { OPENROUTER_API_KEY: "env-key" }, cwd, configDir });
  assert.equal(config.apiKey, "env-key");
  assert.equal(config.apiKeySource, "env");
});

test("flags override env", async () => {
  const cwd = await tempDir();
  const configDir = await tempDir();
  const config = await loadConfig(
    { apiKey: "flag-key", timeout: 33 },
    { env: { OPENROUTER_API_KEY: "env-key", ORIMG_TIMEOUT: "99" }, cwd, configDir },
  );
  assert.equal(config.apiKey, "flag-key");
  assert.equal(config.apiKeySource, "flag");
  assert.equal(config.timeout, 33);
});

test("empty env strings are ignored", async () => {
  const cwd = await tempDir();
  const configDir = await tempDir();
  await writeFile(path.join(cwd, ".env"), "OPENROUTER_API_KEY=dotenv-key\n");
  const config = await loadConfig({}, { env: { OPENROUTER_API_KEY: "" }, cwd, configDir });
  assert.equal(config.apiKey, "dotenv-key");
  assert.equal(config.apiKeySource, "dotenv");
});

test("numeric env values are parsed", async () => {
  const cwd = await tempDir();
  const configDir = await tempDir();
  const config = await loadConfig(
    {},
    { env: { ORIMG_CONCURRENCY: "8", ORIMG_TIMEOUT: "45", ORIMG_RETRIES: "0", ORIMG_BASE_URL: "http://127.0.0.1:9/api/v1/" }, cwd, configDir },
  );
  assert.equal(config.concurrency, 8);
  assert.equal(config.timeout, 45);
  assert.equal(config.retries, 0);
  assert.equal(config.baseUrl, "http://127.0.0.1:9/api/v1");
});

test("maskApiKey shows only the tail", () => {
  assert.equal(maskApiKey("sk-or-v1-abcdef77b"), "...77b");
  assert.equal(maskApiKey(undefined), null);
  assert.ok(!String(maskApiKey("sk-or-v1-secret-key")).includes("secret"));
});
