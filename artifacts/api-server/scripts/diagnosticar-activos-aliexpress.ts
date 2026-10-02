/**
 * VERIFICACIÓN de la corrección, contra AliExpress REAL.
 *
 * Comprueba las dos cosas que estaban rotas:
 *   1. Que una respuesta HTML con 200 ahora se RECHAZA (antes pasaba el filtro).
 *   2. Que las miniaturas por RUTA ('/96x96.png') ahora se reparan a la foto
 *      grande y que esa URL devuelve una imagen de verdad.
 */
import { fotoGrande, esFotoDeGaleria, tipoDeArchivo } from "../src/lib/activos-fabricante";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** La lógica de `bajar()` YA CORREGIDA: firma + tipo esperado. */
async function bajarCorregido(url: string, esperado?: "imagen" | "video") {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://es.aliexpress.com/" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { ok: false, motivo: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000) return { ok: false, motivo: `chico (${buf.length})` };
    const tipo = tipoDeArchivo(buf);
    if (tipo === "html") return { ok: false, motivo: "HTML con 200 → RECHAZADO ✅" };
    if (esperado && tipo !== esperado) return { ok: false, motivo: `esperaba ${esperado}, llegó ${tipo}` };
    return { ok: true, tipo, bytes: buf.length, ct: r.headers.get("content-type") || "-" };
  } catch (e: any) {
    return { ok: false, motivo: e?.message || "error" };
  }
}

async function main() {
  console.log("=== 1. El caso que rompía todo: HTML con 200 ===");
  const pag = "https://www.aliexpress.com/item/100500000000000.html";
  const v = await bajarCorregido(pag, "video");
  console.log(`  ${pag}`);
  console.log(`  → ${v.ok ? "❌ TODAVÍA PASA" : `✅ ${v.motivo}`}`);

  console.log("\n=== 2. Miniaturas reales de la búsqueda, reparadas ===");
  const q = "mochila burbuja";
  const r = await fetch(`https://www.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/\s+/g, "-"))}.html?SortType=total_tranpro_desc`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(45_000),
  });
  const html = await r.text();
  const crudas = [...new Set((html.match(/https?:\/\/[^"'\\ ]*?(?:aliexpress-media|alicdn)[^"'\\ ]*/gi) || []))];
  const candidatas = crudas.filter((u) => /\.(?:jpe?g|png|webp|avif)/i.test(u)).slice(0, 5);
  console.log(`  URLs de foto en el HTML: ${candidatas.length} (de ${crudas.length})`);

  let buenas = 0;
  for (const cruda of candidatas) {
    const grande = fotoGrande(cruda);
    const d = await bajarCorregido(grande, "imagen");
    const reparada = grande !== cruda.replace(/[)"',;\\\]]+$/, "");
    if (d.ok) buenas++;
    console.log(`\n  · ${cruda.slice(0, 95)}${reparada ? "\n    (miniatura → reparada a foto grande)" : ""}`);
    console.log(`    ${d.ok ? `✅ IMAGEN REAL · ${Math.round((d as any).bytes / 1024)} KB · ${(d as any).tipo} · ct=${(d as any).ct}` : `❌ ${d.motivo}`}`);
  }
  console.log(`\n  RESULTADO: ${buenas}/${candidatas.length} URLs devolvieron imagen real`);

  console.log("\n=== 3. ¿Cuántas de esas son de galería (kf/) y no íconos? ===");
  console.log(`  de galería: ${candidatas.filter(esFotoDeGaleria).length} · descartadas por no serlo: ${candidatas.filter((u) => !esFotoDeGaleria(u)).length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("falló:", e); process.exit(1); });
