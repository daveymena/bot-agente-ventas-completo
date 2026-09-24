/**
 * Prueba de anuncios con los productos REALES de una tienda pública, sin
 * tocar la base ni Meta: arma el texto con anuncio-por-modelo.ts y revisa si
 * Meta aceptaría la foto (medidas-de-imagen.ts). No publica ni gasta nada.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/probar-anuncios-tienda.ts sofia-premium corrector
 *
 * Opcional: un JSON {"id": "nombre nuevo"} como 3er argumento para probar
 * cómo quedan los anuncios con otros nombres antes de cambiarlos.
 */
import { readFileSync } from "node:fs";
import { planDeAnuncio } from "../src/lib/anuncio-por-modelo";
import { medirImagen, porQueMetaLaRechaza } from "../src/lib/medidas-de-imagen";
import { CONDICIONES_DE_RESPALDO } from "../src/lib/modelo-de-negocio";

const [slug = "sofia-premium", filtro = "corrector", renombres] = process.argv.slice(2);
const base = "https://ventasproia.com";
const nombres: Record<string, string> = renombres ? JSON.parse(readFileSync(renombres, "utf8")) : {};

const r = await fetch(`${base}/api/public/products/${slug}`);
const lista: any[] = await r.json().then((j: any) => (Array.isArray(j) ? j : j.products || []));
const productos = lista.filter((p) => new RegExp(filtro, "i").test(p.name));

for (const p of productos) {
  const nombre = nombres[String(p.id)] || p.name;
  const plan = planDeAnuncio({ ...p, name: nombre }, CONDICIONES_DE_RESPALDO);
  let foto = "sin foto";
  if (p.image) {
    const buf = Buffer.from(await (await fetch(p.image.startsWith("http") ? p.image : `${base}${p.image}`)).arrayBuffer());
    const m = medirImagen(buf);
    const motivo = porQueMetaLaRechaza(m);
    foto = `${m.ancho}×${m.alto} ${m.formato} ${(buf.length / 1024).toFixed(0)} KB → ${motivo ? `❌ Meta la rechaza: ${motivo}` : "✅ sirve"}`;
  }
  console.log(`\n${"═".repeat(72)}\n#${p.id}  ${nombre}${nombre !== p.name ? `   (hoy: "${p.name}")` : ""}`);
  console.log(`modelo: ${plan.modelo} · objetivo: ${plan.objetivoRecomendado} · foto: ${foto}`);
  console.log(`título: ${plan.headline}\n${plan.primaryText}`);
}
