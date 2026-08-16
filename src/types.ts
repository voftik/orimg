export interface GenParams {
  n?: number;
  resolution?: string;
  aspect_ratio?: string;
  quality?: string;
  output_format?: string;
  background?: string;
  seed?: number;
  input_references?: string[];
}

export interface Job extends GenParams {
  model: string;
  prompt: string;
}

export interface JobsFile {
  schema_version: number;
  task?: string;
  defaults?: GenParams;
  jobs: Job[];
}

export interface ResolvedConfig {
  apiKey?: string;
  baseUrl: string;
  out: string;
  concurrency: number;
  timeout: number;
  retries: number;
  models?: string[];
}

export interface ImageRecord {
  model: string;
  path: string;
  seed?: number;
  cost_usd: number | null;
  duration_ms: number;
  params: Record<string, unknown>;
  via?: "images" | "chat-fallback";
}

export interface FailureRecord {
  model: string;
  error: string;
  code: string;
  retries: number;
}

export interface ManifestJob {
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  status: "ok" | "failed";
  files: string[];
  seed?: number;
  cost_usd?: number | null;
  duration_ms?: number;
  via?: "images" | "chat-fallback";
  retries?: number;
  error?: string;
  code?: string;
}

export interface Manifest {
  schema_version: 1;
  created_at: string;
  task?: string;
  batch_dir: string;
  jobs: ManifestJob[];
  totals: { cost_usd: number; images: number; failed: number };
  chosen?: { file: string; to: string; at: string };
}

export interface Envelope {
  schema_version: 1;
  success: boolean;
  data?: unknown;
  error: { code: string; message: string } | null;
}
