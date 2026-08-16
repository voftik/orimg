# Contributing to orimg

Thanks for wanting to make orimg better! This project exists because agents needed something that didn't exist — chances are your itch is shared by others.

## Ground rules

- **Zero runtime dependencies** is a hard constraint. Dev dependencies are fine; anything shipped in `dist/` must be pure Node ≥ 20 stdlib.
- **Files first.** Nothing may put image bytes into an agent's context. Paths, manifests and galleries only.
- **The CLI is deterministic transport; intelligence lives in the skill.** Model-specific smarts belong in `skill/references/`, not in TypeScript.
- **Partial success is success.** New failure modes must not kill a batch.

## Dev setup

```bash
git clone https://github.com/voftik/orimg && cd orimg
npm install
npm run build        # tsc --noEmit + tsup
npm test             # runs against a local mock server — zero API cost
```

An OpenRouter key is only needed for the optional real smoke test:

```bash
SMOKE=1 npm run smoke   # one ~$0.04 request to gemini-2.5-flash-image
```

## Good first contributions

- **New dialect guides** — a well-sourced `skill/references/<model>.md` for a model we don't cover (FLUX.2, Qwen-Image, Recraft…). Follow the structure of the existing files: structure, length, on-image text, parameters, negatives, editing, strengths/weaknesses, 3 example prompts.
- **Gallery UX** — the comparison gallery (`src/core/gallery.ts`) is self-contained HTML; keyboard navigation, side-by-side diff, EXIF-style parameter overlays are all welcome.
- **Provider quirks** — timeout/retry edge cases for specific models, better error messages.
- **Docs** — clarify anything that confused you; that confusion is a bug.

## Pull requests

1. One logical change per PR.
2. `npm run build && npm test` must be green; add tests for new behavior (mock server lives in `test/mock-server.mjs` — extend it rather than hitting the network).
3. If you change the CLI contract (flags, envelope, exit codes), update `README.md`, `skill/references/api-parameters.md`, and bump `schema_version` only for breaking envelope changes.
4. If you change skill content, keep `SKILL.md` short — details go to `references/`; the frontmatter `description` must stay ≤ 1024 chars.

## Reporting bugs

Use the bug report template. Always include: `orimg doctor --json` output (it masks your key), the exact command, and the JSON envelope or stderr you got.

## Code style

Strict TypeScript, no `any` outside JSON-parsing boundaries, no comments that restate the code. Match what's already there.
