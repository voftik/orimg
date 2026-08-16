# GPT Image Prompt Dialect (gpt-5-image and gpt-image-2)

Model IDs: `openai/gpt-5-image` (hybrid), `openai/gpt-image-2` (dedicated), plus `openai/gpt-5-image-mini` (cheap drafts) and `openai/gpt-5.4-image-2` (newer dedicated). One dialect covers all of them.

## gpt-5-image vs gpt-image-2 — know the difference

- **`gpt-5-image` (hybrid)**: your prompt passes through a mainline GPT-5 LLM that internally rewrites/expands it (`revised_prompt`) before the image is made. Consequence: underspecified briefs get filled in sensibly, BUT anything you care about must be stated as an explicit constraint or it may be "improved" away. Treat the prompt as a brief to an art director: complete, unambiguous, with hard invariants spelled out.
- **`gpt-image-2` (dedicated)**: the prompt reaches the image model directly — your structure is the final word. Supports arbitrary dimensions (sides multiples of 16, long side ≤3840px, ratio ≤3:1, 0.65–8.3 MP; reliable up to 2560×1440, more variance above). Does NOT support transparent background; input fidelity is always high. Roughly 25% cheaper than gpt-5-image at the same quality.
- Both: `quality` low/medium/high/auto (low = drafts; high = dense infographics and identity-sensitive edits), `n` up to 10.

## Structure (official cookbook order)

1. **Scene/background context**
2. **Subject**
3. **Key visual details** — materials, textures, medium
4. **Constraints** — what to exclude AND what to preserve
5. **Purpose** — "ad", "UI mock", "infographic"; the purpose sets the rendering mode

For complex briefs, use short **labeled sections** or line breaks instead of one long paragraph. JSON-like structures, instruction lists, and descriptive paragraphs all officially work — prefer a skimmable labeled template.

- Be concrete about materials, shapes, and medium.
- "photorealistic" / "real photograph" / "professional photography" in the text switches photo mode on.
- For people, describe scale, body framing, gaze, and object interactions.

## Text on the image

- Exact text in quotes or CAPS; specify font style, size, color, and placement.
- Hard words and brand names: spell letter-by-letter ("N-O-R-D-I-K") for accuracy.
- Use quality `medium`/`high` for small text and dense panels.
- Add: `Render all text verbatim, no extra characters.`

## Negatives and invariants

No negative_prompt field. State exclusions and invariants explicitly in a CONSTRAINTS section — and **repeat the full preserve-list on every iteration**, or the scene drifts.

## Editing

- Formula: "Change only [X]. Keep everything else the same."
- Identity lock for people: "Do not change face, facial features, skin tone, body shape, pose, or identity."
- Scene lock: "Preserve camera angle, lighting, shadows, and surrounding context."
- Masks on the edits endpoint are guidance, not an exact shape, for gpt-image-2.
- Multiple input images: reference each "by index and description" ("Image 1: the product; Image 2: the style reference").
- Iterate with a clean base prompt plus small single-purpose follow-ups; reuse context ("same style as before").

## Strengths / weaknesses

- **Strong**: best instruction following of the four (10–20 distinct objects placed correctly), top-tier text rendering, infographics/diagrams/UI mockups, identity preservation in edits, world knowledge.
- **Weak**: camera parameters are interpreted approximately (look, not physics), variance above 2K, identity drift on large scene edits, text can need 1–2 iterations, slower and pricier than competitors.

## Example prompts

**Hero image (16:9 / 2K / high):**

> SCENE: A bright minimal home office at golden hour; a large window on the left pours warm directional light across a pale oak desk.
> SUBJECT: A sleek open laptop showing an abstract analytics dashboard as soft glowing shapes, next to a ceramic mug and a small potted fern.
> DETAILS: Matte materials, soft long shadows, shallow depth of field, editorial product-photography style, photorealistic.
> COMPOSITION: Subject fills the left two-thirds; the right third is a clean, softly blurred wall — negative space for a headline.
> CONSTRAINTS: No people, no brand logos, no readable text anywhere, no watermark.
> PURPOSE: Hero image for a productivity SaaS landing page.

**App icon (1:1 / 1K / high):**

> SUBJECT: A paper plane whose trailing fold forms a subtle upward arrow.
> STYLE: Flat minimalist vector look, two-tone white and light cyan on a solid deep-indigo rounded square, crisp edges, even margins on all sides.
> CONSTRAINTS: Exactly one plane, centered. No text, no gradients, no shadows, no outline strokes, not photorealistic.
> PURPOSE: Mobile app icon.

**Poster with text (2:3 / 2K / high):**

> SCENE: A retro-futuristic night sky over a jagged mountain silhouette; a stylized radio dish on the right third emits concentric glowing rings.
> STYLE: Grainy risograph print texture; limited palette of deep purple, electric blue, and off-white.
> TEXT: Title "MIDNIGHT SIGNALS" in bold condensed sans-serif, top-center. Subtitle "Live at the Observatory — Dec 12" in light sans-serif under the title. Footer "midnightsignals.io" in small caps, bottom-center. Render all text verbatim, no extra characters.
> CONSTRAINTS: Exactly three text blocks as specified, nothing else written. No logos, no watermark.
> PURPOSE: Concert poster.
