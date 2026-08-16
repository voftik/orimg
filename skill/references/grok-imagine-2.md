# Grok Imagine 2.0 Prompt Dialect

Model ID: `x-ai/grok-imagine-image-2.0` (higher-fidelity sibling: `x-ai/grok-imagine-image-quality`).

## Structure: two modes, keyed by task type

Image 2.0 officially "plans typography and layout the way a designer would" (xAI announcement, Aug 2026). Pick the prompt shape per task:

- **Single-subject scene, no text** → one flowing scenario-sentence: **Scene + Style + Mood + Lighting + Camera**. *"Better prompts don't add more words — they add better direction."* Early words weigh the most: start with a concrete subject ("a weathered fisherman mending nets at dawn", never "a person doing an activity"). Emotionally atmospheric adjectives (nostalgic, melancholic, electric) over generic ones; strong verbs (surges, unfurls, slices) over static ones.
- **Layout-heavy image (poster, card, infographic, packaging, thumbnail)** → a short design brief, five parts: (1) Subject; (2) Layout in structural terms ("headline across the top third, product lower right, caption under it"); (3) Exact on-image wording in double quotes; (4) Style; (5) Light. A prompt with subject + layout + exact wording + lighting note comes back with all four honored on the first pass.

## THE trap: illustration drift

Grok (Aurora heritage) drifts toward stylized/anime/illustrative output by default. For any realistic image a **photo anchor in the first words is MANDATORY**:

- "Photorealistic photograph of..." / "Candid DSLR photo of..."
- Plus a real camera and lens: "shot on a Canon EOS R5, 85mm f/1.4".

If output still drifts stylized: (1) describe real-world imperfections — "visible skin texture and pores, slight film grain, natural window light, soft shadows" — forcing a physical scene instead of a clean illustration; (2) explicitly exclude the styles you keep getting: "not anime, not illustration, not 3D render, not cartoon" — naming the unwanted style is the single most effective fix. (If you WANT stylized output, the drift is a feature — Grok does moody illustration well and cheap.)

## Lighting and camera

- Name lighting setups, not adjectives: "Rembrandt lighting", "golden hour", "backlit", "soft diffused light", "soft directional window light from camera left". Generic phrases ("good lighting", "beautiful light") do nothing.
- Shot-type vocabulary the model reliably maps: "wide establishing shot" (world and scale), "low-angle shot" (heroic/imposing), "close-up" (emotion and texture), "over-the-shoulder" (conversation or tension), "shallow depth of field" (subject isolation, bokeh).
- Avoid "cinematic"/"epic" as camera direction — it describes nothing; name one shot type plus one concrete framing choice.

## Text on the image

Typography is a headline strength of Image 2.0 — Arena #2 in both text-to-image and image editing (behind only gpt-image-2). Dense multi-line text works: numbered steps, subheads, sharp small print, full poster layouts.

- Always put exact on-image words in double quotes AND state placement ("across the top third", "in sharp small print beneath it") — unquoted or vague text makes the model invent its own copy.
- Name a typeface flavor ("in a serif", "bold retro typography").
- Remaining real caveat: multilingual/non-Latin text is unreliable (documented case: Traditional Chinese rendered when Simplified was requested) — keep on-image text Latin-script or route to Seedream/Gemini.

## Parameters

- `aspect_ratio`: includes uniquely many phone formats — 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 2:1, 1:2, 19.5:9, 9:19.5, 20:9, 9:20 — ideal for stories/wallpapers.
- `resolution`: 1K / 2K. `quality`: low / medium only (default medium). No seed.
- Via OpenRouter n=1 — duplicate jobs for variants (cheap enough to run several).

## Negatives

No field; inline only. Style-exclusion negatives work ("no anime style", "not illustration"); content-level negatives ("no blur", "don't show X") are often ignored — state those positively instead ("sharp focus", "clean bare wall").

## Editing and references

- Natural-language editing with up to 3 source images per API request (the grok.com app accepts up to 5 — the 3 is an API limit, not a model ceiling).
- **Lock-then-change, one change per request**: "Change the armchair's upholstery to forest green corduroy. Keep the light, the shadows, the floor, and everything else exactly as it is." Bundling ("change the label, the background, and the light") yields three half-changes. Edit rather than re-roll when the base image is close; change one variable per round (lighting OR camera OR mood).
- Multi-reference: assign each image an explicit role or they blend into mush: "Image 1 is the product: keep its shape, label, and color exact. Image 2 sets the style: match its palette and grain. Image 3 is the scene."
- No masks via the API, but Image 2.0 ranks #2 on the image-editing arena and the lock-then-change template recovers much of the local control — do not blanket-route surgical edits away from Grok. (Region-level editing — magic wand, segmentation, background removal — exists only in the grok.com app UI.)
- **Style transfer from a reference is unreliable**: strong-style requests (e.g., watercolor fusion) can come back photorealistic with only a light texture pass. State the target style in the first words and reinforce with medium-specific cues ("gouache strokes visible, paper texture"), or route the job to Gemini/GPT Image.

## Image-to-video handoff

Generate the still at the FINAL aspect ratio with composition, lighting, and style fully baked in — then write the video prompt describing ONLY what changes; do not re-describe the scene (wasted tokens, risks drift). Motion template: "[Only what moves, in timeline order]. [One camera move]. Sound: [material + spatial cues]. [N] seconds, [aspect ratio]."

- One main subject + one primary action + one camera move per clip; 6–10 seconds is the sweet spot.
- The model renders sequentially from frame one — write the key action FIRST; buried at the end it arrives late in the clip.
- Always include an explicit "Sound:" block with material/spatial anchors — omit it and audio is silent or random; for deliberate silence, direct the sound design explicitly.

> Example motion prompt for an existing still: "The paper lanterns sway gently and light rain begins to streak past the neon signs, reflections rippling on the wet pavement. Slow push-in toward the center of the alley. Sound: rain on corrugated metal awnings, low neon transformer buzz, a distant scooter fading. 8 seconds, 9:16."

## Strengths / weaknesses

- **Strong**: speed and price, social-media formats (9:16, 9:20), typography and dense multi-element layouts (first-pass instruction following is now a selling point), creative flexibility, fewer content refusals, seamless handoff to Grok Imagine video.
- **Weak**: illustration drift without a photo anchor, multilingual/non-Latin text, reference style transfer, occasional local-edit mis-anchoring, output URLs from the native API are temporary (the CLI saves files immediately — do not pass raw Grok URLs around).

## Example prompts

**Hero image (16:9 / 2K):**

> Photorealistic photograph of a minimalist workspace bathed in golden-hour light: a pale oak desk with an open laptop and a ceramic mug in front of a vast window, soft directional sunlight raking in from the left and dust motes glowing in the air, calm and quietly optimistic mood, editorial interior style, shot on a Canon EOS R5, 35mm f/2.0, shallow depth of field, the right side of the frame dissolving into clean warm negative space. No people, no watermark, no readable screen text.

**Story visual (9:16 / 2K):**

> A neon-drenched night market alley unfurls upward through the frame, glowing paper lanterns and holographic signs stacked into the distance, electric and nostalgic mood, cinematic cyberpunk illustration style with rich teal and magenta palette, low-angle shot with dramatic vertical perspective, light rain slicking the pavement into mirror reflections. No text, no watermark.

**Typography poster (2:3 / 2K) — design-brief structure:**

> A concert poster for a synthwave band. Headline "NEON DRIFT" across the top third in bold chrome retro typography, subline "LIVE AT THE ORPHEUM — OCT 24" in sharp small print directly beneath it, a sunset grid horizon with a lone car silhouette filling the lower two-thirds, saturated purple-and-teal palette with subtle film grain, clean margin band along the bottom edge. Backlit glow behind the headline.

## Sources

- https://x.ai/news/grok-imagine-image-2
- https://docs.x.ai/docs/guides/image-generations
- https://morphic.com/resources/how-to/grok-imagine-image-2-guide
- https://www.orcarouter.ai/blog/grok-imagine-image-2-0-quality-mode
- https://github.com/thoxakihiko/grok-imagine-prompt-1.5-guide
