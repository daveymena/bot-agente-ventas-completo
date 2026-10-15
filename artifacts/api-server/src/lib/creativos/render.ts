/**
 * Escena → PNG, fotografiada por Chromium a tamaño real.
 *
 * Mismo patrón que `video-anuncio.ts` (capturarEscenas): el contenedor ya trae
 * `chromium` + fuentes (Dockerfile) y puppeteer apunta ahí con
 * PUPPETEER_EXECUTABLE_PATH. Se usa Chromium y no sharp+SVG porque SVG no
 * parte líneas ni carga Google Fonts: el texto del creativo saldría distinto
 * al del editor, que es justo lo que no puede pasar.
 *
 * Las fotos propias (/uploads/...) se pasan a data: antes de abrir la página,
 * porque `setContent` no tiene origen y una ruta relativa no carga.
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { getImageStoreDir } from "../image-store";
import { FORMATOS, escenaADocumento, normalizarEscena, type Escena } from "../estudio/escena";
import { logger } from "../logger";

const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/** /uploads/x.jpg → data:image/jpeg;base64,... (las demás quedan como están). */
async function fotosLocalesEnLinea(e: Escena): Promise<Escena> {
  const base = getImageStoreDir();
  const capas = await Promise.all(e.capas.map(async (c) => {
    if (c.tipo !== "imagen" || !c.src.startsWith("/uploads/")) return c;
    const rel = c.src.replace(/^\/uploads\//, "").split("?")[0]!;
    const ruta = path.resolve(base, rel);
    if (!ruta.startsWith(path.resolve(base))) return c; // nada de ../
    try {
      const buf = await readFile(ruta);
      return { ...c, src: `data:${TIPOS[path.extname(ruta).toLowerCase()] || "image/jpeg"};base64,${buf.toString("base64")}` };
    } catch { return c; }
  }));
  return { ...e, capas };
}

/** Navegador compartido: abrir Chromium por cada PNG cuesta 1-2 s. */
let navegadorVivo: Promise<any> | null = null;
let cierre: ReturnType<typeof setTimeout> | null = null;

async function navegador(): Promise<any> {
  if (cierre) { clearTimeout(cierre); cierre = null; }
  if (!navegadorVivo) {
    navegadorVivo = (async () => {
      const puppeteer: any = (await import("puppeteer")).default;
      return puppeteer.launch({
        headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--lang=es-CO"], timeout: 30_000, protocolTimeout: 60_000,
      });
    })().catch((e) => { navegadorVivo = null; throw e; });
  }
  const b = await navegadorVivo;
  // Se cierra solo tras 2 minutos sin uso: no deja un Chromium comiendo RAM.
  cierre = setTimeout(() => { const v = navegadorVivo; navegadorVivo = null; void v?.then((x: any) => x.close()).catch(() => {}); }, 120_000);
  return b;
}

export async function escenaAPng(escenaCruda: unknown, opts: { escala?: number } = {}): Promise<Buffer> {
  const e = await fotosLocalesEnLinea(normalizarEscena(escenaCruda));
  const { ancho, alto } = FORMATOS[e.formato];
  const b = await navegador();
  const pagina = await b.newPage();
  try {
    const escala = Math.max(0.2, Math.min(2, opts.escala ?? 1));
    await pagina.setViewport({ width: ancho, height: alto, deviceScaleFactor: escala });
    await pagina.setContent(escenaADocumento(e), { waitUntil: "networkidle0", timeout: 30_000 });
    // Las fuentes de Google llegan por red: sin esperarlas, el primer PNG
    // salía con la letra de respaldo.
    await pagina.evaluate("document.fonts && document.fonts.ready").catch(() => {});
    const el = await pagina.$(".vp-lienzo");
    const png: Buffer = await (el || pagina).screenshot({ type: "png" });
    return Buffer.from(png);
  } finally {
    await pagina.close().catch(() => {});
  }
}

/** Exporta y guarda en /uploads/creativos/. Devuelve la ruta pública. */
export async function exportarEscena(tenantId: number, escena: unknown, nombre = "creativo", pngListo?: Buffer | null): Promise<string> {
  const png = pngListo ?? await escenaAPng(escena);
  const dir = path.join(getImageStoreDir(), "creativos", String(Math.trunc(tenantId)));
  await mkdir(dir, { recursive: true });
  const archivo = `${nombre.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "creativo"}-${randomUUID().slice(0, 8)}.png`;
  await writeFile(path.join(dir, archivo), png);
  logger.info({ tenantId, archivo, bytes: png.length }, "[Creativos] PNG exportado");
  return `/uploads/creativos/${Math.trunc(tenantId)}/${archivo}`;
}
