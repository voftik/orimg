import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateJobsFile, ValidationError } from "../dist/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

async function fixture(name) {
  return JSON.parse(await readFile(path.join(HERE, "fixtures", name), "utf8"));
}

test("valid jobs file passes and merges defaults", async () => {
  const { task, jobs } = validateJobsFile(await fixture("jobs.valid.json"));
  assert.equal(task, "test batch");
  assert.equal(jobs.length, 4);

  assert.equal(jobs[0].aspect_ratio, "1:1");
  assert.equal(jobs[0].resolution, "1K");
  assert.equal(jobs[0].quality, "medium");
  assert.equal(jobs[0].n, 1);

  assert.equal(jobs[1].n, 2, "per-job n overrides defaults");
  assert.equal(jobs[2].quality, "high", "per-job quality overrides defaults");
  assert.equal(jobs[2].resolution, "2K", "resolution is normalized to upper case");
  assert.equal(jobs[3].seed, 42);
});

test("bad jobs file reports every problem", async () => {
  const input = await fixture("jobs.bad.json");
  assert.throws(
    () => validateJobsFile(input),
    (err) => {
      assert.ok(err instanceof ValidationError);
      assert.match(err.message, /"schema_version" must be 1/);
      assert.match(err.message, /"task" must be a non-empty string/);
      assert.match(err.message, /defaults: "resolution" must be one of/);
      assert.match(err.message, /jobs\[0\]: "model" must be a non-empty string/);
      assert.match(err.message, /jobs\[1\]: "prompt" must be a non-empty string/);
      assert.match(err.message, /jobs\[2\]: "n" must be an integer between 1 and 10/);
      assert.match(err.message, /jobs\[2\]: "quality" must be one of/);
      assert.match(err.message, /jobs\[2\]: "aspect_ratio" must look like/);
      assert.match(err.message, /jobs\[2\]: "output_format" must be one of/);
      assert.match(err.message, /jobs\[2\]: "seed" must be a non-negative integer/);
      return true;
    },
  );
});

test("non-object input and empty jobs are rejected", () => {
  assert.throws(() => validateJobsFile("not an object"), ValidationError);
  assert.throws(() => validateJobsFile(null), ValidationError);
  assert.throws(() => validateJobsFile({ schema_version: 1, jobs: [] }), /"jobs" must be a non-empty array/);
});

test("input_references must be non-empty strings", () => {
  const base = { schema_version: 1, jobs: [{ model: "a/b", prompt: "x", input_references: [""] }] };
  assert.throws(() => validateJobsFile(base), /"input_references"/);
  const ok = validateJobsFile({
    schema_version: 1,
    jobs: [{ model: "a/b", prompt: "x", input_references: ["./ref.png", "https://example.com/i.png"] }],
  });
  assert.deepEqual(ok.jobs[0].input_references, ["./ref.png", "https://example.com/i.png"]);
});

test("same model may repeat with different prompts", () => {
  const { jobs } = validateJobsFile({
    schema_version: 1,
    jobs: [
      { model: "a/b", prompt: "variant one" },
      { model: "a/b", prompt: "variant two" },
    ],
  });
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].model, jobs[1].model);
});
