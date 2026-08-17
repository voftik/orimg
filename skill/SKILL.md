---
name: image-generation
description: Generates production-quality images by writing model-specific prompts and fanning them out in parallel to multiple top AI image models (Seedream, Gemini, GPT Image, Grok) through the orimg OpenRouter CLI, then compares variants, picks or presents the best one, and reports actual cost. Use when a task needs to generate or create an image, picture, illustration, photo, background, banner, poster, icon, logo, avatar, hero image, OG image, social media visual, texture, wallpaper, or placeholder art, and for image editing or image-to-image work with reference images. Handles per-model prompt dialects, aspect ratio / resolution / quality selection, gallery comparison, and autonomous winner selection in non-interactive sessions. REQUIRED for all image generation tasks.
---

# Image Generation (orimg fan-out via OpenRouter)

Generate images by sending a tailored, model-specific prompt to several top image models in parallel, then deliver the best result. The `orimg` CLI handles the OpenRouter API, parallel fan-out, file output, manifest, and comparison gallery. Your job: analyze the task, pick parameters and models, write ONE prompt PER model in its dialect, run the CLI, and deliver the winner.

## Prerequisites

- An OpenRouter API key must be available. `orimg` resolves it from `OPENROUTER_API_KEY` env, `./.env`, or `~/.config/orimg/config.json` — do NOT check the environment yourself; just run the CLI. Only if `orimg` exits with code 3, STOP and ask the user to configure the key. Never invent, guess, or hardcode a key.
- CLI: use `orimg` if it is on PATH, otherwise `npx -y orimg`. When in doubt, run `orimg doctor --json` first.

## Workflow

### 1. Analyze the task
Determine: **subject** (what exactly to depict), **purpose/placement** (hero section, favicon, README, ad, story), and **style**. Infer style from the project — read neighboring CSS / design-token / brand files (colors, fonts, tone) and look at existing images before writing any prompt.

### 2. Pick generation parameters
Choose from this table. Set size ONLY via API parameters — NEVER put dimensions, aspect ratios, or words like "4K/8K" into prompt text.

| Use case | aspect_ratio | resolution | quality |
|---|---|---|---|
| Hero / banner / OG image | 16:9 | 2K | high |
| Icon / logo / avatar | 1:1 | 1K | high |
| Story / reel / phone wallpaper | 9:16 | 2K | high |
| Poster / flyer / portrait card | 3:4 or 2:3 | 2K | high |
| Draft / placeholder / iteration | per target | 1K | medium |

Full parameter and CLI reference: `references/api-parameters.md`.

### 3. Session mode, then models

**On the FIRST image request of an interactive session, ask the user ONE short question** (use your platform's question tool if it has one) and remember the answer as the session mode:

> Generate several variants with different models to compare, or a single image with one model?
> 1. **Compare mode** — fan out to 3–5 top models, you pick the best from a gallery (~$0.3–0.5/batch)
> 2. **Single mode** — one model, one image. Pick the model:
>    - `google/gemini-3-pro-image` (Nano Banana Pro) — best text/infographics, ~$0.13
>    - `bytedance-seed/seedream-5-0-pro` — poster-grade layouts and typography, ~$0.05
>    - `openai/gpt-5.4-image-2` — strictest instruction following, ~$0.05–0.19
>    - `x-ai/grok-imagine-image-2.0` — fast and cheap, social formats, ~$0.04
>    - `google/gemini-3.1-flash-image` (Nano Banana 2) — budget all-rounder, ~$0.07

Do NOT ask when: the session is non-interactive/autonomous (default to compare mode; for drafts — 2 cheap models); the user already said how many variants or named a model; or the session mode was already chosen — **follow the chosen mode for ALL subsequent image requests in the session without re-asking**. Re-ask only if the user explicitly changes their mind or asks for something the mode cannot deliver (e.g. "show me options" while in single mode — confirm switching).

**Mode consequences downstream:**
- *Compare mode* → steps 4–7 as written: per-model prompts, fan-out, gallery, winner selection.
- *Single mode* → ONE job for the chosen model in its dialect; skip the gallery (`--no-gallery`) and the winner-selection scoring — deliver that image directly and report its cost. Variants within single mode = duplicate jobs for the SAME model with prompt variations, only if the user asks.

**Composing the compare-mode set** — default four (current flagships): `bytedance-seed/seedream-5-0-pro` (Seedream 5 Pro), `google/gemini-3-pro-image` (Nano Banana Pro), `openai/gpt-5.4-image-2` (GPT-5.4 Image, full aspect-ratio set), `x-ai/grok-imagine-image-2.0` (Grok Imagine 2). Adjust the set using `references/model-guide.md` — e.g. typography-heavy posters favor Seedream + Gemini Pro; strict multi-object instructions favor the GPT slot; cheap drafts and social formats favor Grok / Gemini Flash. For drafts, 2 cheap models are enough; for a final deliverable keep 3–4. CAUTION: the older `openai/gpt-5-image` accepts only `1:1`/`3:2`/`2:3`/`auto` aspect ratios — for wide/tall formats keep `gpt-5.4-image-2` or `gpt-image-2` in the OpenAI slot. "Seedance" is ByteDance's VIDEO model, not an image model — for images the ByteDance slot is always Seedream.

### 4. Write ONE prompt PER model, in its dialect
First read `references/prompt-principles.md`, then the dialect file for EVERY chosen model (`references/seedream-5-pro.md`, `references/gemini-3-pro-image.md`, `references/gpt-5-image.md`, `references/grok-imagine-2.md`). Never reuse a single universal prompt across models — the dialects differ materially (Seedream wants a long organized narrative, GPT Image wants labeled sections, Grok needs a photo anchor in the first words, Gemini wants Google's narrative templates).

### 4b. Reference images — mandatory whenever the task involves an existing visual
If the task mentions ANY existing image, person, object, product, logo or scene — "remove the background", "the same character in a new scene", "edit this photo", "match our brand/style", "make a variation of this" — you MUST pass the source image(s) via `input_references` instead of describing them in words. Words lose identity; references preserve it.

- Local file → `"input_references": ["./photo.jpg"]` (the CLI base64-encodes it). Remote image → download it first, or pass the direct https URL.
- The subject exists but you don't have the file ("me", "our product", "the hero from our site")? Find it in the project or download it from the site; if you can't — ask the user for the file. Never reconstruct a real subject from imagination.
- Model choice for editing: `gemini-3-pro-image` (14 refs, conversational multi-turn) or `seedream-5-0-pro` (refs as ground truth, visual markup works); `gpt-5.4-image-2` for identity-sensitive edits (16 refs). Grok caps at 3 refs and local edits are weaker.
- Editing prompt pattern (all models): "Change only [X]. Keep everything else exactly the same, preserving [identity/pose/lighting/composition]." Repeat the preserve-list on every iteration; one change per turn.
- Background removal: no model outputs true alpha. Pass the source as a reference and request "change only the background to a solid uniform white/green background, keep the subject pixel-identical", then the user keys/crops it — or use `background: "transparent"` where supported (gpt-image-1 only). Background REPLACEMENT is a normal edit: reference + "change only the background to […]".

### 5. Generate
Write a jobs file and run the CLI:

```json
{
  "schema_version": 1,
  "task": "hero image for SaaS landing",
  "defaults": { "aspect_ratio": "16:9", "resolution": "2K", "quality": "high", "n": 1 },
  "jobs": [
    { "model": "bytedance-seed/seedream-5-0-pro", "prompt": "<Seedream dialect>" },
    { "model": "google/gemini-3-pro-image", "prompt": "<Gemini dialect>" },
    { "model": "openai/gpt-5.4-image-2", "prompt": "<labeled sections>" },
    { "model": "x-ai/grok-imagine-image-2.0", "prompt": "<photo anchor first>" }
  ]
}
```

```bash
orimg generate --jobs jobs.json --out <dir> --json
```

Output lands in the batch directory (default `./ai-images/<timestamp>-<task-slug>/`): PNG files, `manifest.json` (prompts, params, seeds, per-job cost, timings), and `index.html` comparison gallery. The `--json` envelope returns absolute paths to all of these.

### 6. Deliver the result
Follow the decision rule below: either show the gallery and ask, or evaluate and select the winner yourself.

### 7. Report cost
Read actual per-job and total `cost_usd` from the manifest (or the JSON envelope `totals`) and state the real spend in your report. Never estimate when actuals are available.

## Decision: show the user vs. choose yourself

*(Compare mode only. In single mode there is nothing to pick — deliver the image directly.)*

**Show the gallery and ask** when ALL of these hold: the session is interactive, AND the image is itself the deliverable, AND the user gave no instruction to act autonomously. Give the user the gallery path (`index.html`) and per-model file paths, and wait for their pick.

**Choose yourself** when ANY of these hold: the user told you to work autonomously; the image is an intermediate asset in a larger task; the session is headless/non-interactive. To choose:

1. Read each generated image (Read tool on each file).
2. Score each 1–5 on: (a) brief adherence, (b) exact text rendering, (c) composition for the target placement, (d) artifacts/anatomy, (e) style fit.
3. Copy the winner into place: `orimg select <batch-dir> <model-or-filename> --to <dest-path>`.
4. Report in one line which model won and why. On a tie, pick the cheaper one.

When genuinely unsure which mode applies — ask.

## Error handling

- **Partial success** (exit 0 with entries in `failed[]`): continue with the successful images, mention the failures in one line, and do NOT regenerate the successful jobs.
- **Exit 4** (all jobs failed): report the per-model errors from `failed[]`. If all failures are 429 rate limits, wait ~30–60 s and retry the whole batch ONCE. Otherwise fix the reported cause (bad model ID → `orimg models --search <name>`; bad params → adjust jobs file).
- **Repeated `NETWORK` failures** where fast models succeed but slow ones always fail: the user's network path (VPN/proxy) is likely killing long connections (~30 s). Tell the user, and work with the models that get through (or lower resolution/quality for the slow ones). Do not burn retries beyond one extra batch attempt.
- **Exit 3** (auth): ask the user to set `OPENROUTER_API_KEY`. Do not retry, do not fabricate a key.
- **Exit 2** (validation): fix the jobs file per the error message and rerun.

## References

- `references/prompt-principles.md` — cross-model prompt-writing rules for 2026: universal skeleton, narrative over tags, semantic negatives, camera language, editing pattern. Read before writing any prompt.
- `references/model-guide.md` — model selection table: exact OpenRouter IDs, per-image prices, strengths/weaknesses, scenario routing, budget alternatives.
- `references/api-parameters.md` — jobs-file schema, all CLI commands with examples, aspect ratios, resolutions, JSON envelope, exit codes.
- `references/seedream-5-pro.md` — Seedream 5.0 Pro dialect: long organized narrative, layout-aware typography, editing verbs, example prompts.
- `references/gemini-3-pro-image.md` — Gemini 3 Pro Image dialect: Google's narrative templates, semantic negatives, conversational editing, example prompts.
- `references/gpt-5-image.md` — GPT Image dialect (gpt-5-image and gpt-image-2): labeled sections, preserve lists, verbatim text rendering, example prompts.
- `references/grok-imagine-2.md` — Grok Imagine 2.0 dialect: photo anchor against illustration drift, camera language, social formats, example prompts.
