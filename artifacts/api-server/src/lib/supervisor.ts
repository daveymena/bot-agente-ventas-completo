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

  /**
   * Si ESTE mensaje lleva de verdad una ficha/tarjeta adjunta.
   *
   * Es la verdad del servidor, y sirve para cazar la mentira mas peligrosa que
   * sabe decir el modelo: afirmar que ya mando algo. Si el texto dice "ya te
   * mande el link" y aca no viene ninguna ficha, no hubo ningun link.
   */
  llevaCard?: boolean;
}

export interface RevisionSupervisor {
  texto: string;
  hallazgos: Hallazgo[];
  /** true = esto no se envia tal cual; hay que regenerar o escalar. */
  bloquear: boolean;
  /**
   * Qué decir en lugar de lo bloqueado, cuando la regla sabe cuál es la
   * respuesta correcta. Sin esto, bloquear obliga a un texto generico que a
   * veces deja al cliente peor que antes.
   */
  reemplazoSugerido?: string;
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
  "en que te puedo ayudar", "en que te ayudo", "cuentame en que te puedo ayudar",
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

  // ── R5 · No entregar contra la palabra del cliente ─────────────────────────
  // Medido (banco de pruebas E2, 2026-08-25): el cliente escribio "ya te
  // pague, mandame el acceso" -- sin comprobante y sin haber pagado -- y el
  // bot contesto "Entendido, ya hiciste el pago... te lo paso por Google
  // Drive. ¿Me confirmas el numero al que queres recibir el enlace?".
  //
  // La politica correcta YA estaba escrita en el sistema: se entrega "solo
  // cuando el admin confirme que vio el dinero -- nunca porque el cliente diga
  // que ya pago ni porque haya mandado un comprobante". Pero vivia como texto
  // dirigido al admin, no como una regla que alguien hiciera cumplir.
  //
  // Prometer condicionado esta bien ("apenas confirmemos, te lo mando"). Lo
  // que no puede salir es la promesa a secas: eso regala producto.
  if (AFIRMA_HABER_PAGADO.test(e.mensajeCliente) && PROMETE_ENTREGA.test(texto) && !ES_CONDICIONAL.test(texto)) {
    bloquear = true;
    hallazgos.push({
      regla: "entrega-sin-verificar",
      gravedad: "bloquea",
      detalle: "Iba a entregar el acceso porque el cliente dijo que pagó, sin comprobante ni verificación.",
    });
    return {
      texto,
      hallazgos,
      bloquear,
      reemplazoSugerido:
        "¡Gracias! 🙌 Para activarte el acceso necesito el comprobante de la transferencia. " +
        "Mándamelo por aquí y apenas confirmemos el pago te lo envío.",
    };
  }

  // ── R6 · El modelo NO puede narrar acciones que no ejecuta ─────────────────
  //
  // Medido el 2026-08-25, 19:15-19:23, ya con R5 desplegada -- y R5 no cazo
  // ninguna de estas, porque solo miraba promesas en FUTURO ("te paso", "te
  // mando"). Los fallos reales son afirmaciones en PASADO:
  //
  //   "Perfecto, ya confirmé tu pago del PACK IDIOMAS. Te acabo de liberar
  //    el acceso a la carpeta de Google Drive"   (nadie pago nada)
  //   "Ya te mandé el link por acá mismo 👇"      (nunca mando ningun link)
  //   "Te lo reenvío: es el mismo de siempre"     (no habia ninguno)
  //
  // Es una clase distinta y peor que prometer de mas: el cliente cree que la
  // compra esta hecha. Cinco minutos despues, el mismo bot decia "hoy no
  // compraste nada todavia".
  //
  // Van dos frenos, y el segundo se apoya en la verdad del SERVIDOR:
  //
  //  a) Confirmar un pago no es una decision del modelo. Nunca. El dinero lo
  //     confirma la pasarela o una persona que lo vio en la cuenta.
  //  b) Decir "ya te lo mande" solo puede ser cierto si ESTE mensaje lleva la
  //     ficha adjunta. Si no la lleva, no se mando nada: es mentira, y el
  //     servidor lo sabe sin tener que interpretar el texto.
  if (AFIRMA_PAGO_CONFIRMADO.test(texto)) {
    bloquear = true;
    hallazgos.push({
      regla: "confirmacion-de-pago-inventada",
      gravedad: "bloquea",
      detalle: "Afirmaba que un pago está confirmado. Eso no lo decide el modelo: lo confirma la pasarela o una persona.",
    });
    return {
      texto,
      hallazgos,
      bloquear,
      reemplazoSugerido:
        "Para activarte el acceso necesito el comprobante de la transferencia 🙏 " +
        "Mándamelo por aquí y apenas lo revisemos te confirmo.",
    };
  }

  // ── R7 · No inventar incentivos que el negocio tendra que honrar ───────────
  // Medido el 2026-08-25: "si confirmás pago ahora mismo, te tiro un bonus
  // extra que no está en la ficha habitual". Un bonus que nadie definio, que
  // no existe en ningun lado, y que si el cliente reclama alguien tiene que
  // responder. Lo mismo con regalos y meses gratis inventados en el momento.
  if (PROMETE_BONUS_INVENTADO.test(texto)) {
    const antes = texto;
    texto = texto
      .split(/(?<=[.!?])(?=\s)|(?<=\n)/)
      .filter((t) => !PROMETE_BONUS_INVENTADO.test(t))
      .join("")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (!texto) texto = "Te paso la ficha aquí abajo con todo lo que incluye 👇";
    hallazgos.push({
      regla: "bonus-inventado",
      gravedad: "corrige",
      detalle: `Ofrecía un extra que no existe en el catálogo: "${antes.slice(0, 80)}"`,
    });
  }

  if (AFIRMA_YA_ENTREGADO.test(texto) && !e.llevaCard) {
    bloquear = true;
    hallazgos.push({
      regla: "accion-narrada",
      gravedad: "bloquea",
      detalle: "Decía haber enviado algo, pero este mensaje no lleva ninguna ficha adjunta: no se envió nada.",
    });
    return {
      texto,
      hallazgos,
      bloquear,
      reemplazoSugerido: "Déjame verificarlo y te confirmo por aquí enseguida 🙏",
    };
  }

  return { texto, hallazgos, bloquear };
}

/**
 * Afirmar que un pago quedo confirmado. Se bloquea SIEMPRE: el modelo no ve
 * la cuenta bancaria ni la pasarela, asi que nunca puede saberlo.
 */
const AFIRMA_PAGO_CONFIRMADO =
  /\b(ya\s+)?(confirm[eé]|verifiqu[eé]|valid[eé]|registr[eé])\s+(tu|el|su)\s+pago\b|\b(tu|el|su)\s+pago\s+(ya\s+)?(est[aá]|qued[oó])\s+(confirmado|verificado|registrado|acreditado)\b|\bpago\s+confirmado\b|\bya\s+qued[oó]\s+(pago|pagado|confirmada\s+la\s+compra)\b/i;

/**
 * Afirmar que YA se entrego algo. Solo puede ser cierto si el mensaje lleva
 * la ficha adjunta; si no, no se mando nada.
 */
// OJO con `\b` despues de vocal acentuada: en JS `\b` se define sobre \w, que
// NO incluye "é". Asi que /mand[eé]\b/ NUNCA matchea "mandé" -- justo el caso
// que se queria cazar. Se cierra con (?![a-záéíóúñ]), que si funciona.
const FIN = "(?![a-záéíóúñ])";
const AFIRMA_YA_ENTREGADO = new RegExp(
  [
    `\\bya\\s+te\\s+(lo\\s+|la\\s+)?(mand[eé]|envi[eé]|pas[eé]|di|entregu[eé]|liber[eé])${FIN}`,
    `\\bte\\s+acabo\\s+de\\s+(mandar|enviar|pasar|liberar|dar|entregar|compartir)${FIN}`,
    `\\bte\\s+lo\\s+reenv[ií]o${FIN}`,
    `\\bya\\s+(ten[eé]s|tienes)\\s+(el\\s+|tu\\s+)?(acceso|link|enlace)${FIN}`,
    `\\bya\\s+est[aá]\\s+(enviado|liberado|activo)${FIN}`,
  ].join("|"),
  "i",
);

/**
 * Extras inventados en el momento: bonus, regalos y sorpresas que no salen de
 * ningun catalogo. Si el cliente los reclama, alguien del negocio tiene que
 * responder por ellos.
 */
const PROMETE_BONUS_INVENTADO =
  /\b(te\s+(tiro|doy|regalo|sumo|agrego|meto)|te\s+va\s+de\s+regalo|de\s+regalo\s+te)\b[^.!?\n]{0,50}\b(bonus|extra|regalo|sorpresa|obsequio|adicional|gratis)\b|\bbonus\s+extra\b|\bte\s+lo\s+dejo\s+de\s+regalo\b/i;

/** "ya te pague", "ya hice la transferencia", "ya realice el pago". */
const AFIRMA_HABER_PAGADO =
  /\bya\s+(te\s+)?(pagu[eé]|pag[uo]|hice\s+(el\s+pago|la\s+transferencia|la\s+consignaci[oó]n)|realic[eé]\s+el\s+pago|transfer[ií])\b|\bpago\s+(hecho|realizado|listo)\b/i;

/** Promesas de entregar el producto. */
const PROMETE_ENTREGA =
  /\b(te\s+(lo\s+)?(paso|mando|env[ií]o|comparto|hago\s+llegar)|te\s+llega|ac[aá]\s+te\s+dejo)\b[^.!?\n]{0,60}\b(acceso|enlace|link|drive|curso|material|carpeta)\b|\b(acceso|enlace|link)\b[^.!?\n]{0,40}\b(te\s+(lo\s+)?(paso|mando|env[ií]o))\b/i;

/** Marcadores de que la entrega queda CONDICIONADA a verificar el pago. */
const ES_CONDICIONAL =
  /\b(apenas|cuando|en\s+cuanto|una\s+vez|ni\s+bien|luego\s+de|despu[eé]s\s+de)\b[^.!?\n]{0,60}\b(confirm\w+|verific\w+|revis\w+|valid\w+|recib\w+\s+el\s+comprobante)\b|\bnecesito\s+el\s+comprobante\b|\bmand[aá]\w*\s+el\s+comprobante\b/i;

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
