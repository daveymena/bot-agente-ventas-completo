/**
 * ============================================================
 * EL CONOCIMIENTO QUE CARGA EL DUEÑO, NO EL PROGRAMADOR
 * ============================================================
 *
 * `conocimiento-producto.ts` tiene las respuestas verificadas escritas a mano,
 * con tres productos adentro. Funciona para esos tres y para nadie más: un
 * cliente nuevo del SaaS que carga su curso no tiene respuesta a "¿qué
 * incluye?" ni "¿cuánto dura?", y el bot le contesta "déjame confirmarte ese
 * dato exacto" a algo que el dueño sabe de memoria. Agregarlo exigía editar un
 * `.ts` y desplegar — o sea, el producto solo servía si el cliente programaba.
 *
 * Acá el conocimiento vive en la base y lo carga Atlas conversando. La tabla
 * escrita a mano NO se borra: queda de respaldo, y lo cargado por el dueño le
 * gana. Un negocio que no configuró nada sigue funcionando igual que antes.
 *
 * ── Por qué no se guardan expresiones regulares ─────────────────────────
 *
 * Un dueño de negocio no escribe regex, y una mal cerrada tumbaría el cotejo
 * de todas las preguntas. Se guardan PALABRAS Y FRASES separadas por coma
 * ("qué incluye, temario, módulos") y el cotejo se hace normalizando y
 * buscando. El dueño escribe como habla.
 */

import { db, productKnowledge } from "@workspace/db";
import { and, eq, or, isNull } from "drizzle-orm";
import { logger } from "./logger";
import type { PreguntaConocida } from "./conocimiento-producto";

/** Sin tildes, sin signos, en minúsculas: como se compara todo acá. */
export function normalizarTexto(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    // Escapado, no con los diacriticos crudos: pegados en el archivo son
    // caracteres invisibles, y hay un test que los prohibe justamente
    // porque se copian sin que nadie los vea.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Los disparadores de una fila, ya limpios. */
export function disparadoresDe(crudo: string): string[] {
  return String(crudo || "")
    .split(",")
    .map((d) => normalizarTexto(d))
    .filter((d) => d.length >= 3);
}

/**
 * ¿Alguno de los disparadores aparece en el mensaje?
 *
 * Se compara sobre el texto normalizado, así "¿Qué INCLUYE?" encuentra el
 * disparador "que incluye". Se pide 3 caracteres mínimo para que nadie cargue
 * "a" como disparador y haga que todo coincida con todo.
 */
export function coincide(mensaje: string, disparadores: string[]): boolean {
  const m = normalizarTexto(mensaje);
  if (!m) return false;
  return disparadores.some((d) => m.includes(d));
}

/**
 * El conocimiento que el dueño cargó para este producto, en el mismo formato
 * que usa la tabla escrita a mano.
 *
 * Las filas con `productId` nulo valen para todo el catálogo del negocio: son
 * las que el dueño responde igual sin importar qué le pregunten.
 *
 * Nunca lanza: si la tabla todavía no existe (una base vieja sin migrar), se
 * registra y se devuelve vacío. Quedarse sin las respuestas cargadas es malo;
 * tumbar la conversación entera por eso es peor.
 */
export async function conocimientoCargado(
  tenantId: number,
  productId?: number | null,
): Promise<PreguntaConocida[]> {
  try {
    const filas = await db
      .select()
      .from(productKnowledge)
      .where(
        and(
          eq(productKnowledge.tenantId, tenantId),
          productId
            ? or(eq(productKnowledge.productId, productId), isNull(productKnowledge.productId))
            : isNull(productKnowledge.productId),
        ),
      );

    const salida: PreguntaConocida[] = [];
    for (const f of filas as any[]) {
      const disp = disparadoresDe(f.disparadores);
      if (disp.length === 0) continue;
      const texto = typeof f.respuesta === "string" ? f.respuesta.trim() : "";
      salida.push({
        id: `cargado:${f.id}`,
        // El contrato de `PreguntaConocida` pide un RegExp, pero acá el cotejo
        // real lo hace `coincide()`. Se arma un objeto con `test` propio para
        // no obligar al dueño a escribir expresiones regulares ni tener que
        // escapar lo que escriba.
        patrones: { test: (t: string) => coincide(t, disp) } as unknown as RegExp,
        // Vacío se guarda como null a propósito: es "me lo preguntan y no lo
        // tengo confirmado", y el agente dice que lo confirma en vez de
        // inventarlo.
        respuesta: texto ? texto : null,
      });
    }

    // Lo más específico primero: lo cargado para ESTE producto le gana a lo
    // general del negocio, igual que en la tabla escrita a mano.
    return salida.sort((a, b) => {
      const ap = (filas as any[]).find((f) => `cargado:${f.id}` === a.id)?.productId ? 0 : 1;
      const bp = (filas as any[]).find((f) => `cargado:${f.id}` === b.id)?.productId ? 0 : 1;
      return ap - bp;
    });
  } catch (err: any) {
    logger.warn(
      { err: err?.message, tenantId, productId },
      "[Conocimiento] no se pudo leer lo cargado por el dueño; se usa solo lo de fábrica",
    );
    return [];
  }
}
