import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import type { ConfigResolution } from "../core/config.js";
import {
  ApiError,
  AuthError,
  CliError,
  EXIT,
  TimeoutError,
  ValidationError,
  errorMessage,
  errorRetries,
} from "../core/errors.js";
import type { ExitCodeValue } from "../core/errors.js";
import { fanout } from "../core/fanout.js";
import { extForMediaType, mimeForFile, modelShort, saveBase64, slugify, timestampSlug, uniqueName } from "../core/files.js";
import { writeGallery } from "../core/gallery.js";
import { validateJobsFile } from "../core/jobs.js";
import { writeManifest } from "../core/manifest.js";
import { OpenRouterClient } from "../core/openrouter.js";
import {
  boolFlag,
  formatSeconds,
  formatUsd,
  intFlag,
  isJsonMode,
  parseOrThrow,
  printEnvelope,
  printLines,
  renderTable,
  roundUsd,
  strArrFlag,
  strFlag,
  successEnvelope,
  errorEnvelope,
} from "../core/cliutil.js";
import type { FlagValues } from "../core/cliutil.js";
import { getModels, imagePriceUsd } from "./models.js";
import type { Envelope, FailureRecord, ImageRecord, Job, Manifest, ManifestJob } from "../types.js";

interface JobOutcome {
  job: Job;
  files: string[];
  cost: number | null;
  durationMs: number;
  via: "images" | "chat-fallback";
  retries: number;
}

const GENERATE_OPTIONS = {
  jobs: { type: "string" },
  model: { type: "string", short: "m" },
  prompt: { type: "string", short: "p" },
  n: { type: "string", short: "n" },
  "aspect-ratio": { type: "string" },
  resolution: { type: "string" },
  quality: { type: "string" },
  seed: { type: "string" },
  "output-format": { type: "string" },
  ref: { type: "string", multiple: true },
  task: { type: "string" },
  out: { type: "string" },
  gallery: { type: "boolean" },
  "no-gallery": { type: "boolean" },
  open: { type: "boolean" },
  concurrency: { type: "string" },
  timeout: { type: "string" },
  retries: { type: "string" },
  json: { type: "boolean" },
  "dry-run": { type: "boolean" },
  strict: { type: "boolean" },
  "api-key": { type: "string" },
  "base-url": { type: "string" },
} as const;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadJobsInput(values: FlagValues, config: ConfigResolution): Promise<{ task?: string; jobs: Job[] }> {
  const jobsPath = strFlag(values, "jobs");
  const model = strFlag(values, "model");
  const prompt = strFlag(values, "prompt");

  if (jobsPath !== undefined && (model !== undefined || prompt !== undefined)) {
    throw new ValidationError("use either --jobs or the quick mode flags (-m/-p), not both");
  }

  if (jobsPath !== undefined) {
    const raw = jobsPath === "-" ? await readStdin() : await readFile(path.resolve(jobsPath), "utf8").catch((err: unknown) => {
      throw new ValidationError(`cannot read jobs file "${jobsPath}": ${errorMessage(err)}`);
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new ValidationError(`jobs file is not valid JSON: ${errorMessage(err)}`);
    }
    return validateJobsFile(parsed);
  }

  if (prompt === undefined) {
    throw new ValidationError("nothing to generate: pass --jobs <file|-> or -m <model> -p \"<prompt>\"");
  }

  const models = model !== undefined ? [model] : (config.models ?? []);
  if (models.length === 0) {
    throw new ValidationError('no model given: pass -m <model> or set "models" in ~/.config/orimg/config.json');
  }

  const jobTemplate: Record<string, unknown> = { prompt };
  const n = intFlag(values, "n", { min: 1, max: 10 });
  if (n !== undefined) jobTemplate.n = n;
  const seed = intFlag(values, "seed", { min: 0 });
  if (seed !== undefined) jobTemplate.seed = seed;
  const aspectRatio = strFlag(values, "aspect-ratio");
  if (aspectRatio !== undefined) jobTemplate.aspect_ratio = aspectRatio;
  const resolution = strFlag(values, "resolution");
  if (resolution !== undefined) jobTemplate.resolution = resolution;
  const quality = strFlag(values, "quality");
  if (quality !== undefined) jobTemplate.quality = quality;
  const outputFormat = strFlag(values, "output-format");
  if (outputFormat !== undefined) jobTemplate.output_format = outputFormat;
  const refs = strArrFlag(values, "ref");
  if (refs.length > 0) jobTemplate.input_references = refs;

  const input = {
    schema_version: 1,
    task: strFlag(values, "task"),
    jobs: models.map((m) => ({ ...jobTemplate, model: m })),
  };
  return validateJobsFile(input);
}

async function createExclusiveDir(base: string): Promise<string> {
  await mkdir(path.dirname(base), { recursive: true });
  for (let i = 1; ; i += 1) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    try {
      await mkdir(candidate);
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
}

function chatFallbackParams(job: Job): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (job.aspect_ratio !== undefined) params.aspect_ratio = job.aspect_ratio;
  if (job.resolution !== undefined) params.resolution = job.resolution;
  if (job.input_references !== undefined) params.input_references = job.input_references;
  return params;
}

function appliedParams(job: Job, via: "images" | "chat-fallback"): Record<string, unknown> {
  return via === "chat-fallback" ? chatFallbackParams(job) : publicParams(job);
}

function publicParams(job: Job): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (job.n !== undefined) params.n = job.n;
  if (job.resolution !== undefined) params.resolution = job.resolution;
  if (job.aspect_ratio !== undefined) params.aspect_ratio = job.aspect_ratio;
  if (job.quality !== undefined) params.quality = job.quality;
  if (job.output_format !== undefined) params.output_format = job.output_format;
  if (job.background !== undefined) params.background = job.background;
  if (job.seed !== undefined) params.seed = job.seed;
  if (job.input_references !== undefined) params.input_references = job.input_references;
  return params;
}

async function encodeReferences(refs: string[] | undefined, cwd: string): Promise<string[] | undefined> {
  if (refs === undefined || refs.length === 0) return undefined;
  const encoded: string[] = [];
  for (const ref of refs) {
    if (/^https?:\/\//i.test(ref) || ref.startsWith("data:")) {
      encoded.push(ref);
      continue;
    }
    const filePath = path.resolve(cwd, ref);
    try {
      const buf = await readFile(filePath);
      encoded.push(`data:${mimeForFile(filePath)};base64,${buf.toString("base64")}`);
    } catch (err) {
      throw new ValidationError(`cannot read input reference "${ref}": ${errorMessage(err)}`);
    }
  }
  return encoded;
}

function failCode(err: unknown): string {
  if (err instanceof AuthError) return "AUTH";
  if (err instanceof TimeoutError) return "TIMEOUT";
  if (err instanceof ApiError) return err.code;
  if (err instanceof CliError) return err.code;
  return "UNEXPECTED";
}

async function runDryRun(
  jobs: Job[],
  task: string | undefined,
  config: ConfigResolution,
  jsonMode: boolean,
): Promise<ExitCodeValue> {
  let priceMap = new Map<string, number | null>();
  try {
    const { models } = await getModels(config, {});
    priceMap = new Map(models.map((m) => [m.id, imagePriceUsd(m)]));
  } catch {
    // price estimates stay unknown without model data
  }

  const jobRows = jobs.map((job) => {
    const n = job.n ?? 1;
    const price = priceMap.get(job.model) ?? null;
    return {
      model: job.model,
      n,
      prompt_chars: job.prompt.length,
      params: publicParams(job),
      estimated_cost_usd: price === null ? null : roundUsd(price * n),
    };
  });

  const known = jobRows.filter((j) => j.estimated_cost_usd !== null);
  const totals = {
    jobs: jobRows.length,
    images: jobRows.reduce((sum, j) => sum + j.n, 0),
    estimated_cost_usd: roundUsd(known.reduce((sum, j) => sum + (j.estimated_cost_usd ?? 0), 0)),
    estimate_complete: known.length === jobRows.length,
  };

  if (jsonMode) {
    printEnvelope(successEnvelope({ dry_run: true, task: task ?? null, jobs: jobRows, totals }));
  } else {
    const rows = [["MODEL", "N", "EST. COST"]];
    for (const j of jobRows) rows.push([j.model, String(j.n), formatUsd(j.estimated_cost_usd)]);
    printLines([
      "dry run: jobs are valid, nothing was generated",
      ...renderTable(rows),
      "",
      `total: ${totals.images} image(s), estimated ${formatUsd(totals.estimated_cost_usd)}${totals.estimate_complete ? "" : " (partial estimate)"}`,
    ]);
  }
  return EXIT.OK;
}

export async function cmdGenerate(argv: string[]): Promise<ExitCodeValue> {
  const { values, positionals } = parseOrThrow({ args: argv, allowPositionals: true, options: GENERATE_OPTIONS });
  if (positionals.length > 0) {
    throw new ValidationError(`unexpected argument "${positionals[0]}"`);
  }

  const jsonMode = isJsonMode(values);
  const cwd = process.cwd();

  const config = await loadConfig({
    apiKey: strFlag(values, "api-key"),
    baseUrl: strFlag(values, "base-url"),
    out: strFlag(values, "out"),
    concurrency: intFlag(values, "concurrency", { min: 1, max: 32 }),
    timeout: intFlag(values, "timeout", { min: 1, max: 3600 }),
    retries: intFlag(values, "retries", { min: 0, max: 10 }),
  });

  const { task, jobs } = await loadJobsInput(values, config);

  if (boolFlag(values, "dry-run")) {
    return runDryRun(jobs, task, config, jsonMode);
  }

  if (config.apiKey === undefined) {
    throw new AuthError(
      "no OpenRouter API key found: set OPENROUTER_API_KEY (env or ./.env) or \"apiKey\" in ~/.config/orimg/config.json",
    );
  }

  const encodedRefs = await Promise.all(jobs.map((job) => encodeReferences(job.input_references, cwd)));

  const batchSlug = slugify(task ?? (jobs[0] as Job).prompt);
  const batchDir = await createExclusiveDir(path.resolve(cwd, config.out, `${timestampSlug()}-${batchSlug}`));

  const client = new OpenRouterClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeout * 1000,
    retries: config.retries,
  });

  const usedNames = new Set<string>();

  const { fulfilled, failed } = await fanout(jobs, config.concurrency, async (job, index): Promise<JobOutcome> => {
    const started = Date.now();
    const result = await client.generateImage({
      model: job.model,
      prompt: job.prompt,
      n: job.n,
      resolution: job.resolution,
      aspect_ratio: job.aspect_ratio,
      quality: job.quality,
      output_format: job.output_format,
      background: job.background,
      seed: job.seed,
      input_references: encodedRefs[index],
    });
    const durationMs = Date.now() - started;

    const base = slugify(task ?? job.prompt);
    const fallbackExt = job.output_format === "jpeg" ? "jpg" : (job.output_format ?? "png");
    const files: string[] = [];
    for (const [i, image] of result.images.entries()) {
      const name = uniqueName(
        usedNames,
        `${base}-${modelShort(job.model)}-${i + 1}`,
        extForMediaType(image.mediaType, fallbackExt),
      );
      await saveBase64(path.join(batchDir, name), image.b64);
      files.push(name);
    }

    return { job, files, cost: result.cost, durationMs, via: result.via, retries: result.retries };
  });

  const outcomeByIndex = new Map(fulfilled.map((f) => [f.index, f.value]));
  const failureByIndex = new Map(failed.map((f) => [f.index, f.error]));

  const manifestJobs: ManifestJob[] = jobs.map((job, index) => {
    const outcome = outcomeByIndex.get(index);
    if (outcome !== undefined) {
      const entry: ManifestJob = {
        model: job.model,
        prompt: job.prompt,
        params: appliedParams(job, outcome.via),
        status: "ok",
        files: outcome.files,
        cost_usd: outcome.cost,
        duration_ms: outcome.durationMs,
        via: outcome.via,
        retries: outcome.retries,
      };
      if (job.seed !== undefined) entry.seed = job.seed;
      return entry;
    }
    const error = failureByIndex.get(index);
    return {
      model: job.model,
      prompt: job.prompt,
      params: publicParams(job),
      status: "failed",
      files: [],
      error: errorMessage(error),
      code: failCode(error),
      retries: errorRetries(error),
    };
  });

  const outcomes = fulfilled.map((f) => f.value);
  const totalCost = roundUsd(outcomes.reduce((sum, o) => sum + (o.cost ?? 0), 0));
  const totalImages = outcomes.reduce((sum, o) => sum + o.files.length, 0);

  const manifest: Manifest = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    batch_dir: batchDir,
    jobs: manifestJobs,
    totals: { cost_usd: totalCost, images: totalImages, failed: failed.length },
  };
  if (task !== undefined) manifest.task = task;

  const manifestPath = await writeManifest(batchDir, manifest);

  const galleryEnabled = !boolFlag(values, "no-gallery");
  const galleryPath = galleryEnabled ? await writeGallery(batchDir, manifest) : null;

  if (boolFlag(values, "open") && galleryPath !== null && process.platform === "darwin") {
    const child = spawn("open", [galleryPath], { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  }

  const images: ImageRecord[] = [];
  for (const outcome of outcomes) {
    const perImageCost = outcome.cost === null ? null : roundUsd(outcome.cost / outcome.files.length);
    for (const file of outcome.files) {
      const record: ImageRecord = {
        model: outcome.job.model,
        path: path.join(batchDir, file),
        cost_usd: perImageCost,
        duration_ms: outcome.durationMs,
        params: appliedParams(outcome.job, outcome.via),
        via: outcome.via,
      };
      if (outcome.job.seed !== undefined) record.seed = outcome.job.seed;
      images.push(record);
    }
  }

  const failures: FailureRecord[] = failed.map((f) => ({
    model: f.item.model,
    error: errorMessage(f.error),
    code: failCode(f.error),
    retries: errorRetries(f.error),
  }));

  const data = {
    batch_dir: batchDir,
    manifest: manifestPath,
    gallery: galleryPath,
    images,
    failed: failures,
    totals: { cost_usd: totalCost, images: totalImages, failed: failures.length },
  };

  const authFailed = failures.some((f) => f.code === "AUTH");
  const allFailed = totalImages === 0;

  if (jsonMode) {
    const envelope: Envelope = allFailed
      ? { ...errorEnvelope(authFailed ? "AUTH" : "ALL_FAILED", summarizeFailures(failures)), data }
      : successEnvelope(data);
    printEnvelope(envelope);
  } else {
    const rows = [["MODEL", "STATUS", "FILES", "COST", "TIME"]];
    for (const entry of manifestJobs) {
      rows.push([
        modelShort(entry.model),
        entry.status === "ok" ? (entry.via === "chat-fallback" ? "ok (chat-fallback)" : "ok") : `FAILED (${entry.code ?? "?"})`,
        String(entry.files.length),
        formatUsd(entry.cost_usd ?? null),
        formatSeconds(entry.duration_ms),
      ]);
    }
    const lines = [...renderTable(rows), ""];
    for (const failure of failures) {
      lines.push(`  ${failure.model}: [${failure.code}] ${failure.error}`);
    }
    if (failures.length > 0) lines.push("");
    lines.push(`total: ${totalImages} image(s), ${formatUsd(totalCost)}${failures.length > 0 ? `, ${failures.length} job(s) failed` : ""}`);
    lines.push(`manifest: ${manifestPath}`);
    if (galleryPath !== null) lines.push(`gallery: ${galleryPath}`);
    printLines(lines);
    if (allFailed) process.stderr.write("orimg: all jobs failed\n");
  }

  if (allFailed) return authFailed ? EXIT.AUTH : EXIT.ALL_FAILED;
  if (boolFlag(values, "strict") && failures.length > 0) return EXIT.ALL_FAILED;
  return EXIT.OK;
}

function summarizeFailures(failures: FailureRecord[]): string {
  const parts = failures.map((f) => `${f.model}: [${f.code}] ${f.error}`);
  return `all jobs failed — ${parts.join("; ")}`;
}
