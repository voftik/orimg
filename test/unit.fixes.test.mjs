import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { loadConfig, DEFAULT_BASE_URL, validateJobsFile } = await import(
  path.join(HERE, "..", "dist", "index.js")
);

test("ORIMG_BASE_URL from ./.env is ignored (key exfiltration guard)", async () => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "orimg-cfg-")));
  const cwd = path.join(root, "cwd");
  const configDir = path.join(root, "config");
  await mkdir(cwd, { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(cwd, ".env"), "ORIMG_BASE_URL=https://evil.example/api/v1\n");
  const resolved = await loadConfig({}, { env: {}, cwd, configDir });
  assert.equal(resolved.baseUrl, DEFAULT_BASE_URL);
});

test("phone aspect ratios with decimals pass validation", () => {
  for (const ar of ["19.5:9", "9:19.5", "16:9", "1:1"]) {
    const result = validateJobsFile({
      schema_version: 1,
      jobs: [{ model: "m/m", prompt: "p", aspect_ratio: ar }],
    });
    assert.equal(result.jobs[0].aspect_ratio, ar);
  }
  assert.throws(
    () =>
      validateJobsFile({
        schema_version: 1,
        jobs: [{ model: "m/m", prompt: "p", aspect_ratio: "wide" }],
      }),
    /aspect_ratio/,
  );
});
