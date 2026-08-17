import { stat } from "node:fs/promises";
import { loadConfig, maskApiKey } from "../core/config.js";
import { AuthError, EXIT, errorMessage } from "../core/errors.js";
import type { ExitCodeValue } from "../core/errors.js";
import { OpenRouterClient } from "../core/openrouter.js";
import {
  isJsonMode,
  packageVersion,
  parseOrThrow,
  printEnvelope,
  printLines,
  strFlag,
  successEnvelope,
} from "../core/cliutil.js";
import { installedSkillVersion, skillTargets } from "./setup.js";

export async function cmdDoctor(argv: string[]): Promise<ExitCodeValue> {
  const { values } = parseOrThrow({
    args: argv,
    options: {
      json: { type: "boolean" },
      "api-key": { type: "string" },
      "base-url": { type: "string" },
    },
  });

  const jsonMode = isJsonMode(values);
  const config = await loadConfig({
    apiKey: strFlag(values, "api-key"),
    baseUrl: strFlag(values, "base-url"),
  });

  const apiKeyReport: {
    present: boolean;
    source: typeof config.apiKeySource;
    masked: string | null;
    valid?: boolean | null;
    config_file_mode?: string;
    config_file_permissions_ok?: boolean;
  } = {
    present: config.apiKey !== undefined,
    source: config.apiKeySource,
    masked: maskApiKey(config.apiKey),
  };
  if (config.apiKeySource === "config-file") {
    try {
      const mode = (await stat(config.configFile)).mode & 0o777;
      apiKeyReport.config_file_mode = mode.toString(8).padStart(4, "0");
      apiKeyReport.config_file_permissions_ok = (mode & 0o077) === 0;
    } catch {
      // stat failure is non-fatal for doctor
    }
  }

  const client = new OpenRouterClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: 10_000,
    retries: 0,
  });

  let apiKeyValid: boolean | null = null;
  let apiReport: { reachable: boolean; models?: number; error?: string };
  try {
    const models = await client.listModels();
    apiReport = { reachable: true, models: models.length };
  } catch (err) {
    apiReport = { reachable: false, error: errorMessage(err) };
  }

  if (apiKeyReport.present && apiReport.reachable) {
    try {
      await client.checkKey();
      apiKeyValid = true;
    } catch (err) {
      if (err instanceof AuthError) apiKeyValid = false;
      // any other failure leaves validity unknown (null)
    }
  }
  apiKeyReport.valid = apiKeyValid;

  const skillReport: Record<string, { installed: boolean; version: string | null; path: string }> = {};
  for (const target of skillTargets()) {
    const version = await installedSkillVersion(target.dir);
    skillReport[target.name] = { installed: version !== null, version, path: target.dir };
  }

  const configReport = {
    base_url: config.baseUrl,
    out: config.out,
    concurrency: config.concurrency,
    timeout: config.timeout,
    retries: config.retries,
    models: config.models ?? null,
    config_file: config.configFile,
  };

  const data = {
    api_key: apiKeyReport,
    api: apiReport,
    skill: skillReport,
    config: configReport,
    versions: { orimg: packageVersion(), node: process.version },
  };

  const keyHealthy = apiKeyReport.present && apiKeyValid !== false;
  const healthy = keyHealthy && apiReport.reachable;
  const failCode: ExitCodeValue = !keyHealthy ? EXIT.AUTH : EXIT.UNEXPECTED;
  const failMessage = !apiKeyReport.present
    ? "no OpenRouter API key found"
    : apiKeyValid === false
      ? "the configured OpenRouter API key was rejected (401/403)"
      : `API unreachable: ${apiReport.error ?? "unknown error"}`;

  if (jsonMode) {
    const envelope = successEnvelope(data);
    if (!healthy) {
      envelope.success = false;
      envelope.error = { code: failCode === EXIT.AUTH ? "AUTH" : "UNHEALTHY", message: failMessage };
    }
    printEnvelope(envelope);
  } else {
    const mark = (ok: boolean) => (ok ? "[ok]" : "[!!]");
    const keyStatus = !apiKeyReport.present
      ? "not found"
      : `${apiKeyReport.masked} (from ${apiKeyReport.source})${
          apiKeyValid === true ? ", verified" : apiKeyValid === false ? ", REJECTED by the API" : ""
        }`;
    const lines = [
      `${mark(keyHealthy)} api key: ${keyStatus}`,
      `${mark(apiReport.reachable)} api: ${
        apiReport.reachable ? `${config.baseUrl} reachable, ${apiReport.models} image models` : (apiReport.error ?? "unreachable")
      }`,
    ];
    for (const [name, report] of Object.entries(skillReport)) {
      lines.push(
        `${mark(report.installed)} skill (${name}): ${
          report.installed ? `v${report.version} at ${report.path}` : "not installed — run \`orimg setup\`"
        }`,
      );
    }
    lines.push(
      `     config: out=${config.out} concurrency=${config.concurrency} timeout=${config.timeout}s retries=${config.retries}`,
      `     config file: ${config.configFile}`,
      `     orimg v${packageVersion()}, node ${process.version}`,
    );
    printLines(lines);
  }

  return healthy ? EXIT.OK : failCode;
}
