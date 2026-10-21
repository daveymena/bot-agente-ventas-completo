/**
 * ============================================================
 * ARCHITECT MULTICHANNEL
 * ============================================================
 * Coordina optimizaciones en todos los canales
 * WhatsApp, Email, Facebook, SMS
 */

import { logger } from "./logger";
import { db, conversations, payments, products } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { architectMemoryService } from "./architect-memory-service";
import { architectPredictor } from "./architect-predictor";
import { architectReasoner } from "./architect-reasoner";
import { architectOptimizer } from "./architect-optimizer";

// Los únicos canales que este backend realmente escribe en conversations.channel
// hoy (confirmado en whatsapp.ts, facebook-messenger.ts, facebook-comments.ts).
// Email y SMS no tienen integración de envío real todavía -- no reportar
// métricas de canales que no existen.
const IMPLEMENTED_CHANNELS = ["whatsapp", "facebook_messenger", "facebook_comment"] as const;

export interface MultichannelStrategy {
  whatsapp: {
    messageTemplate: string;
    bestTime: string;
    frequency: string;
    personalization: string;
  };
  email: {
    subject: string;
    bodyTemplate: string;
    sendTime: string;
    segmentation: string;
  };
  facebook: {
    adCopy: string;
    imagePrompt: string;
    audience: string;
    budget: string;
  };
  sms: {
    message: string;
    sendTime: string;
    callToAction: string;
  };
  orchestration: {
    sequence: string[];
    timing: Record<string, string>;
    ifThenRules: Record<string, string>;
  };
}

export class ArchitectMultichannel {
  /**
   * Crear estrategia multicanal cohesiva
   */
  async createMultichannelStrategy(context: {
    productName: string;
    productId: number;
    tenantId: number;
    targetAudience: string;
    budget: number;
  }): Promise<MultichannelStrategy> {
    logger.info({ productName: context.productName }, "🎯 Creating multichannel strategy");

    const [product] = await db.select().from(products).where(eq(products.id, context.productId));
    const realFeatures = (product?.features || []).filter(Boolean);
    const featureLines = realFeatures.length > 0
      ? realFeatures.map((f: any) => `✅ ${f}`).join("\n")
      : "(sin features cargadas en el producto -- agrégalas para que el copy las use en vez de quedar genérico)";
    const highlightLine = product?.highlight ? `\n🚀 ${product.highlight}\n` : "\n";

    return {
      whatsapp: {
        messageTemplate: `
✨ ${context.productName}
${highlightLine}
${featureLines}

🔗 Compra ahora: [link]

¿Preguntas? Estoy aquí 👋
        `.trim(),
        bestTime: "14:00-16:00 (martes a jueves) -- estimación general; usa architectPredictor.predictBestContactTime por cliente para un horario real",
        frequency: "1 mensaje inicial + 2 follow-ups (24h, 72h si no responde)",
        personalization: "Usar nombre, referencia a búsquedas previas, ofrecer descuento exclusivo",
      },

      email: {
        subject: `⚠️ CANAL NO IMPLEMENTADO: no hay envío de email integrado en este backend todavía`,
        bodyTemplate: `Plantilla de referencia únicamente -- no hay proveedor de email conectado (no se encontró integración de envío en el código). No usar en producción hasta implementar el envío real.`,
        sendTime: "N/A",
        segmentation: "N/A -- canal no implementado",
      },

      facebook: {
        adCopy: `🔥 ${context.productName}
${highlightLine}
${featureLines}

Oferta limitada: [CTA]`,
        imagePrompt:
          "Professional product showcase relacionado a las features reales del producto arriba -- no genéricas de stock",
        audience: `${context.targetAudience} | Interés en ${context.productName}`,
        budget: `$${context.budget} distribuido en 4 semanas`,
      },

      sms: {
        message: `⚠️ CANAL NO IMPLEMENTADO: no hay envío de SMS integrado en este backend todavía.`,
        sendTime: "N/A",
        callToAction: "N/A -- canal no implementado",
      },

      orchestration: {
        sequence: [
          "Day 0: WhatsApp intro",
          "Day 1: Email principal",
          "Day 2: Facebook ads begin",
          "Day 3: SMS reminder",
          "Day 4: Email - testimonios",
          "Day 5: WhatsApp urgencia",
          "Day 7: Email último recall",
        ],
        timing: {
          "post-purchase": "Email confirmación 5min, SMS 30min, WhatsApp con instrucciones 1h",
          "no-response-24h": "Email follow-up + SMS",
          "no-response-72h": "Facebook pixel retargeting + WhatsApp final",
        },
        ifThenRules: {
          "if_cart_abandoned": "SMS urgente + Email 2h + WhatsApp 24h",
          "if_view_but_no_click": "Refocus ads + Email educativo",
          "if_previous_buyer": "Upsell sequence, 20% descuento cross-sell",
          "if_high_churn_risk": "Special offer, extra support, prioritized response",
        },
      },
    };
  }

  /**
   * Genera el PLAN de una campaña multicanal (copy + secuencia). Importante:
   * esta función no envía nada por ningún canal todavía -- no hay llamada real
   * a whatsapp.ts/facebook.ts aquí. No debe reportar "active" ni métricas
   * esperadas fabricadas; eso requiere conectarla de verdad al envío real.
   */
  async orchestrateCampaign(context: {
    productId: number;
    tenantId: number;
    campaignName: string;
    startDate: Date;
  }): Promise<{
    campaignId: string;
    status: string;
    channels: Record<string, any>;
    note: string;
  }> {
    const campaignId = `camp_${Date.now()}`;

    logger.info({ campaignId, campaign: context.campaignName }, "📢 Campaign plan generated (not yet dispatched)");

    return {
      campaignId,
      status: "planned", // no "active": esta función no dispara envíos reales todavía
      channels: {
        whatsapp: { status: "implemented -- requiere llamar a whatsapp.ts para enviar" },
        facebook: { status: "implemented -- requiere llamar a facebook.ts para publicar/anunciar" },
        email: { status: "not_implemented" },
        sms: { status: "not_implemented" },
      },
      note: "Métricas esperadas (alcance/conversión/revenue) no se reportan aquí porque no hay campaña real corriendo todavía -- usa architect-multichannel.analyzePerformance() una vez que la campaña esté activa y tenga datos reales.",
    };
  }

  /**
   * Analizar performance multicanal real: agrupa conversations.channel (el único
   * dato real de canal que existe) y cruza con pagos confirmados reales.
   * campaignId no se usa para filtrar todavía porque no existe una columna que
   * asocie conversaciones a una campaña -- se reporta a nivel tenant.
   */
  async analyzePerformance(tenantId: number): Promise<{
    channel_performance: Record<string, any>;
    top_performer: string | null;
    bottom_performer: string | null;
    optimization_recommendations: string[];
  }> {
    const channelPerformance: Record<string, any> = {};
    const roiByChannel: Array<{ channel: string; conversionRate: number }> = [];

    for (const channel of IMPLEMENTED_CHANNELS) {
      const convos = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.tenantId, tenantId), eq(conversations.channel, channel)));

      const convoIds = convos.map((c: any) => c.id);
      let confirmedCount = 0;
      if (convoIds.length > 0) {
        const confirmed = await db
          .select({ id: payments.id })
          .from(payments)
          .where(and(inArray(payments.conversationId, convoIds), eq(payments.status, "confirmed")));
        confirmedCount = confirmed.length;
      }

      const conversionRate = convos.length > 0 ? (confirmedCount / convos.length) * 100 : 0;
      channelPerformance[channel] = {
        conversations: convos.length,
        confirmedSales: confirmedCount,
        conversionRate: `${conversionRate.toFixed(1)}%`,
      };
      if (convos.length >= 5) roiByChannel.push({ channel, conversionRate }); // ignorar canales con muestra insuficiente
    }
    channelPerformance.email = { status: "not_implemented" };
    channelPerformance.sms = { status: "not_implemented" };

    roiByChannel.sort((a, b) => b.conversionRate - a.conversionRate);
    const top = roiByChannel[0] || null;
    const bottom = roiByChannel.length > 1 ? roiByChannel[roiByChannel.length - 1] : null;

    const recommendations: string[] = [];
    if (top) recommendations.push(`📈 ${top.channel} tiene la mayor conversión real (${top.conversionRate.toFixed(1)}%) -- priorizar inversión ahí`);
    if (bottom) recommendations.push(`📉 ${bottom.channel} tiene la menor conversión real (${bottom.conversionRate.toFixed(1)}%) -- revisar copy/targeting`);
    if (roiByChannel.length === 0) recommendations.push("Volumen insuficiente en todos los canales (mínimo 5 conversaciones) para comparar performance con confianza todavía.");

    return {
      channel_performance: channelPerformance,
      top_performer: top ? top.channel : null,
      bottom_performer: bottom ? bottom.channel : null,
      optimization_recommendations: recommendations,
    };
  }

  /**
   * Smart retargeting entre canales
   */
  async createRetargetingSequence(context: {
    stage: "awareness" | "consideration" | "decision";
    tenantId: number;
  }): Promise<{
    stage: string;
    channels: string[];
    messages: Record<string, string>;
  }> {
    const sequences: Record<string, any> = {
      awareness: {
        channels: ["facebook", "email"],
        messages: {
          facebook: "¿Sabías que [beneficio]? Descubre cómo...",
          email: "Guía: Los [X] errores que cometes con [producto]",
        },
      },
      consideration: {
        channels: ["email", "sms", "whatsapp"],
        messages: {
          email: "Comparación: [producto] vs opciones",
          sms: "3 razones por la que [producto]. Lee: [link]",
          whatsapp: "¿Dudas sobre [producto]? Aquí los costos...",
        },
      },
      decision: {
        channels: ["whatsapp", "sms"],
        messages: {
          whatsapp: "¡Listo para cambiar tu [outcome]? Acceso HOY",
          sms: "Oferta expira HOY. Compra: [link]",
        },
      },
    };

    return sequences[context.stage];
  }
}

export const architectMultichannel = new ArchitectMultichannel();
