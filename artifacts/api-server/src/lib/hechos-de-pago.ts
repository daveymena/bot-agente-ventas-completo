/**
 * ============================================================
 * LOS MEDIOS DE PAGO, COMO HECHOS
 * ============================================================
 *
 * Primera pieza de la "hoja de hechos": el servidor arma la lista de lo que
 * ESTE negocio de verdad tiene configurado, y quien responda elige de ahí. El
 * modelo señala; no escribe números de cuenta.
 *
 * ── Los dos defectos que cierra ──────────────────────────────────────────
 *
 * 1. SIEMPRE EL PRIMERO. Todo el código de pagos usaba
 *    `transfer.options[0]`, en los tres sitios. Si el negocio tiene Nequi Y
 *    Daviplata cargados y el cliente pide Daviplata, le llegaba el número de
 *    Nequi. Es plata yendo a la cuenta equivocada, o un cliente trabado justo
 *    cuando iba a pagar.
 *
 * 2. EL MODELO SE INVENTA EL MECANISMO. Medido contra producción el
 *    2026-09-02, con el cliente pidiendo pagar por Nequi:
 *
 *      "💳 Para que te llegue el LINK DE PAGO POR NEQUI, necesito que me
 *       confirmes estos datos: 1️⃣ Tu nombre..."
 *
 *    Un "link de pago por Nequi" no existe -- Nequi es una transferencia a un
 *    número de celular. Se lo inventó, pidió datos personales que no hacen
 *    falta, y NO dio el número, que era lo único que ese cliente necesitaba.
 *
 *    La sección que renderiza el número exacto ya existía y no se usó.
 *
 * ── Por qué esto lo cierra de raíz ───────────────────────────────────────
 *
 * Un medio de pago deja de ser prosa y pasa a ser un dato con nombre. El que
 * responde puede elegir cuáles entran, pero no puede inventarse uno: si
 * Daviplata no está configurado, no está en la lista, y no hay nada que
 * señalar. Deja de ser "el modelo escribe y después verificamos" y pasa a ser
 * "el modelo elige de lo que hay".
 */

export interface MedioDePago {
  /** Identificador estable: "nequi", "daviplata", "tarjeta", "paypal". */
  clave: string;
  /** Como se le dice al cliente. */
  etiqueta: string;
  tipo: "transferencia" | "link";
  /** Para transferencias. */
  numero?: string;
  titular?: string;
  /** Para pasarelas. */
  url?: string;
}

const N = (s: unknown) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** El nombre bonito de una cuenta, a partir de su tipo. */
function etiquetaDeCuenta(tipo: string): string {
  const t = N(tipo);
  if (t.includes("nequi")) return "Nequi";
  if (t.includes("davi")) return "Daviplata";
  if (t.includes("bancolombia")) return "Bancolombia";
  if (t.includes("nu")) return "Nu";
  if (t.includes("banco") || t.includes("cuenta")) return "Transferencia bancaria";
  return tipo ? String(tipo) : "Transferencia";
}

export interface EntradaMedios {
  /** Lo que devuelve el motor de pagos. */
  dynamicLinks?: any;
  /** false para monedas/países donde las pasarelas locales no aplican. */
  aceptaPagosLocales?: boolean;
  /** Cambia la etiqueta de PayPal. */
  esColombia?: boolean;
}

/**
 * Todo lo que este negocio tiene para cobrar. Nada más.
 *
 * ⚠️ Se recorren TODAS las cuentas, no `options[0]`.
 */
export function mediosDePago(e: EntradaMedios): MedioDePago[] {
  const d = e.dynamicLinks || {};
  const corto = (m: any) => String(m?.shortUrl || m?.url || "").trim();
  const medios: MedioDePago[] = [];

  const mp = corto(d.mercadopago);
  if (e.aceptaPagosLocales !== false && mp) {
    medios.push({ clave: "tarjeta", etiqueta: "Tarjeta / PSE", tipo: "link", url: mp });
  }
  const pp = corto(d.paypal);
  if (pp) {
    medios.push({
      clave: "paypal",
      etiqueta: e.esColombia === false ? "Tarjeta o PayPal" : "PayPal",
      tipo: "link",
      url: pp,
    });
  }

  if (e.aceptaPagosLocales !== false) {
    const cuentas = Array.isArray(d?.transfer?.options) ? d.transfer.options : [];
    for (const c of cuentas) {
      const numero = String(c?.number || "").trim();
      if (!numero) continue;
      const etiqueta = etiquetaDeCuenta(String(c?.type || ""));
      medios.push({
        clave: N(etiqueta).replace(/[^a-z0-9]+/g, "") || "transferencia",
        etiqueta,
        tipo: "transferencia",
        numero,
        titular: String(c?.name || "").trim() || undefined,
      });
    }
  }
  return medios;
}

/** Cómo nombra la gente cada medio. */
const COMO_LO_PIDEN: Array<{ prueba: RegExp; claves: string[] }> = [
  { prueba: /\bnequi\b/, claves: ["nequi"] },
  { prueba: /\bdavi\w*\b/, claves: ["daviplata"] },
  { prueba: /\bbancolombia\b/, claves: ["bancolombia"] },
  { prueba: /\bpaypal\b/, claves: ["paypal"] },
  { prueba: /\b(tarjeta|credito|debito|pse|mercado\s?pago)\b/, claves: ["tarjeta", "paypal"] },
  // Genéricos: cubren TODAS las de su clase.
  //
  // ⚠️ Por RAÍZ, no por palabra entera. La primera versión listaba
  // "consignar|consignacion" y se le escapó "te consigno" -- que es como lo
  // dice la gente de verdad. Es el mismo error que costó el día de hoy en
  // media docena de listas: el español conjuga, y una lista de infinitivos
  // siempre va un caso por detrás.
  { prueba: /\b(transfer\w*|consign\w*|deposit\w*|giro|gira\w*)\b/, claves: ["__transferencias"] },
];

export interface LoPedido {
  /** Los medios que corresponde mandar. Vacío = no pidió ninguno concreto. */
  pedidos: MedioDePago[];
  /** Nombró un medio que este negocio NO tiene. Para poder decirlo. */
  noConfigurado: string | null;
}

/**
 * Qué medio pidió el cliente.
 *
 * Si no nombró ninguno, `pedidos` viene vacío y corresponde mandarlos todos --
 * esa decisión es de quien llama, no de acá.
 */
export function loQuePidio(mensaje: string, medios: MedioDePago[]): LoPedido {
  const m = N(mensaje);
  for (const { prueba, claves } of COMO_LO_PIDEN) {
    if (!prueba.test(m)) continue;

    if (claves[0] === "__transferencias") {
      const t = medios.filter((x) => x.tipo === "transferencia");
      return { pedidos: t, noConfigurado: t.length ? null : "transferencia" };
    }
    const encontrados = medios.filter((x) => claves.includes(x.clave));
    if (encontrados.length > 0) return { pedidos: encontrados, noConfigurado: null };

    // Lo nombró y no lo tenemos. Se dice, no se calla ni se sustituye por otro.
    const comoLoLlamo = claves[0] === "tarjeta" ? "tarjeta" : claves[0];
    return { pedidos: [], noConfigurado: comoLoLlamo };
  }
  return { pedidos: [], noConfigurado: null };
}

/**
 * El mensaje, escrito por el SERVIDOR.
 *
 * Un emoji por línea y el mismo formato siempre: el cliente aprende dónde
 * mirar. El número y el enlace salen de la configuración del negocio, nunca
 * de lo que el modelo haya escrito.
 */
export function renderMediosDePago(
  medios: MedioDePago[],
  precioTexto: string,
  cierre?: string,
): string {
  const L: string[] = [];
  if (precioTexto) {
    L.push(`💰 *${precioTexto}*`, "");
  }
  for (const m of medios) {
    if (m.tipo === "link") {
      L.push(`🔹 *${m.etiqueta}:*`, m.url || "", "");
    } else {
      L.push(`🔹 *${m.etiqueta}:*`, `📱 ${m.numero}`);
      if (m.titular) L.push(`👤 ${m.titular}`);
      L.push("");
    }
  }
  if (cierre) L.push(cierre);
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Lo que se dice cuando pidió un medio que el negocio no tiene. */
export function noManejamosEse(pedido: string, medios: MedioDePago[]): string {
  const nombres = medios.map((m) => m.etiqueta);
  if (nombres.length === 0) {
    return `Por ${pedido} no estoy manejando pagos ahora mismo 🙏 Déjame confirmarte cómo hacemos y te aviso.`;
  }
  const lista =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return `Por ${pedido} no manejo pagos 🙏 Pero sí por ${lista}. ¿Cuál te queda mejor?`;
}
