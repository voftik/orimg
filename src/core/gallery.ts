import { writeFile } from "node:fs/promises";
import path from "node:path";
import { formatSeconds, formatUsd } from "./cliutil.js";
import type { Manifest, ManifestJob } from "../types.js";

export const GALLERY_NAME = "index.html";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paramsSummary(job: ManifestJob): string {
  const parts: string[] = [];
  const p = job.params;
  for (const key of ["aspect_ratio", "resolution", "quality", "output_format"]) {
    const value = p[key];
    if (typeof value === "string" || typeof value === "number") parts.push(String(value));
  }
  if (typeof p.n === "number" && p.n > 1) parts.push(`n=${p.n}`);
  if (typeof p.seed === "number") parts.push(`seed=${p.seed}`);
  return parts.join(" · ");
}

function jobSection(job: ManifestJob): string {
  const model = escapeHtml(job.model);
  const viaBadge = job.via === "chat-fallback" ? '<span class="badge">chat-fallback</span>' : "";
  const promptPreview = escapeHtml(job.prompt.length > 280 ? `${job.prompt.slice(0, 280)}…` : job.prompt);

  if (job.status === "failed") {
    return [
      '<section class="job failed">',
      `<h2>${model}<span class="badge error-badge">failed</span></h2>`,
      `<p class="error">${escapeHtml(job.code ?? "ERROR")}: ${escapeHtml(job.error ?? "unknown error")}</p>`,
      "</section>",
    ].join("\n");
  }

  const meta = [paramsSummary(job), formatUsd(job.cost_usd ?? null), formatSeconds(job.duration_ms)]
    .filter((s) => s !== "" && s !== "-")
    .join(" · ");

  const figures = job.files
    .map((file) => {
      const src = escapeHtml(file);
      return [
        '<figure class="card">',
        `<img src="${src}" alt="${src}" loading="lazy" onclick="zoomImage(this)">`,
        `<figcaption><strong>${src}</strong><br><span class="muted">${escapeHtml(meta)}</span></figcaption>`,
        "</figure>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<section class="job">',
    `<h2>${model}${viaBadge}</h2>`,
    `<p class="prompt">${promptPreview}</p>`,
    `<div class="grid">${figures}</div>`,
    "</section>",
  ].join("\n");
}

export function renderGallery(manifest: Manifest): string {
  const title = escapeHtml(manifest.task ?? "orimg batch");
  const meta = [
    escapeHtml(manifest.created_at),
    `${manifest.totals.images} image${manifest.totals.images === 1 ? "" : "s"}`,
    manifest.totals.failed > 0 ? `${manifest.totals.failed} failed` : null,
    formatUsd(manifest.totals.cost_usd),
  ]
    .filter((s): s is string => s !== null)
    .join(" · ");

  const sections = manifest.jobs.map(jobSection).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>orimg — ${title}</title>
<style>
:root {
  --bg: #f5f6f8;
  --card: #ffffff;
  --text: #16181d;
  --muted: #667085;
  --border: #e0e4ea;
  --accent: #4f6ef7;
  --error: #c0392b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101216;
    --card: #191d24;
    --text: #e8eaee;
    --muted: #8b93a3;
    --border: #262c36;
    --accent: #7d95ff;
    --error: #ff7b6b;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 28px clamp(16px, 4vw, 48px);
  background: var(--bg);
  color: var(--text);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
header h1 { margin: 0 0 4px; font-size: 22px; }
header .meta { margin: 0 0 24px; color: var(--muted); }
.job { margin-bottom: 32px; }
.job h2 { font-size: 16px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
}
.error-badge { background: var(--error); }
.prompt { margin: 0 0 12px; color: var(--muted); font-size: 13px; max-width: 72ch; }
.error { color: var(--error); font-size: 14px; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.card {
  margin: 0;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.card img {
  display: block;
  width: 100%;
  height: auto;
  cursor: zoom-in;
  background: var(--border);
}
.card figcaption { padding: 10px 12px; font-size: 12px; word-break: break-all; }
.muted { color: var(--muted); }
#lightbox {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
  z-index: 10;
}
#lightbox.on { display: flex; }
#lightbox img { max-width: 95vw; max-height: 95vh; }
</style>
</head>
<body>
<header>
<h1>${title}</h1>
<p class="meta">${meta}</p>
</header>
<main>
${sections}
</main>
<div id="lightbox" onclick="this.classList.remove('on')"><img id="lightbox-img" alt=""></div>
<script>
function zoomImage(img) {
  document.getElementById('lightbox-img').src = img.src;
  document.getElementById('lightbox').classList.add('on');
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') document.getElementById('lightbox').classList.remove('on');
});
</script>
</body>
</html>
`;
}

export async function writeGallery(batchDir: string, manifest: Manifest): Promise<string> {
  const file = path.join(batchDir, GALLERY_NAME);
  await writeFile(file, renderGallery(manifest), "utf8");
  return file;
}
