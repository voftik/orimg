# CLI and Jobs-File Reference

## Jobs file schema

The jobs file is the canonical way to run a fan-out: each model gets its OWN prompt. Pass it via `--jobs <file>` or `--jobs -` (stdin).

```json
{
  "schema_version": 1,
  "task": "hero image for SaaS landing",
  "defaults": { "aspect_ratio": "16:9", "resolution": "2K", "quality": "high", "n": 1 },
  "jobs": [
    { "model": "bytedance-seed/seedream-5-0-pro", "prompt": "<up to 600 words, Seedream dialect>" },
    { "model": "google/gemini-3-pro-image", "prompt": "<Google narrative template>" },
    { "model": "openai/gpt-image-2", "prompt": "SCENE: ...\nSTYLE: ...\nCONSTRAINTS: ...\nPURPOSE: ..." },
    { "model": "x-ai/grok-imagine-image-2.0", "prompt": "Photorealistic photograph of ... shot on 85mm ..." },
    { "model": "google/gemini-3-pro-image", "prompt": "<edit prompt>", "input_references": ["./brand/logo.png"] }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `schema_version` | number | Always `1` |
| `task` | string | Short human description; used for the output dir slug and manifest |
| `defaults` | object | Any job-level field; applied to every job unless overridden |
| `jobs[].model` | string | Exact OpenRouter model ID; the same ID may repeat (prompt variants) |
| `jobs[].prompt` | string | Model-specific prompt in that model's dialect |
| `jobs[].n` | number | 1–10; images per job (many models cap at 1 — duplicate the job instead) |
| `jobs[].aspect_ratio` | string | See list below |
| `jobs[].resolution` | string | `512` \| `1K` \| `2K` \| `4K` (uppercase K) |
| `jobs[].quality` | string | `auto` \| `low` \| `medium` \| `high` |
| `jobs[].output_format` | string | `png` (default) \| `jpeg` \| `webp` \| `svg` |
| `jobs[].background` | string | `auto` \| `transparent` \| `opaque`. Rarely supported — check `orimg models <id>` (as of Aug 2026 the `openai/gpt-image-1` family declares `transparent`) |
| `jobs[].seed` | number | Reproducibility, where supported (Seedream yes; Gemini/Grok no) |
| `jobs[].input_references` | string[] | Local paths or URLs for image-to-image / editing; the CLI base64-encodes local files. Per-model caps: 3–16 |

Per-job fields override `defaults`. Omit fields you do not use — `null` is accepted and treated exactly like an absent field (so `"seed": null` is fine), but plain omission is cleaner. The CLI validates only shapes (types, ranges); per-model parameter support is enforced by the API and reported as an HTTP 400 in `failed[]`. Check `orimg models <model-id>` for the authoritative `supported_parameters` BEFORE building jobs for unfamiliar models.

### Aspect ratios (18 values; support varies per model)

`1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `2:1`, `1:2`, `4:1`, `1:4`, `19.5:9`, `9:19.5`, `20:9`, `9:20` (plus model-specific extremes like `1:8`/`8:1` — any `W:H` value passes the CLI and is validated by the API per model)

- `gemini-3-pro-image` supports the first 10; `gemini-3.1-flash-image` adds extremes `1:4`, `4:1`, `1:8`, `8:1`; Grok adds the phone formats (`19.5:9`, `9:20`, ...); Seedream is the widest (extreme ratios up to 16:1/1:16).
- **OpenAI caveat**: `openai/gpt-5-image` accepts ONLY `1:1`, `3:2`, `2:3`, `auto` — a 16:9 job fails with HTTP 400. For wide/tall formats use `openai/gpt-image-2` (full set incl. `16:9`, `9:16`, `21:9`).
- Never encode the aspect ratio numerically in prompt text (parameters only); compositional wording like "a vertical poster" or "a wide shot" is allowed and useful.

## CLI commands

```bash
# Fan-out from a jobs file (canonical path)
orimg generate --jobs jobs.json --out ./ai-images --json
orimg generate --jobs - --json < jobs.json          # from stdin
# Options: [--gallery|--no-gallery] [--open] [--concurrency 4] [--timeout 180]
#          [--retries 2] [--dry-run] [--strict]

# Quick single-model mode (no jobs file)
orimg generate -m google/gemini-2.5-flash-image -p "a red circle on white background" \
  -n 1 --aspect-ratio 1:1 --resolution 1K --quality medium --json
# Also: [--seed 42] [--ref <url|path>]... (repeatable)

# Model discovery (free, cached 24h)
orimg models --search seedream --json     # filter list
orimg models google/gemini-3-pro-image    # details: supported params, pricing
orimg models --refresh                    # bust the cache

# Copy the winner to its destination (records the choice in the manifest)
orimg select <batch-dir|manifest.json> <model-or-filename> --to ./public/hero.png

# Install/remove the skill into ~/.claude/skills and ~/.agents/skills
orimg setup [--link] [--remove] [--claude-only|--codex-only]

# Diagnose: key present, API reachable, effective config, skill installed
orimg doctor --json
```

- `--dry-run` — validate the jobs file and estimate cost without spending.
- `--strict` — turn PARTIAL success into exit 4: without it, ≥1 successful job exits 0; with it, any failed job fails the run (for CI).

## Output layout

Each run creates a batch directory `./ai-images/<timestamp>-<task-slug>/` (override with `--out`):

- `<slug>-<model-short>-<n>.png` — one file per image, deduplicated names
- `manifest.json` — task, per-job prompt/params/seed/`cost_usd`/duration/paths, totals, and `chosen` after `orimg select`
- `index.html` — self-contained comparison gallery (grid by model, captions with model/params/price); open with `--open` or give the path to the user

## JSON envelope (with `--json` or when stdout is not a TTY)

```json
{
  "schema_version": 1,
  "success": true,
  "data": {
    "batch_dir": "/abs/path/ai-images/20260817-093000-hero-image",
    "manifest": "/abs/path/.../manifest.json",
    "gallery": "/abs/path/.../index.html",
    "images": [
      { "model": "bytedance-seed/seedream-5-0-pro", "path": "/abs/.../hero-seedream-5-0-pro-1.png",
        "cost_usd": 0.045, "duration_ms": 14200, "seed": 42, "via": "images",
        "params": { "aspect_ratio": "16:9", "resolution": "2K", "quality": "high" } }
    ],
    "failed": [
      { "model": "openai/gpt-image-2", "error": "timeout after 180s", "code": "TIMEOUT", "retries": 2 }
    ],
    "totals": { "cost_usd": 0.21, "images": 3, "failed": 1 }
  },
  "error": null
}
```

All paths are absolute. `cost_usd` is the actual billed cost from the API (`usage.cost`), not an estimate.

## Exit codes

| Code | Meaning | Agent action |
|---|---|---|
| 0 | Success — including partial (≥1 image OK, see `failed[]`) | Proceed; mention failures briefly, never regenerate the successful jobs |
| 1 | Unexpected internal error | Inspect stderr/envelope, retry once if transient |
| 2 | Validation error (bad jobs file / params) | Fix the jobs file per the message, rerun |
| 3 | Auth error (missing/invalid `OPENROUTER_API_KEY`) | Stop and ask the user for the key |
| 4 | All jobs failed | Report per-model errors from `failed[]`; if all are 429, wait 30–60 s and retry the batch once |

## Behavior notes

- Timeout per job is 180 s; 429/503/529 (honoring `Retry-After`) and transient network errors are retried up to 2 times.
- A model missing from the images endpoint falls back automatically to the chat-completions API (`"via": "chat-fallback"` in the manifest and envelope). The fallback carries the prompt, `input_references`, `aspect_ratio` and `resolution`; it CANNOT honor `n>1`, `seed`, `quality`, `output_format`, `background` — those are dropped and excluded from the recorded `params`. If the fallback also fails → `INVALID_MODEL`, use `orimg models --search`.
- Billing is all-or-nothing: failed jobs cost $0.
- Concurrency default is 4 parallel requests.
