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
identificación ("si eres de los que...") · beneficio directo.
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
Preferí "puedes", "obtené", "aprendé", "organizá", "solucioná", "descubrí".

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
/**
 * Cómo se ESCRIBE el texto principal de un anuncio.
 *
 * Va aparte de FORMATO_ANUNCIO (que es cómo se le PRESENTA el trabajo al admin
 * en el chat): esto es la forma del copy que termina publicado y pagado.
 *
 * La gente no lee un anuncio, lo escanea mientras hace scroll. Por eso el copy
 * se arma en bloques cortos separados por una línea en blanco, no en párrafos.
 * Lo verifica revisarFormato(); acá se explica para que salga bien de una.
 */
export const FORMATO_COPY = `
FORMA DEL TEXTO (no es opinable: un copy que no se pueda escanear no sirve).

Escribilo en bloques cortos separados por UNA línea en blanco, en este orden:

1. GANCHO — una línea, con un emoji. Pregunta, problema real o deseo concreto.
2. BENEFICIO — una o dos líneas: qué consigue la persona (el resultado, no la ficha técnica).
3. LISTA — 3 a 5 puntos, uno por línea. Acá van las características REALES.
   EL EMOJI DE CADA PUNTO SALE DEL CATÁLOGO, no de vos: si la característica ya
   viene con el suyo en el brief (🤖, 🔗, 🎨, ♾️…), usá ESE, porque es el que el
   dueño eligió para representarla. ✅ es SOLO para las que no traen ninguno.
   Cuatro ✅ seguidos cuando el catálogo tenía cuatro emoji distintos es un
   error: borra información que el negocio ya se tomó el trabajo de cargar.
4. PRECIO — una línea sola, con 🔥 y la moneda del negocio.
5. ACCIÓN — una línea, con 👉. Una sola acción, no tres.

━━━ LO PRIMERO QUE SE VE ES CASI LO ÚNICO QUE SE VE ━━━
El feed de Meta CORTA el texto principal alrededor de los 125 caracteres y
pone "ver más". Todo lo que va después solo lo lee quien ya decidió tocar.
Y en 2026 el sistema de creativos de Meta recorta y recombina las piezas
según dónde se muestre: los primeros ~40 caracteres son lo ÚNICO que aparece
garantizado en todas las ubicaciones.

Así que la regla no es "escribí corto": es que los primeros 125 caracteres
tengan que funcionar SOLOS. Que se entienda de qué se trata y por qué
importa antes del corte. Si tu gancho necesita el segundo párrafo para tener
sentido, no es un gancho.

Reglas de longitud y forma:
- El GANCHO, primeros ~40 caracteres: tiene que parar el scroll por sí solo.
- Los primeros 125 caracteres se leen enteros; escribilos como si fueran el
  anuncio completo.
- 70 a 130 palabras en total para el texto largo. Nunca más de 200. Los datos
  de Meta muestran que abajo de 100 caracteres suele rendir MÁS, así que si
  el producto se explica corto, escribilo corto: la extensión se justifica
  solo cuando hay algo real que contar.
- Ninguna línea de más de dos renglones.
- UN emoji por elemento importante. Ni cero, ni amontonados.
- Nada de MAYÚSCULAS gritadas ni de introducciones ("¡Hola!", "Te presentamos").
- Convertí cada característica en el beneficio que representa, y dejá la
  característica como respaldo: "19 horas de contenido" es la prueba, "aprendé
  a tu ritmo" es lo que compra la persona.
- No repitas lo que ya se ve en la imagen: el texto suma deseo, contexto y confianza.

Ejemplo de la forma buscada. Mirá la lista: cada punto lleva el emoji que le
corresponde a ESA característica, no el mismo repetido cuatro veces.

🎹 ¿Siempre quisiste aprender piano?

Aprendé paso a paso y avanzá a tu ritmo, desde cero.

🎬 19 horas de contenido en HD
🎼 Clásico, blues, jazz y pop
📥 157 recursos descargables
♾️ Acceso de por vida

🔥 $60.000 COP

👉 Empezá hoy
`.trim();

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
    // El patrón viejo era /(?:miles|cientos|más de \d+)\s+(?:de\s+)?(?:personas|
    // clientes|alumnos|usuarios)/ y dejaba pasar los dos casos reales del
    // 18-08-2026: "+800 dueños ya lo lograron" (la forma "+N" no estaba) y
    // "Más de 1,500 familias" (por partida doble: "familias" no estaba en la
    // lista, y `\d+` cortaba en el "1" de "1,500" y ya no encajaba el espacio).
    // La cifra la inventó el modelo entera. El sustantivo cambia con el nicho
    // -- dueños, familias, emprendedores -- así que la lista se abre; lo que
    // se bloquea es afirmar una cantidad de gente que nadie contó.
    patron: /(?:\bmiles\b|\bcientos\b|\bm[aá]s\s+de\s+\d[\d.,]*|\+\s*\d[\d.,]*)\s+(?:de\s+)?(?:personas|clientes|alumnos|usuarios|due[nñ]os|familias|padres|madres|mam[aá]s|pap[aá]s|estudiantes|emprendedores|mujeres|hombres|negocios|empresas|compradores)\b/i,
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
  {
    // Estadística de mercado inventada.
    //
    // Visto en vivo (2026-08-19) en el anuncio del curso de IA: "¿Sabías que
    // el 80% de las personas que intentan aprender IA por su cuenta abandonan
    // en el primer mes?". Ese dato no sale de ningún lado -- el modelo lo
    // fabricó entero porque suena a gancho de anuncio.
    //
    // Las reglas de acá cubrían prueba social del PRODUCTO ("+800 clientes"),
    // garantías, urgencia y promesas de plata, pero una cifra sobre el MERCADO
    // se colaba limpia. Y es peor que las otras: no es una promesa comercial
    // que el negocio pueda decidir cumplir, es una afirmación factual falsa en
    // un anuncio pago.
    //
    // Se caza el patrón "N% de [gente]" y "N de cada 10", que es como se
    // escriben siempre. Si el dato es REAL y tiene fuente, va en el copy con
    // la fuente escrita al lado -- y entonces deja de matchear este patrón
    // porque el admin la puso a mano.
    patron: /\b\d{1,3}\s*%\s+de\s+(?:l[oa]s\s+)?(?:personas|gente|usuarios|emprendedores|negocios|empresas|alumnos|estudiantes|due[nñ]os|clientes|padres|madres)\b|\b\d\s+de\s+cada\s+\d{1,2}\b/i,
    problema: "usa una estadística que nadie puede respaldar",
    arreglo: "Sacala. Si el dato es real, escribí la fuente al lado; si no, arrancá con el problema concreto del cliente, que no necesita porcentajes.",
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

// ─── Formato: que se pueda ESCANEAR, no solo que sea verdad ─────────────────
//
// Las reglas de arriba cuidan que el anuncio no mienta. Estas cuidan que se
// pueda leer, que es lo otro que lo hace servir o no servir.
//
// Motivo real (2026-08-19): el primer anuncio que el ciclo subió a Meta salió
// verdadero, sin inventos... y era un ladrillo de seis renglones corridos, sin
// un solo emoji, sin listas y sin saltos de línea. Nadie lee eso en un feed: la
// gente NO lee un anuncio, lo escanea mientras hace scroll. Un copy honesto que
// no se puede escanear es plata pagada para que nadie lo lea.
//
// Van acá y no solo en el prompt por lo mismo que los INVENTOS: al modelo se le
// pide el formato y lo cumple hasta que no lo cumple. Acá se verifica, y como
// crear_anuncio ya tiene su vuelta de corrección, un reparo de formato se
// arregla solo sin costarle un turno al admin.
const EMOJI = /\p{Extended_Pictographic}/gu;

/** Cuenta los emojis del texto (los visuales, no los signos). */
function contarEmojis(t: string): number {
  return (t.match(EMOJI) || []).length;
}

/**
 * Revisa la LEGIBILIDAD del texto principal de un anuncio.
 *
 * Solo se aplica al `primaryText`: el titular y la descripción son cortos por
 * definición y pedirles estructura no tendría sentido.
 */
export function revisarFormato(primaryText: string): { bloquea: ReparoDeCopy[]; avisos: ReparoDeCopy[] } {
  const t = String(primaryText || "").trim();
  const bloquea: ReparoDeCopy[] = [];
  const avisos: ReparoDeCopy[] = [];
  if (!t) return { bloquea, avisos };

  const lineas = t.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const palabras = (t.match(/\S+/g) || []).length;
  const emojis = contarEmojis(t);

  // 1. El ladrillo. Es el caso que motivó todo esto.
  if (lineas.length < 3 && palabras > 45) {
    bloquea.push({
      problema: "es un bloque de texto corrido, imposible de escanear en un feed",
      arreglo:
        "Separalo en bloques cortos con UNA línea en blanco entre cada uno: gancho / beneficio / lista de 3-5 puntos / precio / llamada a la acción. El emoji de cada punto de la lista es el que esa característica ya trae en el catálogo; ✅ solo si no trae ninguno.",
      fragmento: t.slice(0, 60) + "…",
    });
  }

  // 2. Un renglón interminable es un ladrillo aunque el resto esté cortado.
  const gigante = lineas.find((l) => l.length > 320);
  if (gigante) {
    bloquea.push({
      problema: "hay un párrafo demasiado largo para leer de un vistazo",
      arreglo: "Partilo en frases de 1-2 líneas, con espacio entre ellas.",
      fragmento: gigante.slice(0, 60) + "…",
    });
  }

  // 3. Largo total. 200 palabras es el techo del copy más largo que se
  //    justifica; más que eso es un artículo, no un anuncio.
  if (palabras > 200) {
    bloquea.push({
      problema: `son ${palabras} palabras: demasiado para un anuncio`,
      arreglo: "Dejalo en 70-130 palabras. Cada línea que no aporte atención, beneficio o acción, sacala.",
    });
  }

  // 4. Sin anclas visuales no hay dónde apoyar la vista.
  if (emojis === 0 && palabras > 25) {
    bloquea.push({
      problema: "no tiene un solo emoji, así que no hay nada que guíe la vista",
      arreglo: "Poné UN emoji por elemento importante: el gancho, cada punto de la lista (el que esa característica trae en el catálogo, o ✅ si no trae), el precio (🔥) y el CTA (👉). Ni uno más.",
    });
  }

  // 5. El exceso contrario: decoración en vez de estructura.
  if (emojis > 14) {
    avisos.push({
      problema: `tiene ${emojis} emojis: son decoración, no estructura`,
      arreglo: "Dejá aproximadamente uno por elemento importante.",
    });
  }
  const seguidos = t.match(/(?:\p{Extended_Pictographic}\s*){4,}/u);
  if (seguidos) {
    avisos.push({
      problema: "hay emojis amontonados",
      arreglo: "Uno solo por línea alcanza.",
      fragmento: seguidos[0].trim().slice(0, 20),
    });
  }

  // 6. Gritar no persuade.
  const gritadas = (t.match(/\b[A-ZÁÉÍÓÚÑ]{4,}\b/g) || []).filter((w) => w !== "COP" && w !== "USD");
  if (gritadas.length > 4) {
    avisos.push({
      problema: "hay demasiadas palabras en mayúsculas",
      arreglo: "Usá mayúsculas solo para el nombre del producto o una palabra suelta.",
      fragmento: gritadas.slice(0, 3).join(", "),
    });
  }

  // 7. Un anuncio que no pide nada no consigue nada. Aviso y no bloqueo: la
  //    acción puede estar escrita de mil formas y no quiero frenar un copy
  //    bueno por no reconocer la variante.
  const cierre = lineas.slice(-2).join(" ").toLowerCase();
  const TIENE_ACCION =
    /(👉|escrib[íi]|escribe|ped[íi]|pide|consult[áa]|compr[áa]|llev[áa]|obten[ée]|descarg[áa]|empez[áa]|empieza|comenz[áa]|entr[áa]|toc[áa]|hac[ée] clic|clic|mensaje|whatsapp|link|enlace|m[áa]s info)/i.test(cierre);
  if (!TIENE_ACCION && palabras > 25) {
    avisos.push({
      problema: "no termina pidiendo una acción concreta",
      arreglo: 'Cerrá con UNA sola acción, por ejemplo "👉 Escribinos por WhatsApp" o "👉 Entrá al enlace".',
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
