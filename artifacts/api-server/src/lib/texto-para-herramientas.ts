/**
 * Con qué texto se eligen las herramientas de un turno.
 *
 * Las herramientas se eligen por lo que se está HABLANDO (13-09-2026,
 * s-1789094170354): un "sí" o un "dale" solo significan algo junto a la
 * pregunta que contestan, así que para un seguimiento corto se miran también
 * los últimos turnos.
 *
 * ⚠️ 09-10-2026: la continuación automática del panel ("Continuá con lo que
 * ya tenías, sin repetir lo que ya hiciste.") mide 61 caracteres y no empieza
 * con "sí/dale/ok", así que NO contaba como seguimiento: el turno se armaba
 * solo con ese texto, que no nombra nada, y llegaba sin las herramientas de
 * Facebook. Atlas contestó "en este turno no está disponible la consulta de
 * campañas" a mitad de una revisión de anuncios del Corrector. Una
 * continuación es por definición un seguimiento.
 */
import { esContinuacionAutomatica } from "./investigacion-previa";

const SEGUIMIENTO = /^(s[ií]|dale|ok|okey|listo|claro|hacelo|hazlo|revisa|revis[aá]lo|ve|mira|adelante|perfecto|bueno|va|de una|por favor)\b/i;

export function esSeguimiento(prompt: string): boolean {
  const p = String(prompt || "").trim();
  return p.length <= 40 || SEGUIMIENTO.test(p) || esContinuacionAutomatica(p);
}

export function textoParaElegirHerramientas(prompt: string, convo: Array<{ content?: unknown }>): string {
  const p = String(prompt || "");
  if (!esSeguimiento(p)) return p;
  return [...convo.slice(-4).map((m) => String(m?.content || "")), p].join("\n");
}
