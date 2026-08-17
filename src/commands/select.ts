import { copyFile, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { EXIT, ValidationError } from "../core/errors.js";
import type { ExitCodeValue } from "../core/errors.js";
import { modelShort } from "../core/files.js";
import { readManifest, writeManifest } from "../core/manifest.js";
import { isJsonMode, parseOrThrow, printEnvelope, printLines, strFlag, successEnvelope } from "../core/cliutil.js";
import type { ManifestJob } from "../types.js";

interface Match {
  job: ManifestJob;
  file: string;
}

function findMatch(jobs: ManifestJob[], pick: string): Match {
  const okJobs = jobs.filter((j) => j.status === "ok" && j.files.length > 0);
  if (okJobs.length === 0) {
    throw new ValidationError("this batch has no successful images to select from");
  }

  for (const job of okJobs) {
    for (const file of job.files) {
      if (file === pick || path.basename(file) === pick) return { job, file };
    }
  }

  const exact = okJobs.filter((j) => j.model === pick || modelShort(j.model) === pick);
  if (exact.length > 0) {
    const job = exact[0] as ManifestJob;
    return { job, file: job.files[0] as string };
  }

  const fuzzy = okJobs.filter((j) => j.model.toLowerCase().includes(pick.toLowerCase()));
  if (fuzzy.length === 1) {
    const job = fuzzy[0] as ManifestJob;
    return { job, file: job.files[0] as string };
  }
  if (fuzzy.length > 1) {
    throw new ValidationError(
      `"${pick}" is ambiguous, matches: ${fuzzy.map((j) => j.model).join(", ")} — use the full model ID or a filename`,
    );
  }

  const available = okJobs.flatMap((j) => [j.model, ...j.files]);
  throw new ValidationError(`no image matched "${pick}"; available: ${available.join(", ")}`);
}

export async function cmdSelect(argv: string[]): Promise<ExitCodeValue> {
  const { values, positionals } = parseOrThrow({
    args: argv,
    allowPositionals: true,
    options: {
      to: { type: "string" },
      json: { type: "boolean" },
    },
  });

  const jsonMode = isJsonMode(values);
  const target = positionals[0];
  const pick = positionals[1];
  const to = strFlag(values, "to");

  if (target === undefined || pick === undefined || to === undefined) {
    throw new ValidationError("usage: orimg select <batch-dir|manifest> <model-or-filename> --to <dest-path>");
  }

  const { manifest, file: manifestFile } = await readManifest(path.resolve(target));
  const batchDir = path.dirname(manifestFile);
  const match = findMatch(manifest.jobs, pick);

  const source = path.resolve(batchDir, match.file);
  const rel = path.relative(batchDir, source);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ValidationError(`manifest entry "${match.file}" points outside the batch directory`);
  }
  // Lexical checks pass through symlinks — compare resolved paths too.
  let realSource: string;
  let realBatch: string;
  try {
    realBatch = await realpath(batchDir);
    realSource = await realpath(source);
  } catch {
    throw new ValidationError(`file "${match.file}" is missing from the batch directory`);
  }
  const realRel = path.relative(realBatch, realSource);
  if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
    throw new ValidationError(`manifest entry "${match.file}" resolves outside the batch directory`);
  }
  let dest = path.resolve(to);
  try {
    if ((await stat(dest)).isDirectory()) dest = path.join(dest, path.basename(match.file));
  } catch {
    // dest does not exist yet
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(source, dest);

  manifest.chosen = { file: match.file, to: dest, at: new Date().toISOString() };
  await writeManifest(batchDir, manifest);

  if (jsonMode) {
    printEnvelope(
      successEnvelope({ from: source, to: dest, model: match.job.model, file: match.file, manifest: manifestFile }),
    );
  } else {
    printLines([`selected ${match.file} (${match.job.model})`, `copied to ${dest}`]);
  }
  return EXIT.OK;
}
