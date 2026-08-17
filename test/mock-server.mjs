import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PX_B64 = readFileSync(path.join(HERE, "fixtures", "px.png.b64"), "utf8").trim();

// Mirrors the live catalog shape: no top-level pricing, `endpoints` is a URL string.
export const MOCK_MODELS = [
  { id: "mock/good-model", name: "Mock Good", endpoints: "/api/v1/images/models/mock/good-model/endpoints" },
  { id: "mock/good-model-b", name: "Mock Good B", endpoints: "/api/v1/images/models/mock/good-model-b/endpoints" },
  { id: "mock/rate-limit-model", name: "Mock Rate Limited", endpoints: "/api/v1/images/models/mock/rate-limit-model/endpoints" },
  { id: "mock/fail-500-model", name: "Mock Broken", endpoints: "/api/v1/images/models/mock/fail-500-model/endpoints" },
  { id: "mock/unpriced-model", name: "Mock Unpriced", endpoints: "/api/v1/images/models/mock/unpriced-model/endpoints" },
];

const MOCK_SUPPORTED_PARAMETERS = {
  resolution: { type: "enum", values: ["1K", "2K"] },
  aspect_ratio: { type: "enum", values: ["1:1", "16:9", "9:16", "3:2", "2:3"] },
  quality: { type: "enum", values: ["auto", "low", "medium", "high"] },
  output_format: { type: "enum", values: ["png", "jpeg", "webp"] },
  n: { type: "range", min: 1, max: 4 },
  input_references: { type: "range", min: 0, max: 14 },
  seed: { type: "boolean" },
};

function mockPricingFor(modelId) {
  if (modelId.includes("unpriced")) return [];
  const base = modelId.includes("good-model-b") ? 0.03 : modelId.includes("rate-limit") ? 0.02 : 0.04;
  return [
    { billable: "output_image", unit: "image", cost_usd: base },
    { billable: "output_image", unit: "image", cost_usd: base * 2, variant: "high_resolution" },
    { billable: "input_image", unit: "image", cost_usd: 0.003 },
  ];
}

export function createState() {
  return {
    requests: [],
    attempts: new Map(),
  };
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function imageSuccess(res, n, costPerRequest = 0.04) {
  const data = Array.from({ length: n }, () => ({ b64_json: PX_B64, media_type: "image/png" }));
  json(res, 200, { data, usage: { cost: costPerRequest } });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function startMockServer(state = createState()) {
  const server = http.createServer((req, res) => {
    void handle(req, res, state).catch((err) => {
      json(res, 500, { error: { message: `mock server crash: ${err.message}` } });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/v1`;

  return {
    url,
    state,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function handle(req, res, state) {
  const url = new URL(req.url, "http://mock");
  const route = `${req.method} ${url.pathname}`;

  if (route === "GET /api/v1/images/models") {
    state.requests.push({ route, model: null });
    json(res, 200, { data: MOCK_MODELS });
    return;
  }

  if (route === "GET /api/v1/key") {
    state.requests.push({ route, model: null });
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ") || auth === "Bearer bad-key") {
      json(res, 401, { error: { message: "Invalid credentials" } });
      return;
    }
    json(res, 200, { data: { label: "mock-key", usage: 0 } });
    return;
  }

  if (req.method === "GET" && /^\/api\/v1\/images\/models\/.+\/endpoints$/.test(url.pathname)) {
    const modelId = url.pathname.slice("/api/v1/images/models/".length, -"/endpoints".length);
    state.requests.push({ route: "GET /api/v1/images/models/:id/endpoints", model: modelId });
    json(res, 200, {
      id: modelId,
      endpoints: [
        {
          provider_name: "Mock Provider",
          pricing: mockPricingFor(modelId),
          supported_parameters: MOCK_SUPPORTED_PARAMETERS,
        },
      ],
    });
    return;
  }

  if (route === "POST /api/v1/images") {
    const body = await readBody(req);
    const model = typeof body.model === "string" ? body.model : "";
    state.requests.push({ route, model, body });

    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ") || auth === "Bearer bad-key") {
      json(res, 401, { error: { message: "No auth credentials found" } });
      return;
    }

    const attempts = (state.attempts.get(model) ?? 0) + 1;
    state.attempts.set(model, attempts);

    if (model.includes("always-429")) {
      json(res, 429, { error: { message: "Rate limited" } }, { "Retry-After": "0" });
      return;
    }
    if (model.includes("rate-limit")) {
      if (attempts < 2) {
        json(res, 429, { error: { message: "Rate limited, try again" } }, { "Retry-After": "0" });
        return;
      }
      imageSuccess(res, body.n ?? 1, 0.02);
      return;
    }
    if (model.includes("fail-500")) {
      json(res, 500, { error: { message: "Internal provider error" } });
      return;
    }
    if (model.includes("c1-error")) {
      json(res, 400, { error: { message: "provider says \u009b[31mnope\u009b[0m stop" } });
      return;
    }
    if (model.includes("retry-then-slow-body")) {
      if (attempts < 2) {
        json(res, 429, { error: { message: "Rate limited" } }, { "Retry-After": "0" });
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"data":[{"b64_json":"');
      return; // stall the body forever; the client's timeout must fire
    }
    if (model.includes("fail-503-once")) {
      if (attempts < 2) {
        json(res, 503, { error: { message: "upstream unavailable" } }, { "Retry-After": "0" });
        return;
      }
      imageSuccess(res, body.n ?? 1, 0.04);
      return;
    }
    if (model.includes("fail-529-once")) {
      if (attempts < 2) {
        json(res, 529, { error: { message: "provider overloaded" } }, { "Retry-After": "0" });
        return;
      }
      imageSuccess(res, body.n ?? 1, 0.04);
      return;
    }
    if (model.includes("reset-once")) {
      if (attempts < 2) {
        req.socket.destroy();
        return;
      }
      imageSuccess(res, body.n ?? 1, 0.04);
      return;
    }
    if (model.includes("timeout")) {
      // never respond; client aborts on its own timeout
      return;
    }
    if (model.includes("not-in-images") || model.includes("chat-only") || model.includes("invalid-model")) {
      json(res, 404, { error: { message: `No endpoints found for ${model}` } });
      return;
    }
    imageSuccess(res, body.n ?? 1, 0.04);
    return;
  }

  if (route === "POST /api/v1/chat/completions") {
    const body = await readBody(req);
    const model = typeof body.model === "string" ? body.model : "";
    state.requests.push({ route, model, body });

    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ")) {
      json(res, 401, { error: { message: "No auth credentials found" } });
      return;
    }

    if (model.includes("not-in-images") || model.includes("chat-only")) {
      json(res, 200, {
        choices: [
          {
            message: {
              role: "assistant",
              content: "",
              images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${PX_B64}` } }],
            },
          },
        ],
        usage: { cost: 0.02 },
      });
      return;
    }
    json(res, 404, { error: { message: `No endpoints found for ${model}` } });
    return;
  }

  json(res, 404, { error: { message: `no mock route for ${route}` } });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { url } = await startMockServer();
  process.stdout.write(`mock OpenRouter listening at ${url}\n`);
}
