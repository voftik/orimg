import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { ParseArgsConfig } from "node:util";
import { ValidationError, errorMessage } from "./errors.js";
import type { Envelope } from "../types.js";

export type FlagValues = Record<string, string | boolean | Array<string | boolean> | undefined>;

export interface ParsedFlags {
  values: FlagValues;
  positionals: string[];
}

export function parseOrThrow(config: ParseArgsConfig): ParsedFlags {
  try {
    const { values, positionals } = parseArgs(config);
    return { values: values as FlagValues, positionals };
  } catch (err) {
    throw new ValidationError(errorMessage(err));
  }
}

export function strFlag(values: FlagValues, name: string): string | undefined {
  const v = values[name];
  return typeof v === "string" ? v : undefined;
}

export function boolFlag(values: FlagValues, name: string): boolean {
  return values[name] === true;
}

export function strArrFlag(values: FlagValues, name: string): string[] {
  const v = values[name];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export function intFlag(values: FlagValues, name: string, opts: { min?: number; max?: number } = {}): number | undefined {
  const v = values[name];
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new ValidationError(`--${name} must be an integer`);
  }
  if (opts.min !== undefined && n < opts.min) throw new ValidationError(`--${name} must be >= ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new ValidationError(`--${name} must be <= ${opts.max}`);
  return n;
}

export function isJsonMode(values: FlagValues): boolean {
  return boolFlag(values, "json") || !process.stdout.isTTY;
}

export function successEnvelope(data: unknown): Envelope {
  return { schema_version: 1, success: true, data, error: null };
}

export function errorEnvelope(code: string, message: string, data?: unknown): Envelope {
  const envelope: Envelope = { schema_version: 1, success: false, error: { code, message } };
  if (data !== undefined) envelope.data = data;
  return envelope;
}

export function printEnvelope(envelope: Envelope): void {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}

export function printLines(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

export function renderTable(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i] ?? cell.length)))
      .join("  ")
      .trimEnd(),
  );
}

export function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `$${value.toFixed(4)}`;
}

export function formatSeconds(ms: number | undefined): string {
  if (ms === undefined) return "-";
  return `${(ms / 1000).toFixed(1)}s`;
}

let cachedRoot: string | null = null;

export function packageRoot(): string {
  if (cachedRoot !== null) return cachedRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(dir, "package.json"))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cachedRoot = path.dirname(fileURLToPath(import.meta.url));
  return cachedRoot;
}

export function packageVersion(): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(packageRoot(), "package.json"), "utf8"));
    if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === "string") return version;
    }
  } catch {
    // fall through
  }
  return "0.0.0";
}
