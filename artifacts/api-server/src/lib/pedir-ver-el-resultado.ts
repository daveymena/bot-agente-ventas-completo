/**
 * ============================================================
 * "DAME EL COPY" ES UN SÍ, CUANDO VERLO NO CUESTA NADA
 * ============================================================
 *
 * El admin lo pidió cuatro veces y nunca lo recibió (chat del 2026-09-04):
 *
 *   "Demuéstrale el copi"
 *   "Entregamos el copi completo para ver q vas a publicar ?"
 *   "Dame el copi para saber que vas a publicar"
 *
 * Y Atlas le contestaba, una y otra vez: "¿Confirmás para que lo genere?".
 *
 * ── El absurdo que había debajo ──────────────────────────────────────────
 *
 * `crear_anuncio` DEVUELVE el copy completo en su resultado --título, texto
 * principal, presupuesto y nota de calidad--. Y esa acción, tal como estaba
 * propuesta, guarda un borrador LOCAL en pausa: no sube nada a Meta, no gasta
 * un peso, no le llega a ningún cliente.
 *
 * O sea que el texto que el admin pedía estaba siempre a un "sí" de distancia,
 * y lo único que lo separaba era una pregunta de confirmación para algo que no
 * tiene ninguna consecuencia. Pedir ver el resultado ES querer que se haga,
 * cuando hacerlo no cuesta nada.
 *
 * ── Por qué NO se relaja la confirmación en general ──────────────────────
 *
 * Porque para casi todo lo demás sí hay consecuencia: subir a Meta, activar
 * una campaña, cambiar un precio, escribirle a un cliente. Ahí confirmar es lo
 * que protege la plata del admin, y eso no se toca.
 *
 * La regla se acota a lo que se puede deshacer sin costo: si CUALQUIERA de las
 * acciones pendientes toca el mundo real, se sigue preguntando.
 */

/** Una acción del plan, tal como la guarda el pendiente. */
export interface AccionPendiente {
  tool: string;
  args?: Record<string, any> | null;
}

/**
 * Acciones cuyo efecto es escribir un borrador local y nada más.
 *
 * La lista es corta a propósito y se amplía con evidencia, no por analogía:
 * cada nombre acá es permiso para ejecutar sin preguntar.
 */
const SOLO_BORRADOR = new Set(["crear_anuncio", "fb_ad_draft", "ad_brief", "optimize_copy"]);

/**
 * ¿Todas las acciones pendientes se pueden ejecutar sin consecuencia?
 *
 * `subirAMeta` es el interruptor que convierte a `crear_anuncio` en algo que sí
 * toca el mundo: con eso en true la campaña se crea en Meta, y ahí vuelve a
 * hacer falta el sí del admin aunque quede en pausa.
 */
export function sinConsecuencia(acciones: AccionPendiente[] | null | undefined): boolean {
  const lista = Array.isArray(acciones) ? acciones : [];
  if (lista.length === 0) return false;
  return lista.every((a) => {
    if (!SOLO_BORRADOR.has(String(a?.tool || ""))) return false;
    const args = (a?.args || {}) as Record<string, any>;
    // Cualquier señal de que sale del borrador local descalifica la acción.
    if (args.subirAMeta === true || args.publicar === true || args.activar === true) return false;
    return true;
  });
}

/**
 * ¿El admin está pidiendo VER lo que se va a producir?
 *
 * No alcanza con que mencione "copy": "cambiá el copy" es otra cosa. Se pide
 * el par -- un verbo de mostrar/entregar Y el objeto que produce la acción --
 * o una pregunta directa por lo que se va a publicar.
 */
const VERBOS_DE_VER =
  /(muestr|mostra|demuestra|ense[nñ]a|entrega|dame|pasame|pasalo|ver\b|veamos|quiero ver|leer|le[ée]r)/i;

const LO_QUE_SE_VA_A_VER =
  /(copy|copi|copo|texto|anuncio|borrador|muestra|redacci[oó]n|lo que vas a publicar|que vas a publicar|c[oó]mo queda|como queda)/i;

export function pideVerElResultado(mensaje: string): boolean {
  const t = String(mensaje || "")
    .toLowerCase()
    .replace(/[áéíóúü]/g, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" }[c] ?? c));
  if (!t.trim()) return false;
  // "¿qué vas a publicar?" es pedir verlo aunque no lleve verbo de mostrar.
  if (/(que|cual)\s+(vas a|vamos a|se va a)\s+publicar/.test(t)) return true;
  return VERBOS_DE_VER.test(t) && LO_QUE_SE_VA_A_VER.test(t);
}

/**
 * ¿Este mensaje autoriza a ejecutar el plan pendiente, por pedir ver algo que
 * no cuesta nada producir?
 */
export function verloEsAutorizarlo(mensaje: string, acciones: AccionPendiente[] | null | undefined): boolean {
  return pideVerElResultado(mensaje) && sinConsecuencia(acciones);
}
