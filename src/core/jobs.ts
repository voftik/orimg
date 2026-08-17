import { ValidationError } from "./errors.js";
import type { GenParams, Job } from "../types.js";

const RESOLUTIONS = new Set(["512", "1K", "2K", "4K"]);
const QUALITIES = new Set(["auto", "low", "medium", "high"]);
const OUTPUT_FORMATS = new Set(["png", "jpeg", "webp", "svg"]);
const ASPECT_RE = /^\d{1,3}(\.\d{1,2})?:\d{1,3}(\.\d{1,2})?$/;

export interface ValidatedJobs {
  task?: string;
  jobs: Job[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Agents routinely emit `"field": null` to mean "no value" — treat null exactly
// like an absent field everywhere instead of failing validation.
function dropNulls(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== null) out[key] = value;
  }
  return out;
}

function checkParams(obj: Record<string, unknown>, label: string, errors: string[]): GenParams {
  const p: GenParams = {};

  if (obj.n !== undefined) {
    if (typeof obj.n === "number" && Number.isInteger(obj.n) && obj.n >= 1 && obj.n <= 10) p.n = obj.n;
    else errors.push(`${label}: "n" must be an integer between 1 and 10`);
  }

  if (obj.resolution !== undefined) {
    const raw = typeof obj.resolution === "string" || typeof obj.resolution === "number" ? String(obj.resolution) : "";
    const normalized = raw.toUpperCase();
    if (RESOLUTIONS.has(normalized)) p.resolution = normalized;
    else errors.push(`${label}: "resolution" must be one of 512, 1K, 2K, 4K`);
  }

  if (obj.aspect_ratio !== undefined) {
    if (typeof obj.aspect_ratio === "string" && ASPECT_RE.test(obj.aspect_ratio)) p.aspect_ratio = obj.aspect_ratio;
    else errors.push(`${label}: "aspect_ratio" must look like "16:9"`);
  }

  if (obj.quality !== undefined) {
    const q = typeof obj.quality === "string" ? obj.quality.toLowerCase() : "";
    if (QUALITIES.has(q)) p.quality = q;
    else errors.push(`${label}: "quality" must be one of auto, low, medium, high`);
  }

  if (obj.output_format !== undefined) {
    const f = typeof obj.output_format === "string" ? obj.output_format.toLowerCase() : "";
    if (OUTPUT_FORMATS.has(f)) p.output_format = f;
    else errors.push(`${label}: "output_format" must be one of png, jpeg, webp, svg`);
  }

  if (obj.background !== undefined) {
    if (typeof obj.background === "string" && obj.background.trim() !== "") p.background = obj.background;
    else errors.push(`${label}: "background" must be a non-empty string`);
  }

  if (obj.seed !== undefined) {
    if (typeof obj.seed === "number" && Number.isInteger(obj.seed) && obj.seed >= 0) p.seed = obj.seed;
    else errors.push(`${label}: "seed" must be a non-negative integer`);
  }

  if (obj.input_references !== undefined) {
    if (
      Array.isArray(obj.input_references) &&
      obj.input_references.every((r): r is string => typeof r === "string" && r.trim() !== "")
    ) {
      if (obj.input_references.length > 0) p.input_references = obj.input_references;
    } else {
      errors.push(`${label}: "input_references" must be an array of non-empty strings`);
    }
  }

  return p;
}

export function validateJobsFile(rawInput: unknown): ValidatedJobs {
  if (!isRecord(rawInput)) throw new ValidationError("jobs file must be a JSON object");
  const input = dropNulls(rawInput);

  const errors: string[] = [];

  if (input.schema_version !== 1) errors.push('"schema_version" must be 1');

  let task: string | undefined;
  if (input.task !== undefined) {
    if (typeof input.task === "string" && input.task.trim() !== "") task = input.task;
    else errors.push('"task" must be a non-empty string');
  }

  let defaults: GenParams = {};
  if (input.defaults !== undefined) {
    if (isRecord(input.defaults)) defaults = checkParams(dropNulls(input.defaults), "defaults", errors);
    else errors.push('"defaults" must be an object');
  }

  const jobs: Job[] = [];
  if (!Array.isArray(input.jobs) || input.jobs.length === 0) {
    errors.push('"jobs" must be a non-empty array');
  } else {
    input.jobs.forEach((rawJob, i) => {
      const label = `jobs[${i}]`;
      if (!isRecord(rawJob)) {
        errors.push(`${label} must be an object`);
        return;
      }
      const raw = dropNulls(rawJob);
      const model = typeof raw.model === "string" && raw.model.trim() !== "" ? raw.model.trim() : undefined;
      if (model === undefined) errors.push(`${label}: "model" must be a non-empty string`);
      const prompt = typeof raw.prompt === "string" && raw.prompt.trim() !== "" ? raw.prompt : undefined;
      if (prompt === undefined) errors.push(`${label}: "prompt" must be a non-empty string`);
      const params = checkParams(raw, label, errors);
      if (model !== undefined && prompt !== undefined) {
        jobs.push({ ...defaults, ...params, model, prompt });
      }
    });
  }

  if (errors.length > 0) {
    throw new ValidationError(`invalid jobs file:\n  - ${errors.join("\n  - ")}`);
  }

  const result: ValidatedJobs = { jobs };
  if (task !== undefined) result.task = task;
  return result;
}
