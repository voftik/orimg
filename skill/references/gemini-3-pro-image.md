# Gemini 3 Pro Image Prompt Dialect

Model ID: `google/gemini-3-pro-image` ("Nano Banana Pro", flagship). Same dialect applies to the cheaper `google/gemini-3.1-flash-image` ("Nano Banana 2") and `google/gemini-2.5-flash-image` ("Nano Banana").

## Core principle

Google's official rule: **"Describe the scene, don't just list keywords."** A narrative descriptive paragraph always beats a comma-separated word list. Write like you are describing a finished photograph or artwork to someone.

## Official templates (use these as skeletons)

- **Photorealism**: "A photorealistic [shot type] of a [subject] in a [setting]. [Light description]. Shot from a [angle] with a [lens type]."
- **Illustration/sticker**: "A [style] of a [subject] doing [activity]. The design features [visual qualities] and [color preference]."
- **Text/logo/poster**: "Create a [image type] for [brand] with the text '[content]' in a [font style]. The design should be [aesthetic], with a [color scheme]."
- **Product shot**: "A high-resolution, studio-lit product photograph of [product] on a [surface]. The lighting is a [setup] to [purpose]. The camera angle is a [position]... sharp focus on [detail]."
- **Minimalist/negative space**: single subject plus "a vast, empty [color] canvas, creating significant negative space" — ideal when text will be overlaid later.

## Best practices

1. Hyper-specificity: "ornate elven plate armor, etched with silver leaf patterns" beats "fantasy armor".
2. State the context and purpose of the image ("for a website hero", "as an app icon") — it changes composition.
3. Iterate conversationally: follow-ups like "make the lighting warmer", "change the expression to more serious" work (multi-turn editing is a Gemini strength).
4. **Semantic negatives**: there is NO negative_prompt. Describe the desired state positively — "an empty, deserted street with no signs of traffic" instead of "no cars".
5. Camera language: wide-angle, macro, low-angle perspective, 85mm portrait lens, Dutch angle.

## Parameters

- `aspect_ratio` (API param): 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9.
- `resolution`: 1K / 2K / 4K (uppercase K; 4K on 3-pro and 3.1-flash only; 2.5-flash caps at 2K).
- No seed support. n=1 — duplicate jobs for variants.
- On 2.5-flash-image edits, aspect ratio is inherited from the input; if it must not change, say "Do not change the input aspect ratio."

## Editing and references

- Inpainting by prompt: "Using the provided image, change only the [element] to [new element]. Keep everything else exactly the same, preserving the original style, lighting, and composition."
- Style transfer and composition from up to 14 reference images (3.1-flash: 10 object + 4 character + 3 style).
- Character consistency across shots: pass reference images, not descriptions.

## Gemini-3 specifics

- Thinking is always on: the model reasons and makes interim images before answering; thinking tokens are billed.
- Google Search grounding available for images based on current real-world data (weather, events).
- ALL outputs carry an invisible SynthID watermark — mention this if the user needs watermark-free assets.

## Strengths / weaknesses

- **Strong**: best-in-class text rendering and infographics, world knowledge, multi-turn conversational editing, reference-driven character consistency, localization/branding accuracy.
- **Weak**: complex typography still may take 1–2 iterations; character consistency across independent generations not guaranteed; thinking adds latency and cost; mandatory SynthID.

## Example prompts

**Hero image (16:9 / 2K):**

> A photorealistic wide-angle shot of a minimalist workspace at golden hour: a pale oak desk with a sleek open laptop, a ceramic mug, and a small fern, in front of a floor-to-ceiling window overlooking a soft-focus city skyline. Warm directional sunlight rakes across the desk from the left, casting long gentle shadows. Shot from a slightly elevated angle with a 35mm lens, shallow depth of field. The right third of the frame is a clean, softly lit wall creating significant negative space for a headline. Intended as a website hero image for a productivity app.

**App icon (1:1 / 1K):**

> A minimalist flat vector-style illustration of a paper plane forming a subtle upward arrow, centered on a solid deep-indigo rounded square. The design features bold geometric shapes, a two-tone palette of white and light cyan, smooth curves, and even padding on all sides. Clean edges, no outlines, no text. Intended as a mobile app icon.

**Poster with text (2:3 / 2K):**

> Create a concert poster for "MIDNIGHT SIGNALS" with the title text "MIDNIGHT SIGNALS" in a bold condensed grotesque font at the top, the subtitle "Live at the Observatory — Dec 12" in a lighter weight beneath it, and "midnightsignals.io" in small caps at the bottom. The design should be retro-futuristic and grainy like a risograph print, with a deep purple and electric blue night sky over a mountain silhouette and a stylized radio dish emitting concentric glowing rings on the right. Limited three-color palette, strong vertical hierarchy, generous margins.
