import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { loadConfig } from "../core/config.js";
import { ValidationError } from "../core/errors.js";
import { OpenRouterClient } from "../core/openrouter.js";
import type { ImageModel } from "../core/openrouter.js";
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

export function imagePriceUsd(model: ImageModel): number | null {
  const pricing = model.pricing;
  if (typeof pricing !== "object" || pricing === null) return null;
  const raw = (pricing as Record<string, unknown>).image;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function priceLabel(model: ImageModel): string {
  const price = imagePriceUsd(model);
  return price === null ? "-" : `$${price}`;
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
    if (jsonMode) printEnvelope(successEnvelope({ model, source }));
    else printLines([JSON.stringify(model, null, 2)]);
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

  const rows = [["MODEL", "PRICE/IMAGE", "NAME"]];
  for (const model of filtered) {
    rows.push([model.id, priceLabel(model), model.name ?? ""]);
  }
  printLines([...renderTable(rows), "", `${filtered.length} model(s), source: ${source}`]);
  return EXIT.OK;
}
