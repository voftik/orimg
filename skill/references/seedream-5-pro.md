# Seedream 5.0 Pro Prompt Dialect

Model ID: `bytedance-seed/seedream-5-0-pro` (budget sibling: `bytedance-seed/seedream-5-0-lite`; previous gen: `bytedance-seed/seedream-4.5`).

## Structure

Formula: **[Subject] + [Action/Pose] + [Environment] + [Style] + [Technical details] + [Text content]**.

- Write full sentences in plain language — not keyword soup. Tag syntax and weights are NOT supported.
- EXPLICITLY name the artifact type ("logo", "poster", "storyboard", "UI mockup", "infographic") — this switches the model's layout-composition mode.
- 5.0 Pro reasons over the WHOLE prompt — completeness and clause organization beat word position; late-mentioned elements are not down-weighted. Strict front-loading applies only to the `seedream-4.5` fallback.
- Give each subject exactly ONE action and moderate the intensity words: overheated verbs ("explosively bursting") cause overshoot artifacts. When motion goes wild, downgrade the verb first.

## Length

- ~600 words / 3000 chars is a CEILING, not a target: past roughly 200 words attention scatters and details drop. Sweet spot for photographic work: 50–200 dense, focused words. Long structured briefs pay off only for layout-heavy work (posters, dashboards, infographics) — organization, not raw length, is what wins. If a brief will not fit, split into two passes and composite.
- 4.x models: optimum 30–100 words; long prompts confuse them. If falling back to `seedream-4.5`, compress.

## Text and layout

- Put exact text in double quotes: `"SUMMER COLLECTION"`. Specify font style ("bold sans-serif") and placement ("title top-center", "CTA bottom-right") per element.
- Optimum 1–10 words per text element; fine small text is unreliable (ByteDance's own admission). For typography-heavy work use `2K` resolution or higher.
- 5.0 Pro renders text in 14 languages and plans the layout before rendering — strongest model for structured posters and infographic grids.
- **Layout briefs**: name the grid first, then each region and its content, then the reading order explicitly (title → sections → charts → labels → footnote) with rough placement per element — an explicit reading order is what the layout planner plans against.
- **HEX colors**: for brand-critical colors use HEX codes in quotes with the plain name as fallback anchor: `Background in '#2D6A4F' (deep forest green)`. HEX reproduces far more consistently than color names.

## Sizes

Set via API `resolution`/`aspect_ratio` ONLY. Words like "8K" in the prompt do not raise the pixel cap. 5.0 Pro accepts extreme aspect ratios (1:16 through 16:1).

## Negatives

No `negative_prompt` field. Two patterns:

1. Inline negation: `no logos, no beauty filters, not cartoon-like`.
2. A trailing block: `Negative Prompt: inaccurate text, watermark` at the end of the prompt.

- Keep exclusions to 1–2 concrete nouns per prompt — long ban-lists are applied inconsistently. Prefer positive rephrasing: `relaxed natural hands` outperforms `no distorted hands`.
- `inaccurate text, text errors` in the trailing block is the best backstop for typography-heavy work.

## Editing and references

- Use verbs **Add / Remove / Replace / Modify** plus an explicit lock on what stays: "Replace the background with a night sky. Keep the subject, pose, and lighting exactly the same."
- Up to 10 reference images — the model treats them as ground truth for untouched regions.
- Visual markup works: arrows/boxes drawn on the input image are understood as edit targets. For several edits in one pass, draw color-coded boxes and write one instruction per color: "In the red box: refinish the cabinets in deep matte navy, keep the brass handles. In the blue box: replace the pendant lamp with a globe light." This beats cramming unrelated edits into one sentence.
- **Fusion vs transfer addressing**: when FUSING multiple references into one scene, address each by content ("the tan leather journal"), never by index — index calls misbind in fusion. Close with "fuse them into one frame with perspective and lighting matched", and pick references shot at roughly the angle they will occupy. Reserve index numbering for TRANSFER operations, where it works: "Transfer the makeup from Image 2 onto the person in Image 1."
- Example-based editing: "Reference the change from Image 1 to Image 2, apply the same operation to Image 3."
- No native masks.

## Special modes

- **Layer separation**: 5.0 Pro can return one composition split into transparent-background layers: "Return as 3 separate layers with transparent backgrounds: the headline text, the product, the background scene." Name ONLY the layers you need — each layer is billed as a separate output image.
- **Web grounding**: 5.0 can consult web search before rendering (`web_search: true` where exposed; naming real entities, recent events, or dates triggers retrieval). Only for images of real current facts (data charts, news posters): "Search for [data/event] from [date range], then generate a poster in [style] visualizing: 1) [dimension] 2) [dimension]." Always proofread rendered numbers. Skip for fiction — it adds cost and latency.
- **Batch series**: enumerate every variant and match the count to the `max_images`/sequential parameter: "Generate 4 images of the same sneaker in different colorways. Image 1: white/blue. Image 2: black/gold. ... Identical angle, studio lighting." Billing follows the declared count — never declare more images than you describe.
- **Many-subject scenes** (a known weakness): impose a grid and describe each cell by position: "A 3x3 overhead flat-lay grid. Top-left cell: [subject + attributes]. Top-center cell: ..." Keep to 9 or fewer subjects with a standardized position vocabulary. If elements still drop, split into two passes and composite.

## Realism and anti-stock

- Engineer imperfections: ask for `natural skin texture, subtle film grain, slight motion softness, handheld framing` and forbid beauty filters to avoid plastic skin.
- Kill the stock look at composition level too: place the subject off-center; freeze a specific mid-action moment; let a foreground element cross the frame edge; give light explicit direction, hardness, and a temperature contrast ("warm key against cool rim"); name concrete surface textures ("wool fibers", "leather grain") — the bare word "detailed" changes nothing. Anything left unspecified defaults to centered symmetry and a stock look.

## Iteration

When a result misses, rerun changing exactly ONE element block (subject / wardrobe-props / scene / framing / camera physics / exclusions) per attempt. Patch the exclusion list only against failures you actually observed — never stack multiple unknown changes in one rerun.

## Strengths / weaknesses

- **Strong**: layout-aware posters, grids, typography; reference and face consistency; batch series; layered output; price.
- **Weak**: scenes overloaded with many objects, tiny dense text, self-contradictory instructions ("photorealistic cartoon"), oversmoothed skin unless anti-gloss cues are given.

## Example prompts

**Hero image (SaaS landing, 16:9 / 2K / high):**

> Hero image for a SaaS landing page. A translucent glass dashboard panel floats above a calm gradient surface, thin luminous data streams flowing into it from the left. The panel shows abstract charts as soft glowing shapes, not readable text. Environment: minimal 3D space with a teal-to-indigo gradient backdrop and a faint reflective floor. Style: modern tech-editorial 3D render, matte materials with subtle glass refraction. Lighting: soft key light from the upper left, delicate rim light tracing the glass edges. Composition: the panel occupies the left two-thirds; the right third stays as clean negative space for a headline overlay. No text, no logos.

**Poster with text (2:3 / 2K / high):**

> Concert poster design with a planned layout. Title text "MIDNIGHT SIGNALS" in bold condensed sans-serif, top-center. Subtitle "Live at the Observatory — Dec 12" in a light sans-serif directly beneath the title. Footer text "midnightsignals.io" in small caps, bottom-center. Background: a retro-futuristic night sky over a jagged mountain silhouette, deep purple to electric blue gradient, a large stylized radio dish on the right third emitting concentric glowing rings. Grainy risograph print texture, limited three-color palette of purple, blue, and off-white. Clear visual hierarchy from title to footer, balanced margins. Negative Prompt: inaccurate text, watermark.

**Multilingual scene (16:9 / 2K / high):**

> A cinematic night photograph looking down a narrow rain-soaked night-market alley, neon and LED signs crowding both walls and reflecting in the puddles. A large red Chinese sign reading "金龍茶室" on the left wall, a smaller Japanese sign "らーめん" below it, a Korean sign "포장마차" on the right, and an English sign "OPEN 24 HRS" in cracked neon tubing at the far end. Steam rising from food stalls, a lone figure with an umbrella mid-stride in the middle distance. Shot at 35mm, f2, handheld, warm neon key against cool blue ambient, natural sensor noise.

**Web-grounded infographic (3:4 / 2K / high):**

> Search for global EV sales figures for the first half of 2026, then generate a clean vertical infographic titled "EV SALES H1 2026" in bold condensed sans-serif, top-center. Three stacked sections in reading order: a headline stat, a simple bar chart comparing the top 5 markets with labeled values, and a one-line takeaway footer in small caps, bottom-center. Palette: background in '#0F172A', accents in '#38BDF8', text in '#F8FAFC'. Flat vector style, generous margins, clear visual hierarchy. Negative Prompt: inaccurate text, text errors.

## Sources

- https://runware.ai/docs/models/bytedance-seedream-5-0-pro/guides/prompting
- https://fal.ai/learn/tools/how-to-use-seedream-5-0-pro-v2
- https://www.atlascloud.ai/blog/guides/seedream-5-pro-prompt-guide
- https://www.imagine.art/blogs/seedream-5-0-pro-prompt-guide
- https://evolink.ai/blog/seedream-prompt-guide-best-practices-2026
