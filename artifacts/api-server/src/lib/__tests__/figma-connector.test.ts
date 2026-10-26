import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { connectFigma, disconnectFigma, figmaStatus, parseFigmaSource, readFigmaFile, readFigmaNode } from "../figma-connector";
import { figmaRouter } from "../../routes/figma";
import express from "express";
import type { AddressInfo } from "node:net";
const nativeFetch = globalThis.fetch;
const TOKEN = "figd-test-token-not-a-real-secret";
let dir: string; let handler: (url: string, init: any) => Response;
const doc = { name: "Mi marca", version: "v1", lastModified: "2026-10-26", document: { children: [{ id: "0:1", name: "Anuncios", children: [{ id: "1:2", name: "Portada", type: "FRAME" }] }] } };
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "figma-test-")); vi.stubEnv("FIGMA_STUDIO_DIR", dir); vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "test-fixed-key-do-not-use");
  handler = () => json(doc); vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => handler(String(url), init)));
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
it("acepta enlaces de Design y normaliza el nodo; bloquea rutas y destinos arbitrarios", () => {
  expect(parseFigmaSource("https://www.figma.com/design/Abc123xyz/Nombre?node-id=12-34")).toEqual({ fileKey: "Abc123xyz", nodeId: "12:34" });
  for (const input of ["https://figma.com.attacker.test/design/Abc123xyz", "http://figma.com/design/Abc123xyz", "https://user:pass@figma.com/design/Abc123xyz", "../../secret", "https://figma.com/board/Abc123xyz"]) expect(() => parseFigmaSource(input)).toThrow();
});
it("verifica acceso antes de guardar, cifra el token y separa negocios", async () => {
  const r = await connectFigma(11, TOKEN, "Abc123xyz"); expect(r.status.connected).toBe(true); expect(r.file.pages[0].frames[0].id).toBe("1:2");
  const raw = await readFile(path.join(dir, "11", "settings.json"), "utf8"); expect(raw).not.toContain(TOKEN); expect(raw).toContain("enc:v1:"); expect(JSON.stringify(r)).not.toContain(TOKEN);
  expect((await figmaStatus(12)).references).toEqual([]); await expect(readFigmaFile(12, "Abc123xyz")).rejects.toMatchObject({ status: 409 });
  handler = (_u, init) => { expect(init.headers["X-Figma-Token"]).toBe(TOKEN); return json(doc); }; await readFigmaFile(11, "Abc123xyz");
});
it("un token rechazado no se guarda ni se incluye en el error", async () => {
  handler = () => json({ error: TOKEN }, 403); await expect(connectFigma(13, TOKEN, "Abc123xyz")).rejects.toThrow(/file_content:read/);
  expect(await readdir(dir)).toEqual([]);
});
it("extrae texto, color, fuente y auto layout sin devolver el árbol completo", async () => {
  await connectFigma(14, TOKEN, "Abc123xyz");
  handler = (url) => url.includes("/images/") ? json({ images: { "1:2": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/preview.png" } }) : json({ nodes: { "1:2": { document: { id: "1:2", name: "Portada", type: "FRAME", layoutMode: "VERTICAL", absoluteBoundingBox: { width: 1080, height: 1350 }, fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }], children: [{ id: "2:1", name: "Titular", type: "TEXT", characters: "Curso de piano", style: { fontFamily: "Inter", fontSize: 64 } }] } } } });
  const r = await readFigmaNode(14, "Abc123xyz", "1:2", true); expect(r.node.colors).toEqual(["#ff0000"]); expect(r.node.texts[0]).toMatchObject({ text: "Curso de piano", font: "Inter", size: 64 }); expect(r.node.layout.mode).toBe("VERTICAL"); expect(r.preview).toContain("amazonaws.com"); expect(r.warning).toContain("no fuente comercial");
});
it("mantiene los datos del frame si falla la imagen; invalida estado al revocar el token", async () => {
  await connectFigma(15, TOKEN, "Abc123xyz");
  handler = (url) => url.includes("/images/") ? json({}, 429) : json({ nodes: { "1:2": { document: { id: "1:2", type: "FRAME", name: "Portada" } } } });
  const r = await readFigmaNode(15, "Abc123xyz", "1:2", true); expect(r.node.name).toBe("Portada"); expect(r.previewError).toContain("límite");
  handler = () => json({}, 401); await expect(readFigmaFile(15, "Abc123xyz")).rejects.toMatchObject({ status: 401 }); expect((await figmaStatus(15)).connected).toBe(false);
});
it("desconectar elimina la credencial conservando solo las referencias", async () => {
  await connectFigma(16, TOKEN, "Abc123xyz"); await disconnectFigma(16); const s = await figmaStatus(16); expect(s.configured).toBe(false); expect(s.references).toHaveLength(1); expect(await readFile(path.join(dir, "16", "settings.json"), "utf8")).not.toContain("enc:v1:");
});
it("la ruta exige sesión y no acepta cookies sin firma", async () => {
  const app = express(); app.use((req: any, _res, next) => { req.cookies = { tenant_id: "16" }; next(); }); app.use("/api/figma", figmaRouter);
  const srv = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => srv.on("listening", resolve)); const { port } = srv.address() as AddressInfo;
  try { expect((await nativeFetch(`http://127.0.0.1:${port}/api/figma/estado`)).status).toBe(401); } finally { srv.closeAllConnections(); await new Promise<void>((resolve) => srv.close(() => resolve())); }
});
