import { test } from "node:test";
import assert from "node:assert/strict";
import { renderGallery } from "../dist/index.js";

const manifest = {
  schema_version: 1,
  created_at: "2026-08-17T10:00:00.000Z",
  task: "hero image for SaaS landing",
  batch_dir: "/tmp/batch",
  jobs: [
    {
      model: "mock/good-model",
      prompt: "a red circle <with> \"quotes\" & ampersand",
      params: { aspect_ratio: "16:9", resolution: "2K", quality: "high", seed: 42 },
      status: "ok",
      files: ["hero-good-model-1.png", "hero-good-model-2.png"],
      cost_usd: 0.04,
      duration_ms: 12345,
      via: "images",
      retries: 0,
    },
    {
      model: "mock/chat-only-model",
      prompt: "a blue square",
      params: {},
      status: "ok",
      files: ["hero-chat-only-model-1.png"],
      cost_usd: 0.02,
      duration_ms: 800,
      via: "chat-fallback",
      retries: 0,
    },
    {
      model: "mock/fail-500-model",
      prompt: "a green triangle",
      params: {},
      status: "failed",
      files: [],
      error: "HTTP 500: Internal provider error",
      code: "HTTP_500",
      retries: 0,
    },
  ],
  totals: { cost_usd: 0.06, images: 3, failed: 1 },
};

test("gallery is self-contained html with theme support", () => {
  const html = renderGallery(manifest);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /prefers-color-scheme: dark/);
  assert.ok(!/<script\s+src=/.test(html), "no external scripts");
  assert.ok(!/<link\s/.test(html), "no external stylesheets");
  assert.ok(!/https?:\/\/[^"]*\.(?:css|js)/.test(html), "no external assets");
});

test("gallery uses relative image sources and captions", () => {
  const html = renderGallery(manifest);
  assert.match(html, /src="hero-good-model-1\.png"/);
  assert.match(html, /src="hero-good-model-2\.png"/);
  assert.ok(!html.includes('src="/'), "no absolute paths in src");
  assert.ok(html.includes("mock/good-model"));
  assert.match(html, /16:9 · 2K · high/);
  assert.match(html, /seed=42/);
  assert.match(html, /\$0\.0400/);
  assert.match(html, /12\.3s/);
});

test("gallery marks chat-fallback and failed jobs", () => {
  const html = renderGallery(manifest);
  assert.match(html, /chat-fallback/);
  assert.match(html, /HTTP_500/);
  assert.match(html, /Internal provider error/);
});

test("gallery escapes html in prompts and has zoom handler", () => {
  const html = renderGallery(manifest);
  assert.ok(html.includes("&lt;with&gt;"));
  assert.ok(!html.includes("<with>"));
  assert.match(html, /zoomImage/);
  assert.match(html, /id="lightbox"/);
});
