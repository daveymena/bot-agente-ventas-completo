const allowedTags = new Set([
  "BR", "P", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "H3", "H4",
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
