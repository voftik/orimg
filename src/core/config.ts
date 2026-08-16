import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ResolvedConfig } from "../types.js";

export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export const CONFIG_DEFAULTS = {
  out: "./ai-images",
  concurrency: 4,
  timeout: 180,
  retries: 2,
} as const;

export type ApiKeySource = "flag" | "env" | "dotenv" | "config-file";

export interface ConfigFlags {
  apiKey?: string;
  baseUrl?: string;
  out?: string;
  concurrency?: number;
  timeout?: number;
  retries?: number;
}

export interface ConfigContext {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  configDir?: string;
}

export interface ConfigResolution extends ResolvedConfig {
  apiKeySource: ApiKeySource | null;
  configFile: string;
}

export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const stripped = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "") out[key] = value;
  }
  return out;
}

async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function readDotEnvFile(cwd: string): Promise<Record<string, string>> {
  try {
    return parseDotEnv(await readFile(path.join(cwd, ".env"), "utf8"));
  } catch {
    return {};
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    const s = nonEmpty(v);
    if (s !== undefined) return s;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

export async function loadConfig(flags: ConfigFlags = {}, ctx: ConfigContext = {}): Promise<ConfigResolution> {
  const env = ctx.env ?? process.env;
  const cwd = ctx.cwd ?? process.cwd();
  const configDir = ctx.configDir ?? nonEmpty(env.ORIMG_CONFIG_DIR) ?? path.join(homedir(), ".config", "orimg");
  const configFile = path.join(configDir, "config.json");

  const file = await readJsonObject(configFile);
  const dotenv = await readDotEnvFile(cwd);

  let apiKey: string | undefined;
  let apiKeySource: ApiKeySource | null = null;
  const keyCandidates: Array<[ApiKeySource, string | undefined]> = [
    ["flag", nonEmpty(flags.apiKey)],
    ["env", firstString(env.OPENROUTER_API_KEY, env.ORIMG_API_KEY)],
    ["dotenv", firstString(dotenv.OPENROUTER_API_KEY, dotenv.ORIMG_API_KEY)],
    ["config-file", nonEmpty(file.apiKey)],
  ];
  for (const [source, value] of keyCandidates) {
    if (value !== undefined) {
      apiKey = value;
      apiKeySource = source;
      break;
    }
  }

  // baseUrl deliberately ignores ./.env: a planted project .env must not be able to
  // redirect requests (and the Authorization header) away from openrouter.ai while
  // the key comes from a trusted source.
  const baseUrl = (firstString(flags.baseUrl, env.ORIMG_BASE_URL, file.baseUrl) ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );

  const out = firstString(flags.out, env.ORIMG_OUT, dotenv.ORIMG_OUT, file.outDir) ?? CONFIG_DEFAULTS.out;

  const concurrency =
    firstNumber(flags.concurrency, env.ORIMG_CONCURRENCY, dotenv.ORIMG_CONCURRENCY, file.concurrency) ??
    CONFIG_DEFAULTS.concurrency;
  const timeout =
    firstNumber(flags.timeout, env.ORIMG_TIMEOUT, dotenv.ORIMG_TIMEOUT, file.timeout) ?? CONFIG_DEFAULTS.timeout;
  const retries =
    firstNumber(flags.retries, env.ORIMG_RETRIES, dotenv.ORIMG_RETRIES, file.retries) ?? CONFIG_DEFAULTS.retries;

  const models = Array.isArray(file.models)
    ? file.models.filter((m): m is string => typeof m === "string" && m.trim() !== "")
    : undefined;

  const resolved: ConfigResolution = {
    apiKey,
    apiKeySource,
    baseUrl,
    out,
    concurrency: clampInt(concurrency, 1, 32, CONFIG_DEFAULTS.concurrency),
    timeout: clampInt(timeout, 1, 3600, CONFIG_DEFAULTS.timeout),
    retries: clampInt(retries, 0, 10, CONFIG_DEFAULTS.retries),
    configFile,
  };
  if (models !== undefined && models.length > 0) resolved.models = models;
  return resolved;
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.round(value);
  return Math.min(max, Math.max(min, n));
}

export function maskApiKey(key: string | undefined): string | null {
  if (key === undefined || key === "") return null;
  return `...${key.slice(-3)}`;
}
