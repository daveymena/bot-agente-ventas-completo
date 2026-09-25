/**
 * Siembra datos REALES en la base local para fotografiar el producto para la
 * portada: la conversación de piano (guardada por el vendedor real), un lead,
 * una landing publicada y una sesión de Atlas. Solo local.
 */
import { ensureDbReady, conversations, messages, leads, landingPages, products } from "@workspace/db";
import { eq } from "drizzle-orm";

const { db } = await ensureDbReady();
const T = 1;

// ── Conversación de piano (lo que de verdad manda el vendedor hoy) ─────────
const tel = "573104567890";
const [lead] = await db.insert(leads).values({ tenantId: T, name: "Camila Ríos", phone: tel, source: "whatsapp", status: "hot", interestLevel: "high" } as any).returning();
const [convo] = await db.insert(conversations).values({
  tenantId: T, leadId: lead.id, channel: "whatsapp", contactName: "Camila Ríos", contactPhone: tel,
  currentStage: "payment", status: "ai", isActive: true,
} as any).returning();
const chat: Array<[string, string]> = [
  ["customer", "Hola, ¿tienen el curso de piano?"],
  ["assistant", "¡Hola Camila! Sí, claro 🎹"],
  ["assistant", "🎼 *CURSO DE PIANO COMPLETO*\n\nCurso completo de piano de cero a avanzado.\n\n✅ *Lo que incluye:*\n🎬 19 módulos en video HD\n🎼 De cero a avanzado\n🎼 Valses, baladas, blues, jazz y pop\n🎼 Teoría musical aplicada\n\nEs 100% digital, sin suscripciones ni pagos mensuales: te llega por un enlace de acceso apenas se confirme el pago. 💎\n\n¿Te gustaría conocer el precio para iniciar hoy mismo? ⚡"],
  ["customer", "Sí"],
  ["assistant", "La inversión para el *CURSO DE PIANO COMPLETO* es de:\n\n💰 *$60.000 COP*\n(Pago único)\n\n¿Te envío los medios de pago para iniciar? ⚡"],
  ["customer", "Dale, por Nequi"],
  ["assistant", "💰 *$60.000 COP*\n\n🔹 *Nequi:*\n📱 313 6174267\n👤 Tecnovariedades\n\nApenas transfieras, mándame el comprobante por aquí y te activo el acceso 🙌"],
  ["customer", "Listo, ya transferí 📸"],
  ["assistant", "¡Recibido! 🙌 Ya lo mandé a validar.\n\nApenas confirmen que entró el pago te paso el acceso por acá."],
];
let t0 = Date.now() - 9 * 60_000;
for (const [role, content] of chat) {
  await db.insert(messages).values({ conversationId: convo.id, role, content, stage: "payment", metadata: {}, createdAt: new Date(t0).toISOString() } as any);
  t0 += 55_000;
}
// Un par de conversaciones más para que la bandeja no se vea vacía.
for (const [nombre, texto, prod] of [["Andrés Mora", "Me interesa el curso de inteligencia artificial", "IA"], ["Laura P.", "¿El de diseño gráfico tiene Illustrator?", "Diseño"]]) {
  const [l2] = await db.insert(leads).values({ tenantId: T, name: nombre, phone: `57300${Math.floor(Math.random() * 9000000 + 1000000)}`, source: "whatsapp", status: "new" } as any).returning();
  const [c2] = await db.insert(conversations).values({ tenantId: T, leadId: l2.id, channel: "whatsapp", contactName: nombre, contactPhone: l2.phone, currentStage: "discovery", status: "ai", isActive: true } as any).returning();
  await db.insert(messages).values({ conversationId: c2.id, role: "customer", content: texto, stage: "discovery", metadata: {} } as any);
  await db.insert(messages).values({ conversationId: c2.id, role: "assistant", content: `¡Hola ${nombre.split(" ")[0]}! Te cuento sobre el curso de ${prod} 👇`, stage: "discovery", metadata: {} } as any);
}

// ── Landing publicada del piano (secciones reales del Studio) ─────────────
const [piano] = await db.select().from(products).where(eq(products.id, 123));
await db.insert(landingPages).values({
  tenantId: T, productId: 123, name: "Landing · Curso de Piano Completo", slug: "curso-de-piano-completo", status: "published",
  publishedUrl: "http://localhost:3002/l/curso-de-piano-completo",
  strategy: { avatar: "Adultos que siempre quisieron tocar y nunca empezaron", promise: "Tocá tu primera canción en 7 días", angle: "de cero, a tu ritmo", generador: "plantilla" },
  design: { familia: "educacion", tone: "cálido", primary: "#4f46e5" },
  source: { type: "product", productId: 123 },
  sections: [
    { id: "hero", type: "hero", title: "Tocá tu primera canción en 7 días", subtitle: "Aprendé piano desde cero, a tu ritmo, con 19 módulos en video HD, partituras y ejercicios. Sin profesor presencial y sin horarios.", cta: "Quiero mi acceso ahora" },
    { id: "benefits", type: "benefits", title: "Lo que vas a lograr", body: "Independencia de las dos manos desde la primera semana\nLeer partituras sin miedo\nTocar pop, baladas, blues y jazz\nImprovisar con escalas y progresiones\nAcompañar a un cantante o tocar en banda" },
    { id: "how", type: "how-it-works", title: "Cómo funciona", body: "Pagás una sola vez\nRecibís el acceso por WhatsApp apenas se confirme\nEstudiás a tu ritmo, desde el celular o el computador" },
    { id: "offer", type: "offer", title: "Todo el curso por un pago único", subtitle: "Acceso de por vida, sin suscripciones", body: "19 módulos en video HD\n283 clases, unas 19 horas\nPartituras y ejercicios descargables\nAcceso de por vida", cta: "Quiero mi acceso ahora" },
    { id: "faq", type: "faq", title: "Preguntas frecuentes", body: "¿Necesito saber algo de música? | No, arranca desde cero.\n¿Necesito un piano? | Sirve cualquier teclado para empezar.\n¿Cómo lo recibo? | Por un enlace de acceso, apenas se confirme el pago.\n¿Es una suscripción? | No, es un pago único con acceso de por vida." },
    { id: "cta", type: "cta", title: "Empezá hoy", subtitle: "Tu primera canción está a 7 días.", cta: "Quiero mi acceso ahora" },
  ],
} as any);

console.log("sembrado:", { convo: convo.id, lead: lead.id, piano: piano?.name });
setTimeout(() => process.exit(0), 400);
