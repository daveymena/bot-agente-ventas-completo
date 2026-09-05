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

function precio(producto: ProductoParaPropuesta): string {
  const monto = Number(producto.price ?? 0);
  if (!Number.isFinite(monto) || monto <= 0) return "";
  return `$${monto.toLocaleString("es-CO")} ${texto(producto.currency)}`.trim();
}

function tema(producto: ProductoParaPropuesta): string {
  const nombre = texto(producto.name);
  return nombre || "este producto";
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

function bloqueDeDatos(producto: ProductoParaPropuesta): string {
  const puntos = listaCaracteristicas(producto);
  const destacado = texto(producto.highlight) || texto(producto.description);
  const partes: string[] = [];
  if (destacado) partes.push(destacado);
  if (puntos.length) partes.push(puntos.map((p) => `✅ ${p}`).join("\n"));
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
  const datos = bloqueDeDatos(producto);
  const accion = cta(objetivo);
  const incluye = listaCaracteristicas(producto);
  const promesaHonesta = esDigital(producto)
    ? "una ruta clara para conocer el contenido y decidir si encaja con lo que querés aprender"
    : "una forma clara de conocer el producto y decidir si encaja con lo que necesitás";

  const variantes: VarianteDeCopy[] = [
    {
      nombre: "A · Empezar con claridad",
      hipotesis: "Conecta con quien tiene interés, pero necesita una ruta concreta para empezar.",
      textoPrincipal: [
        `🤖 ¿Querés acercarte a ${nombre} con una ruta más clara?`,
        `En vez de perder tiempo saltando de una herramienta o tema a otro, conocé una propuesta centrada en ${promesaHonesta}.`,
        datos,
        accion,
      ].filter(Boolean).join("\n\n"),
      titular: `Conocé ${nombre}`.slice(0, 40),
      cta: accion,
    },
    {
      nombre: "B · Lo que incluye",
      hipotesis: "Funciona con personas que comparan opciones y valoran saber exactamente qué reciben.",
      textoPrincipal: [
        `📚 Antes de elegir un curso, vale la pena mirar qué incluye de verdad.`,
        `${nombre} reúne contenido para que puedas revisarlo con calma y elegir informado.`,
        datos,
        accion,
      ].filter(Boolean).join("\n\n"),
      titular: "Mirá lo que incluye".slice(0, 40),
      cta: accion,
    },
    {
      nombre: "C · Resolver la confusión",
      hipotesis: "Prueba un gancho de curiosidad para quienes sienten que hay demasiadas opciones y no saben por cuál empezar.",
      textoPrincipal: [
        `💡 No siempre hace falta más información: a veces hace falta una mejor manera de ordenarla.`,
        `Conocé ${nombre} y revisá si su enfoque, contenido y precio son los que buscás.`,
        datos,
        accion,
      ].filter(Boolean).join("\n\n"),
      titular: "Una ruta para empezar".slice(0, 40),
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
