/**
 * Última barrera antes de que una respuesta llegue al cliente.
 *
 * Esta capa no decide la estrategia comercial. Solo evita que una respuesta
 * insegura o redundante llegue a WhatsApp cuando otra capa se haya equivocado.
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

// Verbos con los que el agente anuncia que va a entregar algo. Van conjugados
// de varias formas ("te paso", "que te pase", "te voy a mandar") porque el
// modelo redacta libre: un solo tiempo verbal dejaba pasar la mitad de los
// casos.
const VERBO_ENTREGA = String.raw`(?:pas(?:o|e|ar[eé]?|amos)|dej(?:o|e|ar[eé]?)|env[ií](?:o|e|ar[eé]?)|mand(?:o|e|ar[eé]?)|muestro|mostrar[eé]?|comparto|compartir[eé]?)`;

// Cómo nombra el modelo lo que va a mandar para cobrar. Empezó siendo solo
// "medios de pago" y por eso el cierre se escapaba: al cliente que dijo
// "quiero comprarlo, ¿cómo hago el pedido?" le contestó "te dejo los enlaces
// de pago listos abajo" y no llegó nada. "enlaces", "datos" y "links" son las
// otras tres formas que aparecieron en conversaciones reales.
const COSA_DE_PAGO = String.raw`(?:medios?|formas?|opciones?|m[eé]todos?|enlaces?|links?|datos?|botones?)\s+de\s+pago`;

const CLAIMS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: new RegExp(`${VERBO_ENTREGA}.*\\b(?:video|v[ií]deo)\\b`, "i"), key: "video" },
  { pattern: new RegExp(`${VERBO_ENTREGA}.*\\b(?:precio|valor)\\b`, "i"), key: "precio" },
  { pattern: new RegExp(`(?:\\b${COSA_DE_PAGO}\\b).*\\b${VERBO_ENTREGA}\\b|${VERBO_ENTREGA}.*\\b${COSA_DE_PAGO}\\b`, "i"), key: "pago" },
  { pattern: new RegExp(`${VERBO_ENTREGA}.*\\b(?:informaci[oó]n|info|detalles?|contenido)\\b`, "i"), key: "contenido" },
  { pattern: new RegExp(`${VERBO_ENTREGA}.*\\b(?:tienda|enlace de la tienda)\\b`, "i"), key: "tienda" },
];

// Estas preguntas no deben aparecer cuando el dato ya se está entregando.
// La de precio es especial: preguntar "¿Te paso el precio?" no entrega ningún
// valor y obliga al cliente a contestar "sí" para recibir un dato que el
// servidor ya puede mostrar. Por eso se elimina siempre del texto final.
const OFERTA_PRECIO_SIN_DATO = /^\s*[¿?]?(?:te\s+)?(?:paso|mando|dejo|digo|muestro)\s+(?:el\s+)?(?:precio|valor)\s*[?؟]?\s*(?:💰)?\s*$/i;

// Frases que describen entrega física. Se conservan para productos físicos,
// pero si el propio texto habla de un curso/acceso digital, son incompatibles.
const ENTREGA_FISICA = /\b(?:pago\s+contra\s*entrega|contra\s*entrega|pagas?\s+(?:en\s+)?efectivo\s+(?:al|cuando)\s+(?:recib\w+|lleg\w+)|pago\s+en\s+efectivo\s+al\s+recibir|paquete\s+(?:a\s+tu\s+)?puerta|transportadora|mensajero|3\s+a\s+5\s+d[ií]as\s+h[aá]biles)\b/i;
const CONTEXTO_DIGITAL = /\b(?:curso|formaci[oó]n|m[oó]dulo|clase|acceso|digital|online|video|enlace|descargable|contenido)\b/i;

function normalize(s: string): string {
  return String(s || "").replace(/\r\n/g, "\n").trim();
}

function corregirEntregaFisicaEnDigital(texto: string): { text: string; removed: string[] } {
  const original = normalize(texto);
  if (!original || !ENTREGA_FISICA.test(original) || !CONTEXTO_DIGITAL.test(original)) {
    return { text: original, removed: [] };
  }

  const removed: string[] = [];
  const lineas = original.split("\n");
  const quedan: string[] = [];
  for (const linea of lineas) {
    if (ENTREGA_FISICA.test(linea)) {
      removed.push(linea.trim());
      continue;
    }
    quedan.push(linea);
  }

  let text = quedan.join("\n");
  text = text
    .replace(/(?:pago\s+contra\s*entrega|contra\s*entrega|pagas?\s+(?:en\s+)?efectivo\s+(?:al|cuando)\s+(?:recib\w+|lleg\w+)|pago\s+en\s+efectivo\s+al\s+recibir)/gi, "")
    .replace(/(?:pago\s+contra\s*entrega|contra\s*entrega)[^.!?]*(?:[.!?]|$)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text || /\b(?:paquete|transportadora|mensajero)\b/i.test(text)) {
    return {
      text: "Es un producto digital 📩 No requiere envío físico; recibes el acceso de forma digital.",
      removed,
    };
  }
  return { text, removed };
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

export function bloquearPlaceholders(texto: string): { text: string; blocked: string[] } {
  const original = normalize(texto);
  if (!original) return { text: "", blocked: [] };
  const blocked: string[] = [];
  const lines = original.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    if (!line.trim()) { kept.push(""); continue; }
    if (PLACEHOLDER.test(line)) { blocked.push(line.trim()); continue; }
    kept.push(line);
  }
  let text = kept.join("\n");
  const sentences = text.split(/(?<=[.!?])\s+/);
  const safeSentences = sentences.filter((s) => {
    if (PLACEHOLDER.test(s)) { blocked.push(s.trim()); return false; }
    return true;
  });
  text = safeSentences.join(" ");
  return { text: limpiarFormato(text), blocked };
}

export function reconciliarPromesas(parts: SalidaPart[]): { parts: SalidaPart[]; removed: string[] } {
  const removed: string[] = [];
  const out: SalidaPart[] = [];
  for (const part of parts) {
    if (part.kind !== "text" || !part.content) { out.push(part); continue; }
    let safe = bloquearPlaceholders(part.content).text;
    const entrega = corregirEntregaFisicaEnDigital(safe);
    if (entrega.removed.length) removed.push(...entrega.removed);
    safe = entrega.text;
    const lines = safe.split("\n");
    const kept: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { kept.push(line); continue; }
      // No hacemos que el cliente confirme un dato que el sistema puede
      // entregar directamente. El precio debe mostrarse cuando corresponde,
      // no ofrecerse como una promesa vacía.
      if (OFERTA_PRECIO_SIN_DATO.test(trimmed)) {
        removed.push(trimmed);
        continue;
      }
      // Una promesa de entrega sobra en los dos escenarios posibles:
      //  · el dato viaja en este mismo envío -> anunciarlo es redundante;
      //  · el dato no viaja -> es una promesa que el envío no cumple, y el
      //    cliente se queda esperando algo que nunca llega (le pasó a un
      //    cliente real con "los medios de pago te los dejo acá abajo").
      // Antes solo se cubría el primer caso, así que las promesas incumplidas
      // salían intactas.
      const claim = CLAIMS.find((c) => c.pattern.test(trimmed));
      if (claim) {
        removed.push(hasDelivery(parts, claim.key) ? trimmed : `${trimmed} [prometido sin enviar]`);
        // La promesa casi nunca viene sola: viaja dentro de un párrafo con
        // argumento de venta que sí sirve. Borrar la línea entera dejaba sin
        // respuesta al cliente que acababa de decir "quiero comprarlo", que es
        // el peor momento posible para quedarse callado. Se quita solo la
        // oración que promete y se conserva el resto.
        const oraciones = trimmed.split(/(?<=[.!?…])\s+/);
        if (oraciones.length > 1) {
          const sobreviven = oraciones.filter((o) => !CLAIMS.some((c) => c.pattern.test(o)));
          if (sobreviven.length) kept.push(sobreviven.join(" "));
        }
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

export function limpiarFormato(texto: string): string {
  return normalize(texto)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    // Un emoji justo después de la apertura ("¿ 🚀 Listo?") se lee como un
    // error de tipeo. Se quita el emoji y el espacio que arrastra.
    .replace(/([¡¿])[ \t]*(?:\p{Extended_Pictographic}️?[ \t]*)+/gu, "$1")
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
      const entrega = corregirEntregaFisicaEnDigital(result.text);
      return entrega.text ? { ...part, content: entrega.text } : null;
    })
    .filter(Boolean) as SalidaPart[];
  return {
    parts: eliminarDuplicadosExactos(finalParts),
    blockedPlaceholders,
    removedClaims: [...reconciliada.removed, ...blockedPlaceholders],
  };
}

export function prepararTextoWhatsApp(texto: string): string {
  const result = bloquearPlaceholders(texto);
  const entrega = corregirEntregaFisicaEnDigital(result.text);
  return entrega.text || "Déjame confirmarte ese dato exacto y te respondo enseguida. 🙏";
}
