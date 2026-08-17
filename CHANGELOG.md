# Changelog

All notable changes to orimg. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [0.5.0] — 2026-08-17 · "audited"

An independent external audit of v0.4.1 filed 18 reproducible findings ([#1](https://github.com/voftik/orimg/issues/1)–[#18](https://github.com/voftik/orimg/issues/18)). All 18 are fixed in this release, in three batches.

### Fixed — trust boundaries and result honesty
- `select` resolves real paths: a symlink inside a batch can no longer smuggle files from outside it (#3).
- Manifests and envelopes never claim a `seed` the chat fallback did not send (#5).
- `doctor` verifies the key live against `/key`: a rejected key exits 3, an unreachable API exits 1, and the envelope reports `api_key.valid` (#1).
- `--dry-run` reads the real per-endpoint pricing records, including per-reference input costs and high-resolution variants; token-billed models (Gemini) honestly estimate as `null` instead of a wrong number (#2).
- `--dry-run` pre-validates every job parameter against the model's declared `supported_parameters` and prints warnings before any money is spent; the jobs validator rejects unknown fields with an explanation instead of silently dropping them (#9).

### Fixed — reliability and the test contract
- Server error messages are stripped of C1 control sequences (0x80–0x9F incl. CSI), closing the 8-bit terminal-injection gap (#4).
- A timeout while reading the response body preserves the real retry count (#6).
- Corrupt manifest entries fail `select` as a validation error, not an internal crash (#7).
- Every subcommand accepts `--help`/`-h` (#8).
- Test contract rebuilt: recorded live-API fixtures (catalog + per-endpoint pricing), scenarios for 503/529 retry, stalled response bodies, C1 injection, corrupt manifests, sandboxed `setup` and tarball contents; `prepublishOnly` runs the full suite; CI gains a coverage job with floors — 67 tests total (#18).

### Fixed — skill and documentation coherence
- One consistent aspect-ratio rule: numeric canvas only via API parameters, compositional wording allowed (#10).
- Gemini reference budget respects the hard 14-image cap (#11).
- Winner selection is host-neutral: Claude Code `Read` / Codex `view_image` (#12).
- Complete transparent-background recipe; `background` documented in the jobs schema; Seedream layer separation marked as not exposed through OpenRouter (#13).
- Packaged README uses absolute links, with a CI guard against relative targets missing from the tarball (#14).
- Example arithmetic corrected; batch estimates aligned at ~$0.32 (#15).
- Comparison table reframed with neutral factual competitor cells and a dated snapshot (#16, #17).

## [0.4.2] — 2026-08-17 · "session generation mode"

### Added
- The skill asks once per interactive session: compare mode (fan out to 3–5 top models with a gallery) or single mode (one model from a listed top five, no gallery, no winner scoring) — and follows the chosen mode for the whole session. Autonomous sessions keep the compare default.

### Changed
- Default OpenAI slot is `openai/gpt-image-2` (newest OpenAI flagship, full aspect-ratio set) across the skill, wizard preset and docs.

## [0.4.1] — 2026-08-17 · "reference images, made mandatory"

### Added
- Skill workflow step 4b: any task involving an existing visual (edit, background removal, same character in a new scene, brand matching) MUST pass source images via `input_references`; includes sourcing rules, per-model editing routing and background recipes.

## [0.4.0] — 2026-08-17 · "field-hardened"

### Fixed
- Jobs validator treats `"field": null` exactly like an absent field — agents emit nulls constantly (found in a real agent session).
- `input_references` sent as `image_url` objects per the live `/images` schema (verified in production).

### Changed
- Flagship lineup refreshed; documented that Seedance is ByteDance's video family, not an image model.

## [0.3.0] — 2026-08-17

### Added
- Interactive `orimg setup` wizard: masked API-key input with live validation, per-agent skill install choice, default lineup presets. Non-TTY and `--yes` keep the silent agent-friendly behavior.
- First npm publish: `npx -y orimg setup` works on any machine.

## [0.2.0] — 2026-08-17

### Changed
- Per-model prompt dialect guides enriched from official Google, OpenAI, BytePlus and xAI prompting guides (five-part Gemini formula, reference-role budgets, text-first and text-as-mask techniques, Grok anti-drift cues, image-to-video handoff).

## [0.1.0] — 2026-08-17

### Added
- Initial release: zero-dependency TypeScript CLI (`generate` with parallel fan-out and partial-failure tolerance, `models`, `select`, `setup`, `doctor`), file-first output with cost-accurate manifests and a self-contained HTML comparison gallery, and the auto-activating `image-generation` Agent Skill for Claude Code and Codex with per-model prompt dialect references.

[0.5.0]: https://github.com/voftik/orimg/releases/tag/v0.5.0
[0.4.2]: https://github.com/voftik/orimg/releases/tag/v0.4.2
[0.4.1]: https://github.com/voftik/orimg/releases/tag/v0.4.1
[0.4.0]: https://github.com/voftik/orimg/releases/tag/v0.4.0
[0.3.0]: https://www.npmjs.com/package/orimg/v/0.3.0
[0.2.0]: https://www.npmjs.com/package/orimg/v/0.2.0
[0.1.0]: https://www.npmjs.com/package/orimg/v/0.1.0
