/**
 * Los OJOS de Atlas cuando diseña (23-10-2026).
 *
 * Diseñar a ciegas es adivinar: Atlas movía capas y cambiaba colores sin ver
 * el resultado. Acá la imagen REAL (el PNG del creativo o la captura de la
 * landing en un celular) va a un modelo de visión con instrucciones de
 * director de arte, y vuelve una crítica concreta que Atlas puede convertir
 * en operaciones: qué capa, qué cambiar, por qué.
 *
 * El criterio es el de un anuncio o una página de venta en un celular, no
 * el de una pieza de portafolio: el producto se ve, el mensaje se lee en
 * 1-2 segundos, el botón se encuentra.
 *
 * Si no hay modelo de visión con clave, devuelve null y la herramienta lo
 * dice: no se inventa una crítica.
 */
import { preguntarAVision } from "../media-entrante";

export interface ContextoDeCritica {
  tipo: "creativo" | "landing";
  /** Lo que el producto es y lo que se quiere lograr, en una frase. */
  objetivo?: string;
  /** describirEscena() o la lista de secciones: para que la crítica nombre capas reales. */
  estructura?: string;
  formato?: string;
}

const CRITERIOS_CREATIVO = [
  "Jerarquía: ¿hay UN punto focal claro (el producto o el gancho)? ¿Compiten dos cosas por la atención?",
  "Producto: ¿se ve grande y nítido, o queda chico/tapado/recortado de forma rara?",
  "Lectura en celular: ¿el gancho se lee en 1-2 segundos? ¿Algún texto es muy chico o tiene poco contraste con lo que tiene detrás?",
  "Composición: márgenes parejos, alineaciones, aire. ¿Algo pegado al borde o flotando sin relación?",
  "Color: ¿el acento combina con la foto? ¿Hay demasiados colores?",
  "Llamado a la acción: ¿se distingue el botón o el precio?",
  "Zonas seguras de Meta: en 9:16 lo de arriba (14%) y abajo (35%) lo tapa la interfaz.",
];

const CRITERIOS_LANDING = [
  "Primera pantalla del celular: ¿se entiende qué es, cuánto cuesta y dónde se compra sin bajar?",
  "Jerarquía: titular, precio y botón principal se distinguen; nada compite con el botón.",
  "Lectura: textos largos, letra chica, poco contraste, renglones de más de 80 caracteres.",
  "Fotos: ¿el producto se ve bien? ¿Hay fotos repetidas o recortes feos?",
  "Ritmo: ¿las secciones alternan y respiran, o es un bloque monótono? ¿Hay secciones vacías o de relleno?",
  "Confianza: ¿se ve cómo se paga y cómo llega? (sin pedir datos que el negocio no tiene)",
];

export function instruccionDeCritica(c: ContextoDeCritica): string {
  const criterios = c.tipo === "creativo" ? CRITERIOS_CREATIVO : CRITERIOS_LANDING;
  return [
    `Eres director de arte de anuncios de venta directa en Latinoamérica. Revisa esta ${c.tipo === "creativo" ? `imagen de anuncio${c.formato ? ` (${c.formato})` : ""}` : "página de venta vista en un celular"}.`,
    c.objetivo ? `Objetivo: ${c.objetivo}` : "",
    c.estructura ? `Así está armada (usa estos ids/nombres al proponer cambios):\n${c.estructura.slice(0, 3500)}` : "",
    "Revisa:",
    ...criterios.map((x) => `- ${x}`),
    "Responde en español, así:",
    "NOTA: un número del 1 al 10 (10 = listo para pautar).",
    "LO QUE FUNCIONA: una línea.",
    "CAMBIOS: de 2 a 5, del más importante al menos, cada uno concreto y aplicable (qué capa o sección, qué propiedad, a qué valor aproximado). Ejemplo: \"[g12] Gancho: subir tam de 6 a 8 y pasarlo a y=8 para que no lo tape el precio\".",
    "No describas la imagen. No inventes datos del producto (precios, descuentos, reseñas). Si algo no se ve con claridad, dilo.",
  ].filter(Boolean).join("\n");
}

/** La crítica del diseño en la imagen, o null si no hay modelo de visión disponible. */
export async function criticarDiseno(png: Buffer, c: ContextoDeCritica, tenantId?: number | null): Promise<string | null> {
  return preguntarAVision(png, "image/png", instruccionDeCritica(c), tenantId, 700);
}
