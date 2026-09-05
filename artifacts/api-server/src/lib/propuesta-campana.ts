/**
 * Vista previa profesional de una campaña.
 *
 * El admin puede pedir estrategia, copy y plan antes de decidir presupuesto o
 * confirmar una campaña. Eso es una consulta segura: no debe depender de un
 * modelo que improvise ni obligarlo a crear un borrador para poder verla.
 *
 * Esta pieza usa exclusivamente datos del producto. No afirma tendencias,
 * resultados, cupos, descuentos ni herramientas que no estén cargados.
 */

import { yaTraeEmoji } from "./copy-de-respaldo";

export interface ProductoParaPropuesta {
  id: number;
  name?: string | null;
  description?: string | null;
  features?: unknown;
  highlight?: string | null;
  price?: number | string | null;
  currency?: string | null;
  kind?: string | null;
  deliveryLink?: string | null;
}

export type ObjetivoDePropuesta = "trafico" | "ventas" | "mensajes" | "reconocimiento";

export interface VarianteDeCopy {
  nombre: string;
  hipotesis: string;
  textoPrincipal: string;
  titular: string;
  cta: string;
}

export interface PropuestaDeCampana {
  producto: string;
  objetivo: ObjetivoDePropuesta;
  destino: string;
  estrategia: string;
  publico: string;
  variantes: VarianteDeCopy[];
  creativo: string;
  planDePrueba: string[];
  pendiente: string;
  texto: string;
}

function texto(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function listaCaracteristicas(producto: ProductoParaPropuesta): string[] {
  const cargadas = Array.isArray(producto.features)
    ? producto.features.map((f) => texto(f)).filter(Boolean)
    : [];
  if (cargadas.length) return cargadas.slice(0, 4);

  const descripcion = texto(producto.description);
  if (!descripcion) return [];
  return descripcion
    .split(/(?<=[.;])\s+|\n+/)
    .map((p) => p.replace(/^[-•·]\s*/, "").trim())
    .filter((p) => p.length >= 12)
    .slice(0, 3);
}

/**
 * El titular, dentro del tope de Meta (40) y sin partir palabras.
 *
 * ⚠️ Antes era `.slice(0, 40)` a secas, y con un nombre largo producía esto:
 *
 *     Titular: Conocé INTELIGENCIA ARTIFICIAL 2026: HER
 *
 * Cortado a la mitad de una palabra. En un anuncio pago eso no se lee como
 * "entró justo": se lee como que algo está roto, y el que lo ve no hace clic.
 * Se corta en el último espacio y se limpia la puntuación que quede colgando.
 */
function recortarTitular(valor: string): string {
  const t = texto(valor);
  if (t.length <= 40) return t;
  const corte = t.slice(0, 40);
  const esp = corte.lastIndexOf(" ");
  // Si el primer "espacio" está demasiado al principio, cortar ahí dejaría un
  // titular de dos palabras: en ese caso conviene el corte duro.
  return (esp > 22 ? corte.slice(0, esp) : corte).replace(/[\s.,;:¿?¡!+-]+$/, "");
}

/**
 * Un titular COMPLETO, no uno recortado.
 *
 * Cortar por palabra evita partir "INTELIGEN|CIA", pero deja frases que se
 * cortan igual: "¿Por dónde empezar con Inteligencia" no está partida a la
 * mitad de una palabra y sin embargo se lee incompleta.
 *
 * Un titular es de las pocas líneas de un anuncio que se leen ENTERAS, así que
 * la respuesta correcta no es recortar mejor: es tener otra frase preparada
 * que entre completa. Se prueban en orden y gana la primera que quepa; el
 * recorte queda como último recurso.
 */
function titularQueEntre(...candidatos: string[]): string {
  for (const c of candidatos) {
    const t = texto(c);
    if (t && t.length <= 40) return t;
  }
  return recortarTitular(candidatos[candidatos.length - 1] || "");
}

function precio(producto: ProductoParaPropuesta): string {
  const monto = Number(producto.price ?? 0);
  if (!Number.isFinite(monto) || monto <= 0) return "";
  return `$${monto.toLocaleString("es-CO")} ${texto(producto.currency)}`.trim();
}

function tema(producto: ProductoParaPropuesta): string {
  const nombre = texto(producto.name);
  return nombre || "este producto";
}

/**
 * El nombre como lo escribiría un copywriter dentro de una frase.
 *
 * ⚠️ Los nombres del catálogo son de catálogo, no de anuncio. El del curso de
 * IA tiene 62 caracteres y está EN MAYÚSCULAS:
 *
 *   "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS"
 *
 * Metido crudo en un gancho da dos resultados malos: en mayúsculas grita --lo
 * que el propio FORMATO_COPY del repo prohíbe-- y en minúsculas forzadas queda
 * "¿ganas de meterte con inteligencia artificial 2026: herramientas + agentes
 * autónomos y no sabés...", una frase que nadie termina de leer.
 *
 * Se corta en los dos puntos, que es donde estos nombres separan el tema del
 * detalle, y se pasa a mayúscula inicial si venía todo en caja alta. El nombre
 * completo sigue apareciendo donde corresponde --en los datos del producto--,
 * pero no dentro de una oración.
 */
function nombreCorto(producto: ProductoParaPropuesta): string {
  let n = tema(producto);

  // "TEMA: detalle largo" -> "TEMA", si lo que queda alcanza para identificarlo.
  const dosPuntos = n.indexOf(":");
  if (dosPuntos >= 8) n = n.slice(0, dosPuntos).trim();

  // Sigue largo: se corta por palabra, nunca a la mitad de una.
  if (n.length > 38) {
    const corte = n.slice(0, 38);
    const esp = corte.lastIndexOf(" ");
    n = (esp > 18 ? corte.slice(0, esp) : corte).trim();
  }

  // GRITADO -> normal. Se compara con la versión sin acentos porque
  // toUpperCase de "autónomos" no es igual a la cadena original.
  const soloLetras = n.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (soloLetras.length > 3 && soloLetras === soloLetras.toUpperCase()) {
    n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
  }
  return n;
}

function esDigital(producto: ProductoParaPropuesta): boolean {
  return !["physical", "fisico", "físico", "dropshipping"].includes(texto(producto.kind).toLowerCase());
}

function interesesSugeridos(nombre: string): string {
  const n = nombre.toLowerCase();
  if (/inteligencia artificial|\bia\b|agente/.test(n)) return "Inteligencia artificial, automatización, tecnología, productividad y emprendimiento";
  if (/piano|m[uú]sica|guitarra|canto/.test(n)) return "Música, aprendizaje musical e instrumentos";
  if (/dise[ñn]|photoshop|canva/.test(n)) return "Diseño gráfico, Canva, creatividad y emprendimiento";
  if (/marketing|ventas|publicidad/.test(n)) return "Marketing digital, ventas, emprendimiento y comercio electrónico";
  return "Intereses directamente relacionados con el producto, más una audiencia amplia para comparar";
}

function destino(objetivo: ObjetivoDePropuesta): string {
  if (objetivo === "mensajes") return "WhatsApp: iniciar conversaciones con personas interesadas";
  if (objetivo === "ventas") return "Web: optimizar para compradores si el píxel registra compras";
  if (objetivo === "reconocimiento") return "Alcance: dar a conocer el producto antes de medir clics o ventas";
  return "Web: llevar visitas calificadas a la página del producto";
}

function cta(objetivo: ObjetivoDePropuesta): string {
  if (objetivo === "mensajes") return "👉 Escribinos por WhatsApp";
  if (objetivo === "ventas") return "👉 Conocé el curso y compralo en la web";
  if (objetivo === "reconocimiento") return "👉 Conocé de qué se trata";
  return "👉 Entrá a la web y conocé el curso";
}

/**
 * Los puntos de la lista, cada uno con SU emoji.
 *
 * ⚠️ Acá había `puntos.map(p => \`✅ ${p}\`)`, que le pegaba un ✅ a todo. Con
 * un catálogo que ya trae emoji propios el resultado era peor que uniforme:
 *
 *     ✅ 🤖 3 cursos: Agentes IA, Claude AI y Gemini
 *     ✅ 🔗 n8n sin código: APIs, webhooks y RAG
 *
 * Dos emoji apilados, y el primero --el que no distingue nada-- ganando la
 * posición de lectura. El dueño lo pidió así: *"necesito que use los emoji que
 * tenemos en los productos, los reales, los que se parecen a cada ítem, no
 * esos chulitos que no diferencian una cosa de otra"*.
 *
 * La regla es la misma que ya usa el copy del modelo (FORMATO_COPY punto 3) y
 * el respaldo determinístico: si la característica trae su emoji del catálogo,
 * se respeta ESE; ✅ queda solo para las que no traen ninguno. Se reutiliza
 * `yaTraeEmoji` en vez de reimplementarla -- tres copias de la misma regla se
 * separan con el tiempo, y esta ya iba por la tercera.
 */
function puntosConSuEmoji(puntos: string[]): string {
  return puntos.map((p) => (yaTraeEmoji(p) ? p : `✅ ${p}`)).join("\n");
}

function bloqueDeDatos(producto: ProductoParaPropuesta): string {
  const puntos = listaCaracteristicas(producto);
  const destacado = texto(producto.highlight) || texto(producto.description);
  const partes: string[] = [];
  if (destacado) partes.push(destacado);
  if (puntos.length) partes.push(puntosConSuEmoji(puntos));
  const valor = precio(producto);
  if (valor) partes.push(`🔥 ${valor}`);
  return partes.join("\n\n");
}

/** Construye una propuesta completa que se puede mostrar antes de gastar. */
export function generarPropuestaDeCampana(
  producto: ProductoParaPropuesta,
  objetivo: ObjetivoDePropuesta = "trafico",
): PropuestaDeCampana {
  const nombre = tema(producto);
  // Dentro de una frase se usa el nombre CORTO; el completo sigue estando en
  // el bloque de datos, que es donde el admin lo necesita entero.
  const corto = nombreCorto(producto);
  const datos = bloqueDeDatos(producto);
  const accion = cta(objetivo);
  const incluye = listaCaracteristicas(producto);
  const promesaHonesta = esDigital(producto)
    ? "una ruta clara para conocer el contenido y decidir si encaja con lo que querés aprender"
    : "una forma clara de conocer el producto y decidir si encaja con lo que necesitás";

  // ── Tres ÁNGULOS, no tres encabezados ─────────────────────────────────
  //
  // ⚠️ Las tres variantes compartían el mismo cuerpo: idéntica bajada,
  // idéntica lista, idéntico precio, idéntico CTA. Solo cambiaba el gancho y
  // el titular. Eso no es una prueba A/B: es un anuncio con tres sombreros, y
  // medirlo no enseña nada porque lo único que se compara es la primera línea.
  //
  // El propio módulo del repo (MODULO_PUBLICIDAD) ya define los tres que
  // funcionan: A) problema/dolor · B) beneficio/resultado · C) curiosidad. Y
  // dice, textual: "que sean de verdad distintas (no el mismo texto con
  // sinónimos)".
  //
  // Acá cambian tres cosas por variante, no una:
  //   · el ÁNGULO (por dónde entra)
  //   · la ESTRUCTURA (con lista o sin lista)
  //   · el LARGO (A y B son completas, C es corta a propósito)
  //
  // El largo es una dimensión de prueba real: en un feed, un copy corto y uno
  // largo compiten distinto, y saber cuál gana en ESTE público vale más que
  // saber cuál de tres ganchos gustó.
  const lista = puntosConSuEmoji(incluye);
  const valor = precio(producto);
  const respaldo = texto(producto.highlight) || texto(producto.description);

  const variantes: VarianteDeCopy[] = [
    {
      // A · PROBLEMA. Entra por lo que le pasa hoy a la persona, no por el
      // producto. El problema es el de decidir, que es real y no hace falta
      // inventarlo.
      nombre: "A · El problema de por dónde empezar",
      hipotesis: "Para quien ya quiere aprender esto pero no sabe con qué empezar. Se mide si el problema pesa más que la oferta.",
      textoPrincipal: [
        `🤔 ¿Con ganas de aprender ${corto} y no sabés por dónde arrancar?`,
        `Pasa seguido: se junta material suelto de todos lados y nunca queda claro cuál es el primer paso.`,
        `${corto} propone ${promesaHonesta}.`,
        lista,
        valor ? `🔥 ${valor}` : "",
        accion,
      ].filter(Boolean).join("\n\n"),
      titular: titularQueEntre(`¿Por dónde empezar con ${corto}?`, "¿Por dónde empezar?"),
      cta: accion,
    },
    {
      // B · BENEFICIO. Entra por lo que se lleva. La lista manda y va ARRIBA,
      // que es lo contrario de A: ahí el contenido es la prueba, acá es el
      // argumento.
      nombre: "B · Lo que te llevás",
      hipotesis: "Para quien compara opciones y decide por contenido. Se mide si el detalle concreto convierte mejor que el gancho emocional.",
      textoPrincipal: [
        `📦 Esto es lo que incluye ${corto}:`,
        lista,
        respaldo,
        valor ? `🔥 ${valor}` : "",
        accion,
      ].filter(Boolean).join("\n\n"),
      titular: titularQueEntre(`Todo lo que incluye ${corto}`, "Todo lo que incluye"),
      cta: accion,
    },
    {
      // C · CURIOSIDAD, y CORTA. Sin lista y sin bajada: tres líneas. Si esta
      // gana, dice algo útil de verdad --que en este público el copy largo
      // estorba-- y eso cambia todos los anuncios siguientes.
      nombre: "C · Corta y directa",
      hipotesis: "Deliberadamente breve y sin lista. Se mide si el copy corto rinde más que el completo en este público.",
      textoPrincipal: [
        `👀 ${corto}, explicado sin vueltas.`,
        valor ? `Todo el contenido por ${valor}.` : `Mirá qué incluye antes de decidir.`,
        accion,
      ].filter(Boolean).join("\n\n"),
      titular: titularQueEntre(corto, "Mirá de qué se trata"),
      cta: accion,
    },
  ];

  const caracteristicaPrincipal = incluye[0] || "el contenido real del curso";
  const estrategia =
    `Objetivo: ${destino(objetivo)}. El anuncio no promete resultados ni usa miedo artificial: ` +
    `abre una conversación con el problema de elegir por dónde empezar y respalda la decisión con ${caracteristicaPrincipal}.`;
  const publico =
    `Primera prueba: Colombia, 22–45 años. Crear dos conjuntos: uno amplio y otro con intereses en ${interesesSugeridos(nombre)}. ` +
    `La comparación decide cuál mantener; no se asume que uno gana antes de medirlo.`;
  const creativo =
    `Usá la imagen real del producto como pieza principal. Si hace falta una nueva, mostrala abierta en una laptop o teléfono, ` +
    `con una sola frase de apoyo tomada del catálogo y sin saturarla de texto. El anuncio debe dejar claro que se trata de ${nombre}.`;
  const planDePrueba = [
    "Publicar las tres variantes con la misma audiencia durante la primera prueba.",
    "Revisar primero clics útiles y costo por visita; no declarar un ganador por impresiones solamente.",
    "Conservar la variante que atraiga visitas de mejor calidad y reemplazar solo el ángulo que no funcione.",
    "Si el objetivo final es vender, conectar el píxel y medir compras antes de escalar presupuesto.",
  ];
  const pendiente = "No se creó ningún borrador ni campaña. Falta definir el presupuesto diario y confirmar qué variante querés llevar a Meta.";

  const textoFinal = [
    `🎯 Propuesta de campaña — ${nombre}`,
    `🔗 Destino: ${destino(objetivo)}`,
    "",
    "🧭 Estrategia",
    estrategia,
    "",
    "👥 Público inicial",
    publico,
    "",
    "📝 Variantes de copy",
    ...variantes.flatMap((v) => ["", `✨ ${v.nombre}`, `Hipótesis: ${v.hipotesis}`, "", v.textoPrincipal, "", `Titular: ${v.titular}`]),
    "",
    "🖼️ Idea visual",
    creativo,
    "",
    "📊 Plan de prueba",
    ...planDePrueba.map((p) => `✅ ${p}`),
    "",
    `⚠️ ${pendiente}`,
  ].join("\n");

  return { producto: nombre, objetivo, destino: destino(objetivo), estrategia, publico, variantes, creativo, planDePrueba, pendiente, texto: textoFinal };
}
