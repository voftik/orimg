# Grok Imagine 2.0 Prompt Dialect

Model ID: `x-ai/grok-imagine-image-2.0` (higher-fidelity sibling: `x-ai/grok-imagine-image-quality`).

## Structure

Five parts woven into one flowing scenario-sentence (not a tag stack): **Scene (what is happening) + Style + Mood + Lighting + Camera**.

xAI publishes almost no official prompt guide; the field-tested rule is: *"Better prompts don't add more words — they add better direction."* One coherent sentence-scenario beats keyword stacking.

- **Early words weigh the most.** Start with a concrete subject: "a weathered fisherman mending nets at dawn", never "a person doing an activity".
- Use emotionally atmospheric adjectives (nostalgic, melancholic, electric) instead of generic ones (happy, cool, nice).
- Use strong verbs (surges, unfurls, slices) instead of static ones (standing, being).

## THE trap: illustration drift

Grok (Aurora heritage) drifts toward stylized/anime/illustrative output by default. For any realistic image a **photo anchor in the first words is MANDATORY**:

- "Photorealistic photograph of..." / "Candid DSLR photo of..."
- Plus a real camera and lens: "shot on a Canon EOS R5, 85mm f/1.4".

Without the anchor, expect an illustration no matter what else the prompt says. (If you WANT stylized output, this drift is a feature — Grok does moody illustration well and cheap.)

## Lighting

Be concrete: "soft directional window light from camera left, shallow depth of field, editorial style". Generic phrases ("good lighting", "beautiful light") do nothing.

## Text on the image

Improved in 2026 (posters, thumbnails, ads are feasible) but still weaker than Gemini Pro and gpt-image-2. Keep on-image text SHORT (1–5 words) and in double quotes. For text-critical work, route to Seedream/Gemini instead.

## Parameters

- `aspect_ratio`: includes uniquely many phone formats — 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1, 1:2, 19.5:9, 9:19.5, 20:9, 9:20 — ideal for stories/wallpapers.
- `resolution`: 1K / 2K. `quality`: low / medium only (default medium). No seed.
- Via OpenRouter n=1 — duplicate jobs for variants (cheap enough to run several).

## Negatives

No field; inline exclusions only: "no watermark, no text, no anime style".

## Editing and references

Natural-language editing with up to 3 source images in one request: combining subjects, style transfer, scene composition. No masks, no fine local control — for surgical edits use Gemini or GPT Image.

## Strengths / weaknesses

- **Strong**: speed and price, social-media formats (9:16, 9:20), creative flexibility, fewer content refusals, seamless handoff to Grok Imagine video (image→video).
- **Weak**: illustration drift without a photo anchor, less precise instruction following on complex multi-object scenes, no masks, output URLs from the native API are temporary (the CLI saves files immediately — not your concern, but do not pass raw Grok URLs around).

## Example prompts

**Hero image (16:9 / 2K):**

> Photorealistic photograph of a minimalist workspace bathed in golden-hour light: a pale oak desk with an open laptop and a ceramic mug in front of a vast window, soft directional sunlight raking in from the left and dust motes glowing in the air, calm and quietly optimistic mood, editorial interior style, shot on a Canon EOS R5, 35mm f/2.0, shallow depth of field, the right side of the frame dissolving into clean warm negative space. No people, no watermark, no readable screen text.

**Story visual (9:16 / 2K):**

> A neon-drenched night market alley unfurls upward through the frame, glowing paper lanterns and holographic signs stacked into the distance, electric and nostalgic mood, cinematic cyberpunk illustration style with rich teal and magenta palette, low-angle shot with dramatic vertical perspective, light rain slicking the pavement into mirror reflections. No text, no watermark.

**App icon (1:1 / 1K) — stylized, plays to Grok's strengths:**

> A minimalist flat icon of a paper plane surging upward, bold white and cyan geometry centered on a deep-indigo rounded square, confident and energetic mood, clean vector style with crisp edges and even margins. No text, no shadows, no photorealism.
