/**
 * ============================================================
 * SUPERVISOR — revisa la respuesta ANTES de que salga al cliente
 * ============================================================
 *
 * El patron de fondo de casi todas las fallas medidas en produccion es el
 * mismo: el servidor SABE el dato exacto (que producto es, cuanto vale, como
 * se entrega, si el pago se verifica solo) y lo deja en manos de una
 * instruccion blanda dentro del prompt. El modelo la ignora y nadie se entera
 * hasta que el cliente lo nota -- o se va sin comprar.
 *
 * Este supervisor cierra ese hueco. Corre SIEMPRE, sobre la respuesta ya
 * redactada, y no le pide permiso al modelo: corrige o bloquea.
 *
 * Es deliberadamente DETERMINISTA. Un supervisor hecho con otra llamada al
 * modelo suena mejor, pero paga el doble de latencia en cada mensaje y puede
 * alucinar en la revision igual que en la respuesta. Las reglas de aca son
 * baratas, no fallan, y cazan fallas medidas de verdad -- no imaginadas.
 * Para lo que si necesita criterio se escala aparte: ver necesitaCriterio().
 *
 * Cada regla nace de un fallo real. El numero de mensaje va en el comentario
 * para poder volver a la conversacion y verificarlo.
 */

import { verificarPrecios, type ProductoParaPrecio } from "./precio-verificado";

export type Gravedad = "bloquea" | "corrige";

export interface Hallazgo {
  regla: string;
  gravedad: Gravedad;
  detalle: string;
}

export interface EntradaSupervisor {
  /** Lo que el agente quiere enviar. */
  respuesta: string;
  /** Lo ultimo que escribio el cliente. */
  mensajeCliente: string;
  /** Catalogo completo: la fuente de verdad. */
  productos: Array<ProductoParaPrecio & { kind?: string | null }>;
  /** Ids del producto del que se esta hablando. */
  idsEnContexto: number[];
  /** Metodos de pago que el negocio verifica A MANO (Nequi, Daviplata...). */
  pagosManuales?: string[];
}

export interface RevisionSupervisor {
  texto: string;
  hallazgos: Hallazgo[];
  /** true = esto no se envia tal cual; hay que regenerar o escalar. */
  bloquear: boolean;
}

// ─── Utilidades de texto ─────────────────────────────────────────────────────

function normalizar(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palabras de relleno que no identifican a ningun producto. */
const RELLENO_NOMBRE = new Set([
  "curso", "cursos", "pack", "packs", "de", "del", "la", "el", "los", "las",
  "y", "e", "a", "con", "para", "por", "completo", "completa", "megapack",
  "nivel", "desde", "cero", "avanzado", "basico", "premium", "digital", "x",
]);

function palabrasClave(nombre: string): string[] {
  return normalizar(nombre).split(" ").filter((p) => p.length > 2 && !RELLENO_NOMBRE.has(p));
}

/**
 * El texto nombra a este producto? Por palabra ENTERA, nunca por subcadena:
 * comparar por subcadena es lo que hacia que "algo" matcheara "algoritmos".
 */
function nombraProducto(texto: string, nombre: string): boolean {
  const claves = palabrasClave(nombre);
  if (claves.length === 0) return false;
  const palabras = new Set(normalizar(texto).split(" "));
  // Alcanza la clave mas distintiva: "idiomas" identifica al PACK IDIOMAS sin
  // exigir que se escriba el nombre entero.
  return claves.some((c) => palabras.has(c));
}

// ─── R3 · Preguntas y respuestas que no dicen nada ───────────────────────────

const INTERROGATIVAS = [
  "donde", "cuando", "como", "que", "cual", "cuanto", "cuanta", "quien",
  "por que", "tienes", "tiene", "tienen", "hay", "puedo", "sirve",
];

export function esPregunta(texto: string): boolean {
  if (/[?¿]/.test(texto)) return true;
  const n = normalizar(texto);
  return INTERROGATIVAS.some((w) => n === w || n.startsWith(w + " "));
}

/** Formulas que ocupan un mensaje sin contestar nada. */
const VACIAS = [
  "fue un placer atenderte", "cualquier duda aqui estoy", "cualquier duda aca estoy",
  "gracias a vos", "gracias a ti", "que tengas buen dia", "que estes muy bien",
  "en que te puedo ayudar", "en que te ayudo", "contame en que te puedo ayudar",
  "que andas buscando", "que estas buscando",
];

function esRespuestaVacia(texto: string): boolean {
  const n = normalizar(texto);
  // Un mensaje largo dice algo aunque arranque con una formula.
  if (n.length > 160) return false;
  return VACIAS.some((v) => n.includes(normalizar(v)));
}

// ─── R4 · Promesas de verificacion automatica ────────────────────────────────

const PROMESA_AUTOMATICA =
  /(apenas|cuando|en cuanto)\s+(el\s+)?sistema\s+(lo\s+)?(confirm\w+|verifi\w+)|el\s+sistema\s+(lo\s+)?(confirma|verifica)\b|verificaci[oó]n\s+autom[aá]tica|se\s+confirma\s+autom[aá]ticamente/i;

const PAGOS_MANUALES_POR_DEFECTO = [
  "nequi", "daviplata", "transferencia", "consignacion", "comprobante",
];

// ─── El supervisor ───────────────────────────────────────────────────────────

export function supervisarRespuesta(e: EntradaSupervisor): RevisionSupervisor {
  const hallazgos: Hallazgo[] = [];
  let texto = e.respuesta || "";
  let bloquear = false;

  // ── R1 · Ningun monto que no sea de un producto real ───────────────────────
  // Medido (conversacion 1, mensajes 258-264): Excel cotizado a $45.000
  // valiendo $20.000, y un combo de los 3 a $85.000 que no existe como
  // producto -- sin link de pago ni forma de entregarlo.
  const precios = verificarPrecios(texto, e.productos, e.idsEnContexto);
  if (precios.inventados.length > 0) {
    texto = precios.texto;
    hallazgos.push({
      regla: "precio-inventado",
      gravedad: "corrige",
      detalle: "Montos que no son de ningun producto real: " + precios.inventados.join(", "),
    });
  }

  // ── R2 · No hablar de un producto que nadie trajo a la conversacion ────────
  // Medido: el cliente pide idiomas y recibe piano (12->13); dice que si al
  // Pack Idiomas y recibe la ficha de piano (85->86); con Diseño Grafico en
  // contexto le hablan de Excel (101->102).
  const enContexto = e.productos.filter((p) => e.idsEnContexto.includes(p.id));
  const pedidosPorElCliente = e.productos.filter((p) => nombraProducto(e.mensajeCliente, p.name));
  const nombradosEnLaRespuesta = e.productos.filter((p) => nombraProducto(texto, p.name));

  // Nombrar tres o mas es enumerar el catalogo, no cruzarse de producto.
  const esListado = nombradosEnLaRespuesta.length >= 3;
  if (!esListado && nombradosEnLaRespuesta.length > 0) {
    const permitidos = new Set([...enContexto, ...pedidosPorElCliente].map((p) => p.id));
    if (permitidos.size > 0) {
      const ajenos = nombradosEnLaRespuesta.filter((p) => !permitidos.has(p.id));
      // Nombrar otro producto DE PASO es legitimo ("a diferencia del de
      // piano"). Solo es cruce si ademas no menciona el que corresponde.
      const mencionaElCorrecto = nombradosEnLaRespuesta.some((p) => permitidos.has(p.id));
      if (ajenos.length > 0 && !mencionaElCorrecto) {
        const esperados = [...permitidos]
          .map((id) => e.productos.find((p) => p.id === id)?.name)
          .filter(Boolean)
          .join(", ");
        bloquear = true;
        hallazgos.push({
          regla: "producto-cruzado",
          gravedad: "bloquea",
          detalle:
            "Responde sobre " + ajenos.map((p) => p.name).join(" / ") +
            " cuando lo que corresponde es " + (esperados || "otro producto"),
        });
      }
    }
  }

  // ── R3 · Si preguntaron algo, no se contesta con una formula ───────────────
  // Medido (conversacion 19, 241->242): "Donde es la academia. Gracias." se
  // contesto con "Fue un placer atenderte". El cliente insistio y se fue.
  if (esPregunta(e.mensajeCliente) && esRespuestaVacia(texto)) {
    bloquear = true;
    hallazgos.push({
      regla: "pregunta-sin-responder",
      gravedad: "bloquea",
      detalle: "Preguntó: " + e.mensajeCliente.trim().slice(0, 80) + " — y la respuesta no contesta nada.",
    });
  }

  // ── R4 · No prometer una verificacion que nadie hace ───────────────────────
  // Medido (145->146 y 147->148): pago por Nequi, que se revisa a mano, y el
  // bot contesta "apenas el sistema confirme el pago". Nadie confirma solo: el
  // comprador queda esperando algo que no va a pasar.
  const manuales = e.pagosManuales?.length ? e.pagosManuales : PAGOS_MANUALES_POR_DEFECTO;
  const nCliente = normalizar(e.mensajeCliente);
  const nTexto = normalizar(texto);
  const hayPagoManual = manuales.some((m) => {
    const n = normalizar(m);
    return nCliente.includes(n) || nTexto.includes(n);
  });
  if (hayPagoManual && PROMESA_AUTOMATICA.test(texto)) {
    texto = texto.replace(PROMESA_AUTOMATICA, "apenas revisemos tu comprobante y confirmemos el pago");
    hallazgos.push({
      regla: "verificacion-inventada",
      gravedad: "corrige",
      detalle: "Prometía verificación automática de un pago que se revisa a mano.",
    });
  }

  return { texto, hallazgos, bloquear };
}

/**
 * Vale la pena un segundo par de ojos con IA?
 *
 * Las reglas de arriba son certeras pero literales. Hay fallas que solo se ven
 * con criterio: responder algo cierto que no contesta lo que preguntaron. Esto
 * marca los casos donde ese critico paga su latencia, para no gastarla en
 * todos los mensajes.
 */
export function necesitaCriterio(e: EntradaSupervisor, r: RevisionSupervisor): boolean {
  if (r.bloquear) return true;
  if (esPregunta(e.mensajeCliente) && normalizar(r.texto).split(" ").filter(Boolean).length < 8) return true;
  return false;
}
