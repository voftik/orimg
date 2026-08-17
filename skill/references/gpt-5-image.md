# GPT Image Prompt Dialect (gpt-5-image and gpt-image-2)

Model IDs: `openai/gpt-5.4-image-2` (newest hybrid, the default OpenAI slot — full aspect-ratio set), `openai/gpt-5-image` (older hybrid, AR limited to 1:1/3:2/2:3/auto), `openai/gpt-image-2` (dedicated Images-API model), `openai/gpt-5-image-mini` (cheap drafts). One dialect covers all of them.

## gpt-5-image vs gpt-image-2 — know the difference

- **`gpt-5-image` (hybrid)**: your prompt passes through a mainline GPT-5 LLM that internally rewrites/expands it (`revised_prompt`) before the image is made. Consequence: underspecified briefs get filled in sensibly, BUT anything you care about must be stated as an explicit constraint or it may be "improved" away. Treat the prompt as a brief to an art director: complete, unambiguous, with hard invariants spelled out.
- **`gpt-image-2` (dedicated)**: the prompt reaches the image model directly — your structure is the final word. Supports arbitrary dimensions (sides multiples of 16, long side ≤3840px, ratio ≤3:1, 0.65–8.3 MP; reliable up to 2560×1440). Does NOT support transparent background; input fidelity is always high. Roughly 25% cheaper than gpt-5-image at the same quality.
- Both: `quality` low/medium/high/auto (low = drafts; high = dense infographics and identity-sensitive edits), `n` up to 10. For design exploration (logos, icons) generate n=4 variants in ONE call, pick the winner, refine with single-change edits.

## Structure (official cookbook order)

1. **Scene/background context**
2. **Subject**
3. **Key visual details** — materials, textures, medium
4. **Constraints** — what to exclude AND what to preserve

Optionally append a **Purpose** line ("ad", "UI mock", "infographic") — not part of the official four-part order, but naming the artifact helps set the rendering mode.

For complex briefs, use short **labeled sections** or line breaks instead of one long paragraph. JSON-like structures, instruction lists, and descriptive paragraphs all officially work — prefer a skimmable labeled template.

- Be concrete about materials, shapes, and medium.
- For people, describe scale, body framing, gaze, and object interactions.

## Photorealism: polished vs candid

"photorealistic" / "real photograph" / "professional photography" switches photo mode on — but defaults to studio polish. For documentary/candid realism add three levers: (1) request real texture — "visible pores, wrinkles, sun texture, fabric wear, worn materials, imperfections"; (2) state the mood — "the image should feel honest and unposed"; (3) close with "No glamorization, no heavy retouching." Avoid words implying studio polish or staging; "iPhone photo" / "taken on a real camera" are official alternatives to "photorealistic" for a casual look.

## Text on the image

- Exact text in quotes or CAPS; specify font style, size, color, and placement.
- Hard words and brand names: spell letter-by-letter ("N-O-R-D-I-K") for accuracy.
- Use quality `medium`/`high` for small text and dense panels.
- Add: `Render all text verbatim, no extra characters.`

## Diagrams and UI mockups

- Diagram template: exact title in quotes + audience + enumerated labels + connective logic: "Create a simple [domain] diagram titled '[TITLE]' for [audience], showing [stage 1], [stage 2], [stage 3]. Use arrows to connect the steps and label the main parts: [explicit list of labels]. Clean classroom-handout look, white background, simple icons, no tiny text." The audience calibrates density; enumerated labels prevent invented ones. Quality high for dense labels.
- UI mockups: describe the screen as a component list in display order (header, list with small photos, specials section, location/hours block) and end with a device frame: "Place the UI mockup in an iPhone frame." Naming concrete UI regions produces a real-app layout instead of a generic collage.

## Character consistency and series

- There is no seed; **image-as-input is the only official consistency mechanism**.
- Anchor workflow: (1) generate the character ALONE on a plain background — appearance, outfit, proportions, personality, art style, plus "original character, no text, no watermarks"; (2) produce every subsequent scene as an EDIT call taking the anchor image as input, describing the new scene/action, repeating the art style, and stating "keep the character's appearance, outfit, and proportions exactly the same". Still repeat key character details in each prompt to reinforce them.
- Comics/storyboards: request the whole strip as ONE image ("Create a short vertical comic-style reel with 4 equal-sized panels."), number the panels, one concrete action-focused beat per panel ("Panel 1: owner leaves, pet framed in window."). The single-call layout keeps characters and style consistent across panels.

## Negatives and invariants

No negative_prompt field. State exclusions and invariants explicitly in a CONSTRAINTS section — and **repeat the full preserve-list on every iteration**, or the scene drifts.

## Editing

- Formula: "Change only [X]. Keep everything else the same." Capitalize the scope limiter — "replace ONLY the chairs..." — it narrows the edit better than lowercase "only". Follow with the scene lock and physical grounding ("realistic contact shadows").
- Identity lock for people: "Do not change face, facial features, skin tone, body shape, pose, or identity."
- Scene lock: "Preserve camera angle, lighting, shadows, and surrounding context."
- **Compositing integration clause** (anti-pasted-on), whenever inserting an object/garment/person into an existing photo: "Match lighting, shadows, and color temperature to the original photo so it integrates photorealistically, without looking pasted on." Full try-on/swap pattern = identity lock + "Replace only the clothing, fitting the garments naturally to the existing pose and body geometry with realistic fabric behavior" + integration clause + "Do not change the background, camera angle, framing, or image quality; do not add accessories, text, logos, or watermarks."
- **Localization in one line**, without re-describing the design: "Translate the text in the infographic to Spanish. Do not change any other aspect of the image." Re-describing invites redesign drift.
- **Style transfer**: phrase as generate-with-style, not "copy the style": "Use the same style from the input image and generate [new subject] on a white background." The reference carries the style; describe only the new subject and background.
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

**Logo (official template; run with n=4, quality medium):**

> Create an original, non-infringing logo for a company called [NAME], a [type of business]. The logo should feel [warm, simple, and timeless]. Use clean, vector-like shapes, a strong silhouette, and balanced negative space. Favor simplicity over detail so it reads clearly at small and large sizes. Flat design, minimal strokes, no gradients unless essential. Plain background. Deliver a single centered logo with generous padding. No watermark.

**Candid documentary portrait (3:2 / high) — anti-polish levers:**

> Create a photorealistic candid photograph of an elderly sailor standing on a small fishing boat. He has weathered skin with visible wrinkles, pores, and sun texture, and a few faded traditional sailor tattoos on his arms. He is calmly adjusting a net while his dog sits nearby on the deck. Shot like a 35mm film photograph, medium close-up at eye level, using a 50mm lens. Soft coastal daylight, shallow depth of field, subtle film grain, natural color balance. The image should feel honest and unposed, with real skin texture, worn materials, and everyday detail. No glamorization, no heavy retouching.

**Poster with text (2:3 / 2K / high):**

> SCENE: A retro-futuristic night sky over a jagged mountain silhouette; a stylized radio dish on the right third emits concentric glowing rings.
> STYLE: Grainy risograph print texture; limited palette of deep purple, electric blue, and off-white.
> TEXT: Title "MIDNIGHT SIGNALS" in bold condensed sans-serif, top-center. Subtitle "Live at the Observatory — Dec 12" in light sans-serif under the title. Footer "midnightsignals.io" in small caps, bottom-center. Render all text verbatim, no extra characters.
> CONSTRAINTS: Exactly three text blocks as specified, nothing else written. No logos, no watermark.
> PURPOSE: Concert poster.

## Sources

- https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide
- https://developers.openai.com/cookbook/examples/multimodal/image-gen-1.5-prompting_guide
- https://platform.openai.com/docs/guides/image-generation
