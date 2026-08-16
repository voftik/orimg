import { cp, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { loadConfig, maskApiKey, saveConfigPatch } from "../core/config.js";
import { AuthError, CliError, EXIT, ValidationError, errorMessage } from "../core/errors.js";
import type { ExitCodeValue } from "../core/errors.js";
import { OpenRouterClient } from "../core/openrouter.js";
import { askChoice, askHidden, askYesNo, isInteractive } from "../core/wizard.js";
import {
  boolFlag,
  isJsonMode,
  packageRoot,
  packageVersion,
  parseOrThrow,
  printEnvelope,
  printLines,
  successEnvelope,
} from "../core/cliutil.js";

export const SKILL_NAME = "image-generation";
export const SKILL_MARKER_RE = /<!--\s*orimg-skill v([^\s]+)\s*-->/;

export interface SkillTarget {
  name: "claude" | "codex";
  dir: string;
}

export function skillTargets(home = homedir()): SkillTarget[] {
  return [
    { name: "claude", dir: path.join(home, ".claude", "skills", SKILL_NAME) },
    { name: "codex", dir: path.join(home, ".agents", "skills", SKILL_NAME) },
  ];
}

export async function installedSkillVersion(dir: string): Promise<string | null> {
  try {
    const content = await readFile(path.join(dir, "SKILL.md"), "utf8");
    const match = SKILL_MARKER_RE.exec(content);
    return match === null ? "unknown" : (match[1] as string);
  } catch {
    return null;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

interface TargetResult {
  name: string;
  dir: string;
  action: "installed" | "linked" | "removed" | "absent" | "up-to-date";
}

async function applyToTargets(
  targets: SkillTarget[],
  opts: { remove: boolean; link: boolean },
): Promise<TargetResult[]> {
  const root = packageRoot();
  const skillSrc = path.join(root, "skill");
  const version = packageVersion();

  if (!opts.remove && !(await pathExists(path.join(skillSrc, "SKILL.md")))) {
    throw new CliError(
      `skill directory not found at ${skillSrc} — this orimg installation is missing its bundled skill`,
      "UNEXPECTED",
      EXIT.UNEXPECTED,
    );
  }

  const results: TargetResult[] = [];
  for (const target of targets) {
    if (opts.remove) {
      if (await pathExists(target.dir)) {
        await rm(target.dir, { recursive: true, force: true });
        results.push({ name: target.name, dir: target.dir, action: "removed" });
      } else {
        results.push({ name: target.name, dir: target.dir, action: "absent" });
      }
      continue;
    }

    if (opts.link) {
      await rm(target.dir, { recursive: true, force: true });
      await mkdir(path.dirname(target.dir), { recursive: true });
      await symlink(skillSrc, target.dir, "dir");
      results.push({ name: target.name, dir: target.dir, action: "linked" });
      continue;
    }

    const existing = await installedSkillVersion(target.dir);
    if (existing === version) {
      results.push({ name: target.name, dir: target.dir, action: "up-to-date" });
      continue;
    }

    await rm(target.dir, { recursive: true, force: true });
    await mkdir(path.dirname(target.dir), { recursive: true });
    await cp(skillSrc, target.dir, { recursive: true });

    const skillMd = path.join(target.dir, "SKILL.md");
    const content = await readFile(skillMd, "utf8");
    if (!SKILL_MARKER_RE.test(content)) {
      await writeFile(skillMd, `${content.trimEnd()}\n\n<!-- orimg-skill v${version} -->\n`, "utf8");
    }
    results.push({ name: target.name, dir: target.dir, action: "installed" });
  }
  return results;
}

async function runWizard(preset: { link: boolean; claudeOnly: boolean; codexOnly: boolean }): Promise<ExitCodeValue> {
  const version = packageVersion();
  printLines([`orimg v${version} — interactive setup`, ""]);

  // Step 1: API key
  const config = await loadConfig();
  let haveKey = false;
  if (config.apiKey !== undefined) {
    haveKey = await askYesNo(
      `Found an OpenRouter API key ${maskApiKey(config.apiKey) ?? ""} (source: ${config.apiKeySource ?? "?"}). Keep it?`,
      true,
    );
  }
  while (!haveKey) {
    const key = await askHidden("Paste your OpenRouter API key (input hidden; create one at https://openrouter.ai/keys, press Enter to skip)");
    if (key === "") {
      printLines(["Skipped. Set OPENROUTER_API_KEY or add \"apiKey\" to your config file later."]);
      break;
    }
    process.stdout.write("Validating key... ");
    const client = new OpenRouterClient({ apiKey: key, baseUrl: config.baseUrl, timeoutMs: 15_000, retries: 0 });
    try {
      await client.checkKey();
      const file = await saveConfigPatch({ apiKey: key });
      printLines(["ok", `Saved to ${file} (permissions 600).`]);
      haveKey = true;
    } catch (err) {
      if (err instanceof AuthError) {
        printLines(["rejected (401) — that key does not work, try again."]);
      } else {
        printLines([`could not verify (${errorMessage(err)}).`]);
        const keepAnyway = await askYesNo("Save it anyway?", false);
        if (keepAnyway) {
          const file = await saveConfigPatch({ apiKey: key });
          printLines([`Saved to ${file} (permissions 600).`]);
          haveKey = true;
        }
      }
    }
  }
  printLines([""]);

  // Step 2: skill targets
  let targets = skillTargets();
  if (preset.claudeOnly) targets = targets.filter((t) => t.name === "claude");
  else if (preset.codexOnly) targets = targets.filter((t) => t.name === "codex");
  else {
    const home = homedir();
    const claudeDetected = await pathExists(path.join(home, ".claude"));
    const codexDetected = (await pathExists(path.join(home, ".codex"))) || (await pathExists(path.join(home, ".agents")));
    const mark = (detected: boolean): string => (detected ? " (detected)" : "");
    const pick = await askChoice("Install the auto-activating agent skill for:", [
      `Claude Code${mark(claudeDetected)} + Codex${mark(codexDetected)} — both`,
      "Claude Code only",
      "Codex only",
      "skip",
    ], 0);
    if (pick === 1) targets = targets.filter((t) => t.name === "claude");
    else if (pick === 2) targets = targets.filter((t) => t.name === "codex");
    else if (pick === 3) targets = [];
  }
  if (targets.length > 0) {
    const results = await applyToTargets(targets, { remove: false, link: preset.link });
    printLines(results.map((r) => `  ${r.name}: ${r.action} (${r.dir})`));
  }
  printLines([""]);

  // Step 3: default model lineup
  const lineup = await askChoice("Default fan-out lineup (used when the agent or jobs file does not specify models):", [
    "Flagship four — seedream-5-0-pro, gemini-3-pro-image, gpt-image-2, grok-imagine-image-2.0 (~$0.38/batch)",
    "Budget duo — gemini-2.5-flash-image, grok-imagine-image-2.0 (~$0.08/batch)",
    "Decide per task (keep unset)",
  ], 0);
  if (lineup === 0) {
    await saveConfigPatch({
      models: [
        "bytedance-seed/seedream-5-0-pro",
        "google/gemini-3-pro-image",
        "openai/gpt-image-2",
        "x-ai/grok-imagine-image-2.0",
      ],
    });
  } else if (lineup === 1) {
    await saveConfigPatch({ models: ["google/gemini-2.5-flash-image", "x-ai/grok-imagine-image-2.0"] });
  }

  printLines([
    "",
    "Done. Try it:",
    "  orimg doctor                     # verify everything",
    '  orimg generate -m google/gemini-2.5-flash-image -p "a red circle" --resolution 1K',
    "…or just ask your agent for an image — the skill activates on its own.",
  ]);
  return EXIT.OK;
}

export async function cmdSetup(argv: string[]): Promise<ExitCodeValue> {
  const { values } = parseOrThrow({
    args: argv,
    options: {
      link: { type: "boolean" },
      remove: { type: "boolean" },
      "claude-only": { type: "boolean" },
      "codex-only": { type: "boolean" },
      yes: { type: "boolean" },
      json: { type: "boolean" },
    },
  });

  const jsonMode = isJsonMode(values);
  const link = boolFlag(values, "link");
  const remove = boolFlag(values, "remove");
  const claudeOnly = boolFlag(values, "claude-only");
  const codexOnly = boolFlag(values, "codex-only");
  const yes = boolFlag(values, "yes");

  if (claudeOnly && codexOnly) {
    throw new ValidationError("--claude-only and --codex-only are mutually exclusive");
  }
  if (link && remove) {
    throw new ValidationError("--link and --remove are mutually exclusive");
  }

  if (!jsonMode && !remove && !yes && isInteractive()) {
    return runWizard({ link, claudeOnly, codexOnly });
  }

  const targets = skillTargets().filter((t) => {
    if (claudeOnly) return t.name === "claude";
    if (codexOnly) return t.name === "codex";
    return true;
  });

  const results = await applyToTargets(targets, { remove, link });
  const version = packageVersion();
  const skillSrc = path.join(packageRoot(), "skill");

  if (jsonMode) {
    printEnvelope(successEnvelope({ version, skill_source: remove ? null : skillSrc, targets: results }));
  } else {
    printLines([
      ...results.map((r) => `${r.name}: ${r.action} (${r.dir})`),
      remove ? "skill removed" : `orimg skill v${version} is ready`,
    ]);
  }
  return EXIT.OK;
}
