/**
 * ¿Este producto se puede COBRAR de verdad?
 *
 * El problema que resuelve, planteado por el admin el 2026-08-23 antes de
 * pautar: si un día cambian los enlaces o las credenciales, las respuestas que
 * prometen pago quedan mal y nadie se entera. Y con tráfico pagado eso es
 * peor que un bug: cada clic que se cobró muere en el cierre, que es donde
 * más caro sale perder al cliente.
 *
 * Nada de esto adivina. Se responde con lo que hay configurado:
 *  · MercadoPago y PayPal los genera el sistema en el momento (agent.ts:1029),
 *    así que alcanza con que las credenciales del NEGOCIO estén puestas.
 *  · `paymentLink` es un enlace fijo cargado a mano: se valida su forma, pero
 *    que sea una URL válida no garantiza que siga viva.
 *  · Transferencia necesita al menos una cuenta con número y titular.
 *  · Un producto FÍSICO se cobra contra entrega aunque no haya pasarela: el
 *    mensajero cobra. Por eso nunca es "no cobrable" por falta de pasarela.
 */
import type { CredencialesDePago } from "./tenant-payment-credentials";

export type ViaDeCobro = "mercadopago" | "paypal" | "enlace_propio" | "transferencia" | "contraentrega";

export interface ProductoCobrable {
  id: number;
  name: string;
  kind?: string | null;
  price?: string | number | null;
  paymentLink?: string | null;
}

export interface Cobrabilidad {
  cobrable: boolean;
  vias: ViaDeCobro[];
  /** Qué le impide cobrarse, en lenguaje que el dueño entienda. */
  problemas: string[];
}

/** Un enlace de pago cargado a mano tiene que ser al menos una URL http(s). */
export function enlaceDePagoValido(link: string | null | undefined): boolean {
  const l = String(link || "").trim();
  if (!l) return false;
  try {
    const u = new URL(l);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function evaluarCobrabilidad(
  producto: ProductoCobrable,
  cred: CredencialesDePago | null | undefined,
): Cobrabilidad {
  const vias: ViaDeCobro[] = [];
  const problemas: string[] = [];

  const esFisico = String(producto.kind || "digital") === "physical";
  const precio = Number(producto.price ?? 0);

  // Sin precio no hay nada que cobrar por ninguna vía. Va primero porque un
  // producto en $0 con MercadoPago configurado igual no se puede vender.
  if (!Number.isFinite(precio) || precio <= 0) {
    problemas.push("No tiene precio cargado.");
  }

  if (cred?.mercadopago?.enabled && cred.mercadopago.accessToken) vias.push("mercadopago");
  if (cred?.paypal?.enabled && cred.paypal.clientId && cred.paypal.clientSecret) vias.push("paypal");
  if (cred?.transfer?.enabled && (cred.transfer.accounts?.length ?? 0) > 0) vias.push("transferencia");

  if (producto.paymentLink) {
    if (enlaceDePagoValido(producto.paymentLink)) {
      vias.push("enlace_propio");
    } else {
      // Un enlace mal cargado es peor que ninguno: el bot lo manda igual y el
      // cliente cae en una página rota justo cuando iba a pagar.
      problemas.push("El enlace de pago cargado a mano no es una dirección web válida.");
    }
  }

  // El físico se paga al mensajero: no depende de ninguna pasarela.
  if (esFisico) vias.push("contraentrega");

  if (vias.length === 0) {
    problemas.push(
      esFisico
        ? "No hay forma de cobrarlo: ni pasarela, ni transferencia, ni enlace propio."
        : "Es digital y no hay ninguna pasarela, transferencia ni enlace de pago configurado.",
    );
  }

  // Aviso, no bloqueo: se cobra igual, pero conviene saberlo.
  if (cred && !cred.propias && vias.length > 0) {
    problemas.push("Está cobrando con las credenciales por defecto del servidor, no con las del negocio.");
  }

  const cobrable = vias.length > 0 && precio > 0;
  return { cobrable, vias, problemas };
}

/**
 * ¿Este producto se puede ENTREGAR?
 *
 * Cobrar y entregar son dos cosas distintas y fallan por separado. Un curso
 * con MercadoPago configurado pero sin link de entrega se cobra perfecto y
 * deja al cliente pagando por nada -- que es la peor forma de perderlo, porque
 * ya dio la plata.
 *
 * Solo aplica a lo digital: un producto físico se entrega por transportadora
 * y no necesita ningún enlace.
 */
export function evaluarEntregabilidad(
  producto: { kind?: string | null; deliveryLink?: string | null },
): { entregable: boolean; problemas: string[] } {
  const esFisico = String(producto.kind || "digital") === "physical";
  if (esFisico) return { entregable: true, problemas: [] };

  const link = String(producto.deliveryLink || "").trim();
  if (!link) {
    return { entregable: false, problemas: ["Es digital y no tiene link de entrega: el cliente paga y no recibe nada."] };
  }
  if (!enlaceDePagoValido(link)) {
    return { entregable: false, problemas: ["El link de entrega no es una dirección web válida."] };
  }
  return { entregable: true, problemas: [] };
}

/**
 * ¿Un cliente podría abrir este enlace?
 *
 * Se pide SIN cookies ni sesión, que es como lo va a abrir él. Comprobado con
 * Terabox el 2026-08-23: un share creado sin clave y sin vencimiento devuelve
 * 200 y muestra el contenido sin pedir login.
 *
 * Es una comprobación de alcance, no de contenido: que responda 200 no dice
 * que adentro esté el curso correcto. Eso lo tiene que mirar una persona.
 */
export async function linkAlcanzablePorElCliente(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number | null; detalle: string }> {
  if (!enlaceDePagoValido(url)) return { ok: false, status: null, detalle: "No es una dirección web válida." };
  try {
    const r = await fetchImpl(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    if (r.status >= 200 && r.status < 300) {
      return { ok: true, status: r.status, detalle: "Responde y no pide sesión." };
    }
    if (r.status === 401 || r.status === 403) {
      return { ok: false, status: r.status, detalle: "Pide permiso o sesión: el cliente no va a poder abrirlo." };
    }
    if (r.status === 404 || r.status === 410) {
      return { ok: false, status: r.status, detalle: "El enlace ya no existe." };
    }
    return { ok: false, status: r.status, detalle: `Respondió ${r.status}.` };
  } catch (e: any) {
    return { ok: false, status: null, detalle: `No se pudo abrir: ${e?.message || e}` };
  }
}

/** Resumen corto para el dueño: qué NO podría cobrar hoy si lo pauta. */
export function resumenDeCobrabilidad(
  evaluados: Array<{ producto: ProductoCobrable; resultado: Cobrabilidad }>,
): { total: number; cobrables: number; noCobrables: Array<{ id: number; name: string; problemas: string[] }> } {
  const noCobrables = evaluados
    .filter((e) => !e.resultado.cobrable)
    .map((e) => ({ id: e.producto.id, name: e.producto.name, problemas: e.resultado.problemas }));
  return {
    total: evaluados.length,
    cobrables: evaluados.length - noCobrables.length,
    noCobrables,
  };
}
