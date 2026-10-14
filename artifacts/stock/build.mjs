/**
 * Empaqueta la API (server/index.ts) en dist/server/index.mjs con esbuild.
 * La interfaz la compila Vite en dist/public (ver `pnpm run build:web`).
 *
 * Nativos que no se pueden bundlear (sharp, libsql) quedan como externos y se
 * resuelven en runtime desde node_modules, igual que en artifacts/api-server.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { build as esbuild } from "esbuild";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(artifactDir, "dist", "server");

await rm(outDir, { recursive: true, force: true });

await esbuild({
  entryPoints: [path.resolve(artifactDir, "server/index.ts")],
  platform: "node",
  target: "node22",
  bundle: true,
  format: "esm",
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  sourcemap: "linked",
  logLevel: "info",
  external: [
    "*.node",
    "sharp",
    "@libsql/client",
    "@libsql/*",
    "libsql",
    "fsevents",
  ],
  // express y compañía son CommonJS: dejamos require/__dirname disponibles en el ESM resultante.
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
  },
});

console.log(`✅ API empaquetada en ${path.relative(process.cwd(), outDir)}/index.mjs`);
