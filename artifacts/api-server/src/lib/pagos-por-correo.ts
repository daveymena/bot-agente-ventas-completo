/**
 * ============================================================
 * EL BANCO AVISA, NO EL CLIENTE — verificar el pago contra el correo
 * ============================================================
 *
 * El admin lo pidió así el 2026-09-06: "si el cliente envía el pago podemos
 * hacer que ese mensaje llegue a mí y decirle: revisa, confirmé un pago a
 * nombre de tal, confírmame si es el pago del curso para darle acceso... pero
 * solo cuando el cliente envíe comprobante".
 *
 * ── Por qué esto cambia el problema de raíz ──────────────────────────────
 *
 * Hasta hoy la única prueba de un pago era una CAPTURA que manda el cliente.
 * Una captura se falsifica en dos minutos, y ya pasó: el 2026-09-06, en la
 * corrida de pruebas, alguien mandó la foto de un paisaje diciendo que era el
 * comprobante.
 *
 * Nequi le manda un correo al dueño por cada plata que ENTRA:
 *
 *   De: notificaciones@nequi.com.co
 *   Asunto: ¡Recibiste plata por Bre-B!
 *   "Recibiste 130.000 de LIZ MONTOYA el 29 de agosto de 2026 a las 4:39 p.m,
 *    desde el banco Bco Bogotá."
 *
 * Ese correo no lo controla el cliente. Es la diferencia entre "el cliente
 * dice que pagó" y "la plata entró".
 *
 * ── Lo que este módulo NO hace ───────────────────────────────────────────
 *
 * No aprueba ni entrega nada, y no mira el correo por su cuenta. Solo corre
 * cuando llega un comprobante, y lo único que produce es una FRASE para el
 * dueño: "confirmé un pago de $X a nombre de Y hace Z minutos". La decisión
 * sigue siendo suya, porque el correo dice cuánto entró y de quién, pero no
 * QUÉ compró esa persona: si dos clientes pagan lo mismo a la misma hora, eso
 * no lo resuelve ningún parser.
 */

/** Un pago que el banco avisó por correo. */
export interface PagoAvisadoPorElBanco {
  /** "nequi" | "daviplata" | "bancolombia" ... */
  banco: string;
  monto: number;
  /** Quién lo envió, tal cual lo escribe el banco. */
  remitente: string | null;
  /** Cuándo lo dice el correo, en texto crudo. La hora fiable es `recibidoEl`. */
  fechaTexto: string | null;
  /** De qué banco venía la plata, si el aviso lo dice. */
  bancoOrigen: string | null;
  /** Fecha del correo. Es la que se usa para cruzar: no depende del parseo. */
  recibidoEl: Date;
}

/**
 * Remitentes que se aceptan como aviso de banco.
 *
 * ⚠️ Es la parte que NO se puede aflojar. Si esto acepta cualquier correo que
 * diga "Nequi", cualquiera que sepa la dirección del dueño le manda un correo
 * falso y se lleva un producto gratis. Se compara el DOMINIO completo, nunca
 * por `includes`.
 */
const DOMINIOS_DE_BANCO: Record<string, string> = {
  "nequi.com.co": "nequi",
  "notificaciones.nequi.com.co": "nequi",
  "daviplata.com": "daviplata",
  "davivienda.com": "daviplata",
  "bancolombia.com.co": "bancolombia",
};

/** El dominio de un `From`, en minúsculas. "A B <x@y.com>" -> "y.com" */
export function dominioDe(remitente: string): string | null {
  const m = String(remitente || "").match(/<?([^<>@\s]+)@([^<>@\s]+?)>?\s*$/);
  return m ? m[2]!.toLowerCase() : null;
}

/**
 * ¿Este correo viene de un banco de verdad?
 *
 * Acepta el dominio exacto o un subdominio suyo. "nequi.com.co.fake.ru" NO
 * pasa: se exige que termine en "." + dominio, no que lo contenga.
 */
export function bancoDelRemitente(remitente: string): string | null {
  const dom = dominioDe(remitente);
  if (!dom) return null;
  for (const [d, banco] of Object.entries(DOMINIOS_DE_BANCO)) {
    if (dom === d || dom.endsWith("." + d)) return banco;
  }
  return null;
}

/**
 * Un aviso de plata que ENTRA, no que sale.
 *
 * Importa la diferencia: la misma bandeja recibe "¡Enviaste plata por Bre-B!"
 * muchísimo más seguido que "¡Recibiste...!" (en la cuenta real, la mayoría de
 * los avisos son envíos). Tomar uno por otro confirmaría como cobro un pago
 * que el propio dueño hizo.
 */
const ES_ENTRADA = /\b(recibiste|te (enviaron|consignaron|transfirieron)|recibiste plata|abono|consignaci[oó]n recibida)\b/i;
const ES_SALIDA = /\b(enviaste|realizaste un env[ií]o|pagaste|retiraste|sacaste)\b/i;

/** "130.000" | "1.234.567,89" | "$ 60.000,00" -> 130000 | 1234567 | 60000 */
export function montoDeTexto(t: string): number | null {
  const limpio = String(t || "").replace(/\s/g, "");
  // Se toma la parte entera: los centavos no deciden nada acá y ",00" es ruido.
  const m = limpio.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/\./g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface EntradaCorreo {
  remitente: string;
  asunto: string;
  cuerpo: string;
  fecha: Date;
}

/**
 * Lee un correo del banco. Devuelve null si no es un aviso de plata recibida
 * -- y eso incluye los avisos de plata ENVIADA, la publicidad y cualquier
 * correo que no venga de un dominio de banco.
 */
export function leerCorreoDePago(c: EntradaCorreo): PagoAvisadoPorElBanco | null {
  const banco = bancoDelRemitente(c.remitente);
  if (!banco) return null;

  const texto = `${c.asunto}\n${c.cuerpo}`;
  if (ES_SALIDA.test(texto) && !ES_ENTRADA.test(c.asunto)) return null;
  if (!ES_ENTRADA.test(texto)) return null;

  // "Recibiste 130.000 de LIZ MONTOYA el 29 de agosto de 2026 a las 4:39 p.m,
  //  desde el banco Bco Bogotá."
  // El banco de origen se busca APARTE y no como grupo opcional del match
  // grande. Con `([^,\n|]+?)` perezoso delante de un grupo opcional, el motor
  // prefiere la coincidencia mas corta y se saltea el opcional: la fecha del
  // aviso real termina en "4:39 p.m," y el ", desde el banco Bco Bogota"
  // quedaba sin capturar aunque estuviera ahi. Dos expresiones simples se leen
  // mejor que una con grupos opcionales, y fallan de a una.
  const m = texto.match(
    /recibiste\s+([\d.,]+)\s+de\s+([^,\n|]+?)\s+el\s+([^,\n|]+)/i,
  );

  if (m) {
    const monto = montoDeTexto(m[1]!);
    if (monto === null) return null;
    const origen = texto.match(/desde el banco\s+([^,.\n|]+)/i);
    return {
      banco,
      monto,
      remitente: (m[2] || "").trim().slice(0, 80) || null,
      fechaTexto: (m[3] || "").trim().slice(0, 80) || null,
      bancoOrigen: origen ? (origen[1] || "").trim().slice(0, 60) || null : null,
      recibidoEl: c.fecha,
    };
  }

  // Formato desconocido pero es un aviso de entrada de un banco real: se
  // rescata el monto si se puede. Vale la pena: el aviso igual sirve para
  // decirle al dueño "entró plata", que es mejor que no decirle nada. Lo que
  // no se sabe queda en null, nunca inventado.
  const suelto = texto.match(/(?:recibiste|abono de|consignaci[oó]n de)\s+\$?\s*([\d.,]+)/i);
  const monto = suelto ? montoDeTexto(suelto[1]!) : null;
  if (monto === null) return null;
  return { banco, monto, remitente: null, fechaTexto: null, bancoOrigen: null, recibidoEl: c.fecha };
}

export interface Cruce {
  pago: PagoAvisadoPorElBanco;
  /** Cuántos minutos antes del comprobante entró la plata. */
  minutosAntes: number;
  /** El monto coincide exactamente con lo que se esperaba cobrar. */
  montoExacto: boolean;
}

/**
 * Busca, entre los avisos del banco, cuál puede ser ESTE pago.
 *
 * `ventanaMin` es hacia atrás desde que llegó el comprobante: el cliente
 * transfiere y manda la captura enseguida, pero puede tardar. 90 minutos es
 * holgado sin llegar a barrer el día entero.
 *
 * Devuelve TODOS los candidatos ordenados por cercanía, no "el bueno": elegir
 * es del dueño. Cuando hay dos pagos iguales a la misma hora, esa ambigüedad
 * es real y esconderla sería lo peligroso.
 */
export function cruzarConElComprobante(
  avisos: PagoAvisadoPorElBanco[],
  ctx: { llegoElComprobante: Date; montoEsperado?: number | null; ventanaMin?: number },
): Cruce[] {
  const ventana = (ctx.ventanaMin ?? 90) * 60_000;
  const t = ctx.llegoElComprobante.getTime();

  return avisos
    .map((p) => ({
      pago: p,
      minutosAntes: Math.round((t - p.recibidoEl.getTime()) / 60_000),
      montoExacto: !!ctx.montoEsperado && p.monto === ctx.montoEsperado,
    }))
    // Solo lo que entró ANTES del comprobante y dentro de la ventana. Un aviso
    // posterior no puede ser el pago que el cliente ya dijo haber hecho.
    .filter((c) => t - c.pago.recibidoEl.getTime() >= -60_000 && t - c.pago.recibidoEl.getTime() <= ventana)
    .sort((a, b) => {
      if (a.montoExacto !== b.montoExacto) return a.montoExacto ? -1 : 1;
      return a.minutosAntes - b.minutosAntes;
    });
}

/**
 * Lo que se le escribe al dueño. Es una PREGUNTA, no un veredicto.
 *
 * El correo del banco dice cuánto entró y de quién, pero no qué compró esa
 * persona. Redactarlo como "pago confirmado" invitaría a aprobar sin mirar,
 * que es justo lo que este proceso viene a evitar.
 */
export function loQueSeLeDiceAlDueno(cruces: Cruce[], nombreDelCliente: string): string {
  if (cruces.length === 0) {
    return (
      "📬 *En tu correo NO aparece ningún pago reciente* que cuadre con este comprobante.\n" +
      "Puede que el banco todavía no haya avisado, o que la plata no haya entrado."
    );
  }

  const l = [`📬 *Tu correo dice que SÍ entró plata:*`];
  for (const c of cruces.slice(0, 3)) {
    const cuando = c.minutosAntes <= 1 ? "recién" : `hace ${c.minutosAntes} min`;
    const dequien = c.pago.remitente ? ` de *${c.pago.remitente}*` : "";
    const exacto = c.montoExacto ? " ✅ (el monto exacto)" : "";
    l.push(`• $${c.pago.monto.toLocaleString("es-CO")}${dequien}, ${cuando} por ${c.pago.banco}${exacto}`);
  }
  if (cruces.length > 3) l.push(`• y ${cruces.length - 3} más en la ventana`);

  l.push("");
  l.push(`¿Ese pago es el de *${nombreDelCliente}*? Si es así, aprobalo y se le entrega.`);
  return l.join("\n");
}
