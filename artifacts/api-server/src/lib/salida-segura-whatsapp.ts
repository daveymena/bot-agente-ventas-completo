/**
 * Última barrera antes de que una respuesta llegue al cliente.
 *
 * El vendedor tiene caminos deterministas y caminos de IA. No importa de dónde
 * venga una parte: antes de salir por WhatsApp debe cumplir las mismas reglas.
 *
 * Esta capa NO decide la estrategia comercial. Solo evita que lleguen:
 * - placeholders de plantilla
 * - promesas de recursos que no viajan en el mismo envío
 * - mensajes vacíos o bullets huérfanos
 * - duplicados exactos dentro de una misma respuesta
 *
 * La información exacta (precio, enlaces, cuentas, producto) sigue viniendo
 * de las fuentes de verdad existentes; este módulo nunca inventa datos.
 */

export type SalidaPart = {
  kind: "text" | "card";
  content?: string;
  productId?: number;
  paymentOnly?: boolean;
  seccion?: string;
  [key: string]: unknown;
};

const PLACEHOLDER = /(?:\$\s?[Xx]+(?:[.,\s][Xx]+)*|\$\s?_{2,}|\bXXX+\b|\[\s*(?:PRECIO|PRICE|LINK|URL|NOMBRE|NAME|PRODUCTO|PRODUCT|MONTO|AMOUNT)\s*\]|<\s*(?:PRECIO|PRICE|LINK|URL|NOMBRE|NAME|PRODUCTO|PRODUCT|MONTO|AMOUNT)\s*>)/i;

const CLAIMS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /(?:te\s+)?(?:paso|dejo|env[ií]o|mando|muestro).*\b(?:video|v[ií]deo)\b/i, key: "video" },
  { pattern: /(?:te\s+)?(?:paso|dejo|env[ií]o|mando|muestro).*\b(?:precio|valor)\b/i, key: "precio" },
  { pattern: /(?:te\s+)?(?:paso|dejo|env[ií]o|mando).*\b(?:medios? de pago|formas? de pago|opciones? de pago)\b/i, key: "pago" },
  { pattern: /(?:te\s+)?(?:paso|dejo|mando|muestro).*\b(?:informaci[oó]n|detalles?|contenido)\b/i, key: "contenido" },
  { pattern: /(?:te\s+)?(?:paso|dejo|mando).*\b(?:tienda|enlace de la tienda)\b/i, key: "tienda" },
];

function normalize(s: string): string {
  return String(s || "").replace(/\r\n/g, "\n").trim();
}

function hasDelivery(parts: SalidaPart[], key: string): boolean {
  return parts.some((p) => {
    if (p.kind !== "card") return false;
    const section = String(p.seccion || "");
    if (key === "contenido") return section === "info" || section === "completa";
    if (key === "video") return section === "video" || section === "completa";
    if (key === "precio") return section === "precio" || section === "completa" || p.paymentOnly === true;
    if (key === "pago") return section === "pago" || section === "pago_transferencia" || section === "pago_link" || p.paymentOnly === true || section === "completa";
    if (key === "tienda") return section === "tienda" || section === "completa";
    return false;
  });
}

/** Quita una oración que solo contiene un hueco de plantilla. Nunca inventa el dato. */
export function bloquearPlaceholders(texto: string): { text: string; blocked: string[] } {
  const original = normalize(texto);
  if (!original) return { text: "", blocked: [] };

  const blocked: string[] = [];
  const lines = original.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      kept.push("");
      continue;
    }
    if (PLACEHOLDER.test(line)) {
      blocked.push(line.trim());
      continue;
    }
    kept.push(line);
  }

  // Un placeholder puede estar en medio de un párrafo. En ese caso elimina la
  // oración completa para no dejar "El valor es de ..." sin valor.
  let text = kept.join("\n");
  const sentences = text.split(/(?<=[.!?])\s+/);
  const safeSentences = sentences.filter((s) => {
    if (PLACEHOLDER.test(s)) {
      blocked.push(s.trim());
      return false;
    }
    return true;
  });
  text = safeSentences.join(" ");

  return { text: limpiarFormato(text), blocked };
}

/**
 * Elimina preguntas/promesas sobre algo que YA viaja en las mismas partes.
 * La pregunta por el paso siguiente se conserva si ese dato no viaja.
 */
export function reconciliarPromesas(parts: SalidaPart[]): { parts: SalidaPart[]; removed: string[] } {
  const removed: string[] = [];
  const out: SalidaPart[] = [];

  for (const part of parts) {
    if (part.kind !== "text" || !part.content) {
      out.push(part);
      continue;
    }

    const safe = bloquearPlaceholders(part.content).text;
    const lines = safe.split("\n");
    const kept: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        kept.push(line);
        continue;
      }

      const claim = CLAIMS.find((c) => c.pattern.test(trimmed));
      if (claim && hasDelivery(parts, claim.key)) {
        removed.push(trimmed);
        continue;
      }
      kept.push(line);
    }

    const content = limpiarFormato(kept.join("\n"));
    if (content) out.push({ ...part, content });
    else removed.push("[texto vacío después de reconciliación]");
  }

  return { parts: eliminarDuplicadosExactos(out), removed };
}

/** Limpieza final: no deja "¡ Hola", bullets vacíos ni líneas huérfanas. */
export function limpiarFormato(texto: string): string {
  return normalize(texto)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/([¡¿])[ \t]+/g, "$1")
    .replace(/^\s*[•●▪▫✅☑️🔹🔸]\s*$/gm, "")
    .replace(/^\s*[-*]\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function eliminarDuplicadosExactos(parts: SalidaPart[]): SalidaPart[] {
  const vistos = new Set<string>();
  return parts.filter((p) => {
    if (p.kind !== "text") return true;
    const key = normalize(String(p.content || "")).toLowerCase();
    if (!key) return false;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

/** Punto único para las partes que realmente van a salir por WhatsApp. */
export function prepararSalidaFinal(parts: SalidaPart[]): {
  parts: SalidaPart[];
  blockedPlaceholders: string[];
  removedClaims: string[];
} {
  const reconciliada = reconciliarPromesas(Array.isArray(parts) ? parts : []);
  const blockedPlaceholders: string[] = [];

  const finalParts = reconciliada.parts
    .map((part) => {
      if (part.kind !== "text" || !part.content) return part;
      const result = bloquearPlaceholders(part.content);
      blockedPlaceholders.push(...result.blocked);
      return result.text ? { ...part, content: result.text } : null;
    })
    .filter(Boolean) as SalidaPart[];

  return {
    parts: eliminarDuplicadosExactos(finalParts),
    blockedPlaceholders,
    removedClaims: reconciliada.removed,
  };
}

/** Sanitiza también captions generados por tarjetas/fichas. */
export function prepararTextoWhatsApp(texto: string): string {
  const result = bloquearPlaceholders(texto);
  return result.text || "Déjame confirmarte ese dato exacto y te respondo enseguida. 🙏";
}
