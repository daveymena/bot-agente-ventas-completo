/**
 * ============================================================
 * LEER EL COMPROBANTE — el modelo lee, el servidor coteja, el admin decide
 * ============================================================
 *
 * El admin lo pidió así el 2026-09-06: "el bot debería poder ver la fecha, el
 * monto, y si la transferencia dice mi nombre y mis datos, ya que tiene una IA
 * de visión". Y en la misma frase el límite: "además echa mentira diciendo que
 * los datos son tales cuando ni siquiera los lee".
 *
 * Las dos cosas son el mismo requisito. Lo que hace falta no es un modelo que
 * afirme más, es uno que DISTINGA lo que leyó de lo que no.
 *
 * ── Por qué `describirImagen` no alcanzaba ───────────────────────────────
 *
 * A ese se le pide CAUTELA a propósito, y con razón: el 2026-09-05 describió
 * una hoja de Excel como "un comprobante de transferencia con valor, fecha y
 * banco". Así que se le prohibió afirmar montos, fechas y números — y el
 * efecto colateral es que ahora no lee NADA, ni cuando el comprobante está
 * perfectamente legible.
 *
 * Acá se separan las dos preguntas, que nunca debieron ser una:
 *
 *   describirImagen   → ¿QUÉ TIPO de imagen es? (sigue igual, sigue cauta)
 *   leerComprobante   → ¿QUÉ DICE, campo por campo, y qué NO se pudo leer?
 *
 * ── La regla que evita la mentira ────────────────────────────────────────
 *
 * Cada campo puede ser `null`, y `null` significa "no lo leí". No es un hueco
 * a rellenar: es un dato, y viaja hasta el aviso del admin escrito con todas
 * las letras ("fecha: no se pudo leer"). Un campo que no se leyó nunca se
 * omite en silencio, porque omitirlo es exactamente lo que deja al admin
 * suponiendo que sí se leyó.
 *
 * ── Y el cotejo NO lo hace el modelo ─────────────────────────────────────
 *
 * El modelo no sabe cuál es la cuenta del negocio ni cuánto vale el producto:
 * eso lo sabe el servidor. El modelo transcribe; `cotejarComprobante` compara
 * contra `credencialesDe(tenant).transfer.accounts` y contra el precio real.
 *
 * Nada de esto aprueba un pago. La decisión sigue siendo del admin: esto le
 * pone delante lo que se leyó y lo que no cuadra, para que decida mirando
 * datos en vez de mirando una foto.
 */
import { logger } from "./logger";
import { getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { modelosDeVision } from "./media-entrante";
import type { CuentaTransferencia } from "./tenant-payment-credentials";

/** Lo que se pudo leer del comprobante. `null` en un campo = NO se leyó. */
export interface ComprobanteLeido {
  /** false si la imagen no parece un comprobante de pago. */
  esComprobante: boolean;
  /** Tal cual figura en la imagen, sin reinterpretar ("05/09/2026", "ayer 3:14 p.m."). */
  fecha: string | null;
  /** Solo el número, sin símbolo ni separadores: 60000. */
  monto: number | null;
  moneda: string | null;
  /** A nombre de quién se hizo la transferencia. */
  destinatario: string | null;
  /** El número de cuenta / celular al que se transfirió. */
  cuentaDestino: string | null;
  /** Quién la hizo, si figura. */
  remitente: string | null;
  banco: string | null;
  referencia: string | null;
  /** Qué campos el modelo dice no haber podido leer. Para el log. */
  noSeLeyo: string[];
}

const CAMPOS: Array<keyof ComprobanteLeido> = [
  "fecha", "monto", "moneda", "destinatario", "cuentaDestino", "remitente", "banco", "referencia",
];

const INSTRUCCION = [
  "Sos un lector de comprobantes de pago. Tu única tarea es TRANSCRIBIR lo que se ve.",
  "",
  "REGLA MÁS IMPORTANTE: si un dato no se lee con TOTAL claridad, poné null.",
  "null es una respuesta correcta y esperada. Inventar un dato es el peor error posible:",
  "con esto se decide si se le entrega un producto a alguien que quizá no pagó.",
  "NO deduzcas, NO completes, NO redondees. Si la imagen no es un comprobante de pago",
  "(una foto, un paisaje, una captura de otra cosa, una hoja de cálculo), poné",
  "esComprobante: false y TODO lo demás en null.",
  "",
  "Devolvé SOLO este JSON, sin texto alrededor y sin bloques de código:",
  "{",
  '  "esComprobante": true o false,',
  '  "fecha": la fecha tal cual figura, como texto, o null,',
  '  "monto": solo el número, sin símbolos ni puntos de miles (60000), o null,',
  '  "moneda": "COP", "USD", etc., o null,',
  '  "destinatario": a nombre de quién se transfirió, o null,',
  '  "cuentaDestino": el número de cuenta o celular de destino, solo dígitos, o null,',
  '  "remitente": quién hizo la transferencia, o null,',
  '  "banco": el banco o billetera (Nequi, Daviplata, Bancolombia...), o null,',
  '  "referencia": el número de referencia o comprobante, o null',
  "}",
].join("\n");

function aTexto(v: any): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (!t || /^(null|n\/a|no se lee|desconocido|-)$/i.test(t)) return null;
  return t.slice(0, 120);
}

function aNumero(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normaliza lo que devolvió el modelo. Nada entra sin revisar. */
export function normalizarComprobante(crudo: any): ComprobanteLeido | null {
  if (!crudo || typeof crudo !== "object") return null;

  const leido: ComprobanteLeido = {
    esComprobante: crudo.esComprobante === true,
    fecha: aTexto(crudo.fecha),
    monto: aNumero(crudo.monto),
    moneda: aTexto(crudo.moneda),
    destinatario: aTexto(crudo.destinatario),
    cuentaDestino: aTexto(crudo.cuentaDestino),
    remitente: aTexto(crudo.remitente),
    banco: aTexto(crudo.banco),
    referencia: aTexto(crudo.referencia),
    noSeLeyo: [],
  };

  // Si dice que no es un comprobante, NADA de lo demás se sostiene: un modelo
  // que ya se equivocó de tipo de imagen no es fuente para el monto.
  if (!leido.esComprobante) {
    for (const c of CAMPOS) (leido as any)[c] = null;
  }

  leido.noSeLeyo = CAMPOS.filter((c) => (leido as any)[c] === null);
  return leido;
}

/** Saca el JSON aunque venga envuelto en texto o en ```json. */
export function extraerJsonDelComprobante(bruto: string): any | null {
  const t = String(bruto || "").trim();
  if (!t) return null;
  const sinCerca = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const i = sinCerca.indexOf("{");
  const j = sinCerca.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(sinCerca.slice(i, j + 1));
  } catch {
    return null;
  }
}

/**
 * Lee el comprobante con el primer modelo de visión que conteste.
 *
 * Devuelve null si ninguno pudo verlo — y eso NO es "no hay datos en el
 * comprobante", es "no lo pudimos mirar". Quien llama tiene que decir
 * exactamente eso, no dar los campos por vacíos.
 */
export async function leerComprobante(
  imagen: Buffer,
  mime = "image/jpeg",
): Promise<ComprobanteLeido | null> {
  const b64 = imagen.toString("base64");

  for (const { proveedor, modelo } of modelosDeVision()) {
    const cfg = getProviderConfig(proveedor);
    if (!cfg?.apiKey) continue;
    try {
      const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: modelo,
          // Holgado por el mismo motivo que en media-entrante: los modelos de
          // razonamiento gastan el presupuesto en `reasoning_content` y
          // devuelven `content` vacío si se les aprieta.
          max_tokens: 900,
          temperature: 0,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: INSTRUCCION },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!r.ok) {
        logger.warn({ proveedor, modelo, status: r.status }, "[Comprobante] el modelo rechazó la imagen");
        continue;
      }
      const j: any = await r.json();
      const bruto = String(j?.choices?.[0]?.message?.content || "").trim();
      if (!bruto) {
        logger.warn({ proveedor, modelo }, "[Comprobante] el modelo contestó vacío: no ve imágenes");
        continue;
      }
      const leido = normalizarComprobante(extraerJsonDelComprobante(bruto));
      if (!leido) {
        logger.warn({ proveedor, modelo }, "[Comprobante] el modelo no devolvió JSON usable");
        continue;
      }
      logger.info(
        { proveedor, modelo, esComprobante: leido.esComprobante, noSeLeyo: leido.noSeLeyo },
        "[Comprobante] leído",
      );
      return leido;
    } catch (e: any) {
      logger.warn({ proveedor, modelo, err: e?.message }, "[Comprobante] falló el modelo de visión");
    }
  }
  return null;
}

export interface Cotejo {
  /** ✅ cuadra · ⚠️ no cuadra · ❔ no se pudo leer */
  marca: "✅" | "⚠️" | "❔";
  linea: string;
}

/** Solo dígitos, para comparar cuentas escritas de cualquier forma. */
const digitos = (v: string | null) => String(v || "").replace(/[^0-9]/g, "");

/** Sin tildes y en minúsculas, para comparar nombres. */
const plano = (v: string | null) =>
  String(v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * ¿El nombre leído es el del titular de la cuenta?
 *
 * Comparación por NOMBRES SUELTOS, no por cadena entera: los comprobantes
 * abrevian ("D. Mena", "DUVIER M."), tapan apellidos con asteriscos y cambian
 * el orden. Con que coincidan dos palabras de tres letras o más alcanza para
 * decir que se parece; menos que eso no se afirma.
 */
export function nombreSeParece(leido: string | null, titular: string | null): boolean {
  const a = plano(leido).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
  const b = plano(titular).split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
  if (a.length === 0 || b.length === 0) return false;
  const comunes = a.filter((p) => b.includes(p));
  return comunes.length >= Math.min(2, b.length);
}

/**
 * Compara lo leído contra lo que el servidor SÍ sabe: las cuentas del negocio
 * y el precio del producto.
 *
 * El modelo no participa de esto. Solo transcribió.
 */
export function cotejarComprobante(
  leido: ComprobanteLeido | null,
  esperado: { cuentas: CuentaTransferencia[]; monto?: number | null; moneda?: string | null },
): Cotejo[] {
  const out: Cotejo[] = [];

  if (!leido) {
    out.push({ marca: "❔", linea: "No se pudo leer la imagen: ningún modelo de visión respondió." });
    return out;
  }
  if (!leido.esComprobante) {
    out.push({ marca: "⚠️", linea: "La imagen NO parece un comprobante de pago." });
    return out;
  }

  // ── La cuenta de destino ────────────────────────────────────────────────
  const cuentas = esperado.cuentas || [];
  if (!leido.cuentaDestino) {
    out.push({ marca: "❔", linea: "Cuenta de destino: no se pudo leer." });
  } else if (cuentas.length === 0) {
    out.push({ marca: "❔", linea: `Cuenta de destino: ${leido.cuentaDestino} (el negocio no tiene cuentas cargadas para comparar).` });
  } else {
    const d = digitos(leido.cuentaDestino);
    const suya = cuentas.find((c) => {
      const n = digitos(c.number);
      return n.length >= 8 && d.length >= 8 && (n === d || n.endsWith(d) || d.endsWith(n));
    });
    out.push(suya
      ? { marca: "✅", linea: `Transferido a TU cuenta ${suya.type}: ${suya.number}` }
      : { marca: "⚠️", linea: `La cuenta de destino (${leido.cuentaDestino}) NO es ninguna de las tuyas.` });
  }

  // ── El titular ──────────────────────────────────────────────────────────
  if (!leido.destinatario) {
    out.push({ marca: "❔", linea: "A nombre de quién: no se pudo leer." });
  } else {
    const coincide = cuentas.some((c) => nombreSeParece(leido.destinatario, c.name));
    out.push(coincide
      ? { marca: "✅", linea: `A nombre de: ${leido.destinatario}` }
      : { marca: "⚠️", linea: `A nombre de "${leido.destinatario}", que no coincide con el titular de tus cuentas.` });
  }

  // ── El monto ────────────────────────────────────────────────────────────
  if (leido.monto === null) {
    out.push({ marca: "❔", linea: "Monto: no se pudo leer." });
  } else if (esperado.monto && esperado.monto > 0) {
    const dif = Math.abs(leido.monto - esperado.monto);
    out.push(dif === 0
      ? { marca: "✅", linea: `Monto: $${leido.monto.toLocaleString("es-CO")} (igual al precio)` }
      : { marca: "⚠️", linea: `Monto: $${leido.monto.toLocaleString("es-CO")} y el producto vale $${esperado.monto.toLocaleString("es-CO")} (faltan $${dif.toLocaleString("es-CO")})` });
  } else {
    out.push({ marca: "❔", linea: `Monto: $${leido.monto.toLocaleString("es-CO")} (sin precio de referencia para comparar).` });
  }

  // ── La fecha ────────────────────────────────────────────────────────────
  out.push(leido.fecha
    ? { marca: "✅", linea: `Fecha: ${leido.fecha}` }
    : { marca: "❔", linea: "Fecha: no se pudo leer." });

  if (leido.banco) out.push({ marca: "✅", linea: `Banco/billetera: ${leido.banco}` });
  if (leido.referencia) out.push({ marca: "✅", linea: `Referencia: ${leido.referencia}` });
  if (leido.remitente) out.push({ marca: "✅", linea: `Lo envía: ${leido.remitente}` });

  return out;
}

/**
 * El bloque que va dentro del aviso al admin.
 *
 * Se escribe SIEMPRE, incluso cuando no se leyó nada: el admin tiene que ver
 * la diferencia entre "revisado y cuadra" y "no se pudo revisar". Ese es el
 * punto entero de esto.
 */
export function bloqueDeLectura(cotejos: Cotejo[]): string {
  if (cotejos.length === 0) return "";
  const dudas = cotejos.filter((c) => c.marca === "⚠️").length;
  const titulo = dudas > 0
    ? `🔍 *LO QUE LEÍ — ${dudas} cosa${dudas === 1 ? "" : "s"} que no cuadra${dudas === 1 ? "" : "n"}*`
    : `🔍 *LO QUE LEÍ*`;
  return [titulo, ...cotejos.map((c) => `${c.marca} ${c.linea}`)].join("\n");
}
