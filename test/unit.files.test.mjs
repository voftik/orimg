import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, modelShort, uniqueName, timestampSlug, extForMediaType } from "../dist/index.js";

test("slugify produces url-safe slugs", () => {
  assert.equal(slugify("Hero image for SaaS landing!"), "hero-image-for-saas-landing");
  assert.equal(slugify("  A   red circle  "), "a-red-circle");
  assert.equal(slugify("Café über Zürich"), "cafe-uber-zurich");
  assert.equal(slugify(""), "image");
  assert.equal(slugify("!!!"), "image");
});

test("slugify truncates long input without trailing dash", () => {
  const slug = slugify("a".repeat(30) + " " + "b".repeat(30));
  assert.ok(slug.length <= 40);
  assert.ok(!slug.endsWith("-"));
});

test("modelShort strips vendor and normalizes separators", () => {
  assert.equal(modelShort("bytedance-seed/seedream-5-0-pro"), "seedream-5-0-pro");
  assert.equal(modelShort("google/gemini-3-pro-image"), "gemini-3-pro-image");
  assert.equal(modelShort("openai/gpt-5-image"), "gpt-5-image");
  assert.equal(modelShort("x-ai/grok-imagine-image-2.0"), "grok-imagine-image-2-0");
  assert.equal(modelShort("no-vendor-model"), "no-vendor-model");
});

test("uniqueName deduplicates with -2/-3 suffixes", () => {
  const used = new Set();
  assert.equal(uniqueName(used, "task-model-1", "png"), "task-model-1.png");
  assert.equal(uniqueName(used, "task-model-1", "png"), "task-model-1-2.png");
  assert.equal(uniqueName(used, "task-model-1", "png"), "task-model-1-3.png");
  assert.equal(uniqueName(used, "task-model-2", "png"), "task-model-2.png");
});

test("timestampSlug matches yyyymmdd-hhmmss", () => {
  assert.match(timestampSlug(new Date(2026, 7, 17, 9, 5, 3)), /^20260817-090503$/);
  assert.match(timestampSlug(), /^\d{8}-\d{6}$/);
});

test("extForMediaType maps media types", () => {
  assert.equal(extForMediaType("image/png"), "png");
  assert.equal(extForMediaType("image/jpeg"), "jpg");
  assert.equal(extForMediaType("image/webp"), "webp");
  assert.equal(extForMediaType("image/svg+xml"), "svg");
  assert.equal(extForMediaType(undefined, "webp"), "webp");
  assert.equal(extForMediaType("application/octet-stream"), "png");
});
