/**
 * ============================================================
 * ¿ESTO SE ENVÍA A UNA CASA, O SE MANDA POR UN ENLACE?
 * ============================================================
 *
 * Conversación real del 2026-09-02, curso de IA (producto 124, $60.000,
 * entrega por enlace):
 *
 *   cliente: "Tienes el curso de inteligencia artificial?"
 *   bot:     [le muestra el curso: 39 módulos en video]
 *   cliente: "Si"
 *   bot:     "¿Cuál es tu nombre completo?"
 *   bot:     "¿Y tu ciudad y departamento?"
 *   bot:     "¿Y me confirmas tu número de celular y tu cédula?"
 *   bot:     "Solo me falta tu cédula para completar el pedido."
 *
 * Le pidió la CÉDULA para un curso que llega por correo. Eso no es solo
 * ridículo delante del cliente: son datos personales que no hacen falta para
 * nada, pedidos y guardados sin ninguna razón.
 *
 * ── Por qué pasó ─────────────────────────────────────────────────────────
 *
 * El flujo de datos de envío se abre cuando el producto tiene `kind` en
 * "physical". En la base, `kind` viene con default "digital" -- pero el
 * importador de WooCommerce lo escribía en "physical" para TODOS los productos
 * que sincronizaba, sin mirar si Woo los declara `virtual` o `downloadable`.
 * O sea que cualquier curso que entró por esa vía quedó marcado como algo que
 * se despacha por transportadora.
 *
 * Eso ya se corrigió en `woocommerce.ts`. Pero corregir el importador no
 * arregla las filas que ya están mal, y sobre todo no evita la próxima fuente
 * de datos malos: mañana entra otro catálogo por otra vía y vuelve a pasar.
 *
 * ── Por eso esto ─────────────────────────────────────────────────────────
 *
 * Un campo suelto de la base no puede ser la única prueba de que algo se
 * despacha en un camión. Cuando el producto tiene un enlace de entrega, o se
 * llama "curso", el sistema TIENE la evidencia de que es digital -- y la
 * estaba ignorando en favor de una bandera.
 *
 * La regla: para pedirle a alguien la cédula hay que estar seguro. Ante la
 * duda, no se pide.
 */

const N = (s: unknown) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Palabras que solo tiene algo que se entrega por un enlace.
 *
 * Van con límite de palabra: "clase" no puede casar dentro de otra cosa, y
 * "curso" tampoco. No entra "digital" a secas -- existe la "báscula digital",
 * que es un aparato que sí se despacha.
 */
const NOMBRE_DE_DIGITAL =
  /\b(curso|cursos|clase|clases|masterclass|taller|diplomado|ebook|e-book|libro digital|pdf|plantilla|plantillas|membresia|suscripcion|acceso de por vida|videocurso|entrenamiento online|programa online)\b/;

/**
 * Frases que solo escribe quien vende algo que se entrega por un enlace.
 *
 * Van sobre la DESCRIPCIÓN, que es texto libre del dueño, así que acá el
 * listón es más alto que en el nombre: nada de palabras sueltas. "Acceso de
 * por vida" o "39 módulos en video" no los dice nadie de un cojín de moto.
 *
 * Hace falta porque el nombre no siempre alcanza: el curso que destapó esto se
 * llama "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS" --
 * ni "curso" ni "clase" aparecen por ningún lado.
 */
const DESCRIPCION_DE_DIGITAL =
  /\b(modulos en video|modulos de video|acceso de por vida|acceso inmediato|enlace de acceso|link de acceso|descarga inmediata|clases grabadas|100% online|totalmente online|\d+\s*modulos|curso completo|masterclass|mentoria|diplomado)\b/;

export type ProductoParaEntrega = {
  kind?: string | null;
  deliveryLink?: string | null;
  name?: string | null;
  category?: string | null;
  description?: string | null;
};

/**
 * ¿Hay evidencia de que este producto se entrega digitalmente?
 *
 * No pregunta "¿la bandera dice digital?" -- pregunta si hay algo que PRUEBE
 * que no se despacha. Se usa para NO pedir datos de envío, así que un falso
 * positivo cuesta poco (el negocio pide la dirección un mensaje después) y un
 * falso negativo cuesta la cédula de un cliente.
 */
export function pareceDigital(p: ProductoParaEntrega | null | undefined): boolean {
  if (!p) return false;

  // La prueba más fuerte: ya hay por dónde entregarlo sin moverlo.
  if (N(p.deliveryLink).trim().length > 0) return true;

  // La bandera, cuando dice digital, se respeta.
  const kind = N(p.kind);
  if (kind && kind !== "physical" && kind !== "fisico" && kind !== "dropshipping") return true;

  // Y lo que escribió el dueño: primero el nombre, después la descripción.
  if (NOMBRE_DE_DIGITAL.test(N(p.name)) || NOMBRE_DE_DIGITAL.test(N(p.category))) return true;
  return DESCRIPCION_DE_DIGITAL.test(N(p.description));
}

/**
 * ¿Se le pueden pedir a este cliente los datos de envío?
 *
 * Solo si el producto está marcado como físico Y no hay ninguna evidencia de
 * que sea digital. Las dos condiciones, no una.
 */
export function seDespachaPorTransportadora(p: ProductoParaEntrega | null | undefined): boolean {
  if (!p) return false;
  const kind = N(p.kind);
  const marcadoFisico = kind === "physical" || kind === "fisico" || kind === "dropshipping";
  return marcadoFisico && !pareceDigital(p);
}
