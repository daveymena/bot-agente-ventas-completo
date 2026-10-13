/**
 * EL DIAGNÓSTICO DEL VENDEDOR
 * ===========================
 *
 * Antes de este módulo, saber si el bot estaba vendiendo bien requería leer
 * chats a mano. El 12 y 13-09-2026 se corrigieron nueve causas distintas, y
 * TODAS se descubrieron así: el dueño mandaba una captura y alguien leía.
 * `evaluador-de-chats.ts` automatizó la lectura de un chat; lo que faltaba era
 * que nadie tuviera que acordarse de correrlo.
 *
 * Este módulo corre el evaluador sobre conversaciones REALES ya ocurridas: no
 * reproduce nada, no llama a ningún modelo y no le escribe a ningún cliente.
 * Lee lo que el bot dijo y lo compara contra hechos que el servidor conoce
 * (qué producto nombró el cliente, cuánto cuesta, si ya pagó).
 *
 * Es la pieza que le permite a Atlas diagnosticar al vendedor en vez de
 * adivinar por qué "el bot responde raro": los hallazgos salen con el número de
 * conversación, y cada regla trae escrito qué significa y con qué se arregla.
 */

import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db, conversations, messages, products } from "@workspace/db";
import { condicionConversacionOperativa } from "./conversation-query";
import { evaluarChat, type Hallazgo, type ProductoParaEvaluar, type TurnoEvaluado } from "./evaluador-de-chats";

/** Qué significa cada regla y con qué se arregla. En palabras del negocio. */
const QUE_SIGNIFICA: Record<
  string,
  { titulo: string; significa: string; seArregla: string; herramienta?: string }
> = {
  "tarjeta-equivocada": {
    titulo: "Muestra la ficha de otro producto",
    significa:
      "El cliente nombró un producto y el bot le mandó la ficha de otro. Es el error más caro: el cliente pregunta por algo concreto y recibe un folleto de otra cosa.",
    seArregla:
      "Con el motor v2 el precio y la ficha los emite la herramienta sobre el producto en foco, así que no puede cruzarse. Prendelo con vendedor_motor y probá con vendedor_probar antes.",
    herramienta: "vendedor_motor",
  },
  "ficha-del-foco-por-otro": {
    titulo: "Se queda pegado al producto viejo",
    significa:
      "El cliente cambió de tema y el bot le volvió a mandar la ficha del producto anterior.",
    seArregla:
      "El motor v2 cambia el foco con una herramienta explícita (enfocar_producto) y avisa en el mismo turno que lo anterior ya no vale.",
    herramienta: "vendedor_motor",
  },
  "niega-lo-que-existe": {
    titulo: "Dice que no tiene algo que sí vende",
    significa:
      "El bot le dijo al cliente que no maneja un producto que está en el catálogo. Venta perdida sin que nadie se entere.",
    seArregla:
      "Pasó por buscar mal en el catálogo. El motor v2 pondera las palabras distintivas: 'curso' no alcanza para devolver cualquier curso.",
    herramienta: "vendedor_motor",
  },
  "niega-el-foco": {
    titulo: "Niega el producto de la conversación",
    significa: "Dijo que no lo tiene sin que el cliente hubiera pedido otro.",
    seArregla: "Mismo origen que el anterior; se resuelve con el motor v2.",
    herramienta: "vendedor_motor",
  },
  "cobra-a-quien-ya-pago": {
    titulo: "Le cobra a quien ya pagó",
    significa:
      "El cliente dijo que ya pagó y el bot le volvió a mandar los medios de pago. Es la queja que más enoja: la persona siente que le están pidiendo plata dos veces.",
    seArregla:
      "El motor v2 registra el aviso de pago en el estado y le prohíbe al modelo volver a cobrar: queda marcado para verificación humana.",
    herramienta: "vendedor_motor",
  },
  "precio-ajeno": {
    titulo: "Menciona un precio que no es de nada",
    significa:
      "Aparece un monto que no coincide con ningún producto del catálogo. O el modelo lo inventó, o el precio quedó desactualizado.",
    seArregla:
      "Con el motor v2 el precio lo emite la herramienta desde la base, y si el modelo escribe una cifra que no existe se le pide que la reescriba.",
    herramienta: "vendedor_motor",
  },
  "ficha-de-uno-por-varios": {
    titulo: "Preguntó por varios y respondió por uno",
    significa: "El cliente nombró dos o más productos y el bot le cotizó uno solo.",
    seArregla: "El motor v2 puede mandar hasta dos fichas por respuesta y las separa.",
    herramienta: "vendedor_motor",
  },
  "respuesta-generica": {
    titulo: "Contesta con la misma frase de siempre",
    significa: "Salió la pregunta comodín en lugar de responder lo que preguntó.",
    seArregla:
      "Suele ser falta de datos del negocio. Cargá las respuestas con agente_conocimiento o completá el perfil con negocio_configurar.",
    herramienta: "agente_conocimiento",
  },
  cambio_de_agente: {
    titulo: "Cambia de agente sin motivo",
    significa: "Dos agentes distintos atendieron la misma conversación sin que el cliente cambiara de producto.",
    seArregla: "Revisá qué agentes hay activos para este negocio: que quede uno por especialidad.",
  },
  "cambio-de-agente": {
    titulo: "Cambia de agente sin motivo",
    significa: "Dos agentes distintos atendieron la misma conversación sin que el cliente cambiara de producto.",
    seArregla: "Revisá qué agentes hay activos para este negocio: que quede uno por especialidad.",
  },
  "url-en-texto": {
    titulo: "Manda enlaces que no son del negocio",
    significa: "Apareció una URL en el texto en vez de en la ficha del producto.",
    seArregla: "Cargá el enlace en el producto para que salga en la ficha.",
  },
  "id-interno": {
    titulo: "Se le escapa un ID interno",
    significa: "El bot le mostró al cliente un número de producto de la base.",
    seArregla: "El motor v2 no expone ids: el modelo solo ve el nombre y el precio.",
    herramienta: "vendedor_motor",
  },
  silencio: {
    titulo: "No contestó",
    significa: "El cliente escribió y no hubo respuesta del bot.",
    seArregla: "Mirá si fue el límite del plan o una caída de proveedores.",
  },
  "comprobante-sin-pago": {
    titulo: "Pide comprobante sin haber cobrado",
    significa: "Pidió el comprobante de pago sin haber dado los medios antes.",
    seArregla: "El motor v2 no permite mandar medios de pago sin haber dado el precio primero.",
    herramienta: "vendedor_motor",
  },
};

export interface HallazgoAgrupado {
  regla: string;
  titulo: string;
  veces: number;
  conversaciones: number[];
  ejemplo: string;
  significa: string;
  seArregla: string;
  herramienta?: string;
}

export interface DiagnosticoDelVendedor {
  revisadas: number;
  conProblemas: number;
  turnos: number;
  hallazgos: HallazgoAgrupado[];
  limpio: boolean;
  resumen: string;
}

/**
 * Reconstruye los turnos de una conversación ya ocurrida: cada mensaje del
 * cliente con lo que el bot contestó justo después.
 */
export function turnosDeMensajes(filas: any[]): TurnoEvaluado[] {
  type Borrador = { mensaje: string; texto: string[]; tarjetas: TurnoEvaluado["tarjetas"] };
  const borradores: Borrador[] = [];
  let pendiente: Borrador | null = null;

  for (const m of filas) {
    const rol = String(m.role || "");
    if (rol === "customer") {
      if (pendiente) borradores.push(pendiente);
      pendiente = { mensaje: String(m.content || ""), texto: [], tarjetas: [] };
      continue;
    }
    if (rol === "agent" && pendiente) {
      pendiente.texto.push(String(m.content || ""));
      const meta: any = m.metadata || {};
      // La ficha que salió en este mensaje, si el motor la registró.
      if (meta?.cardSent && meta?.productId) {
        pendiente.tarjetas.push({ productId: Number(meta.productId), seccion: meta.seccion ?? null });
      }
      // El motor v2 guarda las partes completas cuando puede.
      if (Array.isArray(meta?.partes)) {
        for (const p of meta.partes) {
          if (p?.kind === "card" && p.productId) {
            pendiente.tarjetas.push({ productId: Number(p.productId), seccion: p.seccion ?? null });
          }
        }
      }
    }
  }
  if (pendiente) borradores.push(pendiente);

  return borradores
    .filter((b) => String(b.mensaje || "").trim())
    .map((b) => ({ mensaje: b.mensaje, texto: b.texto.join("\n\n").trim(), tarjetas: b.tarjetas }));
}

/**
 * Diagnostica conversaciones reales. Sin modelos, sin escribirle a nadie.
 */
export async function diagnosticarVendedor(
  tenantId: number,
  opts: { limite?: number; dias?: number } = {},
): Promise<DiagnosticoDelVendedor> {
  const limite = Math.max(1, Math.min(Number(opts.limite) || 20, 60));
  const dias = Math.max(1, Math.min(Number(opts.dias) || 30, 180));
  // En Postgres `last_message_at` es timestamp y espera un Date; en SQLite es
  // TEXT y un Date explota ("tried to bind a value of an unknown type"). Se
  // manda lo que corresponde en cada modo.
  const desdeFecha = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const desde: any = process.env.USE_SQLITE === "true" ? desdeFecha.toISOString() : desdeFecha;

  const catalogo = (await db
    .select({ id: products.id, name: products.name, price: products.price, kind: products.kind })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)))) as unknown as ProductoParaEvaluar[];

  const conversacionesRecientes = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(
      eq(conversations.tenantId, tenantId),
      gte(conversations.lastMessageAt, desde),
      condicionConversacionOperativa(),
    ))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limite);

  const grupos = new Map<string, { veces: number; conversaciones: Set<number>; ejemplo: string }>();
  let revisadas = 0;
  let conProblemas = 0;
  let turnosTotales = 0;

  for (const { id } of conversacionesRecientes) {
    const filas = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt))
      .limit(200);

    if (!filas.length) continue;
    revisadas++;
    const turnos = turnosDeMensajes(filas);
    turnosTotales += turnos.length;

    const hallazgos: Hallazgo[] = evaluarChat(turnos, catalogo);
    if (!hallazgos.length) continue;
    conProblemas++;

    for (const h of hallazgos) {
      const g = grupos.get(h.regla) ?? { veces: 0, conversaciones: new Set<number>(), ejemplo: "" };
      g.veces++;
      g.conversaciones.add(id);
      if (!g.ejemplo) g.ejemplo = h.detalle;
      grupos.set(h.regla, g);
    }
  }

  const hallazgos: HallazgoAgrupado[] = [...grupos.entries()]
    .map(([regla, g]) => {
      const info = QUE_SIGNIFICA[regla] ?? {
        titulo: regla,
        significa: "El evaluador marcó este turno; la regla no tiene explicación cargada todavía.",
        seArregla: "Revisá la conversación a mano antes de tocar nada.",
      };
      return {
        regla,
        titulo: info.titulo,
        veces: g.veces,
        conversaciones: [...g.conversaciones].slice(0, 10),
        ejemplo: g.ejemplo,
        significa: info.significa,
        seArregla: info.seArregla,
        herramienta: info.herramienta,
      };
    })
    .sort((a, b) => b.veces - a.veces);

  const resumen = hallazgos.length
    ? `Revisé ${revisadas} conversaciones de los últimos ${dias} días: ${conProblemas} tienen problemas. ` +
      hallazgos.slice(0, 5).map((h) => `${h.titulo} (${h.veces})`).join("; ") + "."
    : `Revisé ${revisadas} conversaciones de los últimos ${dias} días y no encontré problemas de hechos.`;

  return { revisadas, conProblemas, turnos: turnosTotales, hallazgos, limpio: hallazgos.length === 0, resumen };
}
