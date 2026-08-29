/**
 * Sistema de anuncios inteligentes y profesionales.
 *
 * Por qué existe (18-08-2026, con la conversación del PACK EDUCA A TU PERRO
 * en la mano): el flujo real era escribir → rebotar → reescribir. El modelo
 * redactaba un anuncio lindo prometiendo garantía, soporte y resultados en 30
 * días; el validador lo rechazaba después, una promesa por vez, y cada rechazo
 * costaba un turno entero más una confirmación nueva del admin.
 *
 * El problema de fondo no era el validador: era que el modelo escribía a
 * ciegas. No tenía forma de saber, ANTES de escribir, qué puede afirmar este
 * producto y qué no. Este módulo se lo entrega hecho:
 *
 * - `construirBrief()` arma un brief profesional con los datos REALES del
 *   producto: lo que sí puede afirmar, lo que tiene prohibido afirmar (que es
 *   exactamente lo que el validador va a rechazar después), los tres ángulos
 *   posibles y el nivel de consciencia al que apuntar.
 * - `puntuarCopy()` le pone nota al anuncio con criterios medibles, para que
 *   el admin vea la calidad de lo que está por aprobar en vez de adivinarla.
 *
 * Las tres familias de afirmaciones viven ACÁ y las importa `app-operator`
 * (`validarContenidoAnuncio`). Una sola lista para el brief y para el
 * validador: si divergieran, el brief le prometería al modelo cosas que el
 * validador después le rechaza -- justo el ida y vuelta que esto viene a
 * cerrar.
 */

export interface AfirmacionRegulada {
  patron: RegExp;
  que: string;
}

/** Promesas comerciales: descuentos, garantías, regalos, urgencia. */
export const PROMESAS: AfirmacionRegulada[] = [
  { patron: /\bantes\s*\$?\s*[\d.,]+|\bprecio\s+(anterior|regular|normal)|\bde\s*\$[\d.,]+\s*a\s*\$|\bprecio\s+(especial|promocional|de\s+lanzamiento|introductorio)|\bpor\s+lanzamiento\b|\boferta\s+(especial|de\s+lanzamiento)/i, que: "un precio anterior / descuento" },
  { patron: /\bgarant[ií]a\b|\bgarantizad/i, que: "una garantía" },
  { patron: /\bgratis\b|\bregalo\b|\bbono\b|\bsin costo\b/i, que: "algo gratis o de regalo" },
  { patron: /\b\d+\s*%\s*(de\s*)?(descuento|off)\b|\b2x1\b/i, que: "un descuento" },
  { patron: /\b\d+\s*(cupos?|plazas?|vacantes?|lugares)\b|\bcupos?\s+(limitados?|disponibles?)\b|\b[uú]ltimos?\s+(cupos?|d[ií]as?|lugares)\b|\bsolo\s+hoy\b|\bpor\s+tiempo\s+limitado\b|\btermina\s+(hoy|ma[nñ]ana|pronto)\b|\b[uú]ltima\s+oportunidad\b|\bantes\s+de\s+que\s+(suba|termine|se\s+acabe)/i, que: "una urgencia o escasez" },
  { patron: /\breembolso\b|\bdevoluci[oó]n\s+de\s+dinero\b/i, que: "una devolución de dinero" },
];

/** Resultados prometidos: plazos, niveles alcanzados, dedicación diaria. */
export const RESULTADOS: AfirmacionRegulada[] = [
  { patron: /\ben\s+(solo\s+)?\d+\s*(d[ií]as?|semanas?|meses|horas?)\b/i, que: "un plazo para lograr resultados" },
  { patron: /\bresultados?\s+(en|desde|garantizad)/i, que: "resultados en un plazo" },
  { patron: /\b\d+\s*minutos?\s+(al|por)\s+d[ií]a\b/i, que: "un tiempo diario de dedicación" },
  { patron: /\bde\s+cero\s+a\s+(experto|avanzado|profesional)\b/i, que: "un nivel final alcanzado" },
];

/** Entregables: lo que el cliente espera recibir por haber pagado. */
export const ENTREGABLES: AfirmacionRegulada[] = [
  { patron: /\bv[ií]deos?\b/i, que: "videos" },
  { patron: /\baudios?\b/i, que: "audios" },
  { patron: /\bplantillas?\b/i, que: "plantillas" },
  { patron: /\bcertificad[oa]s?\b/i, que: "un certificado" },
  { patron: /\basesor[ií]as?\b|\bmentor[ií]as?\b/i, que: "asesoría o mentoría" },
  { patron: /\bcomunidad\b|\bgrupo\s+(privado|exclusivo)\b/i, que: "una comunidad o grupo" },
  { patron: /\ben\s+vivo\b|\bclases?\s+en\s+directo\b/i, que: "clases en vivo" },
  { patron: /\bacceso\s+(de\s+por\s+vida|permanente|ilimitado|vitalicio)\b|\bde\s+por\s+vida\b|\bpara\s+siempre\b/i, que: "acceso de por vida" },
  { patron: /\bsoporte\b|\bacompa[nñ]amiento\b|\batenci[oó]n\s+personalizada\b/i, que: "soporte o acompañamiento" },
  { patron: /\bactualizaciones?\b|\bcontenido\s+actualizable\b/i, que: "actualizaciones" },
  { patron: /\bcasos?\s+de\s+[eé]xito\b|\btestimonios?\b|\bhistorias?\s+de\s+alumnos?\b|\balumnos?\s+que\s+ya\b/i, que: "casos de éxito o testimonios de alumnos" },
  { patron: /\bdescargables?\b|\bdescargas?\s+(ilimitadas?|incluidas?)\b/i, que: "material descargable" },
  { patron: /\bbolsa\s+de\s+empleo\b|\bsalida\s+laboral\b|\bempleo\s+garantizado\b/i, que: "salida laboral" },
];

/** Datos reales del producto, ya normalizados para comparar. */
export interface RespaldoDelProducto {
  /** nombre + descripción + características + destacado, en minúsculas */
  texto: string;
  /** lo mismo sin espacios ni signos, para comparar raíces de varias palabras */
  compacto: string;
}

export function respaldoDe(prod: {
  name?: any; description?: any; features?: any; highlight?: any;
}): RespaldoDelProducto {
  const texto = [
    prod.name,
    prod.description,
    Array.isArray(prod.features) ? (prod.features as string[]).join(" ") : "",
    prod.highlight,
  ].filter(Boolean).join(" ").toLowerCase();
  return { texto, compacto: texto.replace(/[^a-záéíóúñ]/g, "") };
}

/**
 * ¿El producto respalda una promesa comercial encontrada en el copy?
 *
 * Se buscan las palabras del match como PALABRAS ENTERAS. Antes era un
 * `includes` suelto y se le escapaba la promesa más común: un anuncio decía
 * "$20.000 (antes $50.000)" y pasaba porque la descripción del producto tenía
 * "Actualizaciones constANTES incluidas".
 */
export function promesaRespaldada(match: string, respaldo: RespaldoDelProducto): boolean {
  const palabras = match.toLowerCase().match(/[a-záéíóúñ]{4,}/g) || [];
  const esPalabraEntera = (w: string) =>
    new RegExp(`(^|[^a-záéíóúñ])${w}([^a-záéíóúñ]|$)`, "i").test(respaldo.texto);
  return palabras.length > 0
    ? palabras.some(esPalabraEntera)
    : respaldo.texto.includes(match.toLowerCase().trim()); // "2x1" y similares, sin letras
}

/** ¿El producto respalda un plazo/resultado? Se compara la frase completa. */
export function resultadoRespaldado(match: string, respaldo: RespaldoDelProducto): boolean {
  return respaldo.texto.includes(match.toLowerCase().trim());
}

/**
 * ¿El producto respalda un entregable? Alcanza con la raíz de la palabra
 * ("videos"/"vídeo" comparten "ideo"), comparada contra el respaldo compactado
 * porque un match de varias palabras queda pegado ("de por vida" -> "deporv").
 */
export function entregableRespaldado(match: string, respaldo: RespaldoDelProducto): boolean {
  const raiz = match.toLowerCase().replace(/[^a-záéíóúñ]/g, "").slice(0, 6);
  return !!raiz && respaldo.compacto.includes(raiz);
}

/**
 * Marcas y herramientas que el copy nombra y el producto NO tiene.
 *
 * El caso real, borrador #92 del 19-08-2026, curso de IA. El producto dice:
 *
 *   Claude · n8n · OpenClaw · Gemini · Claude Code · Claude Design
 *
 * y el anuncio salió diciendo:
 *
 *   ChatGPT · Gemini · Claude · Perplexity · Copilot · Midjourney ·
 *   DALL·E 4 · Leonardo AI · CrewAI · AutoGPT
 *
 * Ocho herramientas que el curso no enseña. El modelo no las copió de ningún
 * lado: rellenó con lo que "debería" traer un curso de IA. Y es la mentira más
 * cara de todas, porque el que compra buscando ChatGPT pide la devolución.
 *
 * El validador que ya existía cubre PROMESAS (garantía, acceso de por vida,
 * testimonios). Un nombre de herramienta no es una promesa, así que pasaba
 * entero.
 *
 * Se detecta por la forma, no por una lista de marcas: una lista habría que
 * mantenerla y solo serviría para este nicho -- el SaaS vende de todo. Lo que
 * se busca es una palabra en Mayúscula EN MEDIO de una frase, que es como se
 * escribe un nombre propio y no una palabra común del español.
 */

/** Nombres que SIEMPRE puede usar: son del sistema, no del producto. */
const MARCAS_DEL_SISTEMA = new Set([
  "whatsapp", "paypal", "nequi", "daviplata", "mercadopago", "mercado", "pago",
  "facebook", "instagram", "messenger", "meta", "telegram", "drive", "google",
  "colombia", "cop", "usd", "iva", "pse", "ia", "pdf",
]);

export function marcasSinRespaldo(copy: string, respaldo: RespaldoDelProducto): string[] {
  const texto = String(copy || "");
  const fuera: string[] = [];
  const vistas = new Set<string>();

  // Una palabra con mayúscula que NO abre frase ni renglón. Se admite el punto
  // y el punto medio de adentro (DALL·E, GPT-4) porque son parte del nombre.
  const RE = /(\S+[ 	]+)([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]*(?:[·.\-][\wÁÉÍÓÚÑáéíóúñ]+)*)/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(texto)) !== null) {
    const anterior = m[1]!.trim();
    const palabra = m[2]!.replace(/[.,;:!?)]+$/, "");
    if (palabra.length < 3) continue;

    // Después de un punto o de una viñeta, una mayúscula suele ser el
    // principio de la frase ("Plantillas listas para usar"), no un nombre
    // propio. Ahí se exige que TENGA FORMA de marca: una mayúscula interna
    // (ChatGPT, AutoGPT, CrewAI), un número o un punto adentro (DALL·E 4).
    // Ninguna palabra común del español se escribe así.
    //
    // Sin esta distinción se escapaba justo el peor caso: "✅ ChatGPT, Gemini,
    // Claude..." abre renglón, así que ChatGPT se saltaba como si fuera el
    // comienzo de una oración.
    const abreFrase = /[.!?:¡¿•✅🔥👉➡️⭐📌]$/.test(anterior) || anterior === "";
    const pareceMarca = /[a-záéíóúñ][A-ZÁÉÍÓÚÑ]/.test(palabra) || /\d/.test(palabra) || /[·.]/.test(palabra);
    if (abreFrase && !pareceMarca) continue;
    const clave = palabra.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    if (MARCAS_DEL_SISTEMA.has(clave)) continue;

    // ¿La nombra el producto? Se compara sin signos, para que "DALL·E" case
    // con "dalle" y "GPT-4" con "gpt4".
    const plano = clave.replace(/[^a-z0-9áéíóúñ]/g, "");
    if (!plano) continue;
    if (respaldo.texto.includes(clave) || respaldo.compacto.includes(plano)) continue;
    if (respaldo.texto.replace(/[^a-z0-9áéíóúñ]/g, "").includes(plano)) continue;

    fuera.push(palabra);
  }
  return fuera;
}

// ─── El brief ────────────────────────────────────────────────────────────────

export interface BriefDeAnuncio {
  productId: number;
  nombre: string;
  precio: string;
  tipo: "digital" | "físico";
  puedeAfirmar: string[];
  noPuedeAfirmar: string[];
  angulos: Array<{ letra: string; enfoque: string; comoArmarlo: string }>;
  nivelConsciencia: string;
  cta: string;
  enlace: string;
  faltantes: string[];
  /** El brief entero en texto, que es lo que termina leyendo el modelo. */
  texto: string;
}

/**
 * Arma el brief a partir del producto REAL. No inventa una sola palabra de
 * copy: entrega materia prima verificable y límites explícitos. Escribir el
 * anuncio sigue siendo trabajo del modelo -- lo que cambia es que ahora lo
 * hace sabiendo qué puede decir.
 */
export function construirBrief(
  prod: { id: number; name: string; description?: any; features?: any; highlight?: any; price?: any; currency?: any; kind?: any; category?: any; deliveryLink?: any },
  opciones: { enlace: string; whatsapp?: string },
): BriefDeAnuncio {
  const respaldo = respaldoDe(prod);
  const kind = String(prod.kind || "digital").toLowerCase();
  const esDigital = !["physical", "fisico", "físico", "dropshipping"].includes(kind);
  const features: string[] = Array.isArray(prod.features) ? (prod.features as string[]).filter(Boolean) : [];
  const precio = `$${Number(prod.price || 0).toLocaleString("es-CO")} ${prod.currency || ""}`.trim();

  // ── Lo que SÍ puede afirmar: nada acá sale de la imaginación ──────────────
  const puedeAfirmar: string[] = [];
  puedeAfirmar.push(`Se llama "${prod.name}" y cuesta ${precio}.`);
  if (prod.highlight) puedeAfirmar.push(`Lo destacado del producto: ${prod.highlight}`);
  for (const f of features.slice(0, 12)) puedeAfirmar.push(f);
  if (!features.length && prod.description) {
    puedeAfirmar.push(`Solo lo que ya dice su descripción: "${String(prod.description).replace(/\s+/g, " ").slice(0, 300)}"`);
  }
  if (esDigital && prod.deliveryLink) puedeAfirmar.push("La entrega es digital: el enlace se manda apenas se confirma el pago.");

  // ── Lo que NO puede afirmar ───────────────────────────────────────────────
  // Se prueba cada familia contra los datos del producto: si el producto no la
  // menciona, el validador la va a rechazar. Decírselo ANTES es toda la
  // diferencia entre escribir bien de una y rebotar tres veces.
  const noPuedeAfirmar: string[] = [];
  for (const familia of [PROMESAS, RESULTADOS, ENTREGABLES]) {
    for (const a of familia) {
      if (!a.patron.test(respaldo.texto)) noPuedeAfirmar.push(a.que);
    }
  }

  // ── Ángulos: qué tocar y con qué material, no un texto ya escrito ─────────
  const angulos = [
    {
      letra: "A",
      enfoque: "Problema / dolor (el recomendado para arrancar)",
      comoArmarlo: `Abrí con la situación incómoda que "${prod.name}" resuelve, en forma de pregunta o de escena concreta. Agitá un poco (qué le cuesta hoy seguir así) y recién ahí aparece el producto como salida.`,
    },
    {
      letra: "B",
      enfoque: "Beneficio / resultado",
      comoArmarlo: `Abrí por lo que la persona va a poder hacer. Traducí cada característica real (${features.slice(0, 3).join(" · ") || "las que estén cargadas"}) a qué gana con ella, sin prometer plazos.`,
    },
    {
      letra: "C",
      enfoque: "Curiosidad / error común",
      comoArmarlo: `Abrí con la creencia equivocada o el error típico de quien intenta esto por su cuenta. El producto entra como el camino que evita ese error.`,
    },
  ];

  const nivelConsciencia = esDigital
    ? "Suele llegar gente que YA conoce el problema pero no la solución: nombrá el problema en el gancho y presentá el método, no la ficha técnica."
    : "Suele llegar gente que conoce el producto y compara: andá a utilidad concreta, precio, cómo se compra y cómo llega.";

  const cta = opciones.whatsapp
    ? `Una sola acción: escribir por WhatsApp (${opciones.whatsapp}). Nada de "compra, comparte y seguinos".`
    : `Una sola acción: entrar al enlace del producto. Nada de "compra, comparte y seguinos".`;

  const faltantes: string[] = [];
  if (!features.length) faltantes.push("El producto no tiene características cargadas: el anuncio va a ser pobre y CUALQUIER beneficio que agregues va a rebotar por no estar respaldado. Conviene cargarlas primero.");
  if (!prod.description || String(prod.description).trim().length < 40) faltantes.push("La descripción del producto es muy corta: hay poco material real del que sacar beneficios.");
  if (!Number(prod.price)) faltantes.push("El producto no tiene precio cargado: sin precio el anuncio no puede cerrar.");

  const texto = [
    `📋 BRIEF DE ANUNCIO — ${prod.name} (id ${prod.id})`,
    `💰 Precio: ${precio}  ·  Tipo: ${esDigital ? "digital" : "físico"}${prod.category ? `  ·  Categoría: ${prod.category}` : ""}`,
    ``,
    `✅ PODÉS AFIRMAR ESTO (sale de los datos reales del producto):`,
    ...puedeAfirmar.map((l) => `   • ${l}`),
    ``,
    `🚫 NO PODÉS AFIRMAR ESTO (el producto no lo respalda; si lo escribís, el anuncio se rechaza):`,
    `   ${noPuedeAfirmar.join(" · ")}`,
    `   Tampoco: cuánta gente lo compró, "el mejor"/"el más vendido", ni promesas de ganancia en plata.`,
    `   Si el admin QUIERE ofrecer algo de esa lista, primero hay que cargarlo en el producto.`,
    // ── Cómo entrega este negocio ────────────────────────────────────────
    // Reportado por el dueño mirando un anuncio generado (2026-08-18): decía
    // "clases presenciales y virtuales" y "certificado" para un negocio que
    // vende packs digitales pregrabados por Google Drive. Su frase exacta:
    // "eso quiere decir que no tiene conocimiento de mi información".
    //
    // Tenía razón a nivel código: ni el brief ni el validador leían nada del
    // negocio, así que el modelo rellenaba el formato de entrega con lo que
    // había visto en la competencia. El dato para desmentirlo YA estaba en la
    // fila del producto (`kind` + `deliveryLink`); solo que nadie lo miraba.
    //
    // Va en el brief y NO solo en el validador porque el objetivo es que no
    // lo escriba, no rechazárselo después: rebotar cuesta un turno y una
    // confirmación del admin por cada invento.
    ...(esDigital
      ? [
          ``,
          `📦 CÓMO ENTREGA ESTE NEGOCIO — esto es lo que el cliente recibe de verdad:`,
          `   Es un producto DIGITAL${prod.deliveryLink ? `, entregado por enlace (${String(prod.deliveryLink).includes("drive.google") ? "Google Drive" : "descarga directa"})` : ""}, ya grabado y listo.`,
          `   PROHIBIDO prometer: clases presenciales, sesiones en vivo, clases en directo, tutorías 1 a 1,`,
          `   horarios de cursada, cupos por fecha, envío físico, domicilio o entrega a domicilio.`,
          `   Nada de eso existe en este negocio, aunque la competencia lo ofrezca. Investigar a la`,
          `   competencia sirve para el ÁNGULO, nunca para copiar cómo entregan ellos.`,
        ]
      : []),
    ``,
    `🎯 TRES ÁNGULOS DISTINTOS (que sean distintos de verdad, no el mismo texto con sinónimos):`,
    ...angulos.map((a) => `   ${a.letra}) ${a.enfoque}\n      ${a.comoArmarlo}`),
    ``,
    `👤 NIVEL DE CONSCIENCIA: ${nivelConsciencia}`,
    `💬 CTA: ${cta}`,
    `🔗 Enlace real del producto: ${opciones.enlace}`,
    ...(faltantes.length ? [``, `⚠️ HUECOS EN LOS DATOS:`, ...faltantes.map((f) => `   • ${f}`)] : []),
  ].join("\n");

  return {
    productId: prod.id,
    nombre: prod.name,
    precio,
    tipo: esDigital ? "digital" : "físico",
    puedeAfirmar,
    noPuedeAfirmar,
    angulos,
    nivelConsciencia,
    cta,
    enlace: opciones.enlace,
    faltantes,
    texto,
  };
}

// ─── La nota del copy ────────────────────────────────────────────────────────

export interface NotaDeCopy {
  puntaje: number;
  notas: string[];
}

/**
 * Le pone nota al anuncio con criterios MEDIBLES, no con opinión.
 *
 * Para qué: hasta ahora el admin aprobaba un copy sin ninguna señal de si era
 * bueno o apenas pasable -- lo único que existía era el rechazo binario del
 * validador (miente / no miente). Un anuncio puede ser perfectamente honesto y
 * aun así no detener a nadie. La nota se muestra junto al borrador para que
 * decida sabiendo.
 *
 * No bloquea nada: la veracidad la sigue bloqueando `revisarCopy`. Esto es
 * calidad publicitaria.
 */
export function puntuarCopy(args: { primaryText?: string; headline?: string }): NotaDeCopy {
  const texto = String(args.primaryText || "").trim();
  const titular = String(args.headline || "").trim();
  const notas: string[] = [];
  let puntaje = 100;

  const primeraLinea = texto.split("\n").find((l) => l.trim())?.trim() || "";

  // El gancho: ¿la apertura hace algo, o es relleno? Una pregunta, una escena,
  // una cifra o una identificación ("si eres de los que...") detienen; anunciar
  // el producto, no.
  const ganchoActivo =
    /\?/.test(primeraLinea) ||
    /^\s*[\p{Extended_Pictographic}\s]*(?:si\s+(?:sos|eres|ten[eé]s|tienes)|cansad|hart[ao]|imagin|as[ií]\s+es\s+como|\d)/iu.test(primeraLinea);
  if (!ganchoActivo) {
    puntaje -= 25;
    notas.push("El gancho no interpela: la primera línea no pregunta, ni nombra un problema, ni muestra una escena. Es lo primero que cambiaría.");
  }

  if (!titular) {
    puntaje -= 10;
    notas.push("No hay titular.");
  } else if (titular.length > 40) {
    puntaje -= 15;
    notas.push(`El titular tiene ${titular.length} caracteres y Meta corta cerca de los 40: al cliente le llega partido.`);
  }

  // Una sola acción. Dos CTA compiten entre sí y bajan las dos.
  const ctas = texto.match(/\b(?:escrib[ií](?:me|nos)?|coment[aá]|comparti|comparte|segu[ií](?:nos|me)|dale me gusta|hac[eé] clic|haz clic|entr[aá]|compr[aá]|inscrib[ií]te|reserv[aá]|descarg[aá])\b/gi) || [];
  const ctasUnicas = new Set(ctas.map((c) => c.toLowerCase()));
  if (ctasUnicas.size === 0) {
    puntaje -= 15;
    notas.push("No hay llamado a la acción: el anuncio no pide nada.");
  } else if (ctasUnicas.size > 2) {
    puntaje -= 10;
    notas.push(`Pide ${ctasUnicas.size} acciones distintas (${[...ctasUnicas].join(", ")}). Una sola: dos CTA se pisan y bajan las dos.`);
  }

  // Regla 80/20: ¿de quién habla?
  const sobreNosotros = (texto.match(/\b(?:nosotros|somos|vendemos|nuestra|nuestro|contamos con|ofrecemos)\b/gi) || []).length;
  const sobreVos = (texto.match(/\b(?:pod[eé]s|puedes|obten[eé]|aprend[eé]|logr[aá]|ten[eé]s|tienes|tu|tus|te)\b/gi) || []).length;
  if (sobreNosotros > sobreVos) {
    puntaje -= 15;
    notas.push("Habla más del negocio que del cliente. Pasalo a segunda persona: qué gana él.");
  }

  // Largo útil para el feed de Meta.
  if (texto.length < 120) {
    puntaje -= 15;
    notas.push(`Son ${texto.length} caracteres: demasiado corto para construir deseo.`);
  } else if (texto.length > 1300) {
    puntaje -= 10;
    notas.push(`Son ${texto.length} caracteres: Meta lo corta con "ver más" y se pierde el cierre. Apuntá a 400-900.`);
  }

  // Emojis: ni cero ni confeti.
  const emojis = (texto.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (emojis === 0) {
    puntaje -= 5;
    notas.push("Sin un solo emoji el texto se lee como un bloque; uno por bloque ayuda a escanear.");
  } else if (emojis > 18) {
    puntaje -= 10;
    notas.push(`${emojis} emojis es relleno: cada uno tiene que significar algo.`);
  }

  // ¿Aparece el precio? Un anuncio que no lo dice filtra peor.
  if (!/\$|\bcop\b|\busd\b|\bpesos\b/i.test(texto)) {
    puntaje -= 5;
    notas.push("No menciona el precio: sin él llegan más consultas pero peor calificadas.");
  }

  return { puntaje: Math.max(0, Math.min(100, puntaje)), notas };
}
