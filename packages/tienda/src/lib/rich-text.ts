// H2 entra porque el formato acordado para las descripciones lo usa como
// titulo principal de la ficha (con H3 para las secciones). Sin permitirlo, el
// sanitizador le sacaba la etiqueta y ese titulo caia a texto suelto: la
// descripcion se guardaba bien y se veia mal, que es el peor de los casos
// porque nada avisa.
//
// Sigue siendo seguro: son etiquetas de estructura, sin atributos (se borran
// todos mas abajo) y con script/style/iframe/object/embed/form eliminados
// antes. Lo que NO entra son tablas ni nada que pueda romper el ancho en un
// celular.
const allowedTags = new Set([
  "BR", "P", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "H2", "H3", "H4",
]);

export function sanitizeRichHtml(value: string): string {
  if (!value) return "";
  if (typeof DOMParser === "undefined") return value.replace(/<[^>]*>/g, " ");

  const doc = new DOMParser().parseFromString(value, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form").forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }
    Array.from(node.attributes).forEach((attribute) => node.removeAttribute(attribute.name));
  });
  return doc.body.innerHTML;
}

export function htmlToPlainText(value: string): string {
  if (!value) return "";
  if (typeof DOMParser === "undefined") return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

/**
 * Convierte una descripción de TEXTO PLANO en HTML con estructura.
 *
 * El catálogo viene de años de descripciones escritas a mano y por plantillas
 * viejas: texto con saltos de línea y emojis, sin una sola etiqueta. Al
 * mostrarlas dentro de HTML los saltos se colapsan --HTML ignora los saltos de
 * línea-- y las 138 fichas quedaban en un bloque corrido imposible de leer en
 * un celular. Reportado tal cual: "se ve muy feo".
 *
 * Arreglarlo regenerando cada producto llevaría 138 pasadas y perdería el
 * texto que el admin escribió. Esto lo resuelve al MOSTRAR, sin tocar la base:
 * reconstruye la estructura que el texto ya tenía.
 *
 * Reglas, deducidas de cómo están escritas de verdad:
 * - Una línea que arranca con viñeta (-, •, ✅, ✔) o con un emoji seguido de
 *   texto corto es un ítem de lista.
 * - Una línea corta que termina en ":" o va en mayúsculas es un subtítulo.
 * - Lo demás es un párrafo.
 *
 * Si el texto YA trae etiquetas, no se toca: ya viene con su formato.
 */
export function plainTextToHtml(value: string): string {
  const texto = String(value || "").trim();
  if (!texto) return "";
  // Ya es HTML: se respeta tal cual.
  if (/<\/?(p|div|ul|ol|li|h[1-6]|br|strong)\b/i.test(texto)) return texto;

  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Sin saltos de línea no hay estructura que reconstruir: un párrafo y listo.
  if (lineas.length <= 1) return `<p>${esc(texto)}</p>`;

  const VINETA = /^\s*(?:[-•*]|✅|✔️?|☑️|🔹|▪️|·)\s+/u;
  // Un emoji al inicio seguido de texto: en estas descripciones marca ítem.
  const EMOJI_ITEM = /^\s*\p{Extended_Pictographic}️?\s+\S/u;

  const salida: string[] = [];
  let lista: string[] = [];
  const cerrarLista = () => {
    if (lista.length) {
      salida.push(`<ul>${lista.map((i) => `<li>${i}</li>`).join("")}</ul>`);
      lista = [];
    }
  };

  for (const linea of lineas) {
    const limpia = esc(linea);
    const esItem = VINETA.test(linea) || (EMOJI_ITEM.test(linea) && linea.length <= 120);
    // Subtítulo: línea corta que anuncia una sección.
    const esTitulo =
      !esItem &&
      linea.length <= 60 &&
      (/[:：]\s*$/.test(linea) || linea === linea.toUpperCase());

    if (esItem) {
      lista.push(limpia.replace(VINETA, ""));
      continue;
    }
    cerrarLista();
    if (esTitulo) salida.push(`<h3>${limpia.replace(/[:：]\s*$/, "")}</h3>`);
    else salida.push(`<p>${limpia}</p>`);
  }
  cerrarLista();
  return salida.join("");
}
