/**
 * PROBAR VENDEDOR — el chat de prueba del dueño.
 *
 * El dueño le escribe al vendedor como si fuera un cliente. Responde el mismo
 * motor v2 que atiende WhatsApp (`correrEnSombra`), pero en memoria: no se crea
 * ninguna conversación ni se manda nada a nadie. Si una respuesta sale mal, se
 * corrige ahí mismo y la corrección aplica desde el próximo mensaje (ver
 * `lib/correcciones-del-dueno.ts`).
 *
 * Cliente: artifacts/ventas-pro/src/pages/probar-vendedor.tsx
 */

import { Router } from "express";
import type { TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import {
  borrarDato,
  borrarIndicacion,
  corregirComoCorresponde,
  corregirDato,
  corregirForma,
  editarDato,
  editarIndicacion,
  loQueSabeElVendedor,
} from "../lib/correcciones-del-dueno";

const router = Router();

/** Tope de la charla que se reenvía: igual que MENSAJES_DE_HISTORIAL del motor. */
const MAX_HISTORIAL = 40;

/** Las condiciones de envío y pago del negocio (las mismas que usa WhatsApp). */
async function condicionesDe(tenantId: number) {
  const { getBusinessContext } = await import("../lib/business-context");
  const { CONDICIONES_DE_RESPALDO } = await import("../lib/modelo-de-negocio");
  const negocio: any = await getBusinessContext(tenantId).catch(() => null);
  return negocio?.condiciones ?? CONDICIONES_DE_RESPALDO;
}

/**
 * Las partes del turno convertidas en los mensajes que recibe el cliente: la
 * ficha con su foto, precio, cuentas y video, con las MISMAS funciones del
 * envío real (`mensajesDeLaFicha`, `presentarParaWhatsApp`).
 *
 * Única diferencia a propósito: los links de MercadoPago/PayPal no se crean,
 * porque crearlos abre un cobro real en el proveedor. Si el negocio los tiene
 * configurados, se muestra dónde irían.
 */
async function mensajesComoEnWhatsApp(tenantId: number, partes: any[]) {
  const { mensajesDeLaFicha } = await import("../lib/whatsapp");
  const { presentarParaWhatsApp } = await import("../lib/presentacion");
  const { unirTextosSeguidos } = await import("../lib/una-sola-burbuja");
  const { PaymentGateway } = await import("../lib/payments");
  const { tenantManager } = await import("../lib/tenantManager");
  const { db, products } = await import("@workspace/db");
  const { and, eq, inArray } = await import("drizzle-orm");

  const juntas = unirTextosSeguidos(partes as any) as any[];
  const ids = juntas.filter((p) => p.kind === "card").map((p) => Number(p.productId));
  const filas = ids.length
    ? await db.select().from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, ids)))
    : [];
  const porId = new Map<number, any>(filas.map((f: any) => [f.id, f]));

  // El "cliente" de la prueba es del país del negocio: la moneda del precio sale
  // del teléfono del cliente (moneda-por-pais), y con una semilla sin número el
  // precio en pesos se mostraba convertido a dólares, cosa que por WhatsApp a un
  // cliente local no pasa. Sin teléfono del negocio, Colombia: los precios se
  // cargan en COP.
  const tenant: any = await tenantManager.getTenantById(tenantId).catch(() => null);
  const telefonoDePrueba = String(tenant?.contactPhone || "").replace(/\D/g, "") || "573000000000";

  let links: any = { transfer: { options: [] }, mercadopago: null, paypal: null };
  if (ids.length) {
    try {
      const pg: any = new PaymentGateway(tenant as any);
      const cfg = pg.config || {};
      const aqui = (proveedor: string) => ({ url: `[link de ${proveedor}: se genera al enviarlo por WhatsApp]` });
      links = {
        transfer: pg.getTransferInfo?.() || links.transfer,
        mercadopago: cfg.mercadoPagoAccessToken ? aqui("MercadoPago") : null,
        paypal: cfg.paypalClientId && cfg.paypalClientSecret ? aqui("PayPal") : null,
      };
    } catch (e: any) {
      logger.warn({ tenantId, err: e?.message }, "[ProbarVendedor] sin datos de pago para la vista previa");
    }
  }

  const salida: { imagen?: string; texto: string; productoId?: number; audio?: boolean }[] = [];
  for (const parte of juntas) {
    if (parte.kind === "voz") {
      // Nota de voz: se ve como audio; el texto es lo que dice (para escucharla
      // con /voz o leerla). Por WhatsApp sale solo en audio.
      salida.push({ audio: true, texto: String(parte.content || "") });
      continue;
    }
    if (parte.kind === "text") {
      const texto = presentarParaWhatsApp(String(parte.content || ""));
      if (texto.trim()) salida.push({ texto });
      continue;
    }
    const producto = porId.get(Number(parte.productId));
    if (!producto) continue;
    for (const m of await mensajesDeLaFicha(producto as any, parte, links, telefonoDePrueba)) {
      salida.push(m.imagen !== undefined ? { imagen: m.imagen, texto: m.texto, productoId: producto.id } : { texto: presentarParaWhatsApp(m.texto) });
    }
  }
  return salida;
}

/**
 * POST /api/probar-vendedor/mensaje
 * { mensaje, historial: [{role:"customer"|"agent", content}], estado? }
 * → { texto, tarjetas: [{productId, nombre, seccion}], estado, herramientas, proveedor }
 */
router.post("/mensaje", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });

  const mensaje = String(req.body?.mensaje || "").trim();
  if (!mensaje) return res.status(400).json({ error: "Mensaje vacío" });

  const historial = (Array.isArray(req.body?.historial) ? req.body.historial : [])
    .filter((m: any) => (m?.role === "customer" || m?.role === "agent") && typeof m?.content === "string")
    .slice(-MAX_HISTORIAL)
    .map((m: any) => ({ role: m.role, content: m.content }));
  const estado = req.body?.estado && typeof req.body.estado === "object" ? req.body.estado : undefined;
  const pedidoPrevio = req.body?.pedido && typeof req.body.pedido === "object" ? req.body.pedido : null;

  try {
    const { correrEnSombra, servicioDePedidosDePrueba } = await import("../lib/motor-nuevo/adaptador");
    const { armarCadena, crearClienteLLM } = await import("../lib/motor-nuevo/cliente-llm");
    const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId, timeoutMsPorDefecto: 60_000 });
    // Pedidos simulados: la lista de datos de envío y el resumen salen como por
    // WhatsApp, pero no se abre ni se despacha ningún pedido real.
    const pedidos = servicioDePedidosDePrueba({ condiciones: await condicionesDe(tenantId), inicial: pedidoPrevio });

    const r = await correrEnSombra({ tenantId, turnos: [mensaje], estadoInicial: estado, historialPrevio: historial, llm, pedidos: pedidos.servicio });
    const turno = r.salida[0];
    if (turno?.error) {
      logger.warn({ tenantId, err: turno.error }, "[ProbarVendedor] el motor falló");
      return res.status(502).json({ error: `El vendedor no pudo responder: ${turno.error}` });
    }

    const mensajes = await mensajesComoEnWhatsApp(tenantId, turno?.partes || []);

    // ── La revisión: qué de esta respuesta no se puede sostener ────────────
    // El dueño (09-10-2026): "que sí corrija y mejore, que no me responda eso
    // porque es mentira". Antes encontrar lo falso dependía de su ojo.
    let revision: any[] = [];
    let revisionEstado: "completada" | "no_disponible" = "no_disponible";
    try {
      const { revisarRespuesta } = await import("../lib/revisar-respuesta");
      const { db, products } = await import("@workspace/db");
      const { and, eq } = await import("drizzle-orm");
      const enFoco = Number((r.estado as any)?.productoEnFoco) || Number(mensajes.find((m) => m.productoId)?.productoId) || 0;
      const [producto] = enFoco
        ? await db.select().from(products).where(and(eq(products.id, enFoco), eq(products.tenantId, tenantId))).limit(1)
        : [];
      revision = revisarRespuesta({
        textos: mensajes.map((m) => m.texto),
        producto: producto ?? null,
        condiciones: await condicionesDe(tenantId),
      });
      revisionEstado = "completada";
    } catch (e: any) {
      logger.warn({ tenantId, err: e?.message }, "[ProbarVendedor] no se pudo revisar la respuesta");
    }

    return res.json({
      mensajes,
      revision,
      revisionEstado,
      textoParaHistorial: turno?.textoParaHistorial || turno?.texto || "",
      motor: "v2",
      texto: turno?.texto || "",
      estado: r.estado,
      pedido: pedidos.pedido(),
      productoEnFoco: (r.estado as any)?.productoEnFoco ?? null,
      herramientas: turno?.herramientas || [],
      proveedor: turno?.proveedor || null,
    });
  } catch (e: any) {
    logger.error({ tenantId, err: e?.message }, "[ProbarVendedor] error");
    return res.status(500).json({ error: "No se pudo correr el vendedor" });
  }
});

/**
 * POST /api/probar-vendedor/voz { texto } → la nota de voz en mp3, con la misma
 * voz y ritmo que salen por WhatsApp.
 */
router.post("/voz", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const texto = String(req.body?.texto || "").trim().slice(0, 700);
  if (!texto) return res.status(400).json({ error: "Sin texto" });
  try {
    const { hablar, vozParaGenero } = await import("../lib/voz-de-atlas");
    const audio = await hablar(texto, process.env.WHATSAPP_AUDIO_VOICE || vozParaGenero(null), "+0%");
    if (!audio) return res.status(502).json({ error: "No se pudo generar la voz" });
    res.setHeader("Content-Type", "audio/mpeg");
    return res.send(audio);
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[ProbarVendedor] voz");
    return res.status(502).json({ error: "No se pudo generar la voz" });
  }
});

/** GET /api/probar-vendedor/sabe → lo que el vendedor sabe hoy (para ver y deshacer). */
router.get("/sabe", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  return res.json(await loQueSabeElVendedor(tenantId));
});

/**
 * POST /api/probar-vendedor/corregir
 * { tipo: "dato", mensajeDelCliente, respuestaCorrecta, productId? }
 * { tipo: "forma", indicacion }
 */
router.post("/corregir", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const b = req.body || {};
  const r =
    b.tipo === "forma"
      ? await corregirForma(tenantId, b.indicacion)
      : b.tipo === "dato"
        ? await corregirDato(tenantId, {
            mensajeDelCliente: b.mensajeDelCliente,
            respuestaCorrecta: b.respuestaCorrecta,
            productId: Number(b.productId) || null,
          })
        : // Sin tipo: la IA decide si es una regla de cómo vender o un dato.
          await corregirComoCorresponde(tenantId, {
            correccion: b.correccion,
            mensajeDelCliente: b.mensajeDelCliente,
            respuestaBot: b.respuestaBot,
            productId: Number(b.productId) || null,
          });
  logger.info({ tenantId, tipo: b.tipo, ok: r.ok }, "[ProbarVendedor] corrección");
  return res.status(r.ok ? 200 : 400).json(r);
});

/** DELETE /api/probar-vendedor/dato/:id  y  /indicacion/:indice → deshacer. */
router.delete("/dato/:id", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, mensaje: "id inválido" });
  return res.json(await borrarDato(tenantId, id));
});

router.delete("/indicacion/:indice", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const indice = Number(req.params.indice);
  if (!Number.isInteger(indice) || indice < 0) return res.status(400).json({ ok: false, mensaje: "índice inválido" });
  const r = await borrarIndicacion(tenantId, indice);
  return res.status(r.ok ? 200 : 400).json(r);
});

/** PUT /api/probar-vendedor/dato/:id { respuesta } → editar respuesta del negocio. */
router.put("/dato/:id", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ ok: false, mensaje: "id inválido" });
  const r = await editarDato(tenantId, id, String(req.body?.respuesta ?? req.body?.texto ?? ""));
  return res.status(r.ok ? 200 : 400).json(r);
});

/** PUT /api/probar-vendedor/indicacion/:indice { indicacion } → editar regla. */
router.put("/indicacion/:indice", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const indice = Number(req.params.indice);
  if (!Number.isInteger(indice) || indice < 0) return res.status(400).json({ ok: false, mensaje: "índice inválido" });
  const r = await editarIndicacion(tenantId, indice, String(req.body?.indicacion ?? req.body?.texto ?? ""));
  return res.status(r.ok ? 200 : 400).json(r);
});

/* ── Aprender de un ejemplo (ver lib/aprender-de-ejemplo.ts) ──────────────── */

/** Tope del archivo: un README de conversación no pasa de unas páginas. */
const MAX_EJEMPLO = 30_000;

/** POST /api/probar-vendedor/ejemplo/analizar { texto } → comparación + propuestas. */
router.post("/ejemplo/analizar", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const texto = String(req.body?.texto || "");
  if (!texto.trim()) return res.status(400).json({ ok: false, mensaje: "El archivo está vacío." });
  if (texto.length > MAX_EJEMPLO) return res.status(400).json({ ok: false, mensaje: "El archivo es muy largo: sube solo la conversación." });
  try {
    const { analizarEjemplo } = await import("../lib/aprender-de-ejemplo");
    const r: any = await analizarEjemplo(tenantId, texto);
    if (r.ok) {
      // "Hoy" se muestra como le llega al cliente: la ficha con foto, precio…
      const hoy: any[] = [];
      for (const t of r.partesHoy) {
        hoy.push({ role: "customer", content: t.mensaje });
        hoy.push({ role: "agent", burbujas: await mensajesComoEnWhatsApp(tenantId, t.partes) });
      }
      r.hoy = hoy;
      delete r.partesHoy;
    }
    return res.status(r.ok ? 200 : 400).json(r);
  } catch (e: any) {
    logger.error({ tenantId, err: e?.message }, "[AprenderDeEjemplo] error");
    return res.status(500).json({ ok: false, mensaje: "No se pudo analizar el ejemplo." });
  }
});

/**
 * POST /api/probar-vendedor/ejemplo/aplicar { propuestas: [{tipo, texto, pregunta?, productoId?}] }
 * Solo forma y dato se aplican; cada una con el mismo camino que "Corregir".
 */
router.post("/ejemplo/aplicar", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const lista: any[] = Array.isArray(req.body?.propuestas) ? req.body.propuestas.slice(0, 20) : [];
  const resultados: { texto: string; ok: boolean; mensaje: string }[] = [];
  for (const p of lista) {
    const texto = String(p?.texto || "");
    // Una por una y en orden: cada forma se suma a las indicaciones que dejó la anterior.
    const r =
      p?.tipo === "forma"
        ? await corregirForma(tenantId, texto)
        : p?.tipo === "dato"
          ? await corregirDato(tenantId, { mensajeDelCliente: String(p.pregunta || ""), respuestaCorrecta: texto, productId: Number(p.productoId) || null })
          : { ok: false, mensaje: "Esta propuesta es solo informativa." };
    resultados.push({ texto, ...r });
  }
  logger.info({ tenantId, aplicadas: resultados.filter((r) => r.ok).length, total: resultados.length }, "[AprenderDeEjemplo] aplicar");
  return res.json({ resultados });
});

/** POST /api/probar-vendedor/ejemplo/probar { turnos: string[] } → cómo responde ahora. */
router.post("/ejemplo/probar", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ error: "Sin sesión" });
  const { MAX_TURNOS_DE_CLIENTE } = await import("../lib/aprender-de-ejemplo");
  const turnos = (Array.isArray(req.body?.turnos) ? req.body.turnos : []).map((t: any) => String(t || "")).filter(Boolean).slice(0, MAX_TURNOS_DE_CLIENTE);
  if (!turnos.length) return res.status(400).json({ ok: false, mensaje: "No hay mensajes para probar." });
  try {
    const { correrEnSombra, servicioDePedidosDePrueba } = await import("../lib/motor-nuevo/adaptador");
    const { armarCadena, crearClienteLLM } = await import("../lib/motor-nuevo/cliente-llm");
    const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId });
    const pedidos = servicioDePedidosDePrueba({ condiciones: await condicionesDe(tenantId) });
    const r = await correrEnSombra({ tenantId, turnos, llm, pedidos: pedidos.servicio });
    const conversacion: { role: string; content?: string; burbujas?: any[] }[] = [];
    for (const s of r.salida as any[]) {
      conversacion.push({ role: "customer", content: s.mensaje });
      conversacion.push({ role: "agent", burbujas: await mensajesComoEnWhatsApp(tenantId, s.partes || []) });
    }
    return res.json({ ok: true, conversacion });
  } catch (e: any) {
    logger.error({ tenantId, err: e?.message }, "[AprenderDeEjemplo] probar");
    return res.status(500).json({ ok: false, mensaje: "No se pudo probar." });
  }
});

export default router;
