/**
 * Las rutas del Estudio que devuelven archivos del disco (fuentes del
 * renderizador y vistas previas de plantillas) usan `res.sendFile`, que por
 * defecto (1) exige ruta absoluta y (2) responde 404 ante cualquier segmento
 * que empiece por punto. En producción ambas cosas pasaban de verdad: las
 * fuentes de @fontsource viven bajo `node_modules/.pnpm/…` y IMAGE_STORE_DIR
 * puede venir relativo. Este test monta el router real sobre un servidor
 * efímero y pide exactamente esas URLs.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

// El router (y lo que arrastra) importa @workspace/db para otras rutas; las de
// este test no tocan la base. Se simula el módulo entero con un Proxy: cualquier
// export que pidan existe, y `db` devuelve consultas vacías.
vi.mock("@workspace/db", () => {
  const consulta: any = new Proxy(() => consulta, {
    get: (_t, k) => (k === "then" ? (ok: any) => Promise.resolve([]).then(ok) : () => consulta),
    apply: () => consulta,
  });
  const generico = (k: string | symbol) => {
    if (k === "db") return { select: () => consulta, update: () => consulta, insert: () => consulta, delete: () => consulta, execute: async () => [] };
    if (k === "ensureDbReady") return async () => {};
    if (k === "then" || typeof k === "symbol") return undefined;
    return {};
  };
  return new Proxy({}, { get: (_t, k) => generico(k), has: () => true });
});

const tmp = mkdtempSync(path.join(os.tmpdir(), "estudio-rutas-"));
let servidor: Server;
let base = "";

beforeAll(async () => {
  // Relativo a propósito: es el caso que rompía `res.sendFile`.
  process.env.IMAGE_STORE_DIR = path.relative(process.cwd(), tmp) || ".";
  const { default: router } = await import("../../routes/estudio-anuncios");
  const app = express();
  app.use((req: any, _res, next) => { req.tenant = { id: 1 }; next(); });
  app.use("/api/estudio-anuncios", router);
  servidor = app.listen(0);
  await new Promise<void>((r) => servidor.once("listening", () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/estudio-anuncios`;
});

afterAll(async () => {
  await new Promise<void>((r) => servidor?.close(() => r()));
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.IMAGE_STORE_DIR;
});

describe("rutas del Estudio que sirven archivos", () => {
  it("sirve una fuente de @fontsource aunque viva bajo node_modules/.pnpm (segmento con punto)", async () => {
    const r = await fetch(`${base}/fuentes/bebas/400.woff`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("font/woff");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("wOFF");
  });

  it("sirve la fuente TTF propia (Inter) y rechaza pesos/extensiones inventados", async () => {
    const ok = await fetch(`${base}/fuentes/inter/700.ttf`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("font/ttf");
    await ok.arrayBuffer();
    const malo = await fetch(`${base}/fuentes/inter/123.ttf`);
    expect(malo.status).toBe(404);
    const otro = await fetch(`${base}/fuentes/no-existe/400.woff`);
    expect(otro.status).toBe(404);
  });

  it("devuelve la vista previa JPG de una plantilla del catálogo con IMAGE_STORE_DIR relativo", async () => {
    const r = await fetch(`${base}/plantillas/oferta.pop.navidad/vista-previa.jpg?formato=vertical&ancho=180`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    // Segunda vez sale de la caché en disco y sigue siendo un JPG válido.
    const r2 = await fetch(`${base}/plantillas/oferta.pop.navidad/vista-previa.jpg?formato=vertical&ancho=180`);
    expect(r2.status).toBe(200);
    expect((await r2.arrayBuffer()).byteLength).toBe(bytes.length);
  }, 30_000);
});
