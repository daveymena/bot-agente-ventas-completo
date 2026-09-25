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
  corregirDato,
  corregirForma,
  loQueSabeElVendedor,
} from "../lib/correcciones-del-dueno";

const router = Router();

/** Tope de la charla que se reenvía: igual que MENSAJES_DE_HISTORIAL del motor. */
const MAX_HISTORIAL = 40;

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

  try {
    const { correrEnSombra, cargarCatalogoDelNegocio } = await import("../lib/motor-nuevo/adaptador");
    const { armarCadena, crearClienteLLM } = await import("../lib/motor-nuevo/cliente-llm");
    const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId });

    const r = await correrEnSombra({ tenantId, turnos: [mensaje], estadoInicial: estado, historialPrevio: historial, llm });
    const turno = r.salida[0];
    if (turno?.error) {
      logger.warn({ tenantId, err: turno.error }, "[ProbarVendedor] el motor falló");
      return res.status(502).json({ error: `El vendedor no pudo responder: ${turno.error}` });
    }

    const catalogo = await cargarCatalogoDelNegocio(tenantId);
    const nombre = (id: number) => catalogo.find((p) => p.id === id)?.name ?? `Producto #${id}`;

    return res.json({
      texto: turno?.texto || "",
      tarjetas: (turno?.tarjetas || []).map((t: any) => ({ productId: t.productId, nombre: nombre(t.productId), seccion: t.seccion ?? null })),
      estado: r.estado,
      productoEnFoco: (r.estado as any)?.productoEnFoco ?? null,
      herramientas: turno?.herramientas || [],
      proveedor: turno?.proveedor || null,
    });
  } catch (e: any) {
    logger.error({ tenantId, err: e?.message }, "[ProbarVendedor] error");
    return res.status(500).json({ error: "No se pudo correr el vendedor" });
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
        : { ok: false, mensaje: 'tipo debe ser "dato" o "forma"' };
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

export default router;
