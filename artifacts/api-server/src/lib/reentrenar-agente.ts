/**
 * REENTRENAR EL VENDEDOR DE WHATSAPP DESDE CERO
 * =============================================
 *
 * Pedido del dueño (18-09-2026): "resetear todo lo que el agente de WhatsApp
 * aprendió para empezar a enseñarle de cero, con todo lo ya aprendido".
 *
 * Qué se borra (lo que el agente acumuló solo y que degradaba cada cambio):
 *   1. Las "lecciones" automáticas de conversation-learning (architect_memory
 *      con tag `lesson`): heurísticas por palabras inyectadas al prompt en
 *      cada turno, sin curaduría. Una corrida local de 7 turnos generó 10.
 *   2. El prompt acumulado de cada agente activo (agents.system_prompt) y el
 *      prompt libre del negocio (tenants.agent_prompt).
 *   3. El conocimiento BASE de una corrida anterior (product_knowledge con
 *      pregunta "[base] …"). Lo que el dueño cargó a mano por Atlas NO se toca.
 *
 * Qué se siembra: un prompt base corto con el flujo del agente de Meta que el
 * dueño aprobó, y el detalle de los cursos que le dictó (piano e IA 2026).
 * La ficha, el precio y los pagos los arma el servidor (whatsapp.ts).
 *
 * NO borra conversaciones ni clientes.
 *
 * Lo usan `scripts/reentrenar-agente.ts` (consola) y la herramienta de Atlas
 * `agente_reentrenar` (chat, por propose_action).
 */
import { db, agents, tenants, productKnowledge, architectMemory, products } from "@workspace/db";
import { and, eq, like } from "drizzle-orm";

// ── 1. El prompt base ────────────────────────────────────────────────────────
export const PROMPT_BASE = `Vendés por WhatsApp los cursos de este negocio. Así vendés (es lo que el dueño aprobó probando el agente de Meta, y lo que 3 meses de chats reales enseñaron):

CÓMO AVANZA UNA VENTA
1. Preguntan por un curso → saludá en una línea y dejá que la ficha del sistema lo presente. NO des el precio si no lo piden.
2. Piden el precio → el sistema lo manda; vos no escribís montos. Después del precio, lo que sigue es ofrecer los medios de pago.
3. Piden cómo pagar → el sistema pone Nequi/Daviplata o el enlace de pago. Vos no escribís números de cuenta ni enlaces.
4. Llega un comprobante → decís que lo recibiste y que lo mandás a validar. NUNCA digas que el pago está confirmado ni que "el sistema lo verifica": lo confirma una persona mirando la cuenta.
5. Entrega → por enlace de acceso, apenas una persona confirme el pago. No prometas tiempos ("en 5 minutos", "al instante").

REGLAS FIJAS DE ESTE NEGOCIO
- Todo es 100% digital: sin envíos físicos, sin certificados, sin membresías, sin suscripciones. Pago único, acceso de por vida.
- Nunca menciones al creador, autor o profesor del curso por su nombre.
- Lo que no está en el catálogo o en el conocimiento no lo afirmes: decí que lo confirmás y seguís.

CÓMO ESCRIBÍS
- Menos texto, más aire: una idea por bloque, línea en blanco entre bloques, 2 a 4 frases.
- Emojis con sentido, 1 a 3 por mensaje; *negrita* solo para el nombre del curso y el precio.
- No abras siempre con "¡Perfecto!" o "¡Claro!". No repitas datos que ya diste.
- Si preguntan qué contiene, cuántas clases o para quién es: contestá con el detalle del curso (está en el conocimiento), en viñetas cortas con un emoji al final de cada una.
- Un "sí" contesta tu última pregunta: si ofreciste el precio, va el precio; si ofreciste los medios de pago, van los medios de pago.
- Cerrá cada mensaje con UNA pregunta que lleve al paso siguiente.`;

// ── 2. El conocimiento base por producto ────────────────────────────────────
export interface Fila { productoNombre: string | null; pregunta: string; disparadores: string; respuesta: string }

export const CONOCIMIENTO: Fila[] = [
  // ── Piano (lo que el dueño dictó el 10-09) ────────────────────────────
  {
    productoNombre: "CURSO DE PIANO COMPLETO",
    pregunta: "[base] qué contiene el curso de piano (clases, horas, temario)",
    disparadores: "que contiene, que trae, cuantas clases, cuantas horas, cuanto dura, temario, contenido del curso, que modulos, que voy a aprender, que aprendo, que se ve",
    respuesta: `🎹 *CONTENIDO DEL CURSO DE PIANO*

Son 19 módulos en video HD (283 clases, unas 19 horas), en 4 bloques:

🎼 Formación musical: escalas, acordes, secuencias armónicas y lectura de partituras; y también tocar por acordes y arpegios sin leer partituras.
🎵 Música actual: pop, balada, blues, jazz y dance.
⚡ Improvisación: patrones exclusivos y pistas instrumentales en distintas tonalidades (guitarra, bajo y percusión) para practicar.
🎤 Acompañamiento: melodías con instrucciones para acompañar cantantes y tocar en banda.

📚 Partituras y ejercicios descargables
♾️ Acceso de por vida, a tu ritmo

¿Te gustaría empezar hoy mismo? ⚡`,
  },
  {
    productoNombre: "CURSO DE PIANO COMPLETO",
    pregunta: "[base] para quién es el curso de piano",
    disparadores: "para quien es, sirve para mi, nunca he tocado, nunca toque, no se nada, desde cero, soy principiante, tengo base, perfeccionar, ya se tocar, mi hijo, mi hija",
    respuesta: `Es para cualquiera que quiera aprender piano desde cero o perfeccionar su técnica 🎹

🌱 Si nunca tocaste: arranca desde la primera nota, con las dos manos por separado.
🎶 Si ya tenés base: improvisación, acompañamiento de cantantes y estilos modernos.
👨‍👩‍👧 Todas las edades, cada uno a su ritmo.

¿Arrancás desde cero o ya tenés algo de práctica?`,
  },
  {
    productoNombre: "CURSO DE PIANO COMPLETO",
    pregunta: "[base] quién dicta el curso de piano",
    disparadores: "quien lo dicta, quien es el profesor, quien lo creo, quien lo hizo, de quien es, quien ensena, quien lo da",
    respuesta: `Lo dicta un profesor con más de 20 años enseñando piano, con un método propio 🎹

El contenido lo recibís completo: 19 módulos en video, partituras y ejercicios.

¿Querés saber qué trae cada bloque?`,
  },

  // ── Inteligencia Artificial 2026 (lo que el dueño dictó el 10-09) ────
  {
    productoNombre: "INTELIGENCIA ARTIFICIAL 2026",
    pregunta: "[base] qué contiene el curso de IA (clases, temario)",
    disparadores: "que contiene, que trae, cuantas clases, cuantas horas, cuanto dura, temario, contenido del curso, que modulos, que voy a aprender, que aprendo, que se ve, que herramientas",
    respuesta: `🤖 *CONTENIDO DEL CURSO DE IA 2026*

Son 11 secciones y más de 100 clases en video, con práctica desde el primer día:

💬 Claude AI desde cero: chat, proyectos con instrucciones y base de conocimiento.
🖥️ Claude Cowork: un agente que ordena archivos, prepara informes y trabaja en tu computador por vos.
⏰ Tareas repetitivas programadas para que se ejecuten solas.
🎨 Claude Design: presentaciones, infografías, webs y kits para redes.
📊 Excel, Word, PowerPoint y Outlook con IA.
🔎 Investigación con informes completos en minutos.
🔐 Seguridad: permisos, protección de datos y Prompt Injection.
🧩 Skills, Plugins y conectores MCP para unir Claude con tus apps.

Sin programar y sin conocimientos técnicos ♾️ Acceso de por vida.

¿Te gustaría empezar hoy mismo? ⚡`,
  },
  {
    productoNombre: "INTELIGENCIA ARTIFICIAL 2026",
    pregunta: "[base] para quién es el curso de IA",
    disparadores: "para quien es, sirve para mi, no se programar, hay que programar, necesito programar, soy principiante, no se nada de ia, requisitos, que necesito",
    respuesta: `No necesitás programar ni tener conocimientos técnicos 🤖 Solo ganas de aplicar la IA a tu trabajo.

Es para:
💼 Emprendedores y autónomos que quieren automatizar sin equipo técnico.
👥 Gerentes y equipos que quieren delegar tareas repetitivas.
🎯 Marketing, diseño y comunicación: landings, presentaciones e infografías.
📊 Usuarios de Microsoft 365 que quieren potenciar Excel, Word, PowerPoint y Outlook.
🎓 Estudiantes y personas en reconversión profesional.

¿A qué te dedicás? Así te digo por dónde te conviene arrancar.`,
  },

  // ── Para todos los productos ──────────────────────────────────────────
  {
    productoNombre: null,
    pregunta: "[base] es suscripción o pago único",
    disparadores: "suscripcion, membresia, mensualidad, pago mensual, es mensual, cuota mensual, se paga cada mes, renovar",
    respuesta: `No es suscripción 💎 Es un pago único: pagás una vez y el acceso te queda de por vida, sin mensualidades.

¿Te gustaría conocer el precio? ⚡`,
  },
  {
    productoNombre: null,
    pregunta: "[base] el pago ya está confirmado / cuándo me llega",
    // ⚠️ Sin "cuándo me llega": antes de pagar es una pregunta de entrega y
    // esta respuesta reemplaza lo que escribe el modelo.
    disparadores: "ya pague, ya transferi, ya hice el pago, ya consigne, ya te mande el comprobante, ahi esta el comprobante",
    respuesta: `¡Recibido! 🙌 Ya lo mandé a validar.

Apenas una persona confirme que entró el pago, te paso el acceso por acá. Suele ser rápido; si ves que me demoro, escribime sin problema.`,
  },
];


function tagsDe(fila: any): string[] {
  const t = fila?.tags;
  if (Array.isArray(t)) return t.map(String);
  try { const p = JSON.parse(String(t || "[]")); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
}
function metaDe(fila: any): any {
  const m = fila?.metadata;
  if (m && typeof m === "object") return m;
  try { return JSON.parse(String(m || "null")); } catch { return null; }
}

export interface PlanDeReentrenamiento {
  tenantId: number;
  lecciones: Array<{ id: number; title: string }>;
  agentes: Array<{ id: number; name: string }>;
  agentPromptActual: number;
  baseVieja: number[];
  conocimiento: Array<{ productId: number | null; pregunta: string; disparadores: string; respuesta: string }>;
  omitidas: string[];
  resumen: string;
}

/** Qué haría el reentrenamiento, sin tocar nada. */
export async function planDeReentrenamiento(tenantId: number): Promise<PlanDeReentrenamiento> {
  const memorias = await db.select().from(architectMemory).where(eq(architectMemory.tenantId, tenantId));
  const lecciones = memorias
    .filter((m: any) => tagsDe(m).includes("lesson") || metaDe(m)?.source === "conversation_learning")
    .map((m: any) => ({ id: Number(m.id), title: String(m.title || "") }));

  const agentesDelNegocio = await db.select().from(agents).where(eq(agents.tenantId, tenantId));
  const activos = agentesDelNegocio.filter((a: any) => a.isActive);
  const objetivo = (activos.length ? activos : agentesDelNegocio).map((a: any) => ({ id: Number(a.id), name: String(a.name) }));
  const [negocio] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  const catalogo = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.tenantId, tenantId));
  const idPorNombre = (nombre: string | null): number | null | "no-existe" => {
    if (!nombre) return null;
    const n = nombre.toLowerCase();
    const p = catalogo.find((c: any) => String(c.name).toLowerCase() === n)
      || catalogo.find((c: any) => String(c.name).toLowerCase().includes(n.split(" ")[0]!) && String(c.name).toLowerCase().includes(n.split(" ").slice(-1)[0]!));
    return p ? Number(p.id) : "no-existe";
  };
  const baseVieja = (await db.select({ id: productKnowledge.id }).from(productKnowledge)
    .where(and(eq(productKnowledge.tenantId, tenantId), like(productKnowledge.pregunta, "[base]%")))).map((f: any) => Number(f.id));

  const conocimiento: PlanDeReentrenamiento["conocimiento"] = [];
  const omitidas: string[] = [];
  for (const f of CONOCIMIENTO) {
    const pid = idPorNombre(f.productoNombre);
    if (pid === "no-existe") { omitidas.push(`"${f.productoNombre}" no está en el catálogo: se omite "${f.pregunta}"`); continue; }
    conocimiento.push({ productId: pid, pregunta: f.pregunta, disparadores: f.disparadores, respuesta: f.respuesta });
  }

  const resumen =
    `🧹 ${lecciones.length} lecciones automáticas a borrar · ` +
    `🤖 prompt base en ${objetivo.length} agente(s): ${objetivo.map((a: { name: string }) => a.name).join(", ") || "ninguno"} · ` +
    `📝 prompt libre del negocio: ${negocio?.agentPrompt ? `${String(negocio.agentPrompt).length} caracteres (se vacía)` : "vacío"} · ` +
    `📚 conocimiento base: ${baseVieja.length} filas viejas → ${conocimiento.length} nuevas` +
    (omitidas.length ? ` · ⚠️ ${omitidas.join("; ")}` : "");

  return {
    tenantId, lecciones, agentes: objetivo,
    agentPromptActual: negocio?.agentPrompt ? String(negocio.agentPrompt).length : 0,
    baseVieja, conocimiento, omitidas, resumen,
  };
}

/** Lo hace. Devuelve el plan aplicado. */
export async function aplicarReentrenamiento(tenantId: number): Promise<PlanDeReentrenamiento> {
  const plan = await planDeReentrenamiento(tenantId);
  for (const l of plan.lecciones) await db.delete(architectMemory).where(eq(architectMemory.id, l.id));
  for (const a of plan.agentes) await db.update(agents).set({ systemPrompt: PROMPT_BASE } as any).where(eq(agents.id, a.id));
  await db.update(tenants).set({ agentPrompt: null } as any).where(eq(tenants.id, tenantId));
  for (const id of plan.baseVieja) await db.delete(productKnowledge).where(eq(productKnowledge.id, id));
  for (const f of plan.conocimiento) await db.insert(productKnowledge).values({ tenantId, ...f } as any);
  return plan;
}
