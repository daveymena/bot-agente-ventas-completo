/**
 * CONVERSACIÓN 221 (24-09-2026) -- cliente de anuncio perdido
 *
 *   cliente: ¡Hola! Quiero más información     (lead meta_ads)
 *   bot:     ¿Estás buscando algún curso, herramienta digital o producto físico?
 *   cliente: El correcto
 *   bot:     Te cuento que el corrector de postura no lo manejamos por ahora...
 *
 * Dos fallos: el motor v2 no leía el anuncio de origen, y el agente de
 * digitales solo veía digitales, así que "no encontré" se volvió "no lo
 * manejamos" con cuatro correctores activos en el negocio.
 */
import { describe, test, expect } from "vitest";
import { db, tenants, conversations, messages } from "@workspace/db";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { productoDelAnuncioDeLaConversacion } from "../adaptador";

const cursos: Producto[] = [
  { id: 1, name: "Curso de Piano", description: "", price: 20000, currency: "COP", kind: "digital", disponible: true },
  { id: 2, name: "Mecánica de bicicletas", description: "", price: 20000, currency: "COP", kind: "digital", disponible: true },
];
const correctores: Producto[] = [
  { id: 203, name: "Corrector Postural con Placa Rígida", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true },
  { id: 201, name: "Corrector de Hombros y Clavícula", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true },
];
const todo = [...cursos, ...correctores];

describe("el agente de digitales no niega lo que vende el de físicos", () => {
  test('"El correcto" encuentra los correctores aunque no estén en su catálogo', () => {
    const ctx: ContextoHerramientas = {
      estado: estadoInicial(221),
      catalogo: [...cursos],
      catalogoCompleto: todo,
      partes: [],
      conocimiento: [],
      guion: guionDelNegocio({ catalogo: cursos, negocio: { nombre: "T" }, medios: [] }),
      mensajeDelCliente: "El correcto",
      efectos: [],
    };
    const r: any = ejecutores.buscar_en_catalogo(ctx, { consulta: "El correcto" });
    expect(r.mensaje).toMatch(/#203/);
    expect(r.mensaje).not.toMatch(/no lo manej/i);
    // Quedan disponibles para enfocar/mostrar en el mismo turno.
    expect(ctx.catalogo.some((p) => p.id === 203)).toBe(true);
  });

  test("sin catálogo completo, sigue diciendo la verdad: no hay", () => {
    const ctx: ContextoHerramientas = {
      estado: estadoInicial(221),
      catalogo: [...cursos],
      partes: [],
      conocimiento: [],
      guion: guionDelNegocio({ catalogo: cursos, negocio: { nombre: "T" }, medios: [] }),
      mensajeDelCliente: "El correcto",
      efectos: [],
    };
    const r: any = ejecutores.buscar_en_catalogo(ctx, { consulta: "El correcto" });
    expect(r.mensaje).toMatch(/No hay nada/);
  });
});

describe("el anuncio de origen fija el producto", () => {
  async function conversacionConAnuncio(metadata: any) {
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const [t] = await db.insert(tenants).values({ name: "Ad", email: `ad-${s}@test.local`, slug: `ad-${s}`, brandName: "Ad" } as any).returning();
    const [c] = await db.insert(conversations).values({ tenantId: t.id, contactName: "Daniel", contactPhone: `57302${s.slice(-6)}`, status: "ai" } as any).returning();
    await db.insert(messages).values({ conversationId: c.id, role: "customer", content: "¡Hola! Quiero más información", metadata } as any);
    return c.id;
  }

  test("el titular del anuncio nombra el producto", async () => {
    const id = await conversacionConAnuncio({ adTitle: "Corrector Postural con Placa Rígida", adBody: "Endereza tu espalda", adUrl: "", adId: "" });
    const p = await productoDelAnuncioDeLaConversacion(id, todo);
    expect(p?.id).toBe(203);
  });

  test("sin anuncio no inventa foco", async () => {
    const id = await conversacionConAnuncio({});
    expect(await productoDelAnuncioDeLaConversacion(id, todo)).toBeNull();
  });

  test("un titular ambiguo no elige a ciegas", async () => {
    const id = await conversacionConAnuncio({ adTitle: "Corrector", adBody: "", adUrl: "", adId: "" });
    expect(await productoDelAnuncioDeLaConversacion(id, todo)).toBeNull();
  });
});
