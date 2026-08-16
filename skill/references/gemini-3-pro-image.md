# Gemini 3 Pro Image Prompt Dialect

Model ID: `google/gemini-3-pro-image` ("Nano Banana Pro", flagship). Same dialect applies to the cheaper `google/gemini-3.1-flash-image` ("Nano Banana 2") and `google/gemini-2.5-flash-image` ("Nano Banana").

## Core principle

Google's official rule: **"Describe the scene, don't just list keywords."** A narrative descriptive paragraph always beats a comma-separated word list.

- **Start with a strong operation verb**: "Create...", "Generate an image of...", "Using the provided image, change...", "Transform...", "Remove...". Without an explicit generation verb the multimodal model may answer with text instead of an image.
- **Five-part formula** for text-to-image: **[Subject] + [Action] + [Location/context] + [Composition] + [Style]**, in that order. Keeping the bracketed labels inline in the prompt is official practice ("[Subject] A striking fashion model... [Style] Fashion magazine editorial...").
- Optimal length: 1–3 descriptive sentences for simple images; long structured prompts only for text-heavy work (posters, infographics, slides).

## Official templates (use these as skeletons)

- **Photorealism**: "A photorealistic [shot type] of a [subject] in a [setting]. [Light description]. Shot from a [angle] with a [lens type]."
- **Illustration/sticker**: "A [style] of a [subject] doing [activity]. The design features [visual qualities] and [color preference]."
- **Text/logo/poster**: "Create a [image type] for [brand] with the text '[content]' in a [font style]. The design should be [aesthetic], with a [color scheme]."
- **Product shot**: "A high-resolution, studio-lit product photograph of [product] on a [surface]. The lighting is a [setup] to [purpose]. The camera angle is a [position]... sharp focus on [detail]."
- **Minimalist/negative space**: single subject plus "a vast, empty [color] canvas, creating significant negative space" — ideal when text will be overlaid later.
- **Sketch-to-art**: "Turn this rough [medium] sketch of a [subject] into a [style description] photo. Keep the [specific features] from the sketch but add [new details/materials]."
- **Comic/storyboard**: "Make a 3 panel comic in a [style]. Put the character in a [type of scene]." Characters stay consistent across panels within ONE generation — prefer one multi-panel image over N separate runs.

## Best practices

1. Hyper-specificity: "ornate elven plate armor, etched with silver leaf patterns" beats "fantasy armor".
2. State purpose AND mood up front ("Intended as a website hero for a productivity app; the mood is calm and premium") — purpose changes composition, mood changes the lighting/palette choices the model's reasoning makes on its own.
3. Iterate conversationally: follow-ups like "make the lighting warmer" work (multi-turn editing is a Gemini strength).
4. **Semantic negatives**: there is NO negative_prompt. Describe the desired state positively — "an empty, deserted street with no signs of traffic" instead of "no cars".
5. Name concrete hardware, film stock, and lighting rigs — the model maps them to coherent looks: "shot on GoPro", "Fujifilm color science", "shallow depth of field (f/1.8)", "as if on 1980s color film, slightly grainy", "three-point softbox setup", "chiaroscuro lighting with harsh, high contrast", "golden hour backlighting".
6. Describe the format in the prompt text as well as the `aspect_ratio` param ("a 9:16 vertical poster", "a cinematic 21:9 wide shot") — it steers where the model leaves negative space and how it stacks elements, not just the canvas shape.

## Text on the image

- Enclose exact words in quotes: "URBAN EXPLORER". Name a font or typographic style PER LINE ("bold, white, sans-serif", "Century Gothic", "flowing Brush Script").
- Keep to 3–5 text elements per image, short phrases, never paragraphs. Multi-line pattern: "render three lines of text with the following exact styling: For the top line, ... For the middle line, ... For the bottom line, ..."
- Small text blurs at 1K — make the text larger or bump resolution to 2K/4K.
- **Text-first hack** for copy-heavy images: finalize the exact wording in a text-only exchange first, then ask for the image containing that finalized text — Gemini renders text it has already "agreed on" far more reliably than text invented mid-generation.
- **Localization**: name the target language for rendered text ("...with the headline text in Korean"), or after generation: "Now translate the text in the image into [language], keeping the layout and styling identical."
- **Text-as-mask**: "A typographic poster with a solid [color] background, bold letters spell '[WORD]'. The text acts as a cut-out window. A photograph of [scene] is visible ONLY inside the letterforms."

## Parameters

- `aspect_ratio` (API param): 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9. 3.1-flash additionally supports 1:4, 4:1, 1:8, 8:1 (skyscraper/leaderboard banners).
- `resolution`: 1K / 2K / 4K (uppercase K; 4K on 3-pro and 3.1-flash only; 2.5-flash caps at 2K). 3.1-flash adds a cheap 512px ("0.5K") draft tier.
- No seed support. n=1 — duplicate jobs for variants.
- On 2.5-flash-image edits, aspect ratio is inherited from the input; if it must not change, say "Do not change the input aspect ratio."

## Editing and references

- Inpainting by prompt: "Using the provided image, change only the [element] to [new element]. Keep everything else exactly the same, preserving the original style, lighting, and composition."
- **One change per turn**: stacking several edits in a single prompt causes some to be silently dropped.
- State what must NOT change in concrete terms ("Keep the pose and clothing identical", "Ensure that the features of [subject] remain completely unchanged"), not just "keep everything else the same". For removals add a fill instruction: "Remove the [object] from the image. Fill in the background naturally."
- **Reference formula**: [Reference images] + [Relationship instruction] + [New scenario]. Name the role of EACH image explicitly: "Use Image A for the character's pose, Image B for the art style, Image C for the background."
- Up to 14 reference images total (both 3-pro and 3.1-flash). Budget within the limit: 6–10 object images, 4–5 character images (cap at 5 for very high-fidelity character rendering), up to 3 style references.
- Character consistency across shots: pass reference images, not descriptions.

## Gemini-3 specifics

- Thinking is always on for 3-pro: the model reasons and makes interim "thought images" before the final output. Per current Gemini API docs the interim thought images are NOT charged — the final image is. Thinking adds latency.
- Google Search grounding: phrase the retrieval step explicitly — "Search the web about [topic] and make an infographic about it" works markedly better than assuming implicit grounding. Formula for data-driven images: [Search request] + [Analytical task: how the data modifies the scene] + [Visual translation: what to render].
- ALL outputs carry an invisible SynthID watermark — mention this if the user needs watermark-free assets.

### gemini-3.1-flash-image extras

Extreme ratios and 0.5K (above); `thinking_level` knob (minimal by default — raise to high for complex compositions); image-search grounding (`search_types: ["image_search"]`); video input as reference. Workflow: iterate cheap drafts at 0.5K/1K on 3.1-flash, then re-run the winning prompt at 2K/4K.

## Strengths / weaknesses

- **Strong**: best-in-class text rendering and infographics, world knowledge, multi-turn conversational editing, reference-driven character consistency, localization/branding accuracy.
- **Weak**: complex typography still may take 1–2 iterations; character consistency across independent generations not guaranteed; thinking adds latency; mandatory SynthID.

## Example prompts

**Hero image (16:9 / 2K):**

> A photorealistic wide-angle shot of a minimalist workspace at golden hour: a pale oak desk with a sleek open laptop, a ceramic mug, and a small fern, in front of a floor-to-ceiling window overlooking a soft-focus city skyline. Warm directional sunlight rakes across the desk from the left, casting long gentle shadows. Shot from a slightly elevated angle with a 35mm lens, shallow depth of field. The right third of the frame is a clean, softly lit wall creating significant negative space for a headline. Intended as a website hero image for a productivity app.

**Product shot with per-line fonts (4:5 / 2K):**

> A high-end, glossy commercial beauty shot of a sleek, minimalist nude-colored face moisturizer jar resting on a warm studio background. The lighting is soft and radiant. Next to the product, render three lines of text with the following exact styling: For the top line, the word 'GLOW' in a flowing, elegant Brush Script font. For the middle line, the text '10% OFF' in a heavy, blocky Impact font. For the bottom line, the text 'Your First Order' in a thin, minimalist Century Gothic font.

**Poster with text (2:3 / 2K):**

> Create a concert poster for "MIDNIGHT SIGNALS" with the title text "MIDNIGHT SIGNALS" in a bold condensed grotesque font at the top, the subtitle "Live at the Observatory — Dec 12" in a lighter weight beneath it, and "midnightsignals.io" in small caps at the bottom. The design should be retro-futuristic and grainy like a risograph print, with a deep purple and electric blue night sky over a mountain silhouette and a stylized radio dish emitting concentric glowing rings on the right. Limited three-color palette, strong vertical hierarchy, generous margins.

## Sources

- https://ai.google.dev/gemini-api/docs/image-generation
- https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana
- https://blog.google/products/gemini/prompting-tips-nano-banana-pro/
- https://dev.to/googleai/introducing-nano-banana-pro-complete-developer-tutorial-5fc8
- https://fal.ai/learn/tools/how-to-use-nano-banana-2
