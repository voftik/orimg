import { createInterface } from "node:readline/promises";

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export async function ask(question: string, def?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = def !== undefined && def !== "" ? ` (${def})` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer === "" && def !== undefined ? def : answer;
  } finally {
    rl.close();
  }
}

export async function askYesNo(question: string, def: boolean): Promise<boolean> {
  const hint = def ? "Y/n" : "y/N";
  const answer = (await ask(`${question} [${hint}]`)).toLowerCase();
  if (answer === "") return def;
  return answer === "y" || answer === "yes";
}

export async function askChoice(question: string, choices: string[], defIndex: number): Promise<number> {
  process.stdout.write(`${question}\n`);
  choices.forEach((choice, i) => process.stdout.write(`  ${i + 1}) ${choice}\n`));
  for (;;) {
    const answer = await ask(`choose 1-${choices.length}`, String(defIndex + 1));
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return n - 1;
    process.stdout.write("please enter a number from the list\n");
  }
}

export function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(`${question}: `);
    const wasRaw = stdin.isRaw === true;
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = "";
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode?.(wasRaw);
      stdin.pause();
    };
    const onData = (chunk: Buffer): void => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\u0003") {
          cleanup();
          stdout.write("\n");
          process.exit(130);
        } else if (ch === "\r" || ch === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value.trim());
          return;
        } else if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (ch >= " ") {
          value += ch;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}
