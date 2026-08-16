import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ValidationError, errorMessage } from "./errors.js";
import type { Manifest } from "../types.js";

export const MANIFEST_NAME = "manifest.json";

export async function writeManifest(batchDir: string, manifest: Manifest): Promise<string> {
  const file = path.join(batchDir, MANIFEST_NAME);
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return file;
}

function looksLikeManifest(value: unknown): value is Manifest {
  if (typeof value !== "object" || value === null) return false;
  const m = value as Record<string, unknown>;
  return m.schema_version === 1 && Array.isArray(m.jobs) && typeof m.batch_dir === "string";
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function readManifest(fileOrDir: string): Promise<{ manifest: Manifest; file: string }> {
  const file = (await isDirectory(fileOrDir)) ? path.join(fileOrDir, MANIFEST_NAME) : fileOrDir;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new ValidationError(`cannot read manifest at ${file}: ${errorMessage(err)}`);
  }
  if (!looksLikeManifest(parsed)) {
    throw new ValidationError(`not a valid orimg manifest: ${file}`);
  }
  return { manifest: parsed, file };
}
