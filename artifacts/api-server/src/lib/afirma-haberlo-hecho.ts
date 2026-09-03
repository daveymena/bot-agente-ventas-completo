/**
 * ¿ATLAS ESTÁ DICIENDO QUE YA HIZO ALGO QUE NO HIZO?
 *
 * El candado existe porque el 2026-08-19 Atlas contestó "✅ Borrador 89 subido
 * a Meta en pausa" y Meta devolvía `{"campaigns":[]}`: no existía nada. Cuando
 * el texto afirma un trabajo terminado y no se ejecutó ninguna herramienta,
 * arriba del mensaje va un aviso diciendo la verdad.
 *
 * ── Por qué se sacó de la ruta a un archivo propio ─────────────────────────
 *
 * Porque estaba mal, y en el chat de producción del 2026-09-03 se ve dos veces
 * en la misma pantalla. El aviso salió sobre:
 *
 *   · un mensaje que SÍ tenía propuesta y terminaba en "📌 ¿Confirmás?",
 *     encabezado por "no quedó ninguna acción pendiente de confirmar" -- el
 *     aviso contradiciendo al mensaje que encabeza;
 *   · una respuesta puramente conversacional ("tenés razón, me estoy
 *     colgando..."), donde no había nada que guardar ni que aclarar.
 *
 * La causa es la misma en los dos: **en castellano, un montón de sustantivos
 * comunes terminan en -ado/-ido**. La regla reconocía la FORMA del participio
 * --que es la idea correcta, perseguir verbos uno por uno se pierde siempre--
 * pero sin distinguir el participio del sustantivo. Entonces:
 *
 *   "copy + estado del embudo"        →  "estado"     ✗
 *   "✅ Problema identificado"         →  "identificado" (adjetivo, no acción) ✗
 *   "Sigo trabajando en tu pedido"    →  "pedido"     ✗
 *
 * `estado`, `pedido`, `resultado`, `mercado`, `contenido`, `significado`,
 * `sonido`, `cuidado`, `empleado`: todos terminan igual que "guardado" y
 * ninguno afirma nada. Y `pedido` aparece en el propio latido de progreso del
 * turno ("Sigo trabajando en tu pedido"), así que el aviso podía dispararse
 * por texto que escribe el sistema, no el modelo.
 *
 * ── Por qué importa que sobre-avise ───────────────────────────────────────
 *
 * El comentario que dejó esto acá decía: "un falso positivo no hace daño;
 * entre avisar de más y dejar pasar un 'ya está hecho' falso, este proyecto ya
 * sabe cuál duele". Es cierto para el riesgo, y falso para el costo, y el chat
 * de producción lo muestra: el aviso le dice al admin **"pedímelo de nuevo
 * para que lo registre de verdad"**. Si hace caso sobre un mensaje que sí
 * tenía plan, termina con el anuncio duplicado -- exactamente lo que el mismo
 * archivo advierte diez líneas más abajo. Un aviso que se dispara siempre deja
 * de leerse, y el día que sea cierto tampoco lo van a leer.
 *
 * El criterio sigue siendo el de antes -- reconocer la forma, no enumerar
 * significados -- con una sola corrección: una palabra que en castellano es un
 * sustantivo corriente no cuenta como afirmación de trabajo hecho.
 */

/**
 * Terminan en -ado/-ido y NO son un trabajo terminado.
 *
 * Sustantivos y adjetivos de uso diario, más los que este dominio repite:
 * "pedido" (el latido del turno), "estado", "resultado", "contenido".
 *
 * Va sin acentos y en minúscula: se compara contra la palabra normalizada.
 */
const NO_AFIRMAN = new Set([
  // Los que aparecieron de verdad en producción.
  "estado", "estados", "pedido", "pedidos", "resultado", "resultados",
  "contenido", "contenidos", "identificado", "identificados",
  // Sustantivos comunes con la misma terminación.
  "mercado", "mercados", "significado", "significados", "sonido", "sonidos",
  "cuidado", "cuidados", "empleado", "empleados", "candidato", "candidatos",
  "apellido", "apellidos", "partido", "partidos", "sentido", "sentidos",
  "tratado", "tratados", "grado", "grados", "lado", "lados", "dado", "dados",
  "vestido", "vestidos", "ruido", "ruidos", "descuido", "descuidos",
  "periodo", "periodos", "helado", "helados", "mandado", "mandados",
  // Adjetivos que describen, no afirman una acción del sistema.
  "relacionado", "relacionados", "relacionada", "relacionadas",
  "detallado", "detallados", "detallada", "detalladas",
  "recomendado", "recomendados", "recomendada", "recomendadas",
  "adecuado", "adecuados", "adecuada", "adecuadas",
  "complicado", "complicados", "complicada", "complicadas",
  "querido", "queridos", "querida", "queridas",
  "conocido", "conocidos", "conocida", "conocidas",
  "parecido", "parecidos", "parecida", "parecidas",
  "elevado", "elevados", "elevada", "elevadas",
  "limitado", "limitados", "limitada", "limitadas",
  "interesado", "interesados", "interesada", "interesadas",
  "preocupado", "preocupados", "preocupada", "preocupadas",
]);

/**
 * Sin acentos y en minúscula, para comparar contra la lista.
 *
 * Se mapean las vocales acentuadas a mano en vez de usar el truco de
 * `normalize("NFD")` + rango de marcas combinantes. Ese rango son caracteres
 * INVISIBLES dentro de la expresión: no se ven en el diff, no se ven al
 * revisar, y basta una herramienta que los reinterprete para que la clase
 * quede rota y nadie se entere. Este repo ya pagó eso una vez -- el 0x08 que
 * se coló en una regex de whatsapp.ts, que compilaba y no casaba nunca -- y
 * tiene una prueba (`sin-caracteres-corruptos`) para no repetirlo.
 *
 * Acá el alfabeto es el castellano y son seis letras: escribirlas se lee.
 */
const ACENTOS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u",
};

function normalizar(palabra: string): string {
  return palabra.toLowerCase().replace(/[áéíóúü]/g, (c) => ACENTOS[c] ?? c);
}

/**
 * Las tres formas en que el modelo afirma haber terminado algo.
 *
 * Cada una captura EL PARTICIPIO en el grupo 1, que es el cambio: antes la
 * expresión solo decía si casaba o no, y sin la palabra en la mano no había
 * dónde preguntar "¿esto es de verdad un participio?".
 *
 * Van como literales y NO armadas con `new RegExp` + plantilla: construyéndolas
 * así los escapes se pierden (`\b\w` terminaba siendo `w`) y el candado quedaba
 * mudo sin que nada avisara.
 */
const PATRONES: RegExp[] = [
  // "✅ ... subido", "Listo, ... publicado"
  /(?:✅|✔️|\blistos?\b)[^\n]{0,100}?\b(\w{3,}(?:ad[oa]s?|id[oa]s?))\b/gi,
  // "quedó pausada", "fue publicado", "ya está actualizado"
  /\b(?:qued(?:ó|o|aron)|fue(?:ron)?|est(?:á|án|a|an))\s+(?:ya\s+)?(\w{3,}(?:ad[oa]s?|id[oa]s?))\b/gi,
  // "Borrador guardado", "campaña creada", "campos guardados"
  //
  // "producto" queda FUERA a propósito: "encontré estos productos
  // relacionados" es una pregunta legítima. Un producto realmente guardado lo
  // cazan los dos patrones de arriba.
  /\b(?:campos?|borrador(?:es)?|anuncios?|campa[nñ]as?|cambios?|copy)\b[^\n]{0,20}?\b(\w{3,}(?:ad[oa]s?|id[oa]s?))\b/gi,
];

/**
 * ¿El texto afirma que un trabajo ya está hecho?
 *
 * Devuelve true solo si alguna de las tres formas casa CON un participio de
 * verdad. Una coincidencia cuya palabra es un sustantivo corriente se descarta
 * y se sigue buscando: el mismo mensaje puede traer "estado" (que no cuenta) y
 * "guardado" (que sí).
 */
export function afirmaHaberloHecho(texto: string): boolean {
  const t = String(texto || "");
  for (const patron of PATRONES) {
    // `lastIndex` es estado compartido en una regex /g declarada a nivel de
    // módulo: sin reiniciarlo, la segunda llamada arranca donde terminó la
    // primera y se saltea coincidencias del principio del texto.
    patron.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = patron.exec(t)) !== null) {
      const palabra = m[1];
      if (palabra && !NO_AFIRMAN.has(normalizar(palabra))) return true;
      // Una coincidencia de ancho cero colgaría el bucle. No debería pasar con
      // estos patrones, pero es una línea contra un cuelgue en producción.
      if (m.index === patron.lastIndex) patron.lastIndex++;
    }
  }
  return false;
}
