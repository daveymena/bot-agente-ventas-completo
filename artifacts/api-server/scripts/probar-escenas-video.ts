/**
 * Renderiza las escenas del video de anuncio con fotos reales, sin base ni
 * ffmpeg, para mirar el diseño antes de desplegar.
 *   PUPPETEER_EXECUTABLE_PATH=... npx tsx scripts/probar-escenas-video.ts <salida> <foto1> [foto2...]
 */
import { htmlDeEscena, type EscenaDeVideo } from "../src/lib/video-anuncio";

async function main() {
  const [salida, ...urls] = process.argv.slice(2);
  if (!salida || !urls.length) throw new Error("uso: <carpeta-salida> <foto...>");
  const { readFile } = await import("node:fs/promises");
  const fotos = await Promise.all(urls.map(async (u) => {
    if (!/^https?:/i.test(u)) return `data:image/jpeg;base64,${(await readFile(u)).toString("base64")}`;
    const r = await fetch(u);
    const tipo = r.headers.get("content-type") || "image/jpeg";
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  }));
  const escenas: EscenaDeVideo[] = [
    { texto: "¿Tensión en el cuello al trabajar?", locucion: "", visual: "producto", duracion: 3 },
    { texto: "Alinea hombros y columna", locucion: "", visual: "producto", duracion: 3 },
    { texto: "Invisible bajo la ropa", locucion: "", visual: "producto", duracion: 3 },
    { texto: "Llévalo hoy", locucion: "", visual: "producto", duracion: 3 },
    { texto: "¡Pide el tuyo ahora!", locucion: "", visual: "producto", duracion: 3 },
  ];
  const puppeteer: any = (await import("puppeteer")).default;
  const nav = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, args: ["--no-sandbox"] });
  const pag = await nav.newPage();
  await pag.setViewport({ width: 1080, height: 1920 });
  for (let i = 0; i < escenas.length; i++) {
    const n = i % fotos.length;
    const html = htmlDeEscena(escenas[i]!, i, escenas.length, {
      foto: fotos[n]!, detalle: i >= fotos.length, color: "#4F46E5", marca: "VentasProIA",
      precio: "$55.000", cta: i % 2 ? "Escríbenos por WhatsApp" : "Pídelo en el enlace", modelo: "fisico", destino: "web",
    });
    await pag.setContent(html, { waitUntil: "load" });
    await pag.screenshot({ path: `${salida}/escena-${i}.png` });
  }
  await nav.close();
  console.log("listo");
}
main().catch((e) => { console.error(e); process.exit(1); });
