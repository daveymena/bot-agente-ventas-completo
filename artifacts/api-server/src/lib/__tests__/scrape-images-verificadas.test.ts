import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { TOOLS } from "../app-operator";

/**
 * 2026-09-28 (megacomputer): al admin le llegó `.../uploads/2026/05/edite`,
 * recortada a mitad de nombre → 404. web_scrape_images devolvía URLs sin
 * comprobar que resolvieran. Ahora solo salen las que abren de verdad.
 */
const tool = () => TOOLS.find((t: any) => t.name === "web_scrape_images") as any;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let srv: Server;
let base = "";
beforeAll(async () => {
  srv = createServer((req, res) => {
    if (req.url === "/prod") {
      res.setHeader("content-type", "text/html");
      res.end(`<html><head><meta property="og:image" content="${base}/rota.png"></head><body><img src="${base}/buena.png"><img src="${base}/rota.png"></body></html>`);
    } else if (req.url === "/buena.png") {
      res.setHeader("content-type", "image/png");
      res.end(PNG);
    } else {
      res.statusCode = 404;
      res.end("no");
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const a = srv.address();
  base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
afterAll(async () => { await new Promise((r) => srv.close(r)); });

describe("web_scrape_images solo entrega imágenes que abren", () => {
  it("descarta la rota (404) y conserva la viva", async () => {
    const r = await tool().run({ url: `${base}/prod`, limit: 10 });
    expect(r.ok).toBe(true);
    const imgs: string[] = r.data.images;
    expect(imgs).toContain(`${base}/buena.png`);
    expect(imgs.some((u) => u.includes("rota"))).toBe(false);
  }, 20000);

  it("si ninguna abre, lo dice en vez de devolver rotas", async () => {
    const r = await tool().run({ url: `${base}/no-existe`, limit: 5 });
    expect(r.ok).toBe(false);
  }, 20000);
});
