import { setTimeout as sleep } from "node:timers/promises";
import { ApiError, AuthError, TimeoutError } from "./errors.js";

export interface ClientOptions {
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  n?: number;
  resolution?: string;
  aspect_ratio?: string;
  quality?: string;
  output_format?: string;
  background?: string;
  seed?: number;
  input_references?: string[];
}

export interface ImagePayload {
  b64: string;
  mediaType: string;
}

export interface GenerateResult {
  images: ImagePayload[];
  cost: number | null;
  via: "images" | "chat-fallback";
  retries: number;
}

export interface ImageModel {
  id: string;
  name?: string;
  description?: string;
  pricing?: Record<string, unknown>;
  supported_parameters?: unknown;
  [key: string]: unknown;
}

const RETRYABLE_STATUSES = new Set([429, 503, 529]);
const MAX_BACKOFF_MS = 30_000;
const MAX_RETRY_AFTER_MS = 60_000;

export function parseDataUrl(url: string): ImagePayload | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(url);
  if (m === null) return null;
  return { mediaType: m[1] as string, b64: m[2] as string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeControlChars(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
}

async function extractErrorMessage(res: Response): Promise<string> {
  return sanitizeControlChars(await extractErrorMessageRaw(res));
}

async function extractErrorMessageRaw(res: Response): Promise<string> {
  let text = "";
  try {
    text = await res.text();
  } catch {
    return res.statusText;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed)) {
      const error = parsed.error;
      if (isRecord(error) && typeof error.message === "string") return error.message;
      if (typeof parsed.message === "string") return parsed.message;
    }
  } catch {
    // not JSON, fall through
  }
  const trimmed = text.trim();
  return trimmed === "" ? res.statusText : trimmed.slice(0, 300);
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (header === null) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(0, date - Date.now()), MAX_RETRY_AFTER_MS);
  return null;
}

function backoffMs(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export class OpenRouterClient {
  private readonly opts: ClientOptions;

  constructor(opts: ClientOptions) {
    this.opts = opts;
  }

  private headers(withBody: boolean): Record<string, string> {
    const h: Record<string, string> = {
      "HTTP-Referer": "https://github.com/orimg",
      "X-Title": "orimg",
    };
    if (withBody) h["Content-Type"] = "application/json";
    if (this.opts.apiKey !== undefined && this.opts.apiKey !== "") {
      h.Authorization = `Bearer ${this.opts.apiKey}`;
    }
    return h;
  }

  private async request(
    pathname: string,
    init: { method: "GET" | "POST"; body?: string },
  ): Promise<{ res: Response; retries: number }> {
    const url = `${this.opts.baseUrl}${pathname}`;
    let retries = 0;
    for (;;) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: init.method,
          body: init.body,
          headers: this.headers(init.body !== undefined),
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
          const timeoutError = new TimeoutError(Math.round(this.opts.timeoutMs / 1000));
          timeoutError.retries = retries;
          throw timeoutError;
        }
        if (retries < this.opts.retries) {
          const wait = backoffMs(retries);
          retries += 1;
          await sleep(wait);
          continue;
        }
        const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
        const networkError = new ApiError(
          `network error${cause !== "" ? cause : `: ${err instanceof Error ? err.message : String(err)}`}`,
          0,
          "NETWORK",
        );
        networkError.retries = retries;
        throw networkError;
      }

      if (res.ok) return { res, retries };

      const message = await extractErrorMessage(res);

      if (res.status === 401 || res.status === 403) {
        const authError = new AuthError(`authentication failed (${res.status}): ${message}`);
        authError.retries = retries;
        throw authError;
      }

      if (RETRYABLE_STATUSES.has(res.status) && retries < this.opts.retries) {
        const wait = retryAfterMs(res) ?? backoffMs(retries);
        retries += 1;
        await sleep(wait);
        continue;
      }

      const apiError = new ApiError(`HTTP ${res.status}: ${message}`, res.status);
      apiError.retries = retries;
      throw apiError;
    }
  }

  async generateImage(req: ImageRequest): Promise<GenerateResult> {
    const body = JSON.stringify(
      pruneUndefined({
        model: req.model,
        prompt: req.prompt,
        n: req.n,
        resolution: req.resolution,
        aspect_ratio: req.aspect_ratio,
        quality: req.quality,
        output_format: req.output_format,
        background: req.background,
        seed: req.seed,
        input_references: req.input_references,
      }),
    );

    try {
      const { res, retries } = await this.request("/images", { method: "POST", body });
      const parsed = await parseImagesResponse(res).catch((err: unknown) => this.rethrowBodyAbort(err, 0));
      return { ...parsed, via: "images", retries };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return this.chatFallback(req);
      }
      throw err;
    }
  }

  private rethrowBodyAbort(err: unknown, retries: number): never {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      const timeoutError = new TimeoutError(Math.round(this.opts.timeoutMs / 1000));
      timeoutError.retries = retries;
      throw timeoutError;
    }
    throw err;
  }

  private async chatFallback(req: ImageRequest): Promise<GenerateResult> {
    const refs = req.input_references ?? [];
    const content =
      refs.length === 0
        ? req.prompt
        : [
            { type: "text", text: req.prompt },
            ...refs.map((url) => ({ type: "image_url", image_url: { url } })),
          ];
    const imageConfig = pruneUndefined({ aspect_ratio: req.aspect_ratio, image_size: req.resolution });
    const body = JSON.stringify(
      pruneUndefined({
        model: req.model,
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
        image_config: Object.keys(imageConfig).length > 0 ? imageConfig : undefined,
      }),
    );

    let response: { res: Response; retries: number };
    try {
      response = await this.request("/chat/completions", { method: "POST", body });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
        const hint = req.model.includes("/") ? req.model.split("/").pop() : req.model;
        const invalid = new ApiError(
          `model "${req.model}" is not available on /images or /chat/completions; try \`orimg models --search ${hint ?? req.model}\``,
          404,
          "INVALID_MODEL",
        );
        invalid.retries = err.retries;
        throw invalid;
      }
      throw err;
    }

    const parsed = await parseChatResponse(response.res).catch((err: unknown) =>
      this.rethrowBodyAbort(err, response.retries),
    );
    return { ...parsed, via: "chat-fallback", retries: response.retries };
  }

  async listModels(): Promise<ImageModel[]> {
    const { res } = await this.request("/images/models", { method: "GET" });
    const parsed: unknown = await res.json();
    if (!isRecord(parsed) || !Array.isArray(parsed.data)) return [];
    return parsed.data.filter((m): m is ImageModel => isRecord(m) && typeof m.id === "string");
  }
}

async function parseImagesResponse(res: Response): Promise<{ images: ImagePayload[]; cost: number | null }> {
  const parsed: unknown = await res.json();
  const images: ImagePayload[] = [];
  let cost: number | null = null;

  if (isRecord(parsed)) {
    if (Array.isArray(parsed.data)) {
      for (const item of parsed.data) {
        if (!isRecord(item)) continue;
        if (typeof item.b64_json === "string" && item.b64_json !== "") {
          images.push({
            b64: item.b64_json,
            mediaType: typeof item.media_type === "string" ? item.media_type : "image/png",
          });
        } else if (typeof item.url === "string" && item.url.startsWith("data:")) {
          const fromUrl = parseDataUrl(item.url);
          if (fromUrl !== null) images.push(fromUrl);
        }
      }
    }
    if (isRecord(parsed.usage) && typeof parsed.usage.cost === "number") cost = parsed.usage.cost;
  }

  if (images.length === 0) throw new ApiError("response contained no images", 200, "NO_IMAGES");
  return { images, cost };
}

async function parseChatResponse(res: Response): Promise<{ images: ImagePayload[]; cost: number | null }> {
  const parsed: unknown = await res.json();
  const images: ImagePayload[] = [];
  let cost: number | null = null;

  if (isRecord(parsed)) {
    const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
    const first: unknown = choices[0];
    if (isRecord(first) && isRecord(first.message) && Array.isArray(first.message.images)) {
      for (const item of first.message.images) {
        let url: string | undefined;
        if (typeof item === "string") url = item;
        else if (isRecord(item)) {
          if (isRecord(item.image_url) && typeof item.image_url.url === "string") url = item.image_url.url;
          else if (typeof item.url === "string") url = item.url;
        }
        if (url !== undefined && url.startsWith("data:")) {
          const fromUrl = parseDataUrl(url);
          if (fromUrl !== null) images.push(fromUrl);
        }
      }
    }
    if (isRecord(parsed.usage) && typeof parsed.usage.cost === "number") cost = parsed.usage.cost;
  }

  if (images.length === 0) throw new ApiError("chat fallback returned no images", 200, "NO_IMAGES");
  return { images, cost };
}
