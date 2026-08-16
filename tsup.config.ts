import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  splitting: false,
  clean: true,
  sourcemap: false,
  banner: { js: "#!/usr/bin/env node" },
});
