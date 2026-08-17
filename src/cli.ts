import { CliError, EXIT, errorMessage } from "./core/errors.js";
import { errorEnvelope, packageVersion } from "./core/cliutil.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdGenerate } from "./commands/generate.js";
import { cmdModels } from "./commands/models.js";
import { cmdSelect } from "./commands/select.js";
import { cmdSetup } from "./commands/setup.js";

const USAGE = `orimg — multi-model image generation via OpenRouter

Usage:
  orimg generate --jobs <file|->  [--out DIR] [--no-gallery] [--open] [--concurrency N]
                 [--timeout SEC] [--retries N] [--json] [--dry-run] [--strict]
  orimg generate -m <model> -p "<prompt>" [-n N] [--aspect-ratio 16:9] [--resolution 512|1K|2K|4K]
                 [--quality auto|low|medium|high] [--seed N] [--ref <url|path>]...
  orimg models [<model-id>] [--search TEXT] [--refresh] [--json]
  orimg select <batch-dir|manifest> <model-or-filename> --to <dest-path> [--json]
  orimg setup                       interactive wizard (key, skill, defaults)
  orimg setup --yes [--link] [--remove] [--claude-only|--codex-only] [--json]
  orimg doctor [--json]

Environment:
  OPENROUTER_API_KEY   API key (also: ./.env or "apiKey" in ~/.config/orimg/config.json)
  ORIMG_BASE_URL, ORIMG_OUT, ORIMG_CONCURRENCY, ORIMG_TIMEOUT, ORIMG_RETRIES,
  ORIMG_CONFIG_DIR, ORIMG_CACHE_DIR

Exit codes: 0 ok/partial · 1 unexpected · 2 usage/validation · 3 auth · 4 all jobs failed`;

async function main(argv: string[]): Promise<number> {
  const command = argv[0];
  const rest = argv.slice(1);

  if (command === undefined) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT.VALIDATION;
  }
  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(`${USAGE}\n`);
    return EXIT.OK;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    process.stdout.write(`${packageVersion()}\n`);
    return EXIT.OK;
  }

  if (rest.includes("--help") || rest.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return EXIT.OK;
  }

  switch (command) {
    case "generate":
      return cmdGenerate(rest);
    case "models":
      return cmdModels(rest);
    case "select":
      return cmdSelect(rest);
    case "setup":
      return cmdSetup(rest);
    case "doctor":
      return cmdDoctor(rest);
    default:
      process.stderr.write(`orimg: unknown command "${command}"\n\n${USAGE}\n`);
      return EXIT.VALIDATION;
  }
}

const argv = process.argv.slice(2);
const jsonErrors = argv.includes("--json") || !process.stdout.isTTY;

main(argv).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    const exitCode = err instanceof CliError ? err.exitCode : EXIT.UNEXPECTED;
    const code = err instanceof CliError ? err.code : "UNEXPECTED";
    if (jsonErrors) {
      process.stderr.write(`${JSON.stringify(errorEnvelope(code, errorMessage(err)))}\n`);
    } else {
      process.stderr.write(`orimg: ${errorMessage(err)}\n`);
      if (exitCode === EXIT.VALIDATION) process.stderr.write("run `orimg --help` for usage\n");
    }
    process.exitCode = exitCode;
  },
);
