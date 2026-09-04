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

import { verificarPrecios, defenderElPrecio, type ProductoParaPrecio } from "./precio-verificado";
import { preguntasSueltas } from "./estado-cognitivo";

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
  /**
   * Catalogo completo: la fuente de verdad.
   *
   * `deliveryLink` importa tanto como el precio: es POR DONDE se entrega, y
   * el modelo lo inventa igual que inventaba montos (ver R9).
   */
  productos: Array<ProductoParaPrecio & {
    kind?: string | null;
    deliveryLink?: string | null;
    /** Lo que el producto DICE que trae. Es contra esto que se mide un temario. */
    description?: string | null;
    features?: string[] | null;
  }>;
  /** Ids del producto del que se esta hablando. */
  idsEnContexto: number[];
  /**
   * El texto NO lo redacto el modelo: salio de la base de conocimiento, que
   * ya esta verificada por el negocio.
   *
   * Con esto se saltan las reglas que juzgan si el texto DICE la verdad --
   * revisarlas seria desconfiar de lo que el propio negocio escribio, y de
   * paso podrian estropearlo.
   *
   * Lo que NO se salta son las reglas que juzgan si la respuesta VIENE AL
   * CASO: que no acepte una rebaja, que no deje preguntas sin contestar, que
   * no nombre una entrega que no es. Esas no miran la verdad del texto sino
   * su relacion con lo que el cliente pregunto, y una respuesta verificada
   * puede fallar ahi igual.
   */
  respuestaVerificada?: boolean;

  /**
   * Lo que el agente YA le mando a este cliente en esta conversacion.
   *
   * Sin esto el agente no compara lo que va a decir contra lo que ya dijo. El
   * admin lo puso asi: "no esta teniendo uso de razon a la hora de enviar la
   * informacion, no analiza si lo que esta enviando esta bien, y no tiene
   * memoria de lo que pasa".
   *
   * El caso que lo destapo (2026-08-30): la ficha listo las caracteristicas
   * del curso y el mensaje siguiente pregunto "¿Te cuento que incluye? 👀" --
   * ofreciendole algo que acababa de recibir.
   */
  yaEnviado?: string[];

  /**
   * Si ESTE negocio acepta negociar el precio.
   *
   * Por defecto false. Con true, la regla que impide aceptar rebajas deja de
   * aplicarse: hay rubros donde regatear es como se vende, y el candado seria
   * el bot negandose a trabajar.
   */
  negociaPrecio?: boolean;

  /** Metodos de pago que el negocio verifica A MANO (Nequi, Daviplata...). */
  pagosManuales?: string[];

  /**
   * Los numeros de cuenta REALES del negocio (Nequi, Daviplata, banco).
   *
   * Cualquier otro numero que el modelo escriba como cuenta de cobro es plata
   * que se va a la cuenta equivocada.
   */
  cuentasReales?: string[];

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

  // Las reglas que siguen juzgan si el texto dice la VERDAD, y por eso solo
  // aplican a lo que redacto el modelo. Ver `respuestaVerificada`.
  if (!e.respuestaVerificada) {

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

  // ── R8 · Un numero de cuenta que no es del negocio NO puede salir ──────────
  //
  // Medido en vivo el 2026-08-26, escribiendole al bot desde WhatsApp Web:
  //
  //   YO:  como pago por nequi
  //   BOT: "Podés pagar por Nequi con el número que te paso en este mensaje:
  //         300 123 4567"
  //
  // Ese numero NO EXISTE. El del negocio es 3136174267. El modelo lo invento
  // con la forma de un celular colombiano, que es lo que lo hace peligroso:
  // parece de verdad, y el cliente transfiere.
  //
  // Es el peor error posible de este bot. No es una respuesta fea ni un dato
  // impreciso: es plata que se va a una cuenta ajena y no vuelve.
  //
  // El numero real lo sabe el servidor, asi que esto no se interpreta: se
  // compara. Cualquier celular de 10 digitos que no sea una cuenta cargada, en
  // un mensaje que habla de pagar, no sale.
  const cuentas = (e.cuentasReales || []).map((c) => String(c).replace(/[^0-9]/g, "")).filter(Boolean);
  const hablaDeCobro = /\bnequi|daviplata|transferenc|consigna|cuenta|celular|n[uú]mero\b/i.test(texto);
  if (hablaDeCobro) {
    // 10 digitos seguidos, con o sin espacios/puntos de por medio.
    const posibles = texto.match(/\b\d[\d\s.\-]{8,14}\d\b/g) || [];
    const ajenos = posibles
      .map((n) => ({ crudo: n, limpio: n.replace(/[^0-9]/g, "") }))
      .filter((n) => n.limpio.length === 10 && n.limpio.startsWith("3"))
      .filter((n) => !cuentas.includes(n.limpio));

    if (ajenos.length > 0) {
      bloquear = true;
      hallazgos.push({
        regla: "cuenta-inventada",
        gravedad: "bloquea",
        detalle: `Escribió un número de cuenta que NO es del negocio: ${ajenos.map((a) => a.crudo).join(", ")}`,
      });
      return {
        texto,
        hallazgos,
        bloquear,
        reemplazoSugerido: cuentas.length
          ? "Te paso los datos de pago aquí abajo 👇"
          : "Dejame confirmarte los datos de pago y te los envío enseguida 🙏",
      };
    }
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

  } // fin de las reglas que solo aplican a lo que redacto el modelo

  // ── R12 · Ofrecer lo que ya entrego ──────────────────────────────────────
  //
  // Conversacion real (2026-08-30):
  //
  //   bot: [ficha con las 4 caracteristicas del curso]
  //   bot: "💰 $60.000 COP — ¿Te cuento que incluye? 👀"
  //
  // Le pregunto si le contaba lo que le acababa de contar. Para el cliente eso
  // no es un detalle de redaccion: es la prueba de que del otro lado nadie
  // esta leyendo. Y es lo que el admin describio como "no se siente humano".
  //
  // No se bloquea: lo que el mensaje dice esta bien, lo que sobra es el cierre.
  // Se le quita el ofrecimiento y listo -- un mensaje sin pregunta final es
  // mejor que uno que pregunta algo absurdo.
  if (Array.isArray(e.yaEnviado) && e.yaEnviado.length > 0) {
    const OFRECE_CONTENIDO = /¿?\s*(te cuento qu[eé] (incluye|viene|trae)|te muestro todo lo que trae|qu(er[eé]s|ieres) ver qu[eé] incluye)[^\n]*/gi;
    // "Ya lo vio" = un mensaje anterior enumero caracteristicas: dos o mas
    // renglones que abren con vinieta o emoji. Es como se ve una ficha.
    const yaListoElContenido = e.yaEnviado.some((m) => {
      const renglones = String(m || "").split("\n").filter((l) => /^\s*(?:[-•*]|\p{Extended_Pictographic})/u.test(l));
      return renglones.length >= 2;
    });
    if (yaListoElContenido && OFRECE_CONTENIDO.test(texto)) {
      const limpio = texto.replace(OFRECE_CONTENIDO, "").replace(/\n{3,}/g, "\n\n").trim();
      hallazgos.push({
        regla: "ofrece-lo-ya-enviado",
        gravedad: "corrige",
        detalle: "Ofrecia contarle el contenido que ya se le habia enviado en esta conversacion.",
      });
      texto = limpio;
    }
  }

  // ── R11 · Contestar una de tres y descartar el resto ─────────────────────
  //
  // Ronda 3 de QA (2026-08-27): de cinco preguntas repartidas en dos mensajes,
  // el bot contestó UNA. Las otras cuatro no las contestó ni dijo que no las
  // iba a contestar -- simplemente desaparecieron.
  //
  // Para el cliente eso es peor que un "no sé": preguntó por el envío a
  // Quibdó dos veces y las dos veces se hizo el desentendido.
  //
  // Acá NO se bloquea: lo que el bot sí contestó está bien y sirve. Se le
  // agrega una línea nombrando lo que quedó pendiente, que es lo que hace
  // una persona cuando le tiran tres cosas juntas.
  const sueltas = preguntasSueltas(e.mensajeCliente);
  if (sueltas.length > 1 && !bloquear) {
    const enRespuesta = new Set(normalizar(texto).split(" ").filter((p) => p.length > 2));
    const sinTocar = sueltas.filter((q) => {
      const claves = normalizar(q).split(" ").filter((p) => p.length > 3 && !RELLENO_NOMBRE.has(p));
      return claves.length > 0 && claves.every((c) => !enRespuesta.has(c));
    });
    if (sinTocar.length > 0 && !/tambi[eé]n|y sobre|lo otro|lo dem[aá]s/i.test(texto)) {
      const pendiente = sinTocar[0]!.slice(0, 60);
      texto = `${texto.trim()}\n\nY sobre lo otro que preguntaste ("${pendiente}"), déjame confirmártelo y te digo 🙏`;
      hallazgos.push({
        regla: "pregunta-a-medias",
        gravedad: "corrige",
        detalle: `Quedaron ${sinTocar.length} de ${sueltas.length} preguntas sin contestar: "${pendiente}"`,
      });
    }
  }

  // ── R10 · Aceptar un descuento sin querer ────────────────────────────────
  //
  // De la ronda 3 de QA (2026-08-27). El cliente escribió tres cosas juntas:
  //   "me lo dejas en 30 mil? y si no me gusta me devuelves la plata?
  //    y tienes algo físico con envío a Quibdó?"
  // y el bot contestó:
  //   "Claro que sí 😊 Tienes 7 días de garantía ✅ ..."
  //
  // Él quería contestar lo de la garantía. Pero "Claro que sí" pegado a "me lo
  // dejas en 30 mil" se lee como que le aceptaron el precio -- y cuando el
  // cliente lo confirmó ("entonces quedamos en 30 mil, cierto?") tampoco lo
  // desmintió. Queda por escrito, en WhatsApp, un sí a la mitad de precio.
  //
  // Ninguna regla anterior lo agarraba: R1 saca montos inventados del texto
  // del BOT, y acá el monto lo puso el CLIENTE. El bot solo dijo que sí.
  //
  // El precio no se negocia. Y como la respuesta correcta se sabe -- es el
  // precio del catálogo -- se reemplaza por texto fijo en vez de bloquear a
  // secas: bloquear dejaría al cliente sin respuesta justo cuando está
  // regateando, que es cuando más atención necesita.
  // ⚠️ Medido contra produccion el 2026-09-02: "me dejas el curso de
  // inteligencia artificial en 40 mil?" NO casaba. Todas las formas de
  // "dejar en" exigian el pronombre --"me LO dejas"-- y el cliente que nombra
  // el producto en vez de pronombrarlo se caia por el hueco. Como no entraba
  // acá, `defenderElPrecio` nunca corria; otro guardia borraba lo que el
  // modelo habia inventado y al cliente le llegaba "¡ Hola!" a secas, en
  // plena negociacion.
  //
  // La segunda mitad admite el objeto nombrado en el medio, pero exige que lo
  // que viene despues del "en" sea PLATA -- "$40", "40.000", "40 mil". Sin eso
  // se comia "¿me das el acceso en 24 horas?", que no es un regateo.
  const PIDE_REBAJA =
    /\b(descuento|rebaja|rebajar|rebajita|me lo dejas?|lo dejas? en|me lo das? en|precio especial|mejor precio|m[aá]s barato|promoci[oó]n|oferta especial|hac[eé]s? precio|hace precio|[uú]ltimo precio|lo menos que|cu[aá]nto es lo menos|hasta cu[aá]nto|en cu[aá]nto me lo dejas?)\b|\bme\s+(?:lo\s+|la\s+|los\s+|las\s+)?(?:dej[aá]s?|deja|d[aá]s?|da)\b[^?.!\n]{0,40}?\ben\s*(?:\$\s*\d+|\d{1,3}(?:[.,]\d{3})+|\d{2,3}\s*(?:mil|k|lucas))\b/i;
  const ACEPTA_SIN_PENSAR =
    /^\s*(?:[¡!]*\s*)?(claro que s[ií]|claro|listo|dale|de una|por supuesto|hecho|obvio|perfecto|s[ií]\s*[,.!]|ok|okey|okay|va|trato hecho|cerrado)\b/i;
  // ── Salvo que ESTE negocio si negocie ──────────────────────────────────
  //
  // El default es no negociar, y es deliberado: un precio que baja al primer
  // pedido ensena que el de la lista era falso, y de ahi en mas todo el
  // catalogo se lee como inflado.
  //
  // Pero esto es un SaaS. Un concesionario, una mueblería o un mayorista SI
  // regatean, y para ellos este candado seria el bot negandose a hacer su
  // trabajo. Se configura en el perfil del negocio (`negociaPrecio`).
  if (PIDE_REBAJA.test(e.mensajeCliente) && !e.negociaPrecio) {
    const enFoco = e.productos.filter((p) => e.idsEnContexto.includes(p.id));
    const precio = Number(enFoco[0]?.price ?? NaN);
    // El texto del bot NO puede abrir afirmando, y tiene que decir el precio
    // real. Si no dice ninguno de los dos, el cliente completa el hueco solo.
    const abreAfirmando = ACEPTA_SIN_PENSAR.test(texto);
    const diceElPrecio =
      Number.isFinite(precio) && precio > 0 &&
      new RegExp(String(Math.round(precio)).replace(/\B(?=(\d{3})+(?!\d))/g, "[.,]?")).test(
        texto.replace(/[^0-9.,]/g, " "),
      );
    if (abreAfirmando || !diceElPrecio) {
      bloquear = true;
      hallazgos.push({
        regla: "descuento-aceptado",
        gravedad: "bloquea",
        detalle:
          `El cliente pidió rebaja y la respuesta ${abreAfirmando ? "abría afirmando" : "no decía el precio real"}: ` +
          `"${texto.slice(0, 80)}"`,
      });
      const precioTexto = Number.isFinite(precio) && precio > 0
        ? `$${Math.round(precio).toLocaleString("es-CO")}`
        : "el del catálogo";
      return {
        texto,
        hallazgos,
        bloquear,
        // Texto FIJO: no lo redacta el modelo. Dice el precio, no regatea, y
        // deja la puerta abierta -- que es lo que hace un vendedor de verdad
        // cuando le piden rebaja.
        // El texto lo arma `defenderElPrecio` con los datos REALES del
        // producto. El anterior negaba dos veces --"es fijo", "no manejo
        // descuentos"-- y no daba una sola razón para comprarlo. Al que pide
        // rebaja no lo convence un "no": lo convence ver que lo vale.
        reemplazoSugerido: defenderElPrecio(enFoco[0] as any),
      };
    }
  }

  // ── R9 · Prometer una entrega por un servicio que no es ──────────────────
  //
  // Conversacion real (2026-08-27, el admin probando de punta a punta): el
  // curso de IA se entrega por Terabox y el bot escribio "Acceso inmediato por
  // Google Drive" y "Enlace de descarga por Google Drive", dos veces en la
  // misma charla. El cliente paga esperando un Drive y recibe otra cosa.
  //
  // La respuesta a "¿como me llega?" ya estaba arreglada en el conocimiento,
  // pero eso solo cubre cuando lo PREGUNTAN. Aca el modelo lo mete de adorno
  // dentro de una ficha que el mismo redacta, y por ahi se colaba igual.
  //
  // No se borra la frase entera -- "Acceso inmediato" es cierto y vende --,
  // se le saca solo el servicio equivocado.
  const entregasEnContexto = e.productos
    .filter((p) => e.idsEnContexto.includes(p.id))
    .map((p) => String(p.deliveryLink || "").toLowerCase())
    .filter(Boolean);
  if (entregasEnContexto.length > 0) {
    const SERVICIOS: Array<{ nombre: string; enUrl: RegExp; enTexto: RegExp }> = [
      { nombre: "Google Drive", enUrl: /drive\.google|docs\.google/, enTexto: /google\s*drive|g[- ]?drive|drive de google/gi },
      { nombre: "Terabox", enUrl: /terabox/, enTexto: /terabox/gi },
      { nombre: "Dropbox", enUrl: /dropbox/, enTexto: /dropbox/gi },
      { nombre: "MEGA", enUrl: /mega\.nz|mega\.io/, enTexto: /\bmega\.nz\b|\bmega\b(?=\s+(?:o|,|\.|$))/gi },
      { nombre: "OneDrive", enUrl: /onedrive|1drv\.ms/, enTexto: /onedrive|one\s*drive/gi },
      { nombre: "WeTransfer", enUrl: /wetransfer/, enTexto: /wetransfer|we\s*transfer/gi },
    ];
    const ajenos = SERVICIOS.filter(
      (srv) => srv.enTexto.test(texto) && !entregasEnContexto.some((u) => srv.enUrl.test(u)),
    );
    // .test() con /g deja el lastIndex movido; sin esto el replace de abajo
    // arranca a mitad del texto y se salta la primera aparicion.
    for (const srv of SERVICIOS) srv.enTexto.lastIndex = 0;
    if (ajenos.length > 0) {
      const antes = texto;
      for (const srv of ajenos) {
        texto = texto
          // "por Google Drive", "via Drive", "a traves de Dropbox": se va la
          // preposicion con el servicio, que si no queda "Acceso inmediato por".
          .replace(new RegExp(`\\s*(?:por|v[ií]a|via|en|desde|a trav[eé]s de|mediante)\\s+${srv.enTexto.source}`, "gi"), "")
          .replace(srv.enTexto, "")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/[ \t]+([,.:;])/g, "$1")
          .trim();
      }
      hallazgos.push({
        regla: "entrega-inventada",
        gravedad: "corrige",
        detalle:
          `Prometia la entrega por ${ajenos.map((a) => a.nombre).join(", ")}, ` +
          `y no es por donde se entrega este producto: "${antes.slice(0, 90)}"`,
      });
    }
  }

  // ── R13. EL TEMARIO INVENTADO ─────────────────────────────────────────
  //
  // Conversación real del 2026-09-02. El cliente preguntó por el curso de IA y
  // el bot le detalló cuatro módulos con nombre propio:
  //
  //   "🤖 Módulo 1 – Fundamentos de IA
  //    🛠️ Módulo 2 – Herramientas esenciales
  //    ⚙️ Módulo 3 – Agentes autónomos
  //    Módulo 4 – Proyectos prácticos"
  //
  // El producto REAL, que llegó en la ficha dos mensajes después, dice otra
  // cosa: 39 módulos de Master en Agentes IA, 13 de Claude AI, n8n, OpenClaw,
  // Gemini. O sea que el bot le vendió un temario que no existe, y el cliente
  // se entera al abrir el curso.
  //
  // Las reglas anteriores no lo tocaban: ninguna mira el CONTENIDO. R1 cuida
  // los precios, R9 la entrega, R5 los bonos. El temario es lo que el cliente
  // de verdad compra.
  //
  // Se juzga solo lo que tiene NOMBRE: un "4 módulos" suelto puede salir de la
  // descripción, pero "Módulo 2 – Herramientas esenciales" es una afirmación
  // concreta y verificable contra el catálogo.
  const enFocoAhora = e.productos.filter((p) => e.idsEnContexto.includes(p.id));
  if (enFocoAhora.length > 0) {
    const verdad = normalizar(
      enFocoAhora
        .map((p) => `${p.name} ${p.description || ""} ${(p.features || []).join(" ")}`)
        .join(" "),
    );
    const inventados: string[] = [];
    const NOMBRA_MODULO = /(?:m[oó]dulo|lecci[oó]n|clase|unidad)\s*\d+\s*[–—:-]\s*([^\r\n]{4,60})/gi;
    let m: RegExpExecArray | null;
    while ((m = NOMBRA_MODULO.exec(texto)) !== null) {
      const titulo = normalizar(m[1]);
      // Las palabras que de verdad distinguen a ese módulo, sin las de relleno.
      const claves = titulo.split(" ").filter((w) => w.length >= 5);
      if (claves.length === 0) continue;
      const respaldadas = claves.filter((w) => verdad.includes(w)).length;
      // Con menos de la mitad respaldada, ese título no sale del catálogo.
      if (respaldadas * 2 < claves.length) inventados.push(m[1].trim());
    }

    if (inventados.length > 0) {
      bloquear = true;
      hallazgos.push({
        regla: "temario-inventado",
        gravedad: "bloquea",
        detalle:
          `Detalló un temario que no está en el catálogo: ${inventados.slice(0, 3).map((t) => `"${t}"`).join(", ")}. ` +
          `El cliente compra eso y no lo encuentra.`,
      });
      return { texto, hallazgos, bloquear, reemplazoSugerido: undefined };
    }
  }

  // ── R14. CONTRAENTREGA EN UN PRODUCTO DIGITAL ─────────────────────────
  //
  // De la misma conversación: "Pago contra entrega: pagas cuando recibes el
  // material en tu WhatsApp", sobre un curso digital que se cobra por
  // adelantado. Es una condición de pago falsa, y de las que el cliente
  // reclama con razón.
  //
  // Sale del texto y no se bloquea el mensaje entero: el resto de la respuesta
  // suele estar bien, y quitar la línea alcanza.
  const hayDigitalEnFoco = enFocoAhora.some((p) => String(p.kind || "digital") !== "physical");
  if (hayDigitalEnFoco && !enFocoAhora.some((p) => String(p.kind) === "physical")) {
    const CONTRAENTREGA =
      /^.*\b(contra\s*entrega|contraentrega|pagas?\s+cuando\s+(lo\s+)?recib\w+|paga\s+al\s+recibir)\b.*$/gim;
    if (CONTRAENTREGA.test(texto)) {
      texto = texto.replace(CONTRAENTREGA, "").replace(/\n{3,}/g, "\n\n").trim();
      hallazgos.push({
        regla: "contraentrega-en-digital",
        gravedad: "corrige",
        detalle: "Prometía pago contra entrega en un producto digital, que se cobra por adelantado.",
      });
    }
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
/**
 * El modelo afirmando que un pago esta confirmado.
 *
 * ⚠️ La forma con "ESTA" faltaba, y es la que se escapo. Medido el
 * 2026-09-04 reproduciendo la conversacion del admin:
 *
 *   cliente: "Tenes el curso de inteligencia artificial"
 *   bot:     "El curso de IA 2026 ya ESTA PAGO y activado."
 *
 * Nadie habia verificado nada. El patron anticipaba "ya QUEDO pago" y no
 * "ya ESTA pago": la misma clase de fallo que este archivo ya documenta dos
 * veces -- una lista de formas que no incluye la que la gente usa.
 *
 * Se suman los sinonimos del rubro: en Colombia "cancelado" y "abonado"
 * significan pagado.
 *
 * "Activado" queda FUERA a proposito: eso habla del acceso, no del dinero, y
 * lo cubre la regla de "ya te lo mande". Meterlo aca bloquearia la entrega
 * legitima despues de que una persona SI verifico el pago.
 */
const AFIRMA_PAGO_CONFIRMADO =
  /\b(ya\s+)?(confirm[eé]|verifiqu[eé]|valid[eé]|registr[eé])\s+(tu|el|su)\s+pago\b|\b(tu|el|su)\s+pago\s+(ya\s+)?(est[aá]|qued[oó])\s+(confirmado|verificado|registrado|acreditado)\b|\bpago\s+confirmado\b|\b(ya\s+)?(est[aá]|qued[oó])\s+(pago|pagado|pagada|abonado|abonada|cancelado|cancelada)\b|\bconfirmada\s+la\s+compra\b/i;

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
