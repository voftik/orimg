import { cp, lstat, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CliError, EXIT, ValidationError } from "../core/errors.js";
import type { ExitCodeValue } from "../core/errors.js";
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

export async function cmdSetup(argv: string[]): Promise<ExitCodeValue> {
  const { values } = parseOrThrow({
    args: argv,
    options: {
      link: { type: "boolean" },
      remove: { type: "boolean" },
      "claude-only": { type: "boolean" },
      "codex-only": { type: "boolean" },
      json: { type: "boolean" },
    },
  });

  const jsonMode = isJsonMode(values);
  const link = boolFlag(values, "link");
  const remove = boolFlag(values, "remove");
  const claudeOnly = boolFlag(values, "claude-only");
  const codexOnly = boolFlag(values, "codex-only");

  if (claudeOnly && codexOnly) {
    throw new ValidationError("--claude-only and --codex-only are mutually exclusive");
  }
  if (link && remove) {
    throw new ValidationError("--link and --remove are mutually exclusive");
  }

  const targets = skillTargets().filter((t) => {
    if (claudeOnly) return t.name === "claude";
    if (codexOnly) return t.name === "codex";
    return true;
  });

  const root = packageRoot();
  const skillSrc = path.join(root, "skill");
  const version = packageVersion();

  if (!remove && !(await pathExists(path.join(skillSrc, "SKILL.md")))) {
    throw new CliError(
      `skill directory not found at ${skillSrc} — this orimg installation is missing its bundled skill`,
      "UNEXPECTED",
      EXIT.UNEXPECTED,
    );
  }

  const results: TargetResult[] = [];

  for (const target of targets) {
    if (remove) {
      if (await pathExists(target.dir)) {
        await rm(target.dir, { recursive: true, force: true });
        results.push({ name: target.name, dir: target.dir, action: "removed" });
      } else {
        results.push({ name: target.name, dir: target.dir, action: "absent" });
      }
      continue;
    }

    if (link) {
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
