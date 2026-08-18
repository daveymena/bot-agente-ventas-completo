/**
 * Módulo de publicidad persuasiva.
 *
 * Reglas de copywriting que el dueño definió (18-08-2026) para que los
 * anuncios dejen de ser descripciones de producto y pasen a vender.
 *
 * Vive aparte y NO se inyecta en todos los prompts a propósito: el prompt
 * del operador ya roza el tope de caracteres (`MAX_PROMPT_CHARS`), y pasarse
 * no degrada la respuesta, la ANULA. Se carga solo cuando de verdad se está
 * generando un anuncio.
 *
 * La parte que NO puede quedar en manos del modelo -- inventar precios,
 * descuentos, urgencia falsa o testimonios -- no se pide por prompt: se
 * bloquea en `revisarCopy()` y en `validarContenidoAnuncio` (app-operator).
 * Pedirle a un modelo que no invente funciona hasta que no funciona.
 */

/** El módulo, condensado a lo que cambia el resultado. */
export const MODULO_PUBLICIDAD = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📢 CÓMO SE ESCRIBE UN ANUNCIO ACÁ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
No describas el producto. Vendé en este orden:
Problema → Deseo → Solución → Beneficio → Producto → Confianza → Acción

❌ "Tenemos un curso de piano con 50 clases en video."
✅ "¿Siempre quisiste aprender piano pero no sabías por dónde empezar? 🎹
    Aprendé desde cero, paso a paso, sin experiencia previa."

EL GANCHO (primeras palabras) decide si alguien sigue leyendo.
Tipos que funcionan: pregunta · problema · deseo · curiosidad · error común ·
identificación ("si sos de los que...") · beneficio directo.
NUNCA arranques con "Tenemos disponible", "Nuevo producto", "Compra ahora",
"Oferta" ni "Producto de excelente calidad": son genéricos y no detienen a nadie.

ESTRUCTURA PAS: Problema → Agitación (por qué molesta/cuesta) → Solución.
ESTRUCTURA AIDA: Atención → Interés → Deseo → Acción.
Usá la que le sirva al producto.

BENEFICIO ANTES QUE CARACTERÍSTICA. La fórmula es:
característica + qué significa + qué gana el cliente.
❌ "Memoria de 256 GB, pantalla de 15.6 pulgadas."
✅ "Espacio de sobra para tus archivos y una pantalla cómoda para trabajar."

REGLA 80/20: hablá del CLIENTE, no de la empresa.
Evitá "nosotros tenemos", "somos una empresa", "vendemos".
Preferí "podés", "obtené", "aprendé", "organizá", "solucioná", "descubrí".

UNA SOLA ACCIÓN por anuncio. Nada de "compra, comparte, comenta y seguinos".

━━━ SEGÚN EL TIPO DE PRODUCTO ━━━
FÍSICO → vendé utilidad, comodidad, ahorro de tiempo, practicidad, cómo se
resuelve un problema del día a día, facilidad de compra y entrega.
DIGITAL → vendé transformación, conocimiento, acceso inmediato, aprender a tu
ritmo, el resultado que se puede alcanzar.
En digitales NUNCA prometas un resultado económico ni garantizado.
❌ "Con este curso ganás $5 millones."
✅ "Aprendé las herramientas para desarrollar esta habilidad."

━━━ NIVEL DE CONSCIENCIA DEL CLIENTE ━━━
No conoce el problema → despertá la necesidad primero.
Conoce el problema → hablá de la solución.
Conoce la solución → presentá el producto.
Ya conoce el producto → precio, disponibilidad, confianza y cierre.
No uses el mismo mensaje para los cuatro.

━━━ TRES VERSIONES, TRES ENFOQUES ━━━
Cuando generes varias, que sean de verdad distintas (no el mismo texto con
sinónimos): A) problema/dolor · B) beneficio/resultado · C) curiosidad.
La primera es la recomendada.

━━━ LA REGLA DE ORO ━━━
Antes de dar por bueno un anuncio, respondé estas cuatro:
1. ¿Por qué alguien que está scrolleando debería detenerse acá?
2. ¿Qué problema o deseo estoy tocando?
3. ¿Por qué este producto le sirve a ESA persona?
4. ¿Qué quiero que haga después de leerlo?
Si la primera no tiene respuesta clara, cambiá el gancho.

━━━ EL ANUNCIO PREPARA LA CONVERSACIÓN ━━━
Quien llega del anuncio ya dijo qué quiere con el clic. El agente NO arranca
con "¿en qué te ayudo?": retoma el producto del anuncio desde el primer mensaje.
`.trim();

/** Formato de salida cuando se pide un anuncio armado. */
export const FORMATO_ANUNCIO = `
Entregá el anuncio así:
🎯 ÁNGULO — en una línea, qué enfoque tomaste y por qué.
🔥 GANCHO — la frase de apertura.
📝 TEXTO PRINCIPAL — el anuncio completo.
📌 TITULAR — corto y directo (máximo 40 caracteres).
💬 CTA — una sola acción.
🎨 IDEA PARA LA IMAGEN/VIDEO — qué mostrar, sin llenar la pieza de texto.
`.trim();

// ─── Lo que no se le pide al modelo: se le bloquea ───────────────────────────

/**
 * Afirmaciones que no se pueden publicar sin un dato real que las respalde.
 *
 * Son las que meten al negocio en problemas: urgencia inventada, prueba social
 * inventada, garantías y resultados que nadie confirmó. El módulo se las
 * prohíbe por prompt; acá se verifican, que es lo único que de verdad las para.
 */
const INVENTOS: Array<{ patron: RegExp; problema: string; arreglo: string }> = [
  {
    patron: /\b(?:[uú]ltim[ao]s?|quedan|solo|s[oó]lo)\s+\d+\s*(?:unidades?|cupos?|puestos?|lugares?)/i,
    problema: "dice cuántas unidades o cupos quedan",
    arreglo: "Sacalo, o cambialo por \"consultá disponibilidad\".",
  },
  {
    patron: /\b(?:oferta|promoci[oó]n|descuento|precio)\s+(?:v[aá]lid[ao]|termina|vence|hasta|solo por)\b/i,
    problema: "pone fecha límite a una oferta",
    arreglo: "Solo va si el descuento existe de verdad y tiene fecha real.",
  },
  {
    patron: /\b(?:miles|cientos|m[aá]s de \d+)\s+(?:de\s+)?(?:personas|clientes|alumnos|usuarios)\b/i,
    problema: "afirma cuánta gente lo compró",
    arreglo: "Sacalo: no hay dato que lo respalde.",
  },
  {
    patron: /\b(?:garantizad[oa]s?|100\s*%\s*(?:garantizado|efectivo|seguro)|resultados? garantizad)/i,
    problema: "garantiza un resultado",
    arreglo: "Cambialo por lo que el producto SÍ entrega.",
  },
  {
    patron: /\b(?:gan[aá]|gan[aá]s|gener[aá])\s+(?:hasta\s+)?\$?\s*\d[\d.,]*\s*(?:millones?|mil|d[oó]lares|usd|pesos)/i,
    problema: "promete una ganancia en plata",
    arreglo: "Prohibido. Hablá de la habilidad que se aprende, no de dinero.",
  },
  {
    patron: /\b(?:el mejor|los mejores|la mejor|el m[aá]s vendido|n[uú]mero 1|#1)\b/i,
    problema: "se declara el mejor o el más vendido",
    arreglo: "Reemplazalo por un beneficio concreto y verificable.",
  },
];

/** Aperturas genéricas: no detienen a nadie, es la regla del gancho. */
const APERTURAS_GENERICAS = [
  /^\s*(?:🔥|✨|⭐|👉|📢|🚨)?\s*(?:tenemos|ten[eé]s)\s+disponible/i,
  /^\s*(?:🔥|✨|⭐|👉|📢|🚨)?\s*nuevo\s+producto/i,
  /^\s*(?:🔥|✨|⭐|👉|📢|🚨)?\s*(?:compr[aá]|compre)\s+(?:ya|ahora)/i,
  /^\s*(?:🔥|✨|⭐|👉|📢|🚨)?\s*(?:gran\s+)?oferta\b/i,
  /^\s*(?:🔥|✨|⭐|👉|📢|🚨)?\s*producto\s+de\s+(?:excelente|la mejor)\s+calidad/i,
  /^\s*(?:🔥|✨|⭐|👉|📢|🚨)?\s*(?:aprovech[aá]|no te lo pierdas)/i,
];

export interface ReparoDeCopy {
  problema: string;
  arreglo: string;
  fragmento?: string;
}

/**
 * Revisa un copy contra las reglas duras del módulo.
 *
 * Devuelve reparos concretos, no un puntaje: el modelo tiene que saber QUÉ
 * cambiar. Un reparo bloquea la publicación; el gancho genérico solo avisa
 * (es un problema de calidad, no de veracidad).
 */
export function revisarCopy(texto: string): { bloquea: ReparoDeCopy[]; avisos: ReparoDeCopy[] } {
  const t = String(texto || "");
  const bloquea: ReparoDeCopy[] = [];
  const avisos: ReparoDeCopy[] = [];

  // Se compara SIN tildes.
  //
  // `\b` en JavaScript solo reconoce [A-Za-z0-9_]: delante de una "Ú" no hay
  // límite de palabra, así que "¡Últimas 3 unidades!" -- el caso más típico de
  // urgencia inventada -- se colaba entero. Lo cazó la prueba. Los índices se
  // mantienen porque quitar diacríticos con NFD+borrado no corre el texto,
  // así que el fragmento se recorta del original y se le muestra al modelo
  // tal como lo escribió.
  const plano = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const inv of INVENTOS) {
    const m = plano.match(inv.patron);
    if (m) {
      const desde = m.index ?? 0;
      bloquea.push({
        problema: inv.problema,
        arreglo: inv.arreglo,
        fragmento: t.slice(desde, desde + m[0].length) || m[0],
      });
    }
  }

  const primeraLinea = t.split("\n").find((l) => l.trim()) || "";
  if (APERTURAS_GENERICAS.some((rx) => rx.test(primeraLinea))) {
    avisos.push({
      problema: "el gancho es genérico y no detiene a nadie",
      arreglo: "Arrancá con una pregunta, un problema real o un deseo concreto del cliente.",
      fragmento: primeraLinea.slice(0, 60),
    });
  }

  // Habla de la empresa en vez del cliente (regla 80/20).
  const sobreNosotros = (t.match(/\b(?:nosotros|somos una empresa|vendemos|nuestra empresa|contamos con)\b/gi) || []).length;
  const sobreVos = (t.match(/\b(?:pod[eé]s|puedes|obten[eé]|aprend[eé]|organiz[aá]|solucion[aá]|descubr[ií]|ten[eé]s|tienes)\b/gi) || []).length;
  if (sobreNosotros > 0 && sobreNosotros >= sobreVos) {
    avisos.push({
      problema: "el anuncio habla más del negocio que del cliente",
      arreglo: "Reescribilo en segunda persona: qué gana ÉL, no qué tenemos nosotros.",
    });
  }

  return { bloquea, avisos };
}

/** Los reparos en texto, listos para devolverle al modelo. */
export function reparosEnTexto(r: { bloquea: ReparoDeCopy[]; avisos: ReparoDeCopy[] }): string {
  const lineas: string[] = [];
  for (const b of r.bloquea) {
    lineas.push(`❌ ${b.problema}${b.fragmento ? ` ("${b.fragmento}")` : ""} → ${b.arreglo}`);
  }
  for (const a of r.avisos) {
    lineas.push(`⚠️ ${a.problema}${a.fragmento ? ` ("${a.fragmento}")` : ""} → ${a.arreglo}`);
  }
  return lineas.join("\n");
}
