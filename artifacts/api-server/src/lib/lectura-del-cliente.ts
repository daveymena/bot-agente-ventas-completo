/**
 * ============================================================
 * LECTURA DEL CLIENTE — el modelo lee, las listas respaldan
 * ============================================================
 *
 * Hasta hoy `entenderAlCliente` corría primero pero solo se usaba su
 * `intencion`. Todo lo demás —qué producto nombró, si preguntó por varios, si
 * habla del que está en foco, si pide el video o el precio— seguía saliendo
 * de listas de palabras (`nombraOtraCosaQueElFoco`, `preguntaPorVarios`,
 * `pideAlgoEntregable`, `PIDE_*`). Y cada frase que la lista no conocía era un
 * hueco nuevo: "comprar" no casaba con "comprarla", "gracias" era despedida,
 * `\bsí\b` no casaba nunca por la tilde.
 *
 * Acá vive la regla que invierte eso:
 *
 *   · si el modelo leyó el mensaje con confianza, SU lectura manda;
 *   · si no corrió, tardó o dudó, decide la lista de siempre.
 *
 * Ninguna de estas funciones toca hechos (precio, enlace, cuenta): eso lo
 * sigue poniendo el servidor. Solo deciden QUÉ pidió el cliente.
 */

import type { Entendimiento, Pedido } from "./entender-al-cliente";
import { pideAlgoEntregable, preguntaPorVarios } from "./ficha-parcial";

/** Por debajo de esto el modelo dudó: se sigue con los patrones. */
export const CONFIANZA_MINIMA = 0.5;

export function mandaLaLectura(en: Entendimiento | null | undefined): en is Entendimiento {
  return !!en && Number(en.confianza) >= CONFIANZA_MINIMA;
}

/**
 * Pedidos que se contestan con un pedazo de la ficha (precio, video,
 * enlace, medios de pago…). "contenido" también: es la sección `info`.
 */
const ENTREGABLES: ReadonlySet<Pedido> = new Set<Pedido>([
  "precio", "pago", "transferencia", "link_pago", "tienda", "video", "contenido", "entrega",
]);

/**
 * ¿Pide algo que el servidor puede ENTREGAR (y por lo tanto la ficha, o una
 * sección de ella, es la respuesta)?
 *
 * Unión a propósito: la lista ya no da falsos positivos desde que `cuanto` y
 * `valor` exigen contexto (2026-08-27), así que sumarle la lectura del modelo
 * solo puede cerrar huecos, no abrir ninguno.
 */
export function pideEntregable(en: Entendimiento | null | undefined, texto: string): boolean {
  if (pideAlgoEntregable(texto)) return true;
  return mandaLaLectura(en) && en.pide.some((p) => ENTREGABLES.has(p));
}

/**
 * ¿Preguntó por VARIOS productos a la vez? La sección de UNO no contesta la
 * suma. El modelo cuenta ids; la lista cuenta palabras del catálogo.
 */
export function preguntaPorVariosProductos(
  en: Entendimiento | null | undefined,
  texto: string,
  nombres: string[],
): boolean {
  if (mandaLaLectura(en) && en.productosNombrados.length >= 2) return true;
  return preguntaPorVarios(texto, nombres);
}

/**
 * ¿El mensaje nombra OTRA cosa que no es el producto en foco (y no está en el
 * catálogo)? Es lo que apaga la ficha del foco y habilita el "no lo tengo".
 *
 * El modelo puede decir las dos cosas, y se decide así:
 *   · "es sobre el foco" y no nombró nada          → false, gane lo que gane
 *     la lista (un "¿es grabado?" no es otro producto);
 *   · "pide algo que no hay" y no nombró nada      → true;
 *   · nombró un producto del catálogo distinto      → NO es este caso: es un
 *     cambio de producto, y lo resuelve el buscador con `productoDelMensaje`.
 * Sin lectura confiable, la lista (`porLista`) decide como siempre.
 */
export function nombraOtraCosa(
  en: Entendimiento | null | undefined,
  porLista: boolean,
  focoId: number | null | undefined,
): boolean {
  if (!mandaLaLectura(en)) return porLista;
  const nombrados = en.productosNombrados;
  if (nombrados.length === 0) {
    if (en.sobreElFoco) return false;
    if (en.pideAlgoQueNoHay) return true;
    return porLista;
  }
  // Nombró algo del catálogo: si es el foco mismo, no es "otra cosa"; si es
  // otro producto real, tampoco (eso es cambio de producto, no "no lo tengo").
  if (nombrados.length === 1 && nombrados[0] === focoId) return false;
  return false;
}

/**
 * ¿Pregunta por el producto que se viene hablando, sin nombrar otro? Sirve
 * para que el buscador no le cambie el producto al cliente por una palabra
 * suelta ("¿me sirve si no sé nada de programación?" → PACK PROGRAMACIÓN).
 */
export function preguntaSobreElFoco(en: Entendimiento | null | undefined, porLista: boolean): boolean {
  if (!mandaLaLectura(en)) return porLista;
  if (en.productosNombrados.length === 0 && en.sobreElFoco) return true;
  return porLista;
}

/**
 * ¿Nombró algo concreto? (Para decidir entre "no lo tengo" y "¿de qué
 * producto me hablas?" cuando no hay foco ni coincidencia.)
 *   · el modelo dice que pide algo que no hay → sí, algo concreto;
 *   · el modelo dice que solo pide ver el catálogo, saluda o pregunta cómo
 *     comprar → no.
 */
export function nombraAlgoConcretoSegunLectura(
  en: Entendimiento | null | undefined,
  porLista: boolean,
): boolean {
  if (!mandaLaLectura(en)) return porLista;
  if (en.productosNombrados.length > 0) return true;
  if (en.pideAlgoQueNoHay) return true;
  if (en.pide.includes("catalogo")) return false;
  // El modelo no vio nada concreto y tampoco lo afirmó: que decida la lista,
  // que es la vara con la que se venía midiendo.
  return porLista;
}

const normalizar = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ");

/** Palabras que están en muchos nombres del catálogo y no identifican nada. */
const GENERICAS_DEL_NOMBRE = new Set([
  "curso", "cursos", "pack", "mega", "completo", "completa", "online", "desde", "cero",
  "nivel", "basico", "avanzado", "digital", "producto", "para", "con", "sin", "por",
]);

/**
 * El producto que el modelo dice que el cliente NOMBRÓ, verificado contra el
 * texto: se acepta solo si nombró exactamente uno y alguna palabra propia de
 * ese nombre (4+ letras, no genérica) está en el mensaje.
 *
 * Es la regla "el modelo lee, el servidor verifica" en su forma más simple.
 * El modelo eligió mal el id seguido cuando el catálogo iba truncado (escribió
 * 115 y 101 para el 124, 2026-09-02); con esta vara un id equivocado no pasa,
 * porque el nombre equivocado no está en el mensaje.
 */
export function productoNombradoVerificado<T extends { id: number; name?: string | null }>(
  en: Entendimiento | null | undefined,
  texto: string,
  catalogo: T[],
): T | null {
  if (!mandaLaLectura(en) || en.productosNombrados.length !== 1) return null;
  const p = catalogo.find((x) => x.id === en.productosNombrados[0]);
  if (!p) return null;
  const enMensaje = new Set(normalizar(texto).match(/[a-z0-9ñ]{4,}/g) ?? []);
  const propias = (normalizar(String(p.name || "")).match(/[a-z0-9ñ]{4,}/g) ?? [])
    .filter((w) => !GENERICAS_DEL_NOMBRE.has(w));
  return propias.some((w) => enMensaje.has(w)) ? p : null;
}

/** Los `pide` del modelo, o vacío si no hay lectura confiable. */
export function pedidosLeidos(en: Entendimiento | null | undefined): Pedido[] {
  return mandaLaLectura(en) ? en.pide : [];
}
