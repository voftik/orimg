import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { estimateJobCostUsd, preflightWarnings } = await import(path.join(HERE, "..", "dist", "index.js"));

const catalog = JSON.parse(await readFile(path.join(HERE, "fixtures", "contract-catalog.json"), "utf8"));
const endpoints = JSON.parse(await readFile(path.join(HERE, "fixtures", "contract-endpoints.json"), "utf8"));

const seedream = endpoints.by_model["bytedance-seed/seedream-5-0-pro"].endpoints;
const geminiPro = endpoints.by_model["google/gemini-3-pro-image"].endpoints;
const geminiFlash = endpoints.by_model["google/gemini-2.5-flash-image"].endpoints;

// Recorded 2026-08-17 from the live OpenRouter API. If these break after a
// fixture refresh, the API contract changed — update the parsers, not the test.
test("contract: catalog models carry no top-level pricing and endpoints is a URL", () => {
  assert.ok(catalog.data.length >= 4);
  for (const model of catalog.data) {
    assert.equal(typeof model.id, "string");
    assert.equal(model.pricing, undefined, `${model.id} grew top-level pricing — parser assumptions changed`);
    assert.match(model.endpoints, /^\/api\/v1\/images\/models\/.+\/endpoints$/);
    assert.ok(model.supported_parameters !== undefined);
  }
});

test("contract: per-image billing estimates match recorded Seedream pricing", () => {
  assert.equal(estimateJobCostUsd({ resolution: "1K" }, seedream), 0.045);
  assert.equal(estimateJobCostUsd({ resolution: "2K" }, seedream), 0.09, "2K is Seedream's top tier -> high_resolution");
  assert.equal(estimateJobCostUsd({ resolution: "1K", input_references: ["a", "b"] }, seedream), 0.045 + 0.006);
});

test("contract: token-billed models return an honest null estimate", () => {
  assert.equal(estimateJobCostUsd({ resolution: "1K" }, geminiPro), null);
  assert.equal(estimateJobCostUsd({}, geminiFlash), null);
});

test("contract: preflight flags parameters the live models do not declare", () => {
  const flashWarnings = preflightWarnings(
    { model: "google/gemini-2.5-flash-image", prompt: "x", resolution: "2K" },
    geminiFlash,
  );
  assert.ok(
    flashWarnings.some((w) => w.includes('"resolution"')),
    `gemini-2.5-flash declares no resolution parameter: ${JSON.stringify(flashWarnings)}`,
  );

  const seedreamWarnings = preflightWarnings(
    { model: "bytedance-seed/seedream-5-0-pro", prompt: "x", resolution: "4K" },
    seedream,
  );
  assert.ok(seedreamWarnings.some((w) => w.includes('"resolution": "4K"')));

  const clean = preflightWarnings(
    { model: "bytedance-seed/seedream-5-0-pro", prompt: "x", resolution: "1K", seed: 42 },
    seedream,
  );
  assert.deepEqual(clean, [], "declared parameters produce no warnings");
});
