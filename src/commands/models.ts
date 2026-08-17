import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import { ValidationError } from "../core/errors.js";
import { OpenRouterClient } from "../core/openrouter.js";
import type { ImageModel, ModelEndpoint } from "../core/openrouter.js";
import type { Job } from "../types.js";
import {
  boolFlag,
  isJsonMode,
  parseOrThrow,
  printEnvelope,
  printLines,
  renderTable,
  strFlag,
  successEnvelope,
} from "../core/cliutil.js";
import { EXIT } from "../core/errors.js";
import type { ExitCodeValue } from "../core/errors.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function modelsCacheFile(env: NodeJS.ProcessEnv = process.env): string {
  const custom = env.ORIMG_CACHE_DIR;
  const xdg = env.XDG_CACHE_HOME;
  const dir =
    typeof custom === "string" && custom.trim() !== ""
      ? custom
      : typeof xdg === "string" && xdg.trim() !== ""
        ? path.join(xdg, "orimg")
        : path.join(homedir(), ".cache", "orimg");
  return path.join(dir, "models.json");
}

interface ModelsCache {
  fetched_at: string;
  data: ImageModel[];
}

async function readCache(file: string): Promise<ModelsCache | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ModelsCache).fetched_at === "string" &&
      Array.isArray((parsed as ModelsCache).data)
    ) {
      return parsed as ModelsCache;
    }
  } catch {
    // missing or corrupt cache
  }
  return null;
}

export interface ModelsSource {
  models: ImageModel[];
  source: "cache" | "api" | "stale-cache";
}

export async function getModels(
  config: { apiKey?: string; baseUrl: string; retries: number },
  opts: { refresh?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<ModelsSource> {
  const cacheFile = modelsCacheFile(opts.env ?? process.env);
  const cache = await readCache(cacheFile);

  if (cache !== null && opts.refresh !== true) {
    const age = Date.now() - Date.parse(cache.fetched_at);
    if (Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS) {
      return { models: cache.data, source: "cache" };
    }
  }

  const client = new OpenRouterClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: 30_000,
    retries: Math.min(config.retries, 1),
  });

  try {
    const models = await client.listModels();
    try {
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, `${JSON.stringify({ fetched_at: new Date().toISOString(), data: models })}\n`, "utf8");
    } catch {
      // cache write failures are non-fatal
    }
    return { models, source: "api" };
  } catch (err) {
    if (cache !== null) return { models: cache.data, source: "stale-cache" };
    throw err;
  }
}

interface EndpointsCacheEntry {
  fetched_at: string;
  endpoints: ModelEndpoint[];
}

export function endpointsCacheFile(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(path.dirname(modelsCacheFile(env)), "endpoints.json");
}

async function readEndpointsCache(file: string): Promise<Record<string, EndpointsCacheEntry>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, EndpointsCacheEntry>;
    }
  } catch {
    // missing or corrupt cache
  }
  return {};
}

export async function getModelEndpoints(
  config: { apiKey?: string; baseUrl: string; retries: number },
  modelId: string,
  opts: { refresh?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<ModelEndpoint[] | null> {
  const cacheFile = endpointsCacheFile(opts.env ?? process.env);
  const cache = await readEndpointsCache(cacheFile);
  const entry = cache[modelId];

  if (entry !== undefined && opts.refresh !== true) {
    const age = Date.now() - Date.parse(entry.fetched_at);
    if (Number.isFinite(age) && age >= 0 && age < CACHE_TTL_MS) return entry.endpoints;
  }

  const client = new OpenRouterClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: 30_000,
    retries: Math.min(config.retries, 1),
  });

  try {
    const endpoints = await client.modelEndpoints(modelId);
    cache[modelId] = { fetched_at: new Date().toISOString(), endpoints };
    try {
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, `${JSON.stringify(cache)}\n`, "utf8");
    } catch {
      // cache write failures are non-fatal
    }
    return endpoints;
  } catch {
    return entry?.endpoints ?? null;
  }
}

const RESOLUTION_ORDER = ["512", "1K", "2K", "4K"];

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pricingEntries(endpoints: ModelEndpoint[]): Array<Record<string, unknown>> {
  for (const endpoint of endpoints) {
    if (Array.isArray(endpoint.pricing)) {
      return endpoint.pricing.filter(isRecordValue).filter((p) => typeof p.cost_usd === "number");
    }
  }
  return [];
}

function supportedParams(endpoints: ModelEndpoint[]): Record<string, unknown> | null {
  for (const endpoint of endpoints) {
    if (isRecordValue(endpoint.supported_parameters)) return endpoint.supported_parameters;
  }
  return null;
}

export function estimateJobCostUsd(
  job: { resolution?: string; n?: number; input_references?: string[] },
  endpoints: ModelEndpoint[],
): number | null {
  const pricing = pricingEntries(endpoints);
  const output = pricing.filter((p) => p.billable === "output_image");
  if (output.length === 0) return null;

  const base = output.find((p) => p.variant === undefined) ?? (output[0] as Record<string, unknown>);
  const high = output.find((p) => p.variant === "high_resolution");

  const sp = supportedParams(endpoints);
  const resDecl = sp !== null && isRecordValue(sp.resolution) ? sp.resolution : null;
  const declared = resDecl !== null && Array.isArray(resDecl.values) ? resDecl.values.filter((v): v is string => typeof v === "string") : [];
  const top = RESOLUTION_ORDER.filter((r) => declared.includes(r)).pop();

  const jobRank = RESOLUTION_ORDER.indexOf(job.resolution ?? "1K");
  const topRank = top === undefined ? -1 : RESOLUTION_ORDER.indexOf(top);
  const useHigh = high !== undefined && top !== undefined && top !== "1K" && jobRank >= topRank;

  const perImage = (useHigh ? high : base).cost_usd as number;
  const inputEntry = pricing.find((p) => p.billable === "input_image");
  const refCount = job.input_references?.length ?? 0;
  const inputCost = inputEntry !== undefined && refCount > 0 ? (inputEntry.cost_usd as number) * refCount : 0;

  return perImage * (job.n ?? 1) + inputCost;
}

export function preflightWarnings(job: Job, endpoints: ModelEndpoint[]): string[] {
  const sp = supportedParams(endpoints);
  if (sp === null) return [];
  const warnings: string[] = [];

  const checkEnum = (field: string, value: string | undefined): void => {
    if (value === undefined) return;
    const decl = sp[field];
    if (!isRecordValue(decl)) {
      warnings.push(`"${field}" is not declared by ${job.model}; the API may ignore or reject it`);
      return;
    }
    const values = decl.values;
    if (Array.isArray(values) && !values.includes(value)) {
      warnings.push(`"${field}": "${value}" is not in ${job.model}'s supported values (${values.join(", ")})`);
    }
  };

  checkEnum("resolution", job.resolution);
  checkEnum("aspect_ratio", job.aspect_ratio);
  checkEnum("quality", job.quality);
  checkEnum("output_format", job.output_format);
  checkEnum("background", job.background);

  const checkRange = (field: string, count: number | undefined): void => {
    if (count === undefined) return;
    const decl = sp[field];
    if (!isRecordValue(decl)) {
      if (count > 1 || field === "input_references") {
        warnings.push(`"${field}" is not declared by ${job.model}; the API may ignore or reject it`);
      }
      return;
    }
    if (typeof decl.max === "number" && count > decl.max) {
      warnings.push(`"${field}": ${count} exceeds ${job.model}'s maximum of ${decl.max}`);
    }
  };

  checkRange("n", job.n);
  checkRange("input_references", job.input_references?.length);

  if (job.seed !== undefined && !isRecordValue(sp.seed)) {
    warnings.push(`"seed" is not declared by ${job.model}; the API may ignore or reject it`);
  }

  return warnings;
}

export function imagePriceUsd(model: ImageModel): number | null {
  const pricing = model.pricing;
  if (typeof pricing !== "object" || pricing === null) return null;
  const raw = (pricing as Record<string, unknown>).image;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : null;
}


export async function cmdModels(argv: string[]): Promise<ExitCodeValue> {
  const { values, positionals } = parseOrThrow({
    args: argv,
    allowPositionals: true,
    options: {
      search: { type: "string" },
      refresh: { type: "boolean" },
      json: { type: "boolean" },
      "api-key": { type: "string" },
      "base-url": { type: "string" },
    },
  });

  const jsonMode = isJsonMode(values);
  const config = await loadConfig({ apiKey: strFlag(values, "api-key"), baseUrl: strFlag(values, "base-url") });
  const { models, source } = await getModels(config, { refresh: boolFlag(values, "refresh") });

  const modelId = positionals[0];
  if (modelId !== undefined) {
    const model = models.find((m) => m.id === modelId);
    if (model === undefined) {
      const hint = modelId.includes("/") ? (modelId.split("/").pop() ?? modelId) : modelId;
      throw new ValidationError(`model "${modelId}" not found; try \`orimg models --search ${hint}\``);
    }
    const endpoints = await getModelEndpoints(config, modelId, { refresh: boolFlag(values, "refresh") });
    if (jsonMode) printEnvelope(successEnvelope({ model, endpoints, source }));
    else printLines([JSON.stringify({ ...model, endpoints }, null, 2)]);
    return EXIT.OK;
  }

  const search = strFlag(values, "search")?.toLowerCase();
  const filtered =
    search === undefined
      ? models
      : models.filter(
          (m) => m.id.toLowerCase().includes(search) || (m.name ?? "").toLowerCase().includes(search),
        );

  if (jsonMode) {
    printEnvelope(successEnvelope({ models: filtered, count: filtered.length, source }));
    return EXIT.OK;
  }

  if (filtered.length === 0) {
    printLines([`no image models matched${search === undefined ? "" : ` "${search}"`} (source: ${source})`]);
    return EXIT.OK;
  }

  const rows = [["MODEL", "NAME"]];
  for (const model of filtered) {
    rows.push([model.id, model.name ?? ""]);
  }
  printLines([...renderTable(rows), "", `${filtered.length} model(s), source: ${source}`]);
  return EXIT.OK;
}
