# Model Selection Guide

Exact OpenRouter model IDs, prices, and routing rules. Prices are approximate per image (real cost is always in the manifest `cost_usd`, taken from the API's `usage.cost`).

## Default fan-out four

| Model ID | ~$/image | Strengths | Weaknesses | Pick when |
|---|---|---|---|---|
| `bytedance-seed/seedream-5-0-pro` | ~$0.045 | Layout-aware posters/grids, typography in 14 languages, reference/face consistency, engineered-imperfection realism, cheap | Overloaded multi-object scenes, tiny dense text, skin oversmoothing without anti-gloss cues | Posters, typography, brand layouts, photoreal portraits, anything reference-driven |
| `google/gemini-3-pro-image` | ~$0.13 (1K/2K), ~$0.24 (4K) | Best-in-class text rendering and infographics, world knowledge, multi-turn conversational editing, up to 14 refs, 4K | Complex typography may need iterations; thinking adds latency (interim thought images are free, only the final frame is billed); mandatory SynthID watermark | Infographics, diagrams, text-heavy designs, edits over several turns, real-world knowledge scenes |
| `openai/gpt-5.4-image-2` | ~$0.05–0.19 (token-billed) | Newest GPT-5-family hybrid (reasoning + generation): best instruction following, excellent text, FULL aspect-ratio set incl. 16:9/9:16/21:9, n up to 10, 16 refs | Priciest at high quality, slower, camera params approximate | Strict multi-object briefs, UI/product mockups, dense infographics, identity-sensitive edits — the default OpenAI slot |
| `x-ai/grok-imagine-image-2.0` | ~$0.04 | Fast, cheap, strong typography (top-2 on text-rendering arenas), phone/social aspect ratios (9:16, 9:20, 19.5:9), creative flexibility, fewer refusals, pairs with Grok video | Drifts to anime/illustration without a photo anchor; non-Latin text unreliable; style transfer from refs weak; local edits can mis-anchor; quality caps at medium | Cheap drafts, social-media formats, budget typography, moody/creative shots, photorealism with a proper photo anchor |

## Capabilities (via OpenRouter `/api/v1/images`)

| Model | n | resolution | quality | seed | max refs |
|---|---|---|---|---|---|
| seedream-5-0-pro | 1 | 1K/2K | yes | yes | 10 (docs; catalog reports up to 14) |
| gemini-3-pro-image | 1 | 1K/2K/4K | — | no | 14 |
| gpt-5.4-image-2 | 1–10 | full AR set incl. 16:9/9:16/21:9 | low/medium/high/auto | no | 16 |
| gpt-5-image (older) | 1–10 | AR only 1:1/3:2/2:3/auto | low/medium/high/auto | no | 16 |
| gpt-image-2 | 1–10 | full AR set incl. 16:9/9:16/21:9 | low/medium/high/auto | no | 16 |
| grok-imagine-image-2.0 | 1 | 1K/2K | low/medium | no | 3 |

Parameter support differs per model — the CLI validates, but check `orimg models <model-id>` when unsure. For models with `n: 1`, get variants by duplicating the job (optionally with prompt variations).

## Budget alternatives

| Model ID | ~$/image | Notes |
|---|---|---|
| `google/gemini-2.5-flash-image` | ~$0.04 | "Nano Banana", previous gen; up to 2K; solid all-rounder for drafts; same Gemini dialect |
| `google/gemini-3.1-flash-image` | ~$0.07 | "Nano Banana 2"; up to 4K, 14 refs; best cheap option for text rendering |
| `bytedance-seed/seedream-5-0-lite` | ~$0.035 | 2K/4K, n up to 4; cheap Seedream-dialect batches |
| `openai/gpt-5-image-mini` | ~$0.01–0.03 | Cheap drafts with GPT-dialect instruction following |
| `openai/gpt-image-2` | ~25% cheaper than gpt-5.4 | Dedicated image model (no reasoning pass), full AR set; see `gpt-5-image.md` for differences |
| `openai/gpt-5-image` | ~$0.04–0.17 | Previous GPT-5 hybrid; AR limited to 1:1/3:2/2:3/auto |

Note: "Seedance" (`bytedance-seed/seedance-*`) is ByteDance's VIDEO model family — it does not appear in the image catalog. For images the ByteDance slot is always Seedream.

## Scenario routing

- **Typography / posters / text-heavy design** → `seedream-5-0-pro` + `gemini-3-pro-image` + `grok-imagine-image-2.0` as the budget third (Grok Imagine 2.0 is now top-2 on text-rendering arenas; Latin scripts only) — or `gpt-image-2` when the layout brief is strict.
- **Strict multi-object instructions** ("exactly five items, each labeled...") → `openai/gpt-5-image` is mandatory in the set; consider `gemini-3-pro-image` as second.
- **Cheap drafts / social formats / placeholders** → `x-ai/grok-imagine-image-2.0` + `google/gemini-2.5-flash-image` (or `gemini-3.1-flash-image`); skip the expensive pair.
- **Photorealism** → `grok-imagine-image-2.0` with a photo anchor (see its dialect file) or `seedream-5-0-pro` with engineered imperfections.
- **Infographics / diagrams / UI mockups** → `gemini-3-pro-image` + `gpt-5-image`.
- **Image editing with references** → `gemini-3-pro-image` (up to 14 refs, conversational) or `seedream-5-0-pro` (refs as ground truth, visual markup works).
- **Transparent background / vector-ish assets** → note `gpt-image-2` does NOT support transparent background; use Seedream/Gemini and request a solid keyable background, or flatten in post.

Unknown or niche model requested by the user? Pass the ID through as-is — the CLI accepts any OpenRouter model ID; discover options with `orimg models --search <term>`.
