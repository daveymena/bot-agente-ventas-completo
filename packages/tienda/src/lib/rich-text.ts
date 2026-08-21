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
