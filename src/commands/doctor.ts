import { stat } from "node:fs/promises";
import { loadConfig, maskApiKey } from "../core/config.js";
import { EXIT, errorMessage } from "../core/errors.js";
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

  let apiReport: { reachable: boolean; models?: number; error?: string };
  try {
    const client = new OpenRouterClient({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: 10_000,
      retries: 0,
    });
    const models = await client.listModels();
    apiReport = { reachable: true, models: models.length };
  } catch (err) {
    apiReport = { reachable: false, error: errorMessage(err) };
  }

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

  if (jsonMode) {
    printEnvelope(successEnvelope(data));
  } else {
    const mark = (ok: boolean) => (ok ? "[ok]" : "[!!]");
    const lines = [
      `${mark(apiKeyReport.present)} api key: ${
        apiKeyReport.present ? `${apiKeyReport.masked} (from ${apiKeyReport.source})` : "not found"
      }`,
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

  return apiKeyReport.present ? EXIT.OK : EXIT.AUTH;
}
