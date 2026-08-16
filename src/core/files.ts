import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function slugify(text: string, max = 40): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug === "" ? "image" : slug;
}

export function modelShort(model: string): string {
  const idx = model.indexOf("/");
  const short = idx >= 0 ? model.slice(idx + 1) : model;
  const cleaned = short.replace(/[/.]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "model" : cleaned;
}

export function timestampSlug(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

export function uniqueName(used: Set<string>, base: string, ext: string): string {
  let name = `${base}.${ext}`;
  for (let i = 2; used.has(name); i += 1) {
    name = `${base}-${i}.${ext}`;
  }
  used.add(name);
  return name;
}

export function extForMediaType(mediaType: string | undefined, fallback = "png"): string {
  switch (mediaType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/gif":
      return "gif";
    default:
      return fallback;
  }
}

export function mimeForFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "image/png";
  }
}

export async function saveBase64(filePath: string, b64: string): Promise<number> {
  const buf = Buffer.from(b64, "base64");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buf);
  return buf.length;
}
