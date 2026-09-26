/**
 * ADAPTADOR: EL MOTOR NUEVO CONECTADO AL SISTEMA REAL
 * ===================================================
 *
 * `motor.ts` no sabe nada de la base ni del proveedor de IA: recibe un
 * cliente, un catálogo, un guion y una voz. Acá se construyen esas piezas con
 * lo que YA existe en el repo, sin reimplementar nada:
 *
 *   · el catálogo          `products` del tenant (con el video leído del
 *                          metadata igual que lo hace el render de la ficha)
 *   · la voz               el agente activo + el perfil del negocio
 *   · el guion             `business-context` + `hechos-de-pago` + `nicho.ts`
 *   · el conocimiento      `product_knowledge`, lo que cargó el dueño
 *   · la memoria           `conversations.estado_agente` (jsonb / text)
 *
 * Todo lo que escribe en la base pasa por las mismas funciones que usa el
 * motor viejo (`saveAgentMessage`, `avisarAlDueno`): el día que el motor nuevo
 * reemplace al viejo, el inbox, los avisos y los reportes siguen funcionando
 * igual. Que cambie el cerebro no puede cambiar el resto del cuerpo.
 */

import { and, desc, eq } from "drizzle-orm";
import {
  db,
  pool,
  agents,
  conversations,
  leads,
  messages,
  products,
  productKnowledge,
  tenants,
} from "@workspace/db";
import { getBusinessContext } from "../business-context";
import { mediosDePago } from "../hechos-de-pago";
import { PaymentGateway } from "../payments";
import { videoDeProducto } from "../video-de-producto";
import { saveAgentMessage } from "../conversation-engine";
import { dbNow } from "../date-utils";
import { logger } from "../logger";
import { crearRepositorioDrizzle, type EstadoConversacion, type RepositorioEstado } from "./estado-conversacion";
import type { ItemDeConocimiento, Producto, ServicioDePedidos } from "./herramientas";
import { guionDelNegocio, type GuionDelNegocio, type NegocioParaNicho } from "./nicho";
import { crearClienteLLM, armarCadena, type ClienteLLM } from "./cliente-llm";
import { responder, type Mensaje, type VozDelNegocio } from "./motor";

/* ────────────────────────────────────────────────────────────────────────────
 * CARGA
 * ──────────────────────────────────────────────────────────────────────────── */

/** Productos activos del negocio, en la forma que espera el motor. */
export async function cargarCatalogoDelNegocio(tenantId: number): Promise<Producto[]> {
  const filas = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))
    // Orden estable y tope holgado: con `limit(200)` sin orden, en un
    // catálogo grande quedaban afuera productos al azar y `buscar_en_catalogo`
    // (que busca sobre esta lista) decía que no existían.
    .orderBy(desc(products.id))
    .limit(1000);

  return filas.map((p: any) => {
    let videoUrl: string | null = null;
    try {
      videoUrl = videoDeProducto(p.metadata) || null;
    } catch {
      videoUrl = null;
    }

    let opciones: string[] | null = null;
    try {
      const crudas = Array.isArray(p.opciones) ? p.opciones : p.opciones ? JSON.parse(String(p.opciones)) : null;
      if (Array.isArray(crudas)) {
        // {nombre:"Talla", valores:["S","M"]} → "S", "M". Antes quedaba solo
        // "Talla" y el vendedor no tenía contra qué preguntar ni validar.
        opciones = crudas
          .flatMap((o: any) =>
            Array.isArray(o?.valores) && o.valores.length
              ? o.valores.map((v: any) => String(v).trim())
              : [String(o?.nombre || o?.name || o?.valor || o?.value || o || "").trim()],
          )
          .filter(Boolean);
      }
    } catch {
      opciones = null;
    }

    const precio = p.price != null && Number.isFinite(Number(p.price)) ? Number(p.price) : null;
    const stock = p.stock != null && Number.isFinite(Number(p.stock)) ? Number(p.stock) : null;

    return {
      id: p.id,
      name: String(p.name || ""),
      description: p.description ? String(p.description) : null,
      price: precio,
      currency: p.currency || "COP",
      kind: p.kind || "digital",
      categoria: p.category ?? null,
      opciones,
      videoUrl,
      disponible: true,
      stock,
    };
  });
}

/** Los medios de pago REALES del negocio. Si no hay ninguno, la lista es vacía. */
export async function cargarMediosDePago(tenantId: number): Promise<{ etiqueta: string; tipo: "transferencia" | "link" }[]> {
  try {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return [];
    const pg = new PaymentGateway(tenant as any);
    const info = (pg as any).getTransferInfo?.() || { options: [] };
    return mediosDePago({ dynamicLinks: { transfer: info } });
  } catch (e: any) {
    // Sin medios de pago el agente avisa que los confirma: nunca inventa uno.
    logger.warn({ err: e?.message, tenantId }, "[MotorV2] no se pudieron leer los medios de pago");
    return [];
  }
}

/** El guion de ventas derivado del negocio. Ver `nicho.ts`. */
export async function cargarGuion(tenantId: number, catalogo: Producto[], productoEnFoco?: number | null): Promise<GuionDelNegocio> {
  const ctx = await getBusinessContext(tenantId);
  const medios = await cargarMediosDePago(tenantId);
  // FASE 4 contraentrega: vive en condiciones.pagoEnvio, no en PaymentGateway.
  // Si el dueño la configuró, es un medio real y el cierre puede ofrecerlo.
  try {
    const pagoEnvio = String((ctx.condiciones as any)?.pagoEnvio || "");
    if (/contra\s*entrega/i.test(pagoEnvio) && !medios.some((m) => /contra/i.test(m.etiqueta))) {
      medios.push({ etiqueta: "Contraentrega", tipo: "transferencia" });
    }
  } catch {
    /* no crítico */
  }

  const negocio: NegocioParaNicho = {
    nombre: ctx.businessName || null,
    agente: ctx.agentName || null,
    nicho: ctx.nicho,
    descripcion: ctx.descripcion,
    cobertura: ctx.cobertura,
    horario: ctx.horario,
    entrega: ctx.entrega,
    garantia: ctx.garantia,
    acceso: ctx.acceso,
    tono: ctx.tono,
    noPuede: ctx.noPuede,
    loQueDebeSaber: ctx.loQueDebeSaber,
    modoCatalogo: ctx.modoCatalogo,
    condiciones: ctx.condiciones
      ? {
          pais: (ctx.condiciones as any).pais ?? null,
          envio: (ctx.condiciones as any).envio ?? null,
          costoEnvio: (ctx.condiciones as any).costoEnvio ?? null,
          pagoEnvio: (ctx.condiciones as any).pagoEnvio ?? null,
          agenda: (ctx.condiciones as any).agenda ?? null,
        }
      : null,
    negociaPrecio: ctx.negociaPrecio,
  };

  const enFoco = productoEnFoco != null ? catalogo.find((p) => p.id === productoEnFoco) : null;

  return guionDelNegocio({ catalogo, negocio, medios, productoEnFoco: enFoco ?? null });
}

/** Lo que el dueño cargó como respuestas. */
export async function cargarConocimiento(tenantId: number): Promise<ItemDeConocimiento[]> {
  try {
    const filas = await db
      .select()
      .from(productKnowledge)
      .where(eq(productKnowledge.tenantId, tenantId))
      .limit(300);

    return filas.map((k: any) => ({
      productId: k.productId ?? null,
      pregunta: String(k.pregunta || ""),
      disparadores: String(k.disparadores || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      respuesta: k.respuesta ? String(k.respuesta) : null,
    }));
  } catch (e: any) {
    logger.warn({ err: e?.message, tenantId }, "[MotorV2] no se pudo leer el conocimiento del negocio");
    return [];
  }
}

/**
 * QUIÉN ATIENDE esta conversación: el mismo enrutador del motor viejo
 * (`agent-router.ts`): continuidad por conversación, traspaso de la
 * recepcionista al especialista y enrutado por el tipo de producto que pide
 * el cliente.
 *
 * Hasta el 23-09-2026 el motor v2 no lo llamaba: tomaba el nombre del PRIMER
 * agente activo (en cualquier orden) y el catálogo entero. Todo lo que Atlas
 * configuraba al crear un agente -- especialidad, indicaciones, traspaso -- no
 * llegaba al vendedor que atiende WhatsApp, y Atlas le decía al dueño "el
 * sistema ya lo enruta automáticamente".
 */
export async function agenteQueAtiende(conversationId: number, tenantId: number, mensaje: string): Promise<any | null> {
  try {
    const { getActiveAgent } = await import("../agent-router");
    return (await getActiveAgent(mensaje || "", conversationId, tenantId)) || null;
  } catch (e: any) {
    logger.warn({ err: e?.message, conversationId }, "[MotorV2] no se pudo elegir el agente: se usa la voz general del negocio");
    return null;
  }
}

/**
 * El producto del anuncio por el que llegó el cliente, o null. Usa la misma
 * escalera del motor viejo (`productoDelAnuncio`: adId contra
 * facebook_drafts → link con id → slug) y, si ninguna resuelve, el titular
 * del anuncio contra el catálogo: un titular de Atlas nombra el producto.
 */
export async function productoDelAnuncioDeLaConversacion(
  conversationId: number,
  catalogo: Producto[],
): Promise<Producto | null> {
  try {
    const filas = await db
      .select({ role: messages.role, metadata: messages.metadata, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(40);
    const { anuncioDeOrigen, productoDelAnuncio } = await import("../agent");
    const anuncio = anuncioDeOrigen(filas.reverse() as any);
    if (!anuncio) return null;
    const duro = await productoDelAnuncio(anuncio, catalogo as any);
    if (duro) return catalogo.find((p) => p.id === duro.id) ?? null;
    const titular = `${anuncio.titulo} ${anuncio.cuerpo}`.trim();
    if (!titular) return null;
    // 1. El titular trae el nombre EXACTO del producto (así los arma Atlas):
    //    es ese, sin puntajes. Simulación del 25-09-2026: "Corrector de
    //    Hombros y Clavícula" empataba con otros correctores porque sus
    //    DESCRIPCIONES hablan de hombros y espalda, y el cliente del anuncio
    //    recibía "¿qué producto te interesa?".
    const plano = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim();
    const tit = ` ${plano(titular)} `;
    const exactos = catalogo
      .filter((p) => p.disponible !== false && plano(p.name).length >= 6 && tit.includes(` ${plano(p.name)} `))
      .sort((a, b) => plano(b.name).length - plano(a.name).length);
    if (exactos.length) return exactos[0];
    // 2. Parecido contra los NOMBRES; recién después, con descripciones.
    const { puntuarCoincidencias } = await import("./herramientas");
    const soloNombres = catalogo.map((p) => ({ ...p, description: "", categoria: "" } as Producto));
    const [n1, n2] = puntuarCoincidencias(titular, soloNombres, 2);
    if (n1 && (!n2 || n1.puntos > n2.puntos * 1.5)) return catalogo.find((p) => p.id === n1.p.id) ?? null;
    const [primero, segundo] = puntuarCoincidencias(titular, catalogo, 2);
    // Solo si gana claro: con un empate es adivinar, y un producto
    // equivocado en foco es peor que preguntar.
    if (primero && (!segundo || primero.puntos > segundo.puntos * 1.5)) return primero.p;
    return null;
  } catch (e: any) {
    logger.warn({ err: e?.message, conversationId }, "[MotorV2] no se pudo leer el anuncio de origen");
    return null;
  }
}

/**
 * Los productos que le tocan a la especialidad del agente: el de dropshipping
 * ve lo físico, el digital ve lo que no es físico. Sin especialidad, o si el
 * filtro dejara el catálogo vacío, se ve todo: un vendedor sin productos es
 * peor que uno con productos de más.
 *
 * Y SOLO se filtra si otro agente activo cubre la otra especialidad. Medido
 * con la simulación del 23-09-2026: con una sola agente "digital" en el
 * negocio, el corrector (físico) desaparecía, la agente dijo "correctores no
 * manejamos" y terminó vendiendo un curso de bicicletas. Si nadie más vende
 * lo físico, lo físico lo vende el que está.
 */
export function catalogoDeLaEspecialidad(
  catalogo: Producto[],
  especialidad: string | null | undefined,
  especialidadesActivas: string[] = ["digital", "dropshipping"],
): Producto[] {
  const e = String(especialidad || "").toLowerCase();
  if (e !== "digital" && e !== "dropshipping") return catalogo;
  const otra = e === "digital" ? "dropshipping" : "digital";
  if (!especialidadesActivas.map((x) => String(x || "").toLowerCase()).includes(otra)) return catalogo;
  const esFisico = (p: Producto) => String(p.kind || "digital") === "physical";
  const suyos = catalogo.filter((p) => (e === "dropshipping" ? esFisico(p) : !esFisico(p)));
  return suyos.length ? suyos : catalogo;
}

/**
 * La voz: el agente que atiende y lo que el dueño escribió.
 *
 * Nombre: con un solo agente activo manda el nombre del perfil del negocio
 * (el dueño lo eligió); con varios, el de cada agente -- si no, la
 * recepcionista y el especialista se presentan con el mismo nombre.
 *
 * Indicaciones: el tono general del negocio + las indicaciones propias del
 * agente (`agents.metadata.indicaciones`, las escribe Atlas al crearlo). NO
 * se usa `agents.systemPrompt`: es la plantilla larga del motor viejo, con
 * reglas que chocan con las de este motor (fichas [CARD], "Google Drive").
 */
export async function cargarVozDelNegocio(tenantId: number, elegido?: any | null): Promise<VozDelNegocio> {
  const ctx = await getBusinessContext(tenantId);
  let activos: any[] = [];
  try {
    activos = await db.select().from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true))).limit(20);
  } catch {
    activos = [];
  }
  const agente = elegido || activos[0] || null;
  const varios = activos.length > 1;

  const meta = typeof agente?.metadata === "string" ? (() => { try { return JSON.parse(agente.metadata); } catch { return {}; } })() : agente?.metadata || {};
  const indicaciones = [ctx.tono, typeof meta?.indicaciones === "string" ? meta.indicaciones.trim() : ""].filter(Boolean).join("\n");

  return {
    nombreAgente: (varios ? agente?.name || ctx.agentName : ctx.agentName || agente?.name) || "Asesor",
    rolAgente: agente?.role || "asesor comercial",
    nombreNegocio: ctx.businessName || "nuestro equipo",
    instruccionesExtra: indicaciones || null,
    pais: (ctx.condiciones as any)?.pais ?? null,
  };
}

/**
 * El historial, en orden, con el último mensaje del cliente al final.
 *
 * ⚠️ El `limit` va DESPUÉS de ordenar y NO ANTES: con `orderBy(asc)` +
 * `limit(60)` la base devuelve los 60 mensajes MÁS VIEJOS, así que una
 * conversación larga se quedaba sin su final -- justo lo que el agente
 * necesita para no repetirse. Se traen los últimos de la charla.
 */
export async function cargarHistorial(conversationId: number, limite = 60): Promise<Mensaje[]> {
  // Los 500 MÁS RECIENTES, después vueltos a orden cronológico. Con
  // `asc + limit` una charla de más de 500 mensajes traía los 500 primeros y
  // el agente contestaba leyendo la conversación de hace semanas.
  const filas = (
    await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(500)
  ).reverse();

  return filas
    .filter((m: any) => m.role === "customer" || m.role === "agent")
    .slice(-Math.max(1, limite))
    .map((m: any) => ({
      role: m.role === "customer" ? ("customer" as const) : ("agent" as const),
      content: conCita(m),
      createdAt: m.createdAt,
    }));
}

/**
 * Si el cliente respondió CITANDO un mensaje (una ficha, una pregunta), el
 * modelo tiene que verlo: "me interesa este" sin la cita no dice cuál. La
 * primera línea de una ficha es el nombre del producto, así que alcanza con
 * mostrarle el comienzo de lo citado.
 */
function conCita(m: any): string {
  const texto = String(m.content || "");
  if (m.role !== "customer") return texto;
  let meta: any = m.metadata;
  if (typeof meta === "string") {
    try { meta = JSON.parse(meta); } catch { meta = null; }
  }
  const citado = typeof meta?.citado === "string" ? meta.citado.trim() : "";
  if (!citado) return texto;
  return `[Responde citando este mensaje: "${citado.slice(0, 300)}"]\n${texto}`;
}

/**
 * Los pedidos de producto físico, sobre lib/dropshipping.ts: el mismo código
 * que usan la landing y el checkout, y que el motor viejo llamaba desde
 * agent.ts. El motor v2 (el vendedor por defecto desde el 22-09-2026) no lo
 * tenía: en WhatsApp ninguna venta física creaba el pedido, y el agente decía
 * "quedó anotado" sin que existiera nada (simulación del 23-09-2026).
 *
 * `undefined` sin Postgres: dropshipping.ts escribe SQL de Postgres, y en
 * SQLite (local, demo) las herramientas dicen honestamente que no hay pedidos
 * automáticos en vez de reventar.
 */
/** Un teléfono real de WhatsApp son dígitos; "sim-…" solo lo crea la ruta de prueba. */
export function esConversacionDeSimulacion(telefono: unknown): boolean {
  return /^sim-/i.test(String(telefono || ""));
}

export function servicioDePedidos(p: {
  tenantId: number;
  conversationId: number;
  leadId: number | null;
  telefono: string | null;
  condiciones: import("../modelo-de-negocio").CondicionesDelNegocio;
  /**
   * Conversación de SIMULACIÓN (teléfono "sim-…", ver esConversacionDeSimulacion):
   * el pedido recorre todo el camino pero NO se manda a Dropi ni a Woo.
   */
  simulacion?: boolean;
}): ServicioDePedidos | undefined {
  if (!pool) return undefined;
  const ETIQUETA: Record<string, string> = {
    nombre: "nombre completo", documento: "cédula", telefono: "celular", direccion: "dirección",
    ciudad: "ciudad", departamento: "departamento", barrio: "barrio", notas: "punto de referencia",
  };
  const cond = p.condiciones;
  return {
    async tomar({ producto, cantidad, datos }) {
      try {
        const ds = await import("../dropshipping");
        let pedido = await ds.pedidoEnCurso(p.conversationId);
        // Cambió de producto a mitad del pedido: el viejo se cancela, los
        // datos que ya dio se pasan al nuevo para no volver a pedirlos.
        let heredados: Partial<import("../dropshipping").DatosDeEnvio> = {};
        if (pedido && pedido.productId !== producto.id) {
          heredados = { nombre: pedido.nombre, telefono: pedido.telefono, documento: pedido.documento, departamento: pedido.departamento, ciudad: pedido.ciudad, direccion: pedido.direccion, barrio: pedido.barrio, notas: pedido.notas };
          await ds.marcarEstado(pedido.id, "cancelado");
          pedido = null;
        }
        if (!pedido) {
          pedido = await ds.abrirPedido({
            tenantId: p.tenantId, conversationId: p.conversationId, leadId: p.leadId,
            productId: producto.id, productName: producto.name, unitPrice: Number(producto.price) || 0,
            quantity: cantidad, telefono: p.telefono,
            metodoPago: cond.envio.pago === "anticipado" ? "transferencia" : "contraentrega",
          });
        }
        const nuevos: Partial<import("../dropshipping").DatosDeEnvio> = { ...heredados, ...datos };
        if (!nuevos.departamento && !pedido.departamento) {
          const dep = ds.departamentoDeCiudad(nuevos.ciudad || pedido.ciudad);
          if (dep) nuevos.departamento = dep;
        }
        // Un dato corregido después del resumen vuelve a pedir confirmación.
        if (pedido.estado === "por_confirmar" && Object.keys(datos).length) await ds.marcarEstado(pedido.id, "completo");
        pedido = (await ds.guardarDatos(pedido.id, nuevos)) || pedido;

        const faltan = ds.datosQueFaltan(pedido);
        if (faltan.length) {
          const yaTiene = ds.CAMPOS_DE_ENVIO.filter((c) => String((pedido as any)[c.campo] ?? "").trim()).map((c) => ETIQUETA[c.campo] || c.campo);
          return { estado: "faltan", faltan: faltan.map((c) => ETIQUETA[c] || String(c)), yaTiene };
        }
        const zona = ds.verificarZona(pedido, cond.pais);
        if (!zona.ok) return { estado: "zona", motivo: zona.motivo || "la zona no verifica" };
        await ds.marcarEstado(pedido.id, "por_confirmar");
        return { estado: "listo", resumen: ds.resumenDelPedido({ ...pedido, estado: "por_confirmar" }, cond) };
      } catch (e: any) {
        logger.error({ err: e?.message, conversationId: p.conversationId }, "[MotorV2] no se pudo tomar el pedido");
        return { estado: "error", motivo: e?.message || "error interno" };
      }
    },

    async estado() {
      try {
        const { rows } = await pool.query(
          `SELECT * FROM dropshipping_orders WHERE conversation_id = $1 AND estado <> 'borrador' ORDER BY id DESC LIMIT 1`,
          [p.conversationId],
        );
        const f: any = rows[0];
        if (!f) return { hay: false, texto: "" };
        const base = `Pedido #${f.id}: ${f.product_name} × ${f.quantity}, a ${f.ciudad || "?"}. Estado en el sistema: ${f.estado}.`;
        if (String(f.notas || "").includes("SIMULACIÓN")) {
          return { hay: true, texto: `${base} (simulación: no se envió a Dropi; en un pedido real acá aparecen transportadora y guía).` };
        }
        if (!f.dropi_order_id) {
          return { hay: true, texto: `${base} Todavía no tiene número en Dropi${f.dropi_error ? ` (Dropi respondió: ${String(f.dropi_error).slice(0, 120)})` : ""}.` };
        }
        const { tokenDropiDelTenant, listarPedidosDropi } = await import("../dropi-directo");
        const token = await tokenDropiDelTenant(p.tenantId);
        if (!token) return { hay: true, texto: `${base} Número en Dropi: ${f.dropi_order_id}.` };
        const lista = await listarPedidosDropi(token, 50);
        const d = (lista.data || []).find((o) => String(o.id) === String(f.dropi_order_id));
        if (!d) return { hay: true, texto: `${base} Número en Dropi: ${f.dropi_order_id} (no aparece entre los últimos 50 de Dropi).` };
        return {
          hay: true,
          texto: `${base} En Dropi: ${d.estado}${d.transportadora ? `, transportadora ${d.transportadora}` : ""}${d.guia ? `, guía ${d.guia}` : ", todavía sin guía"}. Plazo del negocio: ${cond.envio.plazo}.`,
        };
      } catch (e: any) {
        return { hay: false, texto: `No se pudo consultar: ${e?.message || e}` };
      }
    },

    async confirmar() {
      try {
        const ds = await import("../dropshipping");
        const pedido = await ds.pedidoEnCurso(p.conversationId);
        if (!pedido) return { estado: "sin_pedido" };
        if (p.simulacion) {
          // Nada sale del sistema: el pedido queda cancelado y marcado, para
          // que no cuente en reportes ni lo reintente nadie.
          await ds.guardarDatos(pedido.id, { notas: [pedido.notas, "SIMULACIÓN: no se envió a Dropi"].filter(Boolean).join(" | ") });
          await ds.marcarEstado(pedido.id, "cancelado");
          return {
            estado: "creado",
            numero: `SIM-${pedido.id}`,
            confirmacion:
              `Producto: ${pedido.productName} × ${pedido.quantity}. ` +
              `${pedido.metodoPago === "contraentrega" ? "Paga contraentrega al recibir" : "Pago ya acordado"}. ` +
              `Llega a ${pedido.direccion}${pedido.barrio ? `, barrio ${pedido.barrio}` : ""} — ${pedido.ciudad}, ${pedido.departamento}, en ${cond.envio.plazo}.`,
          };
        }
        await ds.marcarEstado(pedido.id, "confirmado");
        pedido.estado = "confirmado";
        const r = await ds.despacharPedido(pedido);
        if (!r.ok && r.noDisponible) return { estado: "no_disponible", mensajeAlCliente: r.noDisponible.mensajeAlCliente };
        if (!r.ok && (r.cobertura || ds.esErrorDeCobertura(r.dropi?.detalle || r.error || ""))) {
          return {
            estado: "no_disponible",
            mensajeAlCliente: r.cobertura?.mensajeAlCliente || ds.mensajeCoberturaAlCliente(String(pedido.productName || "el producto"), String(pedido.ciudad || "tu ciudad")),
          };
        }
        if (!r.ok && r.dropi?.estado === "error") return { estado: "rechazado", motivo: r.dropi.detalle, productoDesactivado: !!r.productoDesactivado };
        if (!r.ok) return { estado: "error", motivo: r.error || "no se pudo despachar" };
        const numero = r.dropi?.dropiOrderId || (r.wooOrderId != null ? String(r.wooOrderId) : null);
        logger.info({ conversationId: p.conversationId, pedidoId: pedido.id, numero }, "[MotorV2] Pedido físico registrado");
        return {
          estado: "creado",
          numero,
          confirmacion: ds.confirmacionDelPedido(pedido, cond),
        };
      } catch (e: any) {
        logger.error({ err: e?.message, conversationId: p.conversationId }, "[MotorV2] no se pudo confirmar el pedido");
        return { estado: "error", motivo: e?.message || "error interno" };
      }
    },
  };
}

/**
 * El servicio de pedidos del CHAT DE PRUEBA: mismas validaciones y mismos
 * mensajes que `servicioDePedidos` (la lista de datos de envío, el resumen del
 * pedido), pero en memoria. No abre pedidos en la base ni despacha a Dropi.
 *
 * Sin esto la prueba mentía: el vendedor no podía tomar el pedido, redactaba
 * él "¿me pasás tu nombre, dirección y ciudad?" y el dueño veía un texto
 * corrido que por WhatsApp no sale (ahí sale la lista ordenada).
 *
 * El pedido vive entre turnos en `pedido()`: la ruta lo devuelve y lo recibe
 * igual que el estado de la conversación.
 */
export function servicioDePedidosDePrueba(p: {
  condiciones: import("../modelo-de-negocio").CondicionesDelNegocio;
  inicial?: import("../dropshipping").PedidoDropshipping | null;
}): { servicio: ServicioDePedidos; pedido: () => import("../dropshipping").PedidoDropshipping | null } {
  const ETIQUETA: Record<string, string> = {
    nombre: "nombre completo", documento: "cédula", telefono: "celular", direccion: "dirección",
    ciudad: "ciudad", departamento: "departamento", barrio: "barrio", notas: "punto de referencia",
  };
  const cond = p.condiciones;
  let pedido: import("../dropshipping").PedidoDropshipping | null = p.inicial ?? null;

  return {
    pedido: () => pedido,
    servicio: {
      async tomar({ producto, cantidad, datos }) {
        const ds = await import("../dropshipping");
        let heredados: Partial<import("../dropshipping").DatosDeEnvio> = {};
        if (pedido && pedido.productId !== producto.id) {
          const { nombre, telefono, documento, departamento, ciudad, direccion, barrio, notas } = pedido;
          heredados = { nombre, telefono, documento, departamento, ciudad, direccion, barrio, notas };
          pedido = null;
        }
        if (!pedido) {
          const unit = Number(producto.price) || 0;
          pedido = {
            id: 0, tenantId: 0, conversationId: null, productId: producto.id, productName: producto.name,
            quantity: cantidad, unitPrice: String(unit), total: String(unit * cantidad),
            metodoPago: cond.envio.pago === "anticipado" ? "transferencia" : "contraentrega",
            estado: "abierto", wooOrderId: null, wooError: null,
          };
        }
        const nuevos: Partial<import("../dropshipping").DatosDeEnvio> = { ...heredados, ...datos };
        if (!nuevos.departamento && !pedido.departamento) {
          const dep = ds.departamentoDeCiudad(nuevos.ciudad || pedido.ciudad);
          if (dep) nuevos.departamento = dep;
        }
        if (pedido.estado === "por_confirmar" && Object.keys(datos).length) pedido.estado = "completo";
        for (const [k, v] of Object.entries(nuevos)) if (v) (pedido as any)[k] = v;

        const faltan = ds.datosQueFaltan(pedido);
        if (faltan.length) {
          const yaTiene = ds.CAMPOS_DE_ENVIO.filter((c) => String((pedido as any)[c.campo] ?? "").trim()).map((c) => ETIQUETA[c.campo] || c.campo);
          return { estado: "faltan", faltan: faltan.map((c) => ETIQUETA[c] || String(c)), yaTiene };
        }
        const zona = ds.verificarZona(pedido, cond.pais);
        if (!zona.ok) return { estado: "zona", motivo: zona.motivo || "la zona no verifica" };
        pedido.estado = "por_confirmar";
        return { estado: "listo", resumen: ds.resumenDelPedido(pedido, cond) };
      },

      async confirmar() {
        if (!pedido) return { estado: "sin_pedido" };
        pedido.estado = "confirmado";
        return {
          estado: "creado",
          numero: "PRUEBA",
          confirmacion: (await import("../dropshipping")).confirmacionDelPedido(pedido, cond),
        };
      },
    },
  };
}

export function repositorioDeEstado(): RepositorioEstado {
  return crearRepositorioDrizzle({ db, conversations, eq });
}

/* ────────────────────────────────────────────────────────────────────────────
 * EL TURNO COMPLETO
 * ──────────────────────────────────────────────────────────────────────────── */

export interface RespuestaDelVendedor {
  content: string;
  stage: string;
  parts: any[];
  aiProvider: string;
  cardProductIds: number[];
  /** Diagnóstico del turno. Se devuelve para poder medirlo sin leer logs. */
  motor: "v2";
  traza: { herramienta: string; resultado: string }[];
  modoPlan: boolean;
  corregido: boolean;
  nicho: GuionDelNegocio["forma"];
}

// Los valores son los que ya usa el inbox y el panel (`Stage` en
// conversation-engine.ts). Inventar etapas nuevas rompía los filtros de la
// pantalla aunque la columna acepte cualquier texto.
export const ETAPA_A_STAGE: Record<EstadoConversacion["etapa"], string> = {
  saludo: "greeting",
  explorando: "discovery",
  producto_en_foco: "presentation",
  precio_dado: "details",
  cierre: "closing",
  postventa: "post_sale",
  escalado: "human_handoff",
};

/**
 * Corre un turno del vendedor con el motor nuevo.
 *
 * Devuelve EXACTAMENTE la misma forma que `runAgentReply()` de agent.ts, para
 * que `AgentOrchestrator`, la ruta de pruebas y el panel no se enteren de cuál
 * de los dos motores contestó.
 */
export async function responderComoVendedor(
  conversationId: number,
  opts: { llm?: ClienteLLM; appSettings?: any } = {},
): Promise<RespuestaDelVendedor | null> {
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (!convo) return null;

  const tenantId = convo.tenantId ?? 1;
  const repositorio = repositorioDeEstado();

  const estado = await repositorio.cargar(conversationId);
  const estadoAntes = JSON.parse(JSON.stringify(estado));
  const [historial, catalogoCompleto] = await Promise.all([
    cargarHistorial(conversationId),
    cargarCatalogoDelNegocio(tenantId),
  ]);
  // Quién atiende sale del último mensaje del cliente (el enrutador decide
  // si hay traspaso), y de ahí salen su voz y SUS productos.
  const ultimoMensaje = [...historial].reverse().find((m) => m.role === "customer")?.content ?? "";

  // ¿Vino de un anuncio? Meta manda "¡Hola! Quiero más información" para
  // todos; el producto viaja en la metadata del primer mensaje. Conv 221
  // (24-09-2026): lead `meta_ads` y el bot preguntó "¿qué producto te
  // interesa?" -- el motor v2 nunca leía el anuncio. Solo fija el foco si
  // todavía no hay uno: lo que el cliente pida después manda sobre el anuncio.
  let productoAnuncio: Producto | null = null;
  if (estado.productoEnFoco == null) {
    productoAnuncio = await productoDelAnuncioDeLaConversacion(conversationId, catalogoCompleto);
    if (productoAnuncio) {
      estado.productoEnFoco = productoAnuncio.id;
      if (estado.etapa === "saludo" || estado.etapa === "explorando") estado.etapa = "producto_en_foco";
      logger.info({ conversationId, producto: productoAnuncio.name }, "[MotorV2] producto en foco tomado del anuncio");
    }
  }

  // Con el producto del anuncio, el enrutador lo ve nombrado y elige al
  // agente que lo vende (físico → dropshipping) en vez del "por defecto".
  const agente = await agenteQueAtiende(
    conversationId,
    tenantId,
    productoAnuncio ? `${ultimoMensaje} ${productoAnuncio.name}`.trim() : ultimoMensaje,
  );
  const voz = await cargarVozDelNegocio(tenantId, agente);
  let especialidadesActivas: string[] = [];
  try {
    especialidadesActivas = (
      await db.select({ e: agents.especialidad }).from(agents).where(and(eq(agents.tenantId, tenantId), eq(agents.isActive, true)))
    ).map((f: any) => String(f.e || ""));
  } catch {
    especialidadesActivas = [];
  }
  const catalogo = catalogoDeLaEspecialidad(catalogoCompleto, agente?.especialidad, especialidadesActivas);
  // El producto del que VIENEN hablando no desaparece por un traspaso.
  if (estado.productoEnFoco != null && !catalogo.some((p) => p.id === estado.productoEnFoco)) {
    const enFoco = catalogoCompleto.find((p) => p.id === estado.productoEnFoco);
    if (enFoco) catalogo.push(enFoco);
  }

  const guion = await cargarGuion(tenantId, catalogo, estado.productoEnFoco);
  const conocimiento = await cargarConocimiento(tenantId);

  const llm =
    opts.llm ??
    crearClienteLLM({ cadena: await armarCadena({ tenantId, appSettings: opts.appSettings }), tenantId });

  const negocio = await getBusinessContext(tenantId);
  const { CONDICIONES_DE_RESPALDO } = await import("../modelo-de-negocio");
  const pedidos = servicioDePedidos({
    tenantId,
    conversationId,
    leadId: (convo as any).leadId ?? null,
    telefono: (convo as any).contactPhone ?? null,
    condiciones: negocio?.condiciones ?? CONDICIONES_DE_RESPALDO,
    simulacion: esConversacionDeSimulacion((convo as any).contactPhone),
  });

  const resultado = await responder({
    llm,
    estado,
    historial,
    catalogo,
    catalogoCompleto,
    conocimiento,
    guion,
    voz,
    recargarGuion: (nuevoFocoId: number) => cargarGuion(tenantId, catalogo, nuevoFocoId),
    pedidos,
    tenantId,
    agentId: agente?.id,
    conversationId,
    fichaDelAnuncio: productoAnuncio?.id ?? null,
  });

  await repositorio.guardar(resultado.estado);

  // ── Persistir la respuesta igual que el motor viejo ──────────────────────
  // La nota de voz también queda en el historial: el vendedor tiene que
  // recordar qué explicó en el audio.
  const texto = resultado.partes
    .filter((p) => p.kind === "text" || p.kind === "voz")
    .map((p) => (p.kind === "voz" ? `🎙️ (nota de voz) ${(p as any).content || ""}` : String((p as any).content || "")))
    .join("\n\n")
    .trim();
  const cardProductIds = resultado.partes.filter((p) => p.kind === "card").map((p) => (p as any).productId);
  // ── Lo guardado tiene que decir QUÉ salió en la ficha ─────────────────────
  //
  // Conversación real 269 (26-09-2026): el cliente preguntó el precio, el
  // modelo escribió "Acá te dejo el valor" y el precio salió en la ficha,
  // que NO quedaba guardada. El dueño vio en el panel una frase sin número,
  // creyó que el bot había fallado y escribió a mano "Vale 50.000" cuatro
  // minutos después. Y el vendedor, en el turno siguiente, tampoco veía en su
  // historial que ya había dado el precio.
  const marcasDeFicha = resultado.partes
    .filter((p) => p.kind === "card")
    .map((p) => {
      const prod = catalogoCompleto.find((x) => x.id === (p as any).productId);
      const sec = String((p as any).seccion || "completa");
      const precio = prod?.price != null && Number(prod.price) > 0 ? ` — $${Number(prod.price).toLocaleString("es-CO")}` : "";
      const conPrecio = sec === "precio" || sec === "completa" ? precio : "";
      return `[ficha ${sec} de ${prod?.name ?? (p as any).productId}${conPrecio}]`;
    });
  const textoParaGuardar = [texto, ...marcasDeFicha].filter(Boolean).join("\n\n");

  await saveAgentMessage(conversationId, textoParaGuardar || "…", ETAPA_A_STAGE[resultado.estado.etapa] as any, {
    intent: "motor_v2",
    productId: resultado.estado.productoEnFoco ?? undefined,
    isHardcoded: false,
  } as any);

  // El producto en foco NO se guarda en la columna de la conversación: no
  // existe en el esquema (`currentProductId` lo escribe el motor viejo y
  // Drizzle lo descarta en silencio, así que nunca se persistió). Acá vive en
  // `estado_agente`, que sí es una columna real, y por eso sobrevive al
  // reinicio del contenedor y a los mensajes sin tarjeta.
  await db
    .update(conversations)
    .set({ currentStage: ETAPA_A_STAGE[resultado.estado.etapa], lastMessageAt: dbNow() as any })
    .where(eq(conversations.id, conversationId));

  // ── Scoring y seguimiento: igual que el motor viejo ─────────────────────
  //
  // El motor v2 no deja de alimentar el pipeline comercial: el lead scoring y
  // los seguimientos programados viven en `leadScoring.ts`, los lee el dashboard
  // y son los que avisan cuando un cliente quedó a media charla. Es
  // fire-and-forget y atrapa sus propios errores: nunca puede retrasarle la
  // respuesta a quien está escribiendo ahora.
  const ultimoDelCliente = [...historial].reverse().find((m) => m.role === "customer")?.content;
  if (ultimoDelCliente) {
    import("../leadScoring")
      .then(({ processMessageForLeadScoring }) => processMessageForLeadScoring(conversationId, ultimoDelCliente))
      .catch((err) => logger.warn({ err: err?.message }, "[MotorV2] no se pudo calcular el scoring del lead"));
  }

  // ── Efectos: lo que las herramientas pidieron hacer en la base ───────────
  for (const efecto of resultado.efectos) {
    try {
      await aplicarEfecto(efecto, { conversationId, tenantId, convo, estado: resultado.estado, catalogo });
    } catch (e: any) {
      logger.error({ err: e?.message, efecto }, "[MotorV2] no se pudo aplicar el efecto del turno");
    }
  }

  // FASE 14 — Observabilidad: por qué respondió esto, sin adivinar ni
  // guardar datos sensibles (se trunca texto del cliente).
  logger.info(
    {
      conversationId,
      tenantId,
      mensajeRecibido: String(ultimoDelCliente || "").slice(0, 200),
      estadoAntes: {
        foco: estadoAntes.productoEnFoco,
        anterior: estadoAntes.productoAnterior,
        intencion: estadoAntes.intencionActual,
        oferta: estadoAntes.ultimaOferta,
        compra: estadoAntes.compra,
        pago: estadoAntes.pago,
      },
      intencionDetectada: resultado.estado.intencionActual,
      productoActivo: resultado.estado.productoEnFoco,
      herramientas: resultado.traza.map((t) => t.herramienta),
      estadoDespues: {
        foco: resultado.estado.productoEnFoco,
        compra: resultado.estado.compra,
        pago: resultado.estado.pago,
        entrega: resultado.estado.entregaEstado,
      },
      siguienteAccion: resultado.estado.siguienteAccion,
      proveedor: resultado.proveedor,
      modoPlan: resultado.modoPlan,
      corregido: resultado.corregido,
      forma: guion.forma,
      // Cuánto costó el turno y cuánto sirvió el caché del proveedor.
      tokens: resultado.uso,
    },
    "[MOTOR-V2] turno",
  );

  return {
    content: texto,
    stage: ETAPA_A_STAGE[resultado.estado.etapa],
    parts: resultado.partes as any[],
    aiProvider: resultado.proveedor,
    cardProductIds,
    motor: "v2",
    traza: resultado.traza.map((t) => ({ herramienta: t.herramienta, resultado: String(t.resultado).slice(0, 120) })),
    modoPlan: resultado.modoPlan,
    corregido: resultado.corregido,
    nicho: guion.forma,
  };
}

async function aplicarEfecto(
  efecto: any,
  ctx: { conversationId: number; tenantId: number; convo: any; estado: EstadoConversacion; catalogo: Producto[] },
): Promise<void> {
  if (efecto.tipo === "dato") {
    if (efecto.campo === "nombre") {
      // Con el que se le HABLA: el pushName trae apellido y saludar con
      // apellido delata a la máquina en el primer mensaje.
      await db
        .update(conversations)
        .set({ contactName: String(efecto.valor) })
        .where(eq(conversations.id, ctx.conversationId));
    }
    if (ctx.convo?.leadId) {
      const [lead] = await db.select().from(leads).where(eq(leads.id, ctx.convo.leadId)).limit(1);
      const notas = String((lead as any)?.notes || "");
      const linea = `${efecto.campo}: ${efecto.valor}`;
      if (!notas.includes(linea)) {
        await db
          .update(leads)
          .set({ notes: `${notas ? `${notas}\n` : ""}${linea}` })
          .where(eq(leads.id, ctx.convo.leadId));
      }
    }
    return;
  }

  if (efecto.tipo === "pago_reportado") {
    const foco = ctx.estado.productoEnFoco;
    const producto = foco != null ? ctx.catalogo.find((p) => p.id === foco) : null;
    await db
      .update(conversations)
      .set({
        // pending: el cliente DICE que pagó. Confirmarlo lo hace una persona.
        paymentStatus: "pending",
        paymentMethod: efecto.medio ? String(efecto.medio) : null,
        paymentAmount: producto?.price != null ? String(producto.price) : null,
      })
      .where(eq(conversations.id, ctx.conversationId));

    try {
      const { avisarAlDueno } = await import("../avisos");
      await avisarAlDueno(
        ctx.tenantId,
        `💰 *Pago por verificar* — ${ctx.convo?.contactName || "cliente"} dice que ya pagó${
          producto ? ` ${producto.name}` : ""
        }${efecto.medio ? ` por ${efecto.medio}` : ""}. Entrá al panel a confirmarlo.`,
      );
    } catch {
      /* avisar no puede frenar la respuesta al cliente */
    }
    return;
  }

  if (efecto.tipo === "escalar") {
    await db
      .update(conversations)
      .set({ status: "human" })
      .where(eq(conversations.id, ctx.conversationId));
    try {
      const { avisarAlDueno } = await import("../avisos");
      await avisarAlDueno(
        ctx.tenantId,
        `🙋 *Te toca* — ${ctx.convo?.contactName || "un cliente"} necesita a una persona: ${efecto.motivo}`,
      );
    } catch {
      /* idem */
    }
  }
}

/** Para la ruta de sombra: corre el motor sin escribir nada en la conversación. */
export async function correrEnSombra(params: {
  tenantId: number;
  turnos: string[];
  estadoInicial?: EstadoConversacion;
  llm: ClienteLLM;
  /**
   * Probar a UN agente, aunque esté en borrador (inactivo): se simula como si
   * ya estuviera activo, con su voz y los productos de su especialidad. Solo
   * existe en la sombra: el router de producción no ve agentes inactivos.
   */
  agente?: any | null;
  /**
   * La charla que ya pasó (chat de prueba del dueño): así se corre UN turno
   * nuevo sin repetir los anteriores, que podrían salir distinto.
   */
  historialPrevio?: Mensaje[];
  /** Pedidos físicos simulados (`servicioDePedidosDePrueba`). Sin él, no se toman pedidos. */
  pedidos?: ServicioDePedidos;
}) {
  const completo = await cargarCatalogoDelNegocio(params.tenantId);
  let catalogo = completo;
  if (params.agente) {
    let activas: string[] = [];
    try {
      activas = (
        await db.select({ e: agents.especialidad }).from(agents).where(and(eq(agents.tenantId, params.tenantId), eq(agents.isActive, true)))
      ).map((f: any) => String(f.e || ""));
    } catch {
      activas = [];
    }
    catalogo = catalogoDeLaEspecialidad(completo, params.agente.especialidad, [...activas, String(params.agente.especialidad || "")]);
  }
  const voz = await cargarVozDelNegocio(params.tenantId, params.agente ?? null);
  const conocimiento = await cargarConocimiento(params.tenantId);
  const guion = await cargarGuion(params.tenantId, catalogo, null);

  let estado: EstadoConversacion =
    params.estadoInicial ??
    ((await import("./estado-conversacion")).estadoInicial(0));
  const historial: Mensaje[] = [...(params.historialPrevio ?? [])];
  const salida: any[] = [];

  for (const turno of params.turnos) {
    historial.push({ role: "customer", content: turno, createdAt: new Date() });
    let partes: any[] = [];
    let traza: any[] = [];
    let error: string | null = null;
    let proveedor = "—";
    try {
      const r = await responder({
        llm: params.llm,
        estado,
        historial,
        catalogo,
        conocimiento,
        guion,
        voz,
        recargarGuion: (nuevoFocoId: number) => cargarGuion(params.tenantId, catalogo, nuevoFocoId),
        pedidos: params.pedidos,
      });
      partes = r.partes;
      traza = r.traza;
      proveedor = r.proveedor;
      estado = r.estado;
    } catch (e: any) {
      error = String(e?.message || e);
    }
    const texto = partes
      .filter((p) => p.kind === "text" || p.kind === "voz")
      .map((p) => (p.kind === "voz" ? `🎙️ (nota de voz) ${p.content || ""}` : String(p.content || "")))
      .join("\n\n");
    historial.push({ role: "agent", content: texto || "[ficha]", createdAt: new Date() });
    salida.push({
      mensaje: turno,
      texto,
      tarjetas: partes.filter((p) => p.kind === "card"),
      // En orden, texto y fichas intercalados: el chat de prueba las muestra
      // como salen por WhatsApp (ver mensajesDeLaFicha).
      partes,
      herramientas: traza.map((t) => `${t.herramienta} → ${String(t.resultado).slice(0, 90)}`),
      proveedor,
      error,
      // FASE 11/12: comparación estructurada, no solo texto.
      intencion: (estado as any)?.intencionActual ?? null,
      producto: (estado as any)?.productoEnFoco ?? null,
      toolCalls: traza.map((t: any) => t.herramienta),
      state: {
        foco: (estado as any)?.productoEnFoco ?? null,
        anterior: (estado as any)?.productoAnterior ?? null,
        oferta: (estado as any)?.ultimaOferta ?? null,
        compra: (estado as any)?.compra ?? null,
        pago: (estado as any)?.pago ?? null,
        entrega: (estado as any)?.entregaEstado ?? null,
      },
      nextAction: (estado as any)?.siguienteAccion ?? null,
    });
  }

  return { salida, estado, guion: { forma: guion.forma, confianza: guion.confianza, senales: guion.senales } };
}
