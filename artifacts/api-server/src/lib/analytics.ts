import { eq, and, gte, lte, desc, asc, sql, count } from "drizzle-orm";
import { db, conversations, messages, leads, products, activityEvents } from "@workspace/db";
import { logger } from "./logger";
import { tenantManager, type TenantContext } from "./tenantManager";

// Analytics Types
export interface ConversionFunnelData {
  stage: string;
  count: number;
  percentage: number;
  dropoffRate: number;
}

export interface ConversionMetrics {
  totalLeads: number;
  qualifiedLeads: number;
  conversions: number;
  conversionRate: number;
  averageTimeToConversion: number; // in hours
  revenueGenerated: number;
  funnel: ConversionFunnelData[];
}

export interface PerformanceMetrics {
  averageResponseTime: number; // in milliseconds
  messageVolume: {
    total: number;
    incoming: number;
    outgoing: number;
    automated: number;
  };
  peakHours: Array<{
    hour: number;
    messageCount: number;
  }>;
  systemUptime: number; // percentage
  errorRate: number; // percentage
}

export interface BehavioralAnalytics {
  userEngagement: {
    averageSessionDuration: number;
    messagesPerSession: number;
    returnUserRate: number;
  };
  popularProducts: Array<{
    productId: number;
    productName: string;
    inquiries: number;
    conversions: number;
    conversionRate: number;
  }>;
  commonQuestions: Array<{
    question: string;
    frequency: number;
    category: string;
  }>;
  dropoffPoints: Array<{
    stage: string;
    dropoffRate: number;
    commonReasons: string[];
  }>;
}

export interface SystemHealthMetrics {
  aiProviderHealth: {
    provider: string;
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    errorRate: number;
    lastCheck: Date;
  }[];
  whatsappHealth: {
    status: 'connected' | 'disconnected' | 'error';
    messagesSent: number;
    messagesReceived: number;
    connectionUptime: number;
  };
  databaseHealth: {
    status: 'healthy' | 'slow' | 'error';
    queryTime: number;
    connectionPool: number;
  };
  paymentGatewayHealth: {
    mercadopago: { status: string; responseTime: number };
    paypal: { status: string; responseTime: number };
  };
}

export interface AnalyticsDashboard {
  conversionMetrics: ConversionMetrics;
  performanceMetrics: PerformanceMetrics;
  behavioralAnalytics: BehavioralAnalytics;
  systemHealth: SystemHealthMetrics;
  timeRange: {
    start: Date;
    end: Date;
  };
  generatedAt: Date;
}

// Analytics Engine Class
export class AnalyticsEngine {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  /**
   * Generates comprehensive analytics dashboard
   */
  async generateDashboard(
    startDate: Date = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
    endDate: Date = new Date()
  ): Promise<AnalyticsDashboard> {
    try {
      logger.info({
        tenantId: this.tenant.id,
        startDate,
        endDate
      }, "[Analytics] Generating dashboard");

      const [
        conversionMetrics,
        performanceMetrics,
        behavioralAnalytics,
        systemHealth
      ] = await Promise.all([
        this.getConversionMetrics(startDate, endDate),
        this.getPerformanceMetrics(startDate, endDate),
        this.getBehavioralAnalytics(startDate, endDate),
        this.getSystemHealthMetrics()
      ]);

      return {
        conversionMetrics,
        performanceMetrics,
        behavioralAnalytics,
        systemHealth,
        timeRange: { start: startDate, end: endDate },
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error({ error, tenantId: this.tenant.id }, "[Analytics] Failed to generate dashboard");
      throw error;
    }
  }

  /**
   * Analyzes conversion funnel and metrics
   */
  async getConversionMetrics(startDate: Date, endDate: Date): Promise<ConversionMetrics> {
    try {
      // Get all leads in date range
      const allLeads = await db
        .select()
        .from(leads)
        .where(
          and(
            eq(leads.tenantId, this.tenant.id),
            gte(leads.createdAt, startDate),
            lte(leads.createdAt, endDate)
          )
        );

      const totalLeads = allLeads.length;

      // Analyze lead stages
      const stageDistribution = allLeads.reduce((acc, lead) => {
        acc[lead.stage] = (acc[lead.stage] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate funnel stages
      const funnelStages = [
        { stage: 'new', name: 'New Leads' },
        { stage: 'warm', name: 'Engaged' },
        { stage: 'hot', name: 'Interested' },
        { stage: 'qualified', name: 'Qualified' },
        { stage: 'negotiating', name: 'Negotiating' },
        { stage: 'closing', name: 'Closing' },
        { stage: 'converted', name: 'Converted' }
      ];

      const funnel: ConversionFunnelData[] = [];
      let previousCount = totalLeads;

      for (const { stage, name } of funnelStages) {
        const count = stageDistribution[stage] || 0;
        const percentage = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
        const dropoffRate = previousCount > 0 ? ((previousCount - count) / previousCount) * 100 : 0;

        funnel.push({
          stage: name,
          count,
          percentage,
          dropoffRate
        });

        previousCount = count;
      }

      const qualifiedLeads = (stageDistribution.qualified || 0) + 
                           (stageDistribution.negotiating || 0) + 
                           (stageDistribution.closing || 0) + 
                           (stageDistribution.converted || 0);

      const conversions = stageDistribution.converted || 0;
      const conversionRate = totalLeads > 0 ? (conversions / totalLeads) * 100 : 0;

      // Calculate average time to conversion
      const convertedLeads = allLeads.filter(lead => lead.stage === 'converted');
      const averageTimeToConversion = convertedLeads.length > 0 
        ? convertedLeads.reduce((sum, lead) => {
            const timeToConvert = (new Date().getTime() - lead.createdAt.getTime()) / (1000 * 60 * 60);
            return sum + timeToConvert;
          }, 0) / convertedLeads.length
        : 0;

      // Estimate revenue (simplified calculation)
      const revenueGenerated = conversions * 150000; // Average product price

      return {
        totalLeads,
        qualifiedLeads,
        conversions,
        conversionRate,
        averageTimeToConversion,
        revenueGenerated,
        funnel
      };

    } catch (error) {
      logger.error({ error, tenantId: this.tenant.id }, "[Analytics] Failed to get conversion metrics");
      throw error;
    }
  }

  /**
   * Analyzes system performance metrics
   */
  async getPerformanceMetrics(startDate: Date, endDate: Date): Promise<PerformanceMetrics> {
    try {
      // Get message volume data
      const messageData = await db
        .select({
          role: messages.role,
          createdAt: messages.createdAt,
          count: sql<number>`count(*)`
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.tenantId, this.tenant.id),
            gte(messages.createdAt, startDate),
            lte(messages.createdAt, endDate)
          )
        )
        .groupBy(messages.role, messages.createdAt);

      const totalMessages = messageData.reduce((sum, msg) => sum + msg.count, 0);
      const incomingMessages = messageData
        .filter(msg => msg.role === 'customer')
        .reduce((sum, msg) => sum + msg.count, 0);
      const outgoingMessages = messageData
        .filter(msg => msg.role === 'assistant')
        .reduce((sum, msg) => sum + msg.count, 0);

      // Calculate peak hours
      const hourlyDistribution = messageData.reduce((acc, msg) => {
        const hour = msg.createdAt.getHours();
        acc[hour] = (acc[hour] || 0) + msg.count;
        return acc;
      }, {} as Record<number, number>);

      const peakHours = Object.entries(hourlyDistribution)
        .map(([hour, messageCount]) => ({
          hour: parseInt(hour),
          messageCount
        }))
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, 5);

      // Simulate response time and system metrics
      const averageResponseTime = 1200; // 1.2 seconds average
      const systemUptime = 99.5; // 99.5% uptime
      const errorRate = 0.5; // 0.5% error rate

      return {
        averageResponseTime,
        messageVolume: {
          total: totalMessages,
          incoming: incomingMessages,
          outgoing: outgoingMessages,
          automated: outgoingMessages // Assuming all outgoing are automated
        },
        peakHours,
        systemUptime,
        errorRate
      };

    } catch (error) {
      logger.error({ error, tenantId: this.tenant.id }, "[Analytics] Failed to get performance metrics");
      throw error;
    }
  }

  /**
   * Analyzes user behavior patterns
   */
  async getBehavioralAnalytics(startDate: Date, endDate: Date): Promise<BehavioralAnalytics> {
    try {
      // Get conversation data for behavioral analysis
      const conversationData = await db
        .select({
          id: conversations.id,
          createdAt: conversations.createdAt,
          lastMessageAt: conversations.lastMessageAt,
          currentStage: conversations.currentStage
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, this.tenant.id),
            gte(conversations.createdAt, startDate),
            lte(conversations.createdAt, endDate)
          )
        );

      // Calculate engagement metrics
      const totalConversations = conversationData.length;
      const averageSessionDuration = conversationData.reduce((sum, conv) => {
        if (conv.lastMessageAt) {
          const duration = (conv.lastMessageAt.getTime() - conv.createdAt.getTime()) / (1000 * 60);
          return sum + duration;
        }
        return sum;
      }, 0) / Math.max(totalConversations, 1);

      // Get messages per session
      const messagesPerConversation = await db
        .select({
          conversationId: messages.conversationId,
          messageCount: sql<number>`count(*)`
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.tenantId, this.tenant.id),
            gte(messages.createdAt, startDate),
            lte(messages.createdAt, endDate)
          )
        )
        .groupBy(messages.conversationId);

      const averageMessagesPerSession = messagesPerConversation.reduce(
        (sum, conv) => sum + conv.messageCount, 0
      ) / Math.max(messagesPerConversation.length, 1);

      // Simulate return user rate
      const returnUserRate = 25; // 25% return rate

      // Analyze popular products
      const productInquiries = await this.analyzeProductInquiries(startDate, endDate);

      // Simulate common questions and dropoff points
      const commonQuestions = [
        { question: "¿Cuál es el precio?", frequency: 45, category: "pricing" },
        { question: "¿Cómo funciona el curso?", frequency: 32, category: "product_info" },
        { question: "¿Hay garantía?", frequency: 28, category: "trust" },
        { question: "¿Cuánto tiempo dura?", frequency: 25, category: "product_info" },
        { question: "¿Incluye certificado?", frequency: 22, category: "certification" }
      ];

      const dropoffPoints = [
        { 
          stage: "Price Discussion", 
          dropoffRate: 35, 
          commonReasons: ["Price too high", "Need to think", "Comparing options"] 
        },
        { 
          stage: "Product Details", 
          dropoffRate: 22, 
          commonReasons: ["Not what expected", "Too complex", "Wrong timing"] 
        },
        { 
          stage: "Payment Process", 
          dropoffRate: 15, 
          commonReasons: ["Payment issues", "Trust concerns", "Changed mind"] 
        }
      ];

      return {
        userEngagement: {
          averageSessionDuration,
          messagesPerSession: averageMessagesPerSession,
          returnUserRate
        },
        popularProducts: productInquiries,
        commonQuestions,
        dropoffPoints
      };

    } catch (error) {
      logger.error({ error, tenantId: this.tenant.id }, "[Analytics] Failed to get behavioral analytics");
      throw error;
    }
  }

  /**
   * Analyzes product inquiry patterns
   */
  private async analyzeProductInquiries(startDate: Date, endDate: Date): Promise<BehavioralAnalytics['popularProducts']> {
    try {
      // Get all products for this tenant
      const tenantProducts = await db
        .select()
        .from(products)
        .where(eq(products.tenantId, this.tenant.id));

      // Analyze message content for product mentions
      const messageContent = await db
        .select({
          content: messages.content,
          conversationId: messages.conversationId
        })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.tenantId, this.tenant.id),
            eq(messages.role, 'customer'),
            gte(messages.createdAt, startDate),
            lte(messages.createdAt, endDate)
          )
        );

      const productAnalytics = tenantProducts.map(product => {
        const productKeywords = [
          product.name.toLowerCase(),
          ...(product.category ? [product.category.toLowerCase()] : [])
        ];

        const inquiries = messageContent.filter(msg => 
          productKeywords.some(keyword => 
            msg.content.toLowerCase().includes(keyword)
          )
        ).length;

        // Simulate conversions (in real implementation, track actual conversions)
        const conversions = Math.floor(inquiries * 0.15); // 15% conversion rate
        const conversionRate = inquiries > 0 ? (conversions / inquiries) * 100 : 0;

        return {
          productId: product.id,
          productName: product.name,
          inquiries,
          conversions,
          conversionRate
        };
      });

      return productAnalytics
        .filter(p => p.inquiries > 0)
        .sort((a, b) => b.inquiries - a.inquiries)
        .slice(0, 10);

    } catch (error) {
      logger.error({ error }, "[Analytics] Failed to analyze product inquiries");
      return [];
    }
  }

  /**
   * Gets system health metrics
   */
  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    try {
      // Simulate AI provider health checks
      const aiProviderHealth = [
        {
          provider: "OpenAI GPT-4",
          status: 'healthy' as const,
          responseTime: 1200,
          errorRate: 0.5,
          lastCheck: new Date()
        },
        {
          provider: "Anthropic Claude",
          status: 'healthy' as const,
          responseTime: 1100,
          errorRate: 0.3,
          lastCheck: new Date()
        }
      ];

      // WhatsApp health simulation
      const whatsappHealth = {
        status: 'connected' as const,
        messagesSent: 1250,
        messagesReceived: 980,
        connectionUptime: 99.2
      };

      // Database health simulation
      const databaseHealth = {
        status: 'healthy' as const,
        queryTime: 45,
        connectionPool: 8
      };

      // Payment gateway health simulation
      const paymentGatewayHealth = {
        mercadopago: { status: 'healthy', responseTime: 800 },
        paypal: { status: 'healthy', responseTime: 1200 }
      };

      return {
        aiProviderHealth,
        whatsappHealth,
        databaseHealth,
        paymentGatewayHealth
      };

    } catch (error) {
      logger.error({ error }, "[Analytics] Failed to get system health metrics");
      throw error;
    }
  }

  /**
   * Tracks conversion events
   */
  async trackConversion(conversationId: number, productId: number, amount: number): Promise<void> {
    try {
      await db.insert(activityEvents).values({
        type: "conversion_completed",
        title: `Conversión completada`,
        subtitle: `Producto ID: ${productId}, Monto: $${amount}`,
      });

      logger.info({
        tenantId: this.tenant.id,
        conversationId,
        productId,
        amount
      }, "[Analytics] Conversion tracked");

    } catch (error) {
      logger.error({ error, conversationId, productId }, "[Analytics] Failed to track conversion");
    }
  }

  /**
   * Tracks user behavior events
   */
  async trackBehaviorEvent(
    conversationId: number, 
    eventType: string, 
    eventData: Record<string, any>
  ): Promise<void> {
    try {
      await db.insert(activityEvents).values({
        type: `behavior_${eventType}`,
        title: `Evento de comportamiento: ${eventType}`,
        subtitle: JSON.stringify(eventData),
      });

      logger.debug({
        tenantId: this.tenant.id,
        conversationId,
        eventType,
        eventData
      }, "[Analytics] Behavior event tracked");

    } catch (error) {
      logger.error({ error, conversationId, eventType }, "[Analytics] Failed to track behavior event");
    }
  }

  /**
   * Gets real-time analytics summary
   */
  async getRealTimeMetrics(): Promise<{
    activeConversations: number;
    messagesLastHour: number;
    conversionsToday: number;
    systemStatus: 'healthy' | 'degraded' | 'down';
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Active conversations (had activity in last hour)
      const [activeConversationsResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversations)
        .where(
          and(
            eq(conversations.tenantId, this.tenant.id),
            gte(conversations.lastMessageAt, oneHourAgo)
          )
        );

      // Messages in last hour
      const [messagesLastHourResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(
          and(
            eq(conversations.tenantId, this.tenant.id),
            gte(messages.createdAt, oneHourAgo)
          )
        );

      // Conversions today
      const [conversionsTodayResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(
          and(
            eq(leads.tenantId, this.tenant.id),
            eq(leads.stage, 'converted'),
            gte(leads.createdAt, startOfDay)
          )
        );

      return {
        activeConversations: activeConversationsResult?.count || 0,
        messagesLastHour: messagesLastHourResult?.count || 0,
        conversionsToday: conversionsTodayResult?.count || 0,
        systemStatus: 'healthy'
      };

    } catch (error) {
      logger.error({ error, tenantId: this.tenant.id }, "[Analytics] Failed to get real-time metrics");
      return {
        activeConversations: 0,
        messagesLastHour: 0,
        conversionsToday: 0,
        systemStatus: 'down'
      };
    }
  }
}

// Export singleton instance
export const analyticsEngine = new AnalyticsEngine();

// Utility functions
export async function generateAnalyticsDashboard(
  tenant?: TenantContext,
  startDate?: Date,
  endDate?: Date
): Promise<AnalyticsDashboard> {
  const engine = tenant ? new AnalyticsEngine(tenant) : analyticsEngine;
  return engine.generateDashboard(startDate, endDate);
}

export async function trackConversionEvent(
  conversationId: number,
  productId: number,
  amount: number,
  tenant?: TenantContext
): Promise<void> {
  const engine = tenant ? new AnalyticsEngine(tenant) : analyticsEngine;
  return engine.trackConversion(conversationId, productId, amount);
}

export async function trackUserBehavior(
  conversationId: number,
  eventType: string,
  eventData: Record<string, any>,
  tenant?: TenantContext
): Promise<void> {
  const engine = tenant ? new AnalyticsEngine(tenant) : analyticsEngine;
  return engine.trackBehaviorEvent(conversationId, eventType, eventData);
}

export async function getRealTimeAnalytics(tenant?: TenantContext) {
  const engine = tenant ? new AnalyticsEngine(tenant) : analyticsEngine;
  return engine.getRealTimeMetrics();
}