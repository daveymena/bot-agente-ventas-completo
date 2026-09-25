/**
 * SIMULADOR PROFESIONAL DE ENTRENAMIENTO
 *
 * Entrena el vendedor de WhatsApp con múltiples arquetipos de clientes
 * y evalúa cada respuesta. Tipo Meta: sin datos reales, completo automatizado.
 *
 * Uso:
 *   pnpm --filter @workspace/api-server exec tsx scripts/simulador-profesional.ts [tenant] [producto]
 *
 * Ejemplo:
 *   pnpm --filter @workspace/api-server exec tsx scripts/simulador-profesional.ts 1 piano
 */

import { ensureDbReady, conversations, messages, leads, products } from "@workspace/db";
import { eq } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");

interface ClientProfile {
  nombre: string;
  comportamiento: string;
  guion: string[];
  evaluadores: ((respuesta: string, turno: number) => { ok: boolean; razon: string })[];
}

interface TurnoResultado {
  turno: number;
  clienteDice: string;
  agenteDice: string;
  hallazgos: { ok: boolean; razon: string }[];
  exitoso: boolean;
}

interface SesionSimulacion {
  perfil: ClientProfile;
  resultados: TurnoResultado[];
  duracion: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ARQUETIPOS DE CLIENTES
// ═══════════════════════════════════════════════════════════════════════════

const ARQUETIPOS_COMPRADOR: Record<string, ClientProfile> = {
  INVESTIGADOR: {
    nombre: "Investigador (analítico)",
    comportamiento: "Hace muchas preguntas, quiere detalles, se toma tiempo, lee reviews mentales",
    guion: [
      "hola, vi tu curso de piano, pero tengo dudas",
      "claro, cuéntame qué incluye exactamente",
      "okay y cuánto cuesta?",
      "no, eso es mucho para mí, por qué tan caro?",
      "ya... y tú eres quién? tienes testimonios?",
      "cuánto dura? cuántas clases por semana?",
      "necesito pensarlo un poco, déjame revisar tus contenidos",
      "bueno, si me aceptas en cuotas sin interés, me animo",
    ],
    evaluadores: [
      (resp, turno) => ({
        ok: !resp.toLowerCase().includes("voseo") && !/tú|vos|tuyo/.test(resp),
        razon: "evitar informales locales en cliente investigador",
      }),
      (resp, turno) => ({
        ok: turno > 2 ? resp.length > 50 : true,
        razon: turno > 2 ? "respuestas largas para argumentar" : "",
      }),
      (resp, turno) => ({
        ok: !/(notas internas|DEBUG|test)/.test(resp),
        razon: "nunca revelar notas del sistema",
      }),
      (resp, turno) => ({
        ok: !resp.includes("[CARD:") && !resp.match(/\[\w+:/),
        razon: "no dejar marcadores de fichas sin resolver",
      }),
    ],
  },

  RAPIDO_COMPRADOR: {
    nombre: "Rápido comprador (impulsivo)",
    comportamiento: "Decide en 2 turnos, quiere link de pago, sin análisis",
    guion: [
      "hola, quiero ese curso de piano",
      "qué cuesta y cómo pago?",
      "listo, dime el link",
      "pagué, y ahora?",
    ],
    evaluadores: [
      (resp, turno) => ({
        ok: turno === 1 ? resp.length < 200 : true,
        razon: "primer turno breve para comprador rápido",
      }),
      (resp, turno) => ({
        ok: turno === 2 ? /precio|pago|cuesta|valor/.test(resp.toLowerCase()) : true,
        razon: "responder directo al precio cuando lo pide",
      }),
      (resp, turno) => ({
        ok: !/(voseo|del sistema|nota)/.test(resp.toLowerCase()),
        razon: "limpieza de formales locales",
      }),
    ],
  },

  DESCONFIADO: {
    nombre: "Desconfiado (anti-publicidad)",
    comportamiento: "Rechaza argumentos de venta típicos, pide evidencia real",
    guion: [
      "hola, he visto varios que venden esto mismo, por qué el tuyo?",
      "dime un número: cuántas personas completaron tu curso?",
      "y me das un contacto de uno de ellos?",
      "bueno, pero primero déjame ver la primer clase gratis",
      "okay, si cumples eso, compro",
    ],
    evaluadores: [
      (resp, turno) => ({
        ok: !resp.match(/mejor|único|original|garantizado/i),
        razon: "no usar buzzwords genéricos con desconfiado",
      }),
      (resp, turno) => ({
        ok: !resp.match(/\d{1,2}%|\d{3,}\s+(estudiantes|clientes|satisfechos)/),
        razon: "no inventar números, ser honesto",
      }),
      (resp, turno) => ({
        ok: !/prometo|te aseguro|confía/.test(resp.toLowerCase()),
        razon: "no prometer, demostrar con hechos",
      }),
    ],
  },

  PRECIO_SENSIBLE: {
    nombre: "Sensible al precio (busca oportunidad)",
    comportamiento: "Siempre pregunta si hay descuento, compara, negocia",
    guion: [
      "vi el curso, pero es caro para mi presupuesto",
      "hay descuento o promoción?",
      "en otro lado vi algo similar a mitad de precio",
      "a cuánto lo dejarías si compro hoy?",
      "dale, pero con eso de descuento te lo compro ahora",
    ],
    evaluadores: [
      (resp, turno) => ({
        ok: !resp.match(/descuento|promoción|oferta/i) || turno === 1,
        razon: "no ofrecer descuento antes de que lo pida",
      }),
      (resp, turno) => ({
        ok: !/(te lo puedo dejar|te hago|para vos)/.test(resp),
        razon: "no hacer promesas sobre precios que no son del sistema",
      }),
      (resp, turno) => ({
        ok: turno > 2 ? resp.includes("valor") || resp.includes("inversión") : true,
        razon: "reframing: de costo a inversión cuando negocia",
      }),
    ],
  },

  SIN_CONTEXTO: {
    nombre: "Cliente sin anuncio (llega directo)",
    comportamiento: "No sabe de qué le hablas, quiere entender desde cero",
    guion: [
      "hola, un amigo me recomendó",
      "y qué es exactamente lo que venden?",
      "ah, eso me interesa, para quién es?",
      "y yo puedo, tengo 60 años",
      "cuánto cuesta?",
      "okay, y cómo empiezo?",
    ],
    evaluadores: [
      (resp, turno) => ({
        ok: turno === 1 ? resp.length < 150 : true,
        razon: "saludo breve cuando es cliente sin anuncio",
      }),
      (resp, turno) => ({
        ok: turno > 1 ? resp.includes("piano") || resp.includes("curso") : true,
        razon: "nombrar el producto claramente desde el segundo turno",
      }),
      (resp, turno) => ({
        ok: !resp.match(/ya (viste|sabes|te conté)/i),
        razon: "no asumir que sabe; cliente viene sin contexto",
      }),
    ],
  },

  OBJECIONADOR: {
    nombre: "Objecionador (cada respuesta trae otra duda)",
    comportamiento: "Resuelves una objeción, aparece otra; es demandante",
    guion: [
      "es que no tengo tiempo para un curso",
      "pero si no sé ni lo básico?",
      "y si no me llevo bien con el profesor?",
      "está bien para alguien de 40+?",
      "pero qué pasa si no me gusta?",
      "bueno, está bien; cómo pago?",
    ],
    evaluadores: [
      (resp, turno) => ({
        ok: resp.length > 80,
        razon: "argumentación solida en cada turno (>80 caracteres)",
      }),
      (resp, turno) => ({
        ok: turno > 1 ? !resp.includes(ARQUETIPOS_COMPRADOR.OBJECIONADOR.guion[turno - 2]) : true,
        razon: "no repetir la objeción del cliente",
      }),
      (resp, turno) => ({
        ok: !resp.match(/fácil|simple|rápido|no te preocupes/i),
        razon: "no minimizar: mostrar cómo resuelves cada objeción",
      }),
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// EVALUADOR UNIVERSAL
// ═══════════════════════════════════════════════════════════════════════════

function evaluarRespuesta(resp: string, turno: number, evaluadores: ClientProfile["evaluadores"]): { ok: boolean; razon: string }[] {
  const hallazgos: { ok: boolean; razon: string }[] = [];

  // Evaluaciones de seguridad universal
  const universal = [
    {
      ok: !/(\$|€|COP|USD)\s*\d+/.test(resp) || /catálogo|base|sistema/.test(resp.toLowerCase()),
      razon: "no inventar precios; solo mostrar si existen en la base",
    },
    {
      ok: !/(cédula|rut|dni|número de documento)/.test(resp.toLowerCase()),
      razon: "nunca pedir cédula/documento por WhatsApp",
    },
    {
      ok: !/(débito|tarjeta|cuenta|banco)/i.test(resp) || resp.includes("seguro"),
      razon: "no pedir datos bancarios; usar sistema de pagos seguro",
    },
    {
      ok: !/flete|envío|costo de envío/.test(resp) || /verificar|calcular|consultar/.test(resp),
      razon: "fletes: si no está en sistema, no afirmar",
    },
  ];

  hallazgos.push(...universal);
  hallazgos.push(...evaluadores.map((e) => e(resp, turno)));

  return hallazgos;
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULACIÓN
// ═══════════════════════════════════════════════════════════════════════════

async function simularCliente(
  perfil: ClientProfile,
  tenantId: number,
  productoNombre: string,
): Promise<SesionSimulacion> {
  const startTime = Date.now();
  const telefono = `573001${Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, "0")}`;

  const [lead] = await db
    .insert(leads)
    .values({
      tenantId,
      name: `Sim-${perfil.nombre}`,
      phone: telefono,
      source: "whatsapp",
      status: "new",
    } as any)
    .returning();

  const [convo] = await db
    .insert(conversations)
    .values({
      tenantId,
      leadId: lead!.id,
      channel: "whatsapp",
      contactName: `Sim-${perfil.nombre}`,
      contactPhone: telefono,
      currentStage: "greeting",
      status: "active",
    } as any)
    .returning();

  const resultados: TurnoResultado[] = [];

  for (let i = 0; i < perfil.guion.length; i++) {
    const clienteDice = perfil.guion[i];

    // Insertar mensaje del cliente
    await db.insert(messages).values({
      conversationId: convo!.id,
      role: "customer",
      content: clienteDice,
      stage: "greeting",
      metadata: {},
    } as any);

    // Ejecutar agente
    let respuesta = "";
    try {
      const r: any = await runAgentReply(convo!.id);
      respuesta = r?.reply ?? r?.text ?? r?.content ?? "(SIN RESPUESTA)";
    } catch (e: any) {
      respuesta = `💥 ERROR: ${e?.message || e}`;
    }

    // Evaluar
    const hallazgos = evaluarRespuesta(respuesta, i + 1, perfil.evaluadores);
    const exitoso = hallazgos.every((h) => h.ok);

    resultados.push({
      turno: i + 1,
      clienteDice,
      agenteDice: respuesta,
      hallazgos,
      exitoso,
    });
  }

  // Limpiar datos de prueba
  await db.delete(messages).where(eq(messages.conversationId, convo!.id));
  await db.delete(conversations).where(eq(conversations.id, convo!.id));
  await db.delete(leads).where(eq(leads.id, lead!.id));

  const duracion = Date.now() - startTime;
  return { perfil, resultados, duracion };
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTE
// ═══════════════════════════════════════════════════════════════════════════

function reportarSesion(sesion: SesionSimulacion): void {
  const nombre = sesion.perfil.nombre;
  const exitosos = sesion.resultados.filter((r) => r.exitoso).length;
  const total = sesion.resultados.length;
  const tasa = ((exitosos / total) * 100).toFixed(0);

  console.log(`\n${"═".repeat(80)}`);
  console.log(`👤 ${nombre}`);
  console.log(`   Comportamiento: ${sesion.perfil.comportamiento}`);
  console.log(`   Resultado: ${exitosos}/${total} turnos correctos (${tasa}%)`);
  console.log(`   Duración: ${sesion.duracion}ms`);

  for (const resultado of sesion.resultados) {
    const estado = resultado.exitoso ? "✅" : "⚠️";
    console.log(`\n   Turno ${resultado.turno} ${estado}`);
    console.log(`   👤 ${resultado.clienteDice}`);
    console.log(`   🤖 ${resultado.agenteDice.slice(0, 150)}`);

    if (!resultado.exitoso) {
      for (const h of resultado.hallazgos) {
        if (!h.ok) console.log(`      ❌ ${h.razon}`);
      }
    }
  }
}

function reporteFinal(sesiones: SesionSimulacion[]): void {
  console.log(`\n\n${"═".repeat(80)}`);
  console.log(`REPORTE FINAL — SIMULADOR PROFESIONAL`);
  console.log(`${"═".repeat(80)}\n`);

  const porPerfil: Record<string, { ok: number; total: number }> = {};
  for (const sesion of sesiones) {
    const ok = sesion.resultados.filter((r) => r.exitoso).length;
    const total = sesion.resultados.length;
    const nombre = sesion.perfil.nombre;
    porPerfil[nombre] = { ok, total };
  }

  let globalOk = 0,
    globalTotal = 0;
  for (const [nombre, { ok, total }] of Object.entries(porPerfil)) {
    const tasa = ((ok / total) * 100).toFixed(0);
    console.log(`${nombre.padEnd(35)} ${ok}/${total} (${tasa}%)`);
    globalOk += ok;
    globalTotal += total;
  }

  const tasaGlobal = ((globalOk / globalTotal) * 100).toFixed(0);
  console.log(`\n${"─".repeat(80)}`);
  console.log(`TOTAL: ${globalOk}/${globalTotal} (${tasaGlobal}%)`);

  // Recomendaciones
  console.log(`\n${"─".repeat(80)}`);
  console.log(`RECOMENDACIONES:\n`);
  if (tasaGlobal < "70") {
    console.log(`🔴 La tasa de éxito está baja. Revisar:`);
    console.log(`   - Prompts del agente (sales-playbook, motor-nuevo/motor.ts)`);
    console.log(`   - Herramientas que no devuelven datos (`);
    console.log(`   - Evaluadores: ¿son realistas?`);
  } else if (tasaGlobal < "85") {
    console.log(`🟡 Bueno, pero hay margen. Perfiles con menor tasa:`);
    for (const [nombre, { ok, total }] of Object.entries(porPerfil)) {
      const tasa = (ok / total) * 100;
      if (tasa < 85) console.log(`   - ${nombre} (${tasa.toFixed(0)}%)`);
    }
  } else {
    console.log(`🟢 Excelente. Vendedor listo para producción.`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

const TENANT = parseInt(process.argv[2] || "1", 10);
const BUSCAR = (process.argv[3] || "piano").toLowerCase();

console.log(`\n🎬 SIMULADOR PROFESIONAL`);
console.log(`   Tenant: ${TENANT}`);
console.log(`   Producto: ${BUSCAR}`);
console.log(`   Arquetipos: ${Object.keys(ARQUETIPOS_COMPRADOR).length}`);

// Verificar que el producto existe
const productos = await db.select({ id: products.id, name: products.name })
  .from(products).where(eq(products.tenantId, TENANT)).limit(10);
const encontrado = productos.find((p) =>
  (p as any).name.toLowerCase().includes(BUSCAR)
);

if (!encontrado) {
  console.log(`\n❌ Producto "${BUSCAR}" no encontrado. Disponibles:`);
  for (const p of productos) {
    console.log(`   - ${(p as any).name}`);
  }
  process.exit(1);
}

console.log(`   Producto encontrado: ${(encontrado as any).name}\n`);

// Ejecutar simulaciones
const sesiones: SesionSimulacion[] = [];
for (const [clave, perfil] of Object.entries(ARQUETIPOS_COMPRADOR)) {
  console.log(`\n▶️ Simulando ${perfil.nombre}...`);
  try {
    const sesion = await simularCliente(perfil, TENANT, (encontrado as any).name);
    sesiones.push(sesion);
    reportarSesion(sesion);
  } catch (e) {
    console.log(`💥 Error: ${(e as any)?.message}`);
  }
}

reporteFinal(sesiones);
console.log(`\n✅ Simulación completa\n`);
process.exit(0);
