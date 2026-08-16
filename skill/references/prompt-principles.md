# Cross-Model Prompt Principles (2026)

Universal rules that apply to all four default models (Seedream 5.0 Pro, Gemini 3 Pro Image, GPT Image, Grok Imagine 2.0). Read this first, then the dialect file of each model you will use. Dialect files override these defaults where they conflict.

## 1. Narrative beats tags

All 2026 flagships are LLM-backed reasoning models (Gemini 3 thinking, Seedream 5.0 layout planning, gpt-image-2 reasoning). Coherent sentences with context consistently beat comma-separated keyword soup. Weight syntax like `[word::1.3]` or `(word:1.4)` is supported by NONE of the four families — never use it.

## 2. Universal prompt skeleton

Order the prompt as:

**Subject → Action/pose → Environment → Style/medium → Lighting → Camera → Text in "double quotes" → Purpose**

- Subject: concrete and detailed ("a weathered fisherman mending nets", not "a person doing an activity").
- Lighting: specific ("soft directional window light from camera left"), never generic ("good lighting").
- Camera: shot type, lens mm, aperture/DoF, angle.
- Purpose: name the artifact — "hero image", "poster", "app icon", "UI mockup", "infographic". Naming the purpose switches the model's composition mode. Always include it.

Early words carry the most weight in every model — lead with the subject, never with boilerplate.

## 3. Camera language is the universal composition control

`85mm portrait lens`, `macro`, `wide-angle`, `low-angle`, `Dutch angle`, `shallow depth of field`, `golden hour` steer composition in all four models. Caveat (explicit in OpenAI docs): camera parameters are interpreted approximately — they control the look, not physical simulation.

## 4. negative_prompt as a parameter is dead

No model of the four has a `negative_prompt` field. Two working substitutes:

- **Semantic negatives** (Google's rule): describe the desired state positively — "an empty, deserted street" instead of "no cars".
- **Inline exclusions** with concrete nouns: "no logos, no watermark, no beauty filters". Concrete ("no logo") works; abstract ("nothing ugly") does not.

## 5. One editing pattern works everywhere

> "Change only [X]. Keep everything else exactly the same, preserving the original [style / lighting / composition / identity]."

- Repeat the full preserve-list on EVERY iteration — otherwise the scene drifts.
- Change one thing per iteration.

## 6. References are the new style tags

Identity, style, and composition are locked with reference images (`input_references`), not with words. Caps: Gemini up to 14, Seedream 5.0 Pro up to 10, Grok up to 3, GPT Image edits accept several (address them "by index and description"). If a style must be matched precisely, pass a reference instead of describing the style.

## 7. Size only via API parameters

Words like "8K, ultra HD" in prompt text do NOT change output pixels (confirmed for Seedream) — they only slightly shift style. Set `resolution` and `aspect_ratio` as API parameters. Pick aspect ratio for the target medium: 9:16 stories, 16:9 covers/heroes, 3:4 or 2:3 portraits/posters, 1:1 icons.

## 8. Structured prompts are legitimate

Labeled sections and JSON-like structures work as well as prose (officially confirmed by OpenAI, and the natural format for GPT Image). For complex briefs, prefer a skimmable labeled template over one long clever paragraph.

## 9. Realism through imperfections

To avoid the "plastic AI look", request flaws: `subtle film grain`, `natural skin texture`, `slight motion softness`, `handheld framing` — and forbid `beauty filters`. Works in Seedream, Grok, and GPT Image.

## 10. Iteration beats the megaprompt

A clean base prompt plus small single-purpose follow-ups outperforms one giant prompt. Gemini and gpt-image-2 support conversational multi-turn editing; Seedream works best one-layer-per-rerun. Draft at `1K/medium`, finalize at `2K/high`.

## 11. Optimal length

50–150 words of structured text is the cross-model sweet spot. Ceiling: Seedream 5.0 Pro handles up to ~600 organized words; beyond each model's ceiling, details get dropped, not blended.
