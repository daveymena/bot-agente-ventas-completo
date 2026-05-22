// @ts-nocheck
import { logger } from "./logger";
import { db, paymentLinks } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { tenantManager, type TenantContext } from "./tenantManager";

// Payment Validation and Enhancement Types
export interface PaymentServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  lastCheck: Date;
  errorRate: number;
}

export interface PaymentValidationResult {
  isValid: boolean;
  service: string;
  errors: string[];
  warnings: string[];
  estimatedSuccess: number; // 0-100 percentage
}

export interface PaymentAnalytics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  successRate: number;
  averageAmount: number;
  preferredMethods: Array<{
    method: string;
    usage: number;
    successRate: number;
  }>;
}

// Payment Service Health Monitor
class PaymentHealthMonitor {
  private healthCache: Map<string, PaymentServiceHealth> = new Map();
  private readonly HEALTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startMonitoring();
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkAllServices().catch(error => {
        logger.error({ error }, "[PaymentHealth] Health check failed");
      });
    }, this.HEALTH_CHECK_INTERVAL);

    // Initial health check
    this.checkAllServices().catch(error => {
      logger.error({ error }, "[PaymentHealth] Initial health check failed");
    });
  }

  async checkAllServices(): Promise<void> {
    const services = ['mercadopago', 'paypal', 'nequi'];
    
    await Promise.all(services.map(service => this.checkServiceHealth(service)));
  }

  async checkServiceHealth(service: string): Promise<PaymentServiceHealth> {
    const startTime = Date.now();
    let status: PaymentServiceHealth['status'] = 'down';
    let errorRate = 100;

    try {
      switch (service) {
        case 'mercadopago':
          status = await this.checkMercadoPagoHealth();
          break;
        case 'paypal':
          status = await this.checkPayPalHealth();
          break;
        case 'nequi':
          status = 'healthy'; // Nequi is always available (manual transfer)
          break;
        default:
          status = 'down';
      }

      errorRate = status === 'healthy' ? 0 : status === 'degraded' ? 25 : 100;

    } catch (error) {
      logger.warn({ error, service }, "[PaymentHealth] Service health check failed");
      status = 'down';
      errorRate = 100;
    }

    const responseTime = Date.now() - startTime;
    const health: PaymentServiceHealth = {
      service,
      status,
      responseTime,
      lastCheck: new Date(),
      errorRate
    };

    this.healthCache.set(service, health);
    
    logger.debug({ service, status, responseTime }, "[PaymentHealth] Service checked");
    
    return health;
  }

  private async checkMercadoPagoHealth(): Promise<PaymentServiceHealth['status']> {
    try {
      const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!accessToken) return 'down';

      const response = await fetch('https://api.mercadopago.com/users/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (response.ok) return 'healthy';
      if (response.status >= 500) return 'down';
      return 'degraded';

    } catch (error) {
      return 'down';
    }
  }

  private async checkPayPalHealth(): Promise<PaymentServiceHealth['status']> {
    try {
      const clientId = process.env.PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) return 'down';

      const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en_US',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) return 'healthy';
      if (response.status >= 500) return 'down';
      return 'degraded';

    } catch (error) {
      return 'down';
    }
  }

  getServiceHealth(service: string): PaymentServiceHealth | null {
    return this.healthCache.get(service) || null;
  }

  getAllServicesHealth(): PaymentServiceHealth[] {
    return Array.from(this.healthCache.values());
  }

  areServicesHealthy(): boolean {
    const services = this.getAllServicesHealth();
    return services.length > 0 && services.some(service => service.status === 'healthy');
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
}

export interface PaymentMethodResult {
  url?: string;
  shortUrl?: string;
  qr?: string;
  address?: string;
  amount?: string;
  method: string;
  data?: any;
}

// URL Shortener for payment links
class URLShortener {
  private static generateShortCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static async createShortLink(originalUrl: string, method: string, productId: number, clientPhone: string): Promise<string> {
    try {
      const shortCode = this.generateShortCode();
      const baseUrl = process.env.APP_URL || "https://tecnovariedades.easypanel.host";
      const shortUrl = `${baseUrl}/p/${shortCode}`;

      // Store in database for redirection
      await db.insert(paymentLinks).values({
        shortCode,
        originalUrl,
        method,
        productId,
        clientPhone,
        clicks: 0,
        isActive: true
      });

      return shortUrl;
    } catch (error) {
      logger.error({ error, originalUrl }, "Failed to create short link");
      return originalUrl; // Fallback to original URL
    }
  }

  static async resolveShortLink(shortCode: string): Promise<string | null> {
    try {
      const [link] = await db.select()
        .from(paymentLinks)
        .where(eq(paymentLinks.shortCode, shortCode))
        .limit(1);

      if (link && link.isActive) {
        // Increment click counter
        await db.update(paymentLinks)
          .set({ 
            clicks: (link.clicks || 0) + 1,
            lastClickAt: new Date()
          })
          .where(eq(paymentLinks.id, link.id));

        return link.originalUrl;
      }

      return null;
    } catch (error) {
      logger.error({ error, shortCode }, "Failed to resolve short link");
      return null;
    }
  }
}

export class PaymentGateway {
  private config: any;
  private tenant: TenantContext;
  private healthMonitor: PaymentHealthMonitor;

  constructor(tenant?: TenantContext, config: any = {}) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
    this.healthMonitor = new PaymentHealthMonitor();
    
    // Use tenant-specific payment configuration
    const tenantPayments = this.tenant.paymentMethods;
    
    this.config = {
      mercadoPagoAccessToken: tenantPayments.mercadopago?.accessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN,
      paypalClientId: tenantPayments.paypal?.clientId || process.env.PAYPAL_CLIENT_ID,
      paypalClientSecret: tenantPayments.paypal?.clientSecret || process.env.PAYPAL_CLIENT_SECRET,
      paypalMode: tenantPayments.paypal?.mode || process.env.PAYPAL_MODE || "live",
      transferAccounts: tenantPayments.transfer?.accounts || [
        {
          type: "Nequi",
          number: process.env.TRANSFER_NUMBER || "3136174267",
          name: process.env.TRANSFER_NAME || "Duvier Mena"
        }
      ],
      appUrl: process.env.APP_URL || "https://tecnovariedades.easypanel.host",
      ...config,
    };
  }

  /**
   * Validates payment service availability before generating links
   */
  async validatePaymentServices(): Promise<PaymentValidationResult[]> {
    const results: PaymentValidationResult[] = [];

    // Validate MercadoPago
    if (this.config.mercadoPagoAccessToken) {
      const mpHealth = this.healthMonitor.getServiceHealth('mercadopago');
      const mpValidation = await this.validateMercadoPagoService(mpHealth);
      results.push(mpValidation);
    }

    // Validate PayPal
    if (this.config.paypalClientId && this.config.paypalClientSecret) {
      const paypalHealth = this.healthMonitor.getServiceHealth('paypal');
      const paypalValidation = await this.validatePayPalService(paypalHealth);
      results.push(paypalValidation);
    }

    // Validate Transfer (always available)
    results.push({
      isValid: true,
      service: 'transfer',
      errors: [],
      warnings: [],
      estimatedSuccess: 95 // Manual transfers have high success rate
    });

    return results;
  }

  private async validateMercadoPagoService(health: PaymentServiceHealth | null): Promise<PaymentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let estimatedSuccess = 0;

    if (!this.config.mercadoPagoAccessToken) {
      errors.push('MercadoPago access token not configured');
    } else if (!health) {
      warnings.push('MercadoPago health status unknown');
      estimatedSuccess = 50;
    } else {
      switch (health.status) {
        case 'healthy':
          estimatedSuccess = 95;
          if (health.responseTime > 3000) {
            warnings.push('MercadoPago response time is slow');
            estimatedSuccess -= 10;
          }
          break;
        case 'degraded':
          estimatedSuccess = 70;
          warnings.push('MercadoPago service is experiencing issues');
          break;
        case 'down':
          estimatedSuccess = 0;
          errors.push('MercadoPago service is currently unavailable');
          break;
      }
    }

    return {
      isValid: errors.length === 0 && estimatedSuccess > 0,
      service: 'mercadopago',
      errors,
      warnings,
      estimatedSuccess
    };
  }

  private async validatePayPalService(health: PaymentServiceHealth | null): Promise<PaymentValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let estimatedSuccess = 0;

    if (!this.config.paypalClientId || !this.config.paypalClientSecret) {
      errors.push('PayPal credentials not configured');
    } else if (!health) {
      warnings.push('PayPal health status unknown');
      estimatedSuccess = 50;
    } else {
      switch (health.status) {
        case 'healthy':
          estimatedSuccess = 90;
          if (health.responseTime > 5000) {
            warnings.push('PayPal response time is slow');
            estimatedSuccess -= 15;
          }
          break;
        case 'degraded':
          estimatedSuccess = 60;
          warnings.push('PayPal service is experiencing issues');
          break;
        case 'down':
          estimatedSuccess = 0;
          errors.push('PayPal service is currently unavailable');
          break;
      }
    }

    return {
      isValid: errors.length === 0 && estimatedSuccess > 0,
      service: 'paypal',
      errors,
      warnings,
      estimatedSuccess
    };
  }

  /**
   * Gets available payment methods with health status
   */
  async getAvailablePaymentMethods(): Promise<Array<{
    method: string;
    available: boolean;
    health: PaymentServiceHealth | null;
    estimatedSuccess: number;
  }>> {
    const validationResults = await this.validatePaymentServices();
    
    return validationResults.map(result => ({
      method: result.service,
      available: result.isValid,
      health: this.healthMonitor.getServiceHealth(result.service),
      estimatedSuccess: result.estimatedSuccess
    }));
  }

  async createMercadoPagoLink(product: any, client: any): Promise<PaymentMethodResult | null> {
    // Validate service before attempting to create link
    const validation = await this.validateMercadoPagoService(
      this.healthMonitor.getServiceHealth('mercadopago')
    );

    if (!validation.isValid) {
      logger.warn({ 
        errors: validation.errors, 
        warnings: validation.warnings 
      }, "[Payment] MercadoPago validation failed");
      return null;
    }

    if (validation.warnings.length > 0) {
      logger.warn({ warnings: validation.warnings }, "[Payment] MercadoPago warnings detected");
    }

    const mpAccessToken = this.config.mercadoPagoAccessToken;
    if (!mpAccessToken) return null;

    try {
      const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: [
            {
              id: product.id?.toString() || "prod_" + Date.now(),
              title: product.name,
              quantity: 1,
              currency_id: "COP",
              unit_price: Number(product.price || 0),
            },
          ],
          payer: {
            email: client.email || "cliente@email.com",
            name: client.name || "Cliente",
          },
          back_urls: {
            success: `${this.config.appUrl}/mp-success`,
            failure: `${this.config.appUrl}/mp-failure`,
            pending: `${this.config.appUrl}/mp-pending`,
          },
          notification_url: `${this.config.appUrl}/api/webhooks/mercadopago`,
          external_reference: `${client.phone || "unknown"}|${product.id}`,
          auto_return: "approved",
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      const data = await response.json() as any;
      if (!response.ok) throw new Error(data.message || "Error MP");

      // Create short URL for better UX
      const shortUrl = await URLShortener.createShortLink(
        data.init_point, 
        "mercadopago", 
        product.id, 
        client.phone
      );

      // Log successful payment link creation
      logger.info({
        tenantId: this.tenant.id,
        productId: product.id,
        clientPhone: client.phone,
        estimatedSuccess: validation.estimatedSuccess
      }, "[Payment] MercadoPago link created successfully");

      return {
        url: data.init_point,
        shortUrl: shortUrl,
        method: "mercadopago",
        data: {
          estimatedSuccess: validation.estimatedSuccess,
          warnings: validation.warnings
        }
      };
    } catch (e: any) {
      logger.error({ err: e, tenantId: this.tenant.id }, "Error creando link MercadoPago");
      
      // Update health status on error
      await this.healthMonitor.checkServiceHealth('mercadopago');
      
      return null;
    }
  }

  async createPayPalLink(product: any, client: any): Promise<PaymentMethodResult | null> {
    // Validate service before attempting to create link
    const validation = await this.validatePayPalService(
      this.healthMonitor.getServiceHealth('paypal')
    );

    if (!validation.isValid) {
      logger.warn({ 
        errors: validation.errors, 
        warnings: validation.warnings 
      }, "[Payment] PayPal validation failed");
      return null;
    }

    if (validation.warnings.length > 0) {
      logger.warn({ warnings: validation.warnings }, "[Payment] PayPal warnings detected");
    }

    const paypalClientId = this.config.paypalClientId;
    if (!paypalClientId) return null;

    try {
      // Create PayPal payment using their API for dynamic links
      const exchangeRate = Number(process.env.PAYPAL_EXCHANGE_RATE) || 4300; 
      const amountUSD = Number(product.price || 0) / exchangeRate; // Convert COP to USD dynamically
      
      // Get PayPal access token with timeout
      const authResponse = await fetch(`https://api-m.paypal.com/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Language": "en_US",
          "Authorization": `Basic ${Buffer.from(`${paypalClientId}:${this.config.paypalClientSecret}`).toString('base64')}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(10000)
      });

      const authData = await authResponse.json() as any;
      if (!authResponse.ok) throw new Error("PayPal auth failed");

      // Create payment with timeout
      const paymentResponse = await fetch(`https://api-m.paypal.com/v1/payments/payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authData.access_token}`
        },
        body: JSON.stringify({
          intent: "sale",
          payer: {
            payment_method: "paypal"
          },
          transactions: [{
            amount: {
              total: amountUSD.toFixed(2),
              currency: "USD"
            },
            description: product.name,
            custom: `${client.phone}|${product.id}`,
            item_list: {
              items: [{
                name: product.name,
                sku: product.id?.toString() || "prod_" + Date.now(),
                price: amountUSD.toFixed(2),
                currency: "USD",
                quantity: 1
              }]
            }
          }],
          redirect_urls: {
            return_url: `${this.config.appUrl}/paypal-success`,
            cancel_url: `${this.config.appUrl}/paypal-cancel`
          }
        }),
        signal: AbortSignal.timeout(10000)
      });

      const paymentData = await paymentResponse.json() as any;
      if (!paymentResponse.ok) throw new Error(paymentData.message || "PayPal payment creation failed");

      // Find approval URL
      const approvalUrl = paymentData.links?.find((link: any) => link.rel === "approval_url")?.href;
      if (!approvalUrl) throw new Error("No approval URL found");

      // Create short URL
      const shortUrl = await URLShortener.createShortLink(
        approvalUrl, 
        "paypal", 
        product.id, 
        client.phone
      );

      // Log successful payment link creation
      logger.info({
        tenantId: this.tenant.id,
        productId: product.id,
        clientPhone: client.phone,
        amountUSD,
        estimatedSuccess: validation.estimatedSuccess
      }, "[Payment] PayPal link created successfully");

      return {
        url: approvalUrl,
        shortUrl: shortUrl,
        method: "paypal",
        data: {
          estimatedSuccess: validation.estimatedSuccess,
          warnings: validation.warnings,
          amountUSD
        }
      };
    } catch (e: any) {
      logger.error({ err: e, tenantId: this.tenant.id }, "Error creando link PayPal dinámico");
      
      // Update health status on error
      await this.healthMonitor.checkServiceHealth('paypal');
      
      // Fallback to simple PayPal link if API fails
      const amountUSD = Number(product.price || 0) / 4000;
      const baseUrl = this.config.paypalMode === "sandbox" ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";

      const params = new URLSearchParams({
        cmd: "_xclick",
        business: paypalClientId,
        item_name: product.name,
        amount: amountUSD.toFixed(2),
        currency_code: "USD",
        custom: `${client.phone}|${product.id}`,
        return: `${this.config.appUrl}/paypal-success`,
        cancel_return: `${this.config.appUrl}/paypal-cancel`,
        notify_url: `${this.config.appUrl}/api/webhooks/paypal`,
      });

      const fallbackUrl = `${baseUrl}/cgi-bin/webscr?${params.toString()}`;
      const shortUrl = await URLShortener.createShortLink(
        fallbackUrl, 
        "paypal", 
        product.id, 
        client.phone
      );

      logger.info({
        tenantId: this.tenant.id,
        productId: product.id,
        fallbackUsed: true
      }, "[Payment] PayPal fallback link created");

      return {
        url: fallbackUrl,
        shortUrl: shortUrl,
        method: "paypal",
        data: {
          estimatedSuccess: 70, // Lower success rate for fallback
          warnings: ["Using fallback PayPal integration"],
          fallback: true
        }
      };
    }
  }

  getTransferInfo() {
    return {
      method: "transfer",
      name: "Consignación / Transferencia",
      options: this.config.transferAccounts,
    };
  }

  async getAllLinks(product: any, client: any) {
    // Validate all services first
    const validationResults = await this.validatePaymentServices();
    const links: any = {
      transfer: this.getTransferInfo(),
      validation: {
        timestamp: new Date(),
        results: validationResults
      }
    };

    // Only create links for healthy services
    const mpValidation = validationResults.find(r => r.service === 'mercadopago');
    if (mpValidation?.isValid) {
      const mp = await this.createMercadoPagoLink(product, client);
      if (mp) links.mercadopago = mp;
    }

    const paypalValidation = validationResults.find(r => r.service === 'paypal');
    if (paypalValidation?.isValid) {
      const paypal = await this.createPayPalLink(product, client);
      if (paypal) links.paypal = paypal;
    }

    // Log payment link generation attempt
    logger.info({
      tenantId: this.tenant.id,
      productId: product.id,
      clientPhone: client.phone,
      availableMethods: Object.keys(links).filter(k => k !== 'validation'),
      validationResults: validationResults.map(r => ({
        service: r.service,
        valid: r.isValid,
        success: r.estimatedSuccess
      }))
    }, "[Payment] Payment links generated");

    return links;
  }

  /**
   * Gets payment analytics for the tenant
   */
  async getPaymentAnalytics(startDate: Date, endDate: Date): Promise<PaymentAnalytics> {
    try {
      // Get payment link usage data
      const paymentLinkData = await db
        .select()
        .from(paymentLinks)
        .where(
          and(
            gte(paymentLinks.createdAt, startDate),
            lte(paymentLinks.createdAt, endDate)
          )
        );

      const totalTransactions = paymentLinkData.length;
      const successfulTransactions = paymentLinkData.filter(link => link.clicks > 0).length;
      const failedTransactions = totalTransactions - successfulTransactions;
      const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;

      // Calculate method usage
      const methodUsage = paymentLinkData.reduce((acc, link) => {
        acc[link.method] = (acc[link.method] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const preferredMethods = Object.entries(methodUsage).map(([method, usage]) => ({
        method,
        usage,
        successRate: 85 // Simplified - in real implementation, track actual success rates
      }));

      return {
        totalTransactions,
        successfulTransactions,
        failedTransactions,
        successRate,
        averageAmount: 150000, // Simplified average
        preferredMethods
      };

    } catch (error) {
      logger.error({ error, tenantId: this.tenant.id }, "[Payment] Failed to get payment analytics");
      throw error;
    }
  }

  /**
   * Gets payment system health summary
   */
  getPaymentSystemHealth(): {
    overall: 'healthy' | 'degraded' | 'down';
    services: PaymentServiceHealth[];
    availableServices: number;
    totalServices: number;
  } {
    const services = this.healthMonitor.getAllServicesHealth();
    const healthyServices = services.filter(s => s.status === 'healthy').length;
    const totalServices = services.length;

    let overall: 'healthy' | 'degraded' | 'down' = 'down';
    if (healthyServices === totalServices) {
      overall = 'healthy';
    } else if (healthyServices > 0) {
      overall = 'degraded';
    }

    return {
      overall,
      services,
      availableServices: healthyServices,
      totalServices
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.healthMonitor.destroy();
  }
}

// Export URL shortener for use in routes
export { URLShortener };

// Export singleton health monitor
export const paymentHealthMonitor = new PaymentHealthMonitor();

// Export utility functions
export function getPaymentSystemHealth() {
  const gateway = new PaymentGateway();
  return gateway.getPaymentSystemHealth();
}

export async function validateAllPaymentServices(tenant?: TenantContext) {
  const gateway = new PaymentGateway(tenant);
  return gateway.validatePaymentServices();
}

export async function getPaymentAnalytics(
  startDate: Date, 
  endDate: Date, 
  tenant?: TenantContext
): Promise<PaymentAnalytics> {
  const gateway = new PaymentGateway(tenant);
  return gateway.getPaymentAnalytics(startDate, endDate);
}

// Export types
export type { 
  PaymentServiceHealth, 
  PaymentValidationResult, 
  PaymentAnalytics 
};
