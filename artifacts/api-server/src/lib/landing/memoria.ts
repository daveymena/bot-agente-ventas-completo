/**
 * MEMORIA PERSISTENTE DEL GENERADOR DE LANDINGS
 *
 * El generador de landings (Landing Studio v2 y el tool `landing_crear` de
 * Atlas) es "sin memoria": cada generación arrancaba desde cero porque el
 * contexto se perdía al terminar el turno. Acá vive la capa que lo arregla,
 * encima de `architectMemoryService` (tabla architect_memory, que sobrevive
 * reinicios y deploys).
 *
 * Convención de tags: `landing`, `landing:tipo:<tipo>`, `landing:producto:<id>`.
 * Se guarda después de cada generación y se lee ANTES de la siguiente, para
 * que el agente recupere estilo, decisiones y landings previos sin empezar
 * de cero.
 */

import { architectMemoryService } from "../architect-memory-service";

const TAG_LANDING = "landing";

export interface DatosLanding {
  tenantId: number;
  productId?: number | null;
  productName?: string | null;
  tipo?: string | null;
  familia?: string | null;
  slug?: string | null;
  landingId?: number | null;
  instruccion?: string | null;
  summary?: string | null;
}

/**
 * Guarda lo que se hizo en una generación/edición de landing. Nunca debe
 * romper la generación: si falla, se traga el error y sigue.
 */
export async function recordarLanding(d: DatosLanding): Promise<void> {
  try {
    const tags = [TAG_LANDING, `landing:tipo:${d.tipo || "desconocido"}`];
    if (d.productId) tags.push(`landing:producto:${d.productId}`);

    const content = [
      d.summary ? `Resumen: ${d.summary}` : "",
      d.instruccion ? `Instrucción del admin: ${d.instruccion}` : "",
      d.familia ? `Familia visual: ${d.familia}` : "",
      d.slug ? `Slug: ${d.slug}` : "",
      d.landingId ? `Landing id: ${d.landingId}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await architectMemoryService.recordLearning(
      d.tenantId,
      "decision",
      `landing · ${d.tipo || "generada"} · ${d.productName || "sin producto"}`,
      content || `Landing ${d.tipo || ""} generada para ${d.productName || "un producto"}.`,
      tags,
      {
        productId: d.productId ?? null,
        tipo: d.tipo ?? null,
        familia: d.familia ?? null,
        slug: d.slug ?? null,
        landingId: d.landingId ?? null,
        source: "landing",
      },
    );
  } catch {
    /* la memoria no puede tumbar la generación */
  }
}

/**
 * Devuelve un bloque de texto con lo que el agente ya sabe del negocio para
 * este producto/tipo, para inyectar en el prompt. Vacío si no hay nada.
 */
export async function contextoLanding(
  tenantId: number,
  opts: { productId?: number | null; tipo?: string | null } = {},
): Promise<string> {
  try {
    // "" como query matchea todo (patrón usado por marketing-memory.ts).
    const todas = await architectMemoryService.retrieveRelevantMemories(tenantId, "", 60);
    const deLanding = todas.filter((m: any) => (m.tags || []).includes(TAG_LANDING));
    if (!deLanding.length) return "";

    // Primero las del mismo producto, después las del mismo tipo, después el resto.
    const puntuar = (m: any): number => {
      let p = 0;
      if (opts.productId && m.metadata?.productId === opts.productId) p += 3;
      if (opts.tipo && m.metadata?.tipo === opts.tipo) p += 2;
      return p;
    };
    const ordenadas = deLanding
      .sort((a: any, b: any) => puntuar(b) - puntuar(a))
      .slice(0, 6);

    const lineas = ordenadas.map((m: any) => {
      const familia = m.metadata?.familia ? ` · familia ${m.metadata.familia}` : "";
      return `- ${m.title}${familia}\n  ${String(m.content || "").slice(0, 400)}`;
    });

    return (
      "MEMORIA DE LANDINGS PREVIOS DEL NEGOCIO (recuperada para no empezar de cero):\n" +
      "Usá el estilo, las familias y las decisiones que ya se tomaron; no repitas trabajo hecho ni contradigas lo anterior.\n" +
      lineas.join("\n")
    );
  } catch {
    return "";
  }
}
