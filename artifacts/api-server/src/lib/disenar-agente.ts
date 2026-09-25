/**
 * CREAR UN AGENTE COMO LO HARÍA UN PROFESIONAL
 * ============================================
 *
 * Hasta el 25-09-2026 Atlas creaba un agente así: el modelo inventaba un
 * nombre y unas "indicaciones" desde cero, se insertaba ACTIVO y empezaba a
 * atender clientes reales en ese mismo instante. Sin mirar qué productos iba
 * a ver, sin avisar que al agente que ya existía le sacaba la mitad del
 * catálogo, y sin una sola prueba. Con un modelo débil de respaldo (Groq),
 * las indicaciones salían con precios y plazos inventados.
 *
 * Lo que hace alguien que sabe, y lo que este módulo le da a Atlas:
 *
 *   1. DISEÑAR con datos reales (`disenarAgente`, solo lee): qué productos
 *      va a ver, qué forma de venta sale de ese catálogo, qué objeciones y
 *      qué cierre ya pone el sistema solo, qué dato falta para que no tenga
 *      que decir "lo confirmo", y a qué otro agente le cambia el catálogo.
 *   2. VALIDAR las indicaciones (`validarIndicaciones`): son para CÓMO
 *      atiende este agente, no para datos. Un precio, un descuento o un plazo
 *      escrito ahí es un dato que la base no respalda y que el vendedor va a
 *      repetir con total seguridad.
 *   3. CREAR EN BORRADOR (inactivo): no atiende a nadie hasta que se pruebe.
 *   4. PROBAR el borrador (`probarAgente`): la sombra del motor v2 simula al
 *      agente como si ya estuviera activo, con preguntas armadas con los
 *      productos reales, y el evaluador de chats marca los fallos.
 *   5. ACTIVAR, con la aprobación del admin.
 *
 * El modelo escribe la voz. Los hechos, los bloqueos y la prueba los pone el
 * servidor.
 */

import { and, eq } from "drizzle-orm";
import { db, agents } from "@workspace/db";
import {
  cargarCatalogoDelNegocio,
  cargarGuion,
  catalogoDeLaEspecialidad,
  correrEnSombra,
} from "./motor-nuevo/adaptador";
import type { Producto } from "./motor-nuevo/herramientas";
import type { ClienteLLM } from "./motor-nuevo/cliente-llm";
import { evaluarChat, type Hallazgo } from "./evaluador-de-chats";

export type Especialidad = "digital" | "dropshipping";

export const LARGO_MAXIMO_INDICACIONES = 1200;

/* ────────────────────────────────────────────────────────────────────────────
 * Validar las indicaciones
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Esto NO mira lo que escribe un cliente: mira la configuración que Atlas
 * está por guardar. Un número con moneda, un porcentaje o un plazo en días no
 * tiene nada que hacer en "cómo atiende este agente": si es verdad, vive en
 * el producto o en el perfil del negocio, que es de donde el vendedor lo lee.
 */
const DATOS_QUE_VAN_EN_LA_BASE: { patron: RegExp; que: string; donde: string }[] = [
  { patron: /\$\s?\d|\b\d[\d.,]*\s?(cop|usd|mxn|pesos|d[oó]lares)\b|\b\d+\s?mil\b/i, que: "un precio", donde: "el producto (update_product)" },
  { patron: /\b\d{1,3}\s?%/, que: "un porcentaje o descuento", donde: "la política de descuentos (agente_configurar negociaPrecio) o un cupón" },
  // Meses y años no: "niños de 5 años" o "bebés de 6 meses" es el público, no un plazo.
  { patron: /\b\d+\s*(d[ií]as?|horas?|hrs?|semanas?)\b/i, que: "un plazo (entrega, garantía o acceso)", donde: "el perfil del negocio (agente_perfil_negocio: entrega, garantia, acceso)" },
];

/** Restos de la plantilla del motor viejo: en el v2 confunden al modelo. */
const RESTOS_DEL_MOTOR_VIEJO = /\[CARD|google\s*drive|\bID:\s*\d/i;

export function validarIndicaciones(texto: unknown): { ok: boolean; texto: string; errores: string[] } {
  const t = String(texto ?? "").trim();
  const errores: string[] = [];
  if (!t) return { ok: true, texto: "", errores };

  if (t.length > LARGO_MAXIMO_INDICACIONES) {
    errores.push(
      `son ${t.length} caracteres (máximo ${LARGO_MAXIMO_INDICACIONES}). Las indicaciones se leen en CADA respuesta: van cortas, ` +
        "solo lo propio de este agente. Precios, pagos, fichas y objeciones comunes ya los pone el sistema.",
    );
  }
  for (const d of DATOS_QUE_VAN_EN_LA_BASE) {
    const m = t.match(d.patron);
    if (m) {
      errores.push(`traen ${d.que} ("${m[0].trim()}"). Ese dato no va en las indicaciones: va en ${d.donde}, y el vendedor lo lee de ahí.`);
    }
  }
  if (RESTOS_DEL_MOTOR_VIEJO.test(t)) {
    errores.push("traen restos de la plantilla del motor viejo ([CARD], Google Drive o IDs internos). El motor v2 manda fichas y enlaces solo.");
  }
  return { ok: errores.length === 0, texto: t, errores };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Diseñar
 * ──────────────────────────────────────────────────────────────────────────── */

export interface DisenoDeAgente {
  especialidad: Especialidad;
  /** Lo que impide crearlo. Vacío = se puede crear. */
  bloqueos: string[];
  /** Lo que el admin tiene que saber antes de aprobar. */
  avisos: string[];
  catalogo: { cuantos: number; ejemplos: string[]; precioMin: number | null; precioMax: number | null };
  /** Lo que el sistema YA hace solo: las indicaciones no lo repiten. */
  loQueYaHaceElSistema: { forma: string; calificacion: string[]; objeciones: string[]; cierre: string[] };
  /** Datos del negocio que faltan: el agente no podrá afirmarlos. */
  faltan: string[];
  /** Los mensajes de cliente con los que se prueba el borrador. */
  pruebas: string[];
  resumen: string;
}

function esFisico(p: Producto): boolean {
  return String(p.kind || "digital") === "physical";
}

/** Preguntas de un cliente de verdad, con el producto real que va a vender. */
export function pruebasPara(especialidad: Especialidad, catalogo: Producto[]): string[] {
  const p = catalogo[0];
  const nombre = p ? p.name.toLowerCase() : "lo que venden";
  const base = [`hola, me interesa ${nombre}`, "¿cuánto cuesta?"];
  const propias =
    especialidad === "dropshipping"
      ? ["¿hacen envíos a Medellín? ¿cuánto se demora?", "¿puedo pagar cuando me llegue?"]
      : ["¿cómo lo recibo después de pagar?", "¿tiene certificado?"];
  return [...base, ...propias, "lo voy a pensar", "listo, ¿cómo pago?"];
}

export async function disenarAgente(
  tenantId: number,
  args: { especialidad?: unknown; name?: unknown },
): Promise<DisenoDeAgente> {
  const especialidad = String(args.especialidad || "").toLowerCase() as Especialidad;
  const nombre = String(args.name || "").trim();
  const bloqueos: string[] = [];
  const avisos: string[] = [];

  const vacio = (resumen: string): DisenoDeAgente => ({
    especialidad,
    bloqueos,
    avisos,
    catalogo: { cuantos: 0, ejemplos: [], precioMin: null, precioMax: null },
    loQueYaHaceElSistema: { forma: "—", calificacion: [], objeciones: [], cierre: [] },
    faltan: [],
    pruebas: [],
    resumen,
  });

  if (especialidad !== "digital" && especialidad !== "dropshipping") {
    bloqueos.push("'especialidad' tiene que ser 'digital' (entrega con enlace) o 'dropshipping' (producto físico con envío).");
    return vacio(`No se puede diseñar: ${bloqueos[0]}`);
  }

  const existentes = await db.select().from(agents).where(eq(agents.tenantId, tenantId));
  const activos = existentes.filter((a: any) => a.isActive);
  const completo = await cargarCatalogoDelNegocio(tenantId);

  // ── Nombre ────────────────────────────────────────────────────────────
  if (nombre) {
    const igual = existentes.find((a: any) => String(a.name || "").trim().toLowerCase() === nombre.toLowerCase());
    if (igual) bloqueos.push(`Ya existe un agente llamado "${igual.name}" (#${igual.id}). Dos con el mismo nombre confunden al cliente cuando hay traspaso.`);
  }

  // ── Qué productos va a ver ────────────────────────────────────────────
  const propios = completo.filter((p) => (especialidad === "dropshipping" ? esFisico(p) : !esFisico(p)));
  if (propios.length === 0) {
    bloqueos.push(
      especialidad === "dropshipping"
        ? "No hay ningún producto FÍSICO activo en el catálogo: un agente de dropshipping no tendría nada que vender. Cargá primero los productos."
        : "No hay ningún producto DIGITAL activo en el catálogo: este agente no tendría nada que vender. Cargá primero los productos.",
    );
  }
  const especialidadesConEste = [...activos.map((a: any) => String(a.especialidad || "")), especialidad];
  const suyos = catalogoDeLaEspecialidad(completo, especialidad, especialidadesConEste);

  // ── A quién le cambia el catálogo ─────────────────────────────────────
  // El filtro por especialidad solo se prende cuando OTRO agente activo cubre
  // la otra línea. Crear este agente se lo prende al que ya estaba: ese deja
  // de ver productos, y eso el admin tiene que saberlo antes de aprobar.
  const otra: Especialidad = especialidad === "digital" ? "dropshipping" : "digital";
  const yaSeFiltraba = activos.some((a: any) => String(a.especialidad || "") === especialidad);
  if (!yaSeFiltraba) {
    for (const a of activos.filter((x: any) => String(x.especialidad || "") === otra)) {
      const antes = catalogoDeLaEspecialidad(completo, otra, activos.map((x: any) => String(x.especialidad || ""))).length;
      const despues = catalogoDeLaEspecialidad(completo, otra, especialidadesConEste).length;
      if (despues < antes) {
        avisos.push(
          `${a.name} (#${a.id}, ${otra}) pasa de ver ${antes} a ${despues} productos: los ${antes - despues} ${especialidad === "dropshipping" ? "físicos" : "digitales"} pasan a este agente nuevo.`,
        );
      }
    }
  }

  // ── Dos agentes para lo mismo ─────────────────────────────────────────
  const mismaLinea = activos.filter((a: any) => String(a.especialidad || "") === especialidad);
  if (mismaLinea.length) {
    avisos.push(
      `Ya atiende esta misma línea: ${mismaLinea.map((a: any) => `${a.name} (#${a.id})`).join(", ")}. Con dos, cuál contesta depende del texto del cliente. ` +
        "Si la idea es reemplazarlo, desactivá el viejo cuando actives este.",
    );
  }

  // ── Lo que el sistema ya pone solo, con ESTE catálogo ─────────────────
  const guion = await cargarGuion(tenantId, suyos, null);
  const faltan = [...guion.sinConfirmar];
  if (faltan.length) {
    avisos.push(
      `Con los datos de hoy este agente NO puede afirmar: ${faltan.join("; ")}. Va a decir que lo confirma. ` +
        "Para que venda completo, cargalo con agente_perfil_negocio ANTES de activarlo.",
    );
  }

  const precios = suyos.map((p) => p.price).filter((x): x is number => typeof x === "number" && x > 0);
  const catalogo = {
    cuantos: suyos.length,
    ejemplos: suyos.slice(0, 5).map((p) => p.name),
    precioMin: precios.length ? Math.min(...precios) : null,
    precioMax: precios.length ? Math.max(...precios) : null,
  };

  const loQueYaHaceElSistema = {
    forma: guion.forma,
    calificacion: guion.calificacion.filter((c) => c.obligatorio).map((c) => `${c.campo}: ${c.porque}`),
    objeciones: guion.objeciones.map((o) => `"${o.suena}" → ${o.como}`),
    cierre: guion.cierre,
  };

  // Las pruebas preguntan por un producto de SU línea, aunque vea todo el catálogo.
  const pruebas = pruebasPara(especialidad, propios.length ? propios : suyos);

  const resumen = [
    `DISEÑO del agente ${nombre || "(sin nombre)"} — ${especialidad}`,
    bloqueos.length ? `⛔ NO SE PUEDE CREAR: ${bloqueos.join(" ")}` : "✅ Se puede crear.",
    `📦 Va a vender ${catalogo.cuantos} ${catalogo.cuantos === 1 ? "producto" : "productos"}${catalogo.ejemplos.length ? ` (ej: ${catalogo.ejemplos.join(", ")})` : ""}` +
      (catalogo.precioMin != null ? `, de ${catalogo.precioMin} a ${catalogo.precioMax}.` : "."),
    `🧠 El sistema ya le da, sin escribirlo en las indicaciones: forma de venta ${guion.forma}; ` +
      `${loQueYaHaceElSistema.objeciones.length} objeciones previstas; cierre: ${guion.cierre.slice(0, 2).join(" / ")}.`,
    avisos.length ? `⚠️ ${avisos.join("\n⚠️ ")}` : "",
    "✍️ Indicaciones: solo lo PROPIO de este agente (a quién le habla, cómo abre, qué pregunta antes de recomendar, qué nunca hace en este negocio). " +
      `Cortas (máx ${LARGO_MAXIMO_INDICACIONES} caracteres), sin precios, porcentajes ni plazos.`,
    "Siguiente paso: agente_crear (queda en BORRADOR) → agente_probar_borrador → activar con update_agent { agentId, isActive: true }.",
  ]
    .filter(Boolean)
    .join("\n");

  return { especialidad, bloqueos, avisos, catalogo, loQueYaHaceElSistema, faltan, pruebas, resumen };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Probar el borrador
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PruebaDeAgente {
  ok: boolean;
  turnos: { mensaje: string; texto: string; error: string | null }[];
  hallazgos: Hallazgo[];
  resumen: string;
}

export async function probarAgente(
  tenantId: number,
  agentId: number,
  llm: ClienteLLM,
  turnos?: string[],
): Promise<PruebaDeAgente> {
  const [agente] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, Number(agentId)), eq(agents.tenantId, tenantId)))
    .limit(1);
  if (!agente) return { ok: false, turnos: [], hallazgos: [], resumen: `No existe el agente #${agentId} en este negocio.` };

  const completo = await cargarCatalogoDelNegocio(tenantId);
  const lista = (turnos && turnos.length ? turnos : pruebasPara((agente.especialidad as Especialidad) || "digital", completo.filter((p) =>
    agente.especialidad === "dropshipping" ? esFisico(p) : !esFisico(p),
  ))).slice(0, 8);

  const r = await correrEnSombra({ tenantId, turnos: lista, llm, agente });
  const salida = r.salida.map((t: any) => ({ mensaje: t.mensaje, texto: String(t.texto || ""), error: t.error ?? null, tarjetas: t.tarjetas || [] }));

  const hallazgos: Hallazgo[] = evaluarChat(
    salida.map((t) => ({
      mensaje: t.mensaje,
      texto: t.texto,
      tarjetas: (t.tarjetas || []).map((c: any) => ({ productId: Number(c.productId ?? c.id), seccion: c.seccion ?? null })),
      agente: agente.name,
    })),
    completo.map((p) => ({ id: p.id, name: p.name, price: p.price ?? 0, kind: p.kind })),
  );
  salida.forEach((t, i) => {
    if (t.error) hallazgos.push({ turno: i + 1, regla: "error", detalle: t.error });
  });

  const limpio = hallazgos.length === 0;
  const resumen = [
    `PRUEBA de ${agente.name} (#${agente.id}, ${agente.especialidad || "general"}${agente.isActive ? "" : ", en BORRADOR"}) — ${salida.length} turnos, sin escribirle a nadie:`,
    ...salida.map((t, i) => {
      // Las fichas (precio, detalle, pago) también son respuesta: sin ellas
      // parece que el agente esquivó el precio cuando lo mandó en la tarjeta.
      const fichas = (t.tarjetas || []).map((c: any) => `[ficha ${c.productId}${c.seccion ? ` · ${c.seccion}` : ""}]`).join(" ");
      const dijo = t.error ? `ERROR: ${t.error}` : [t.texto.slice(0, 300), fichas].filter(Boolean).join(" ") || "(nada)";
      return `${i + 1}. Cliente: "${t.mensaje}"\n   ${agente.name}: ${dijo}`;
    }),
    "",
    limpio ? "✅ Sin hallazgos." : `⚠️ HALLAZGOS:\n${hallazgos.map((h) => `turno ${h.turno} · ${h.regla}: ${h.detalle}`).join("\n")}`,
    agente.isActive
      ? ""
      : limpio
        ? "Si al admin le gusta cómo habla, se activa con update_agent { agentId, isActive: true } (va por propose_action)."
        : "No lo actives así: corregí las indicaciones (update_agent) o los datos que faltan y probá de nuevo.",
  ]
    .filter((x) => x !== "")
    .join("\n");

  return { ok: true, turnos: salida.map(({ mensaje, texto, error }) => ({ mensaje, texto, error })), hallazgos, resumen };
}
