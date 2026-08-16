import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { saveConfigPatch, configFilePath } = await import(path.join(HERE, "..", "dist", "index.js"));

test("saveConfigPatch creates config with 600 perms and merges patches", async () => {
  const dir = await realpath(await mkdtemp(path.join(os.tmpdir(), "orimg-wiz-")));
  const env = { ORIMG_CONFIG_DIR: dir };

  const file = await saveConfigPatch({ apiKey: "sk-or-test" }, env);
  assert.equal(file, configFilePath(env));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { apiKey: "sk-or-test" });

  await saveConfigPatch({ models: ["a/b", "c/d"] }, env);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { apiKey: "sk-or-test", models: ["a/b", "c/d"] });

  await saveConfigPatch({ models: undefined }, env);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { apiKey: "sk-or-test" });
});
