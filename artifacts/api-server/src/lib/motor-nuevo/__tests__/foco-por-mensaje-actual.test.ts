/**
 * EL FOCO y el mensaje actual (la regla "el producto del mensaje actual
 * manda sobre el contexto viejo").
 *
 * Los fallos del probador (03-10, producción, dos rondas) que esta regla
 * cierra:
 *   · "dice que no lo tiene" con productos del catálogo
 *     ("Coche Mecedora para Bebé con Cierre de Maleta" SÍ está).
 *   · "$110.990 no es el precio de lo que se está hablando" (×9): el precio
 *     del foco viejo mientras el cliente ya hablaba de otro.
 *
 * La REGLA es pura: el producto que el mensaje actual nombra con fuerza.
 * Lo que NUNCA debe tumbar el foco: frases de seguimiento ("la verde",
 * "¿cuánto vale?", "ese") — ruido, no producto.
 */
import { describe, expect, it } from "vitest";
import { puntuarCoincidencias, productoMencionadoEnElMensajeActual, productosMencionadosEnElMensajeActual, UMBRAL_RE_ENFOQUE } from "../herramientas";

// Fragmentos del catálogo REAL (producción, 04-10: scripts/catalogo-real.json
// son 133; acá los implicados en el fallo del probador + otros con palabras
// compartidas para forzar el conflicto).
const catalogo: any[] = [
  { id: 163, name: "Pañalera Mochila Multifuncional 2 En 1", description: "Cuna portátil para bebé, compartimentos múltiples, resistente al agua.", disponible: true, price: 110990, categoria: "Bebés" },
  { id: 91, name: "Coche Mecedora para Bebé con Cierre de Maleta", description: "El bebé se mece seguro; cierre tipo maleta.", disponible: true, price: 189990, categoria: "Bebés" },
  { id: 77, name: "Maleta Tipo Mochila Moderna y Elegante", description: "Mochila viajera antirrobo.", disponible: true, price: 95000, categoria: "Maletas" },
  { id: 55, name: "Mochila Elegante para Mujer", description: "Mochila diaria, varios colores.", disponible: true, price: 68000, categoria: "Bolsos" },
];

describe("productoMencionadoEnElMensajeActual", () => {
  it("el nombre COMPLETO de un producto existente se señala con fuerza (el caso rotura del probador)", () => {
    const r = productoMencionadoEnElMensajeActual("hola, mira el Coche Mecedora para Bebé con Cierre de Maleta", catalogo);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(91);
    expect(r!.puntos).toBeGreaterThanOrEqual(UMBRAL_RE_ENFOQUE);
  });

  it("la PAÑALERA también (el precio que salía 'del foco viejo')", () => {
    const r = productoMencionadoEnElMensajeActual("quiero la pañalera mochila", catalogo);
    expect(r?.id).toBe(163);
  });

  // ── Lo que NO debe re-enfocar (el foco sobrevive al ruido) ─────────────
  it('"la verde" no cambia el producto', () => {
    expect(productoMencionadoEnElMensajeActual("me gusta la verde", catalogo)).toBeNull();
  });
  it('"¿cuánto vale?" no cambia el producto', () => {
    expect(productoMencionadoEnElMensajeActual("¿cuánto vale?", catalogo)).toBeNull();
  });
  it('"ese / lo quiero" no cambia el producto', () => {
    expect(productoMencionadoEnElMensajeActual("ese, lo quiero", catalogo)).toBeNull();
  });
  it("un mensaje vacío no devuelve nada", () => {
    expect(productoMencionadoEnElMensajeActual("", catalogo)).toBeNull();
  });

  it("buscar de manera directa sigue funcionando: cada producto se encuentra a sí mismo primero", () => {
    // La guardia del diag: los 4 nombres completos se auto-encuentran (la
    // reproducción con los 133 reales dio 133/133).
    for (const p of catalogo) {
      const top = puntuarCoincidencias(p.name, catalogo, 5)[0];
      expect(top?.p.id, `la búsqueda de "${p.name}" debería devolverlo primero`).toBe(p.id);
    }
  });
});

/* ── EL CLIENTE CAÓTICO (el caso del probador: nombra VARIOS en un mensaje) ──
 * El fallo: "dice que no lo tiene" con productos que nombró y SÍ existen —
 * el vendedor solo miraba el foco. La regla de LISTA (todos los nombrados,
 * cada uno con SUS palabras de nombre) le entrega el hecho completo. */
describe("productosMencionadosEnElMensajeActual (los multi-nombrados)", () => {
  it("un mensaje que nombra DOS productos distintos los lista a los dos", () => {
    const r = productosMencionadosEnElMensajeActual(
      "quiero el Coche Mecedora para Bebé con Cierre de Maleta y también la Pañalera Mochila",
      catalogo,
    );
    const ids = r.map((x) => x.id);
    expect(ids).toContain(91); // el coche
    expect(ids).toContain(163); // la pañalera
  });

  it("un nombre completo solo es UNO (los que no nombró, no entran)", () => {
    const r = productosMencionadosEnElMensajeActual("quiero el Coche Mecedora para Bebé con Cierre de Maleta", catalogo);
    expect(r.map((x) => x.id)).toEqual([91]);
  });

  it("los ruidos no listan nada (la verde / ese / vacío)", () => {
    expect(productosMencionadosEnElMensajeActual("me gusta la verde", catalogo)).toEqual([]);
    expect(productosMencionadosEnElMensajeActual("ese, lo quiero", catalogo)).toEqual([]);
    expect(productosMencionadosEnElMensajeActual("", catalogo)).toEqual([]);
  });

  it("un 'mochila' ambiguo: en el catálogo REAL (133) lista las candidatas; en el chico es palabra de categoría y no lista", async () => {
    // En el catálogo chico "mochila" aparece en 3 de 4: el umbral la suelta
    // como palabra de categoría (diseño). En el REAL (133) es un match real
    // y la regla la LISTA para que el vendedor pregunte cuál (nadie niega).
    expect(productosMencionadosEnElMensajeActual("me interesa una mochila", catalogo)).toEqual([]);
    const { readFileSync } = await import("node:fs");
    const real = (JSON.parse(readFileSync("scripts/catalogo-real.json", "utf8")) as any[]).map((p: any) => ({
      id: p.id, name: p.name, description: p.description, categoria: p.category,
      opciones: [], disponible: p.isActive !== false, price: p.price, currency: p.currency,
    }));
    const r = productosMencionadosEnElMensajeActual("me interesa una mochila para mi bebé", real);
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r.every((x) => /mochila|pañalera|beb[eé]/i.test(x.nombre))).toBe(true);
  });
});