# Seedream 5.0 Pro Prompt Dialect

Model ID: `bytedance-seed/seedream-5-0-pro` (budget sibling: `bytedance-seed/seedream-5-0-lite`; previous gen: `bytedance-seed/seedream-4.5`).

## Structure

Formula: **[Subject] + [Action/Pose] + [Environment] + [Style] + [Technical details] + [Text content]**.

- Write full sentences in plain language — not keyword soup. Tag syntax and weights are NOT supported.
- EXPLICITLY name the artifact type ("logo", "poster", "storyboard", "UI mockup", "infographic") — this switches the model's layout-composition mode.
- Word order matters: early concepts get more weight. Lead with the subject.

## Length

- 5.0 Pro: up to ~600 English words (hard cap 3000 characters). Long ORGANIZED prompts outperform short ones — this is the one model where a detailed structured brief pays off.
- 4.x models: optimum 30–100 words; long prompts confuse them. If falling back to `seedream-4.5`, compress.

## Text on the image

- Put exact text in double quotes: `"SUMMER COLLECTION"`.
- Specify font style ("bold sans-serif", "elegant script") and placement ("title top-center", "CTA bottom-right").
- Optimum 1–10 words per text element; fine small text is unreliable (ByteDance's own admission). For typography-heavy work use `2K` resolution or higher.
- 5.0 Pro renders text in 14 languages and plans the layout before rendering — strongest model for structured posters and infographic grids.

## Sizes

Set via API `resolution`/`aspect_ratio` ONLY. Words like "8K" in the prompt do not raise the pixel cap. 5.0 Pro accepts extreme aspect ratios (1:16 through 16:1).

## Negatives

No `negative_prompt` field. Two patterns:

1. Inline negation: `no logos, no beauty filters, not cartoon-like`.
2. A trailing block: `Negative Prompt: weak expression, distorted hands, blur` at the end of the prompt.

Exclusions must be concrete nouns ("no logo"), not abstractions.

## Editing and references

- Use verbs **Add / Remove / Replace / Modify** plus an explicit lock on what stays: "Replace the background with a night sky. Keep the subject, pose, and lighting exactly the same."
- Up to 10 reference images — the model treats them as ground truth for untouched regions.
- Visual markup works: arrows/boxes drawn on the input image are understood as edit targets.
- Example-based editing: "Reference the change from Image 1 to Image 2, apply the same operation to Image 3."
- No native masks.

## Strengths / weaknesses

- **Strong**: layout-aware posters, grids, typography; reference and face consistency; batch series; price. Realism is achieved by *engineering imperfections* — ask for `natural skin texture, subtle film grain, slight motion softness, handheld framing` and forbid beauty filters to avoid plastic skin.
- **Weak**: scenes overloaded with many objects, tiny dense text, self-contradictory instructions ("photorealistic cartoon"), oversmoothed skin unless anti-gloss cues are given.

## Example prompts

**Hero image (SaaS landing, 16:9 / 2K / high):**

> Hero image for a SaaS landing page. A translucent glass dashboard panel floats above a calm gradient surface, thin luminous data streams flowing into it from the left. The panel shows abstract charts as soft glowing shapes, not readable text. Environment: minimal 3D space with a teal-to-indigo gradient backdrop and a faint reflective floor. Style: modern tech-editorial 3D render, matte materials with subtle glass refraction. Lighting: soft key light from the upper left, delicate rim light tracing the glass edges. Composition: the panel occupies the left two-thirds; the right third stays as clean negative space for a headline overlay. No text, no logos, no watermark, no lens flare.

**App icon (1:1 / 1K / high):**

> Minimalist flat app icon: a paper plane whose trailing fold forms a subtle upward arrow, centered on a solid deep-indigo rounded-square background. Bold geometric shapes, two-tone palette of white and light cyan, crisp vector-like edges, even margins on all sides. Designed as a product logo icon. No text, no drop shadows, no gradients, not photorealistic.

**Poster with text (2:3 / 2K / high):**

> Concert poster design with a planned layout. Title text "MIDNIGHT SIGNALS" in bold condensed sans-serif, top-center. Subtitle "Live at the Observatory — Dec 12" in a light sans-serif directly beneath the title. Footer text "midnightsignals.io" in small caps, bottom-center. Background: a retro-futuristic night sky over a jagged mountain silhouette, deep purple to electric blue gradient, a large stylized radio dish on the right third emitting concentric glowing rings. Grainy risograph print texture, limited three-color palette of purple, blue, and off-white. Clear visual hierarchy from title to footer, balanced margins. Negative Prompt: extra text, misspelled words, logos, watermark, clutter.
