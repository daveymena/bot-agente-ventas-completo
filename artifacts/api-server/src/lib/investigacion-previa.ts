/**
 * ¿Atlas investiga (Biblioteca de Anuncios + web) ANTES de que el modelo piense?
 *
 * Medido el 29-09-2026 sobre los diagnósticos de turno de producción:
 * "¿hay forma de traer los más vendidos de Dropi…?" pagó 33 s de Biblioteca
 * de Anuncios + web (105 s el turno) y la respuesta salió de Dropi;
 * "Muéstrame los más vendidos de Dropi…" igual (25 s + 75 s) y encima
 * declaró partes que se volvieron a investigar. La continuación automática
 * del panel ("Continuá con lo que ya tenías, sin repetir lo que ya
 * investigaste…") matcheaba /investig/ y re-investigaba en CADA vuelta,
 * hasta 4 por pedido, con esfuerzo máximo.
 *
 * La regla: la investigación previa es para preguntas cuya respuesta está
 * AFUERA. Si el pedido nombra una fuente propia (Dropi, el catálogo, los
 * pedidos, las campañas) la respuesta sale de sus herramientas, y el modelo
 * igual tiene web_search en el núcleo si de verdad le hace falta. Pedir
 * competencia/mercado lo vuelve externo aunque nombre algo propio.
 */

// Ampliado el 14-09-2026: "vamos a buscar cuál se está vendiendo y
// promocionando", "en la web", "en la biblioteca de anuncios" no
// enganchaban, y Atlas se iba a las ventas internas del admin (que eran
// cero) en vez de a internet.
export const PEDIDO_DE_INVESTIGACION = /\b(investig|averigu|indag|research|analiz[aá] el mercado|qu[eé] funciona|tendencia|competencia|benchmark|busc[aá]\w*\s+(en\s+)?(la\s+)?(web|internet|google)|biblioteca de anuncios|ad library|(m[aá]s|mejor)\s+(\w+\s+){0,2}(vend|promocion)|qu[eé]\s+se\s+est[aá]\s+(vendiendo|promocionando|pautando)|en la web|en internet)/i;

// El admin pidió datos DE AFUERA, no los suyos: "no con mis datos",
// "en la web", "en la biblioteca de anuncios". Sin esto el modelo
// rankeaba con las ventas internas y contestaba "tenés 0 ventas".
export const PIDE_FUENTES_EXTERNAS = /\b(no\s+(con\s+)?(mis|los)\s+datos|datos\s+(de\s+)?(la\s+)?(web|internet)|en\s+la\s+web|en\s+internet|bibliotecas?\s+de\s+anuncios|ad library|del mercado)\b/i;

const PIDE_AFUERA = /\b(competencia|competidor(es)?|biblioteca de anuncios|ad library|mercado|tendencias?|benchmark)\b/i;
const NOMBRA_FUENTE_PROPIA = /\b(dropi|dropify|woo\s?commerce|mi(s)?\s+(cat[aá]logo|productos?|pedidos?|ventas|campa[ñn]as?|anuncios?|clientes|tienda|landings?))\b/i;

/** La continuación que el panel manda sola (pages/code-agent.tsx, CONTINUAR). */
export function esContinuacionAutomatica(pedido: string): boolean {
  return /^\s*contin[uú][aá] con lo que ya ten[ií]as/i.test(String(pedido || ""));
}

export function debeInvestigarAntes(pedido: string): boolean {
  const p = String(pedido || "");
  if (esContinuacionAutomatica(p)) return false;
  if (PIDE_FUENTES_EXTERNAS.test(p) || PIDE_AFUERA.test(p)) return true;
  return PEDIDO_DE_INVESTIGACION.test(p) && !NOMBRA_FUENTE_PROPIA.test(p);
}
