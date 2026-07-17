import { eq, desc, count, and, not, sql } from "drizzle-orm";
import { db, conversations, messages, leads, products, payments, followUps } from "@workspace/db";
import { logger } from "./logger";

type CommandResult = { text: string; silent?: boolean };

const COMMANDS: Record<string, { desc: string; handler: (args: string[], phone: string) => Promise<CommandResult> }> = {
  ayuda: {
    desc: "Muestra esta lista de comandos",
    handler: async () => ({
      text: `📋 *COMANDOS DISPONIBLES*

🔹 *ayuda* — Muestra esta lista
🔹 *ad [producto]* — Crea un anuncio en Facebook para un producto
🔹 *stats* — Estadísticas generales del negocio
🔹 *ventas* — Últimas ventas registradas
🔹 *seguimiento [etapa]* — Envía seguimiento a leads en una etapa
🔹 *leads* — Resumen de leads por etapa
🔹 *mensaje [texto]* — Envía un mensaje a todos los leads activos
🔹 *catalogo* — Sincroniza el catálogo de Facebook
🔹 *admin* — Muestra el número de admin configurado

Ejemplo: "ad curso de photoshop" o "stats" o "ventas"
Puedes escribir en español natural, el bot interpreta la intención.`,
    }),
  },

  admin: {
    desc: "Muestra configuración del admin",
    handler: async () => ({
      text: `👤 *Admin configurado*: ${process.env.ADMIN_PHONE || "No configurado"}
📱 *Tu número* es el registrado en esta conversación.`,
    }),
  },

  stats: {
    desc: "Estadísticas del negocio",
    handler: async () => {
      const [totalConvos] = await db.select({ c: count() }).from(conversations);
      const [totalLeads] = await db.select({ c: count() }).from(leads);
      const [totalSales] = await db.select({ c: count() }).from(payments).where(eq(payments.status, "completed"));
      const [pendingPayments] = await db.select({ c: count() }).from(payments).where(eq(payments.status, "pending"));

      const stageDist = await db.select({
        stage: conversations.currentStage,
        c: count(),
      }).from(conversations)
        .groupBy(conversations.currentStage)
        .having(not(sql`${conversations.currentStage} is null`));

      const stageLines = stageDist
        .filter(s => s.stage)
        .map(s => `  • *${s.stage}*: ${s.c}`)
        .join("\n");

      return {
        text: `📊 *ESTADÍSTICAS*

💬 Conversaciones: ${totalConvos.c}
👤 Leads: ${totalLeads.c}
💰 Ventas completadas: ${totalSales.c}
⏳ Pagos pendientes: ${pendingPayments.c}

📌 *Distribución por etapa:*
${stageLines || "  (sin datos)"}

_Para más detalle, usa "ventas" o "leads"_.`,
      };
    },
  },

  ventas: {
    desc: "Últimas ventas registradas",
    handler: async () => {
      const recent = await db.select()
        .from(payments)
        .orderBy(desc(payments.createdAt))
        .limit(5);

      if (recent.length === 0) return { text: "📭 No hay ventas registradas aún." };

      const lines = recent.map((p, i) =>
        `${i + 1}. *${p.payerName || "Anónimo"}* — $${Number(p.amount || 0).toLocaleString("es-CO")} — ${p.productId ? `Prod #${p.productId}` : "N/A"} — *${p.status}*`
      );

      return {
        text: `💰 *ÚLTIMAS VENTAS*

${lines.join("\n")}

_Total mostradas: ${recent.length}_`,
      };
    },
  },

  leads: {
    desc: "Resumen de leads por etapa",
    handler: async () => {
      const leadStages = await db.select({
        stage: leads.stage,
        c: count(),
      }).from(leads)
        .groupBy(leads.stage);

      if (leadStages.length === 0) return { text: "📭 No hay leads registrados." };

      const lines = leadStages.map(s => `  • *${s.stage || "sin etapa"}*: ${s.c} leads`);

      return {
        text: `👤 *LEADS POR ETAPA*

${lines.join("\n")}

_Usa "seguimiento [etapa]" para enviar mensajes automáticos a una etapa específica._`,
      };
    },
  },

  seguimiento: {
    desc: "Envía seguimiento a leads en una etapa (ej: seguimiento cold)",
    handler: async (args) => {
      const stage = args[0]?.toLowerCase();
      if (!stage || !["cold", "warm", "hot", "qualified", "negotiating", "closing", "post_sale", "lost"].includes(stage)) {
        return { text: `❌ Etapa no válida. Usa: seguimiento [cold|warm|hot|qualified|negotiating|closing|post_sale]` };
      }

      const targetLeads = await db.select()
        .from(conversations)
        .where(and(
          eq(conversations.currentStage, stage),
          not(sql`${conversations.contactPhone} is null`),
        ))
        .limit(20);

      if (targetLeads.length === 0) {
        return { text: `📭 No hay leads en etapa "${stage}" con teléfono disponible.` };
      }

      const messages_: Record<string, string> = {
        cold: "¡Hola! 😊 Hace unos días me preguntaste sobre nuestros cursos. ¿Sigues interesado? Tengo algunas novedades que podrían gustarte.",
        warm: "¡Hola! 👋 ¿Cómo va todo? Quería saber si necesitas más información sobre los productos que vimos. Estoy aquí para ayudarte.",
        hot: "¡Hola! 😊 Vi que tienes bastante interés. ¿Te gustaría que coordinemos tu acceso hoy mismo? El proceso es rápido y sencillo.",
        qualified: "¡Hola! 😊 Veo que estás listo para dar el siguiente paso. ¿Te gustaría que te ayude con el proceso de adquisición?",
        negotiating: "¡Hola! 😊 ¿Has tenido oportunidad de revisar las opciones de pago? Podemos encontrar la mejor para ti.",
        closing: "¡Hola! 😊 ¿Cómo va el proceso? Estoy aquí para ayudarte a completar tu acceso de forma rápida y segura.",
        post_sale: "¡Hola! 🎉 Solo quería saber cómo te ha ido con el producto. ¿Todo bien? ¿Necesitas ayuda con algo?",
        lost: "¡Hola! 😊 Ha pasado un tiempo. ¿Te gustaría retomar la conversación? Tenemos nuevas opciones que podrían interesarte.",
      };

      const msg = messages_[stage] || "¡Hola! 😊 ¿Cómo estás? Quería saber cómo puedo ayudarte hoy.";
      let sent = 0;
      let failed = 0;

      const { whatsapp: wa } = await import("./whatsapp");
      for (const convo of targetLeads) {
        try {
          if (wa.isConnected() && convo.contactPhone) {
            await wa.sendText(convo.contactPhone, msg);
            sent++;
          }
        } catch {
          failed++;
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      return {
        text: `📨 *Seguimiento enviado a etapa "${stage}"*

✅ Enviados: ${sent} de ${targetLeads.length}
❌ Fallos: ${failed}

_Mensaje enviado:_ "${msg.substring(0, 60)}..."`,
      };
    },
  },

  mensaje: {
    desc: "Envía un mensaje personalizado a todos los leads activos (ej: mensaje Hola, tengo una oferta)",
    handler: async (args) => {
      const text = args.join(" ");
      if (!text || text.length < 5) {
        return { text: "❌ Escribe un mensaje después del comando. Ej: mensaje Hola, tengo una oferta especial para ti" };
      }

      const activeLeads = await db.select()
        .from(conversations)
        .where(not(sql`${conversations.contactPhone} is null`))
        .limit(50);

      if (activeLeads.length === 0) return { text: "📭 No hay leads activos con teléfono." };

      const { whatsapp: wa } = await import("./whatsapp");
      let sent = 0;
      let failed = 0;
      for (const convo of activeLeads) {
        try {
          if (wa.isConnected() && convo.contactPhone) {
            await wa.sendText(convo.contactPhone, text);
            sent++;
          }
        } catch {
          failed++;
        }
        await new Promise(r => setTimeout(r, 1500));
      }

      return {
        text: `📨 *Mensaje enviado a ${sent} contactos*${failed > 0 ? ` (${failed} fallos)` : ""}`,
      };
    },
  },

  ad: {
    desc: "Crea un anuncio en Facebook para un producto (ej: ad curso photoshop o ad guitarra)",
    handler: async (args) => {
      const query = args.join(" ");
      if (!query || query.length < 3) {
        return { text: "❌ Especifica el producto. Ej: ad curso de photoshop" };
      }

      const match = await db.select()
        .from(products)
        .where(sql`LOWER(${products.name}) LIKE ${`%${query.toLowerCase()}%`}`)
        .limit(1);

      if (match.length === 0) {
        return { text: `❌ No encontré ningún producto que coincida con "${query}".` };
      }

      const product = match[0];

      try {
        const { FacebookService } = await import("./facebook");
        const fb = new FacebookService();

        if (!fb.isConfigured()) {
          return { text: "❌ Facebook Ads no está configurado. Ve a /facebook-ads en la web para configurar." };
        }

        const campaign = await fb.createAdForProduct(product.id);
        if (campaign) {
          const preview = campaign.previewUrl || "(revisa el Ads Manager)";
          return {
            text: `✅ *Anuncio creado para: ${product.name}*

📊 Campaña: ${campaign.campaignId}
💰 Presupuesto: $5,000 COP/día
📝 Copy: ${campaign.adCopy.primaryText?.substring(0, 80)}...
🔗 Preview: ${preview}

_El anuncio está en PAUSADO. Actívalo desde el Ads Manager._`,
          };
        }
        return { text: `❌ No se pudo crear el anuncio. Revisa la configuración de Facebook.` };
      } catch (e: any) {
        return { text: `❌ Error: ${e.message}` };
      }
    },
  },

  catalogo: {
    desc: "Sincroniza el catálogo de productos con Facebook",
    handler: async () => {
      try {
        const { FacebookService } = await import("./facebook");
        const fb = new FacebookService();

        if (!fb.isConfigured()) {
          return { text: "❌ Facebook Ads no está configurado." };
        }

        const result = await fb.syncCatalog();
        return {
          text: `📦 *Catálogo sincronizado*

✅ Productos sincronizados: ${result.synced}
❌ Fallos: ${result.failed}
${result.errors.length > 0 ? `\n⚠️ Errores:\n${result.errors.slice(0, 3).join("\n")}` : ""}`,
        };
      } catch (e: any) {
        return { text: `❌ Error: ${e.message}` };
      }
    },
  },
};

function parseCommand(text: string): { command: string; args: string[] } | null {
  const t = text.toLowerCase().trim();

  if (t.startsWith("/")) {
    const parts = t.slice(1).split(/\s+/);
    return { command: parts[0], args: parts.slice(1) };
  }

  const knownCommands = Object.keys(COMMANDS);
  for (const cmd of knownCommands) {
    const regex = new RegExp(`^${cmd}(?:\\s+(.*))?$`, "i");
    const match = t.match(regex);
    if (match) {
      return { command: cmd.toLowerCase(), args: match[1] ? match[1].split(/\s+/) : [] };
    }
  }

  return null;
}

export function isAdminPhone(phone: string): boolean {
  const adminPhone = process.env.ADMIN_PHONE || "";
  if (!adminPhone) return false;
  const normalized = phone.replace(/[^0-9]/g, "");
  const adminNormalized = adminPhone.replace(/[^0-9]/g, "");
  return normalized === adminNormalized || normalized.includes(adminNormalized) || adminNormalized.includes(normalized);
}

export async function handleAdminCommand(text: string, phone: string): Promise<CommandResult | null> {
  const parsed = parseCommand(text);
  if (!parsed) return null;

  const command = COMMANDS[parsed.command];
  if (!command) {
    return { text: `❌ Comando "${parsed.command}" no reconocido. Escribe "ayuda" para ver los disponibles.` };
  }

  logger.info({ command: parsed.command, args: parsed.args, phone }, "[ADMIN] Comando ejecutado");
  return command.handler(parsed.args, phone);
}

export function getHelpText(): string {
  const lines = Object.entries(COMMANDS).map(
    ([name, cmd]) => `🔹 *${name}* — ${cmd.desc}`
  );
  return `📋 *COMANDOS DISPONIBLES*\n\n${lines.join("\n")}\n\nPuedes escribir con o sin /, el bot interpreta igual.`;
}
