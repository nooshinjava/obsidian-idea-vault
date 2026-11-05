import { build } from "esbuild";

// Bundles src/ (and the shared library in lib/shared) into main.js for Obsidian.
await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  banner: { js: "/* Idea Vault 2.0.1 — https://github.com/nooshinjava/obsidian-idea-vault */" },
  legalComments: "none",
  logLevel: "info",
});
