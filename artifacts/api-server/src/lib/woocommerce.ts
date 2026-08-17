// @ts-nocheck
import axios, { AxiosInstance } from "axios";
import { db, products, tenants } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { cleanProductCopy } from "./dropi";

export interface WooCommerceConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  version?: string;
}

export interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  price: string;
  regular_price: string;
  sale_price: string;
  description: string;
  short_description: string;
  categories: Array<{ id: number; name: string; slug: string }>;
  images: Array<{ id: number; src: string; name: string; alt: string }>;
  stock_status: string;
  stock_quantity: number | null;
  sku: string;
  attributes: Array<{ id: number; name: string; options: string[] }>;
  meta_data?: Array<{ key: string; value: string }>;
}

function extractDropiMeta(product: WooCommerceProduct): { description?: string; imageUrls: string[] } {
  const raw = product.meta_data?.find((item) => item.key === "_dropi_product")?.value || "";
  if (!raw || typeof raw !== "string") return { imageUrls: [] };

  const readString = (key: string) => {
    const match = raw.match(new RegExp(`s:${key.length}:"${key}";s:\\d+:"([\\s\\S]*?)";s:`, "i"));
    return match?.[1]?.replace(/\\"/g, '"') || "";
  };

  const imageUrls = [...raw.matchAll(/s:\d+:"(?:url|urlS3)";s:\d+:"([^"\\]+)"/gi)]
    .map((match) => match[1])
    .filter((url) => /^https?:\/\//i.test(url));

  return {
    description: readString("description") || undefined,
    imageUrls: [...new Set(imageUrls)],
  };
}

export interface WooCommerceOrder {
  billing: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address_1?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items: Array<{
    product_id: number;
    quantity: number;
  }>;
  payment_method?: string;
  payment_method_title?: string;
  set_paid?: boolean;
  status?: string;
  customer_note?: string;
}

export class WooCommerceService {
  private client: AxiosInstance;
  private tenantId: number;

  constructor(config: WooCommerceConfig, tenantId: number) {
    this.tenantId = tenantId;
    
    // Crear cliente axios con autenticación básica
    const baseURL = `${config.storeUrl}/wp-json/${config.version || "wc/v3"}`;
    
    this.client = axios.create({
      baseURL,
      auth: {
        username: config.consumerKey,
        password: config.consumerSecret,
      },
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Obtener todos los productos de WooCommerce
   */
  async getProducts(params: { per_page?: number; page?: number; status?: string } = {}): Promise<WooCommerceProduct[]> {
    try {
      const response = await this.client.get("/products", {
        params: {
          per_page: params.per_page || 100,
          page: params.page || 1,
          status: params.status || "publish",
        },
      });

      logger.info({ 
        tenantId: this.tenantId, 
        count: response.data.length 
      }, "[WooCommerce] Productos obtenidos");

      return response.data;
    } catch (error) {
      logger.error({ 
        tenantId: this.tenantId, 
        error: error.message 
      }, "[WooCommerce] Error obteniendo productos");
      throw new Error(`Error obteniendo productos de WooCommerce: ${error.message}`);
    }
  }

  /**
   * Obtener un producto específico por ID
   */
  async getProduct(productId: number): Promise<WooCommerceProduct> {
    try {
      const response = await this.client.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      logger.error({ 
        tenantId: this.tenantId, 
        productId, 
        error: error.message 
      }, "[WooCommerce] Error obteniendo producto");
      throw new Error(`Error obteniendo producto ${productId}: ${error.message}`);
    }
  }

  /**
   * Crear una orden en WooCommerce
   */
  async createOrder(orderData: WooCommerceOrder): Promise<any> {
    try {
      const response = await this.client.post("/orders", orderData);
      
      logger.info({ 
        tenantId: this.tenantId, 
        orderId: response.data.id,
        total: response.data.total
      }, "[WooCommerce] Orden creada");

      return response.data;
    } catch (error) {
      logger.error({ 
        tenantId: this.tenantId, 
        error: error.message 
      }, "[WooCommerce] Error creando orden");
      throw new Error(`Error creando orden en WooCommerce: ${error.message}`);
    }
  }

  /**
   * Actualizar el estado de una orden
   */
  async updateOrderStatus(orderId: number, status: string): Promise<any> {
    try {
      const response = await this.client.put(`/orders/${orderId}`, { status });
      
      logger.info({ 
        tenantId: this.tenantId, 
        orderId, 
        status 
      }, "[WooCommerce] Estado de orden actualizado");

      return response.data;
    } catch (error) {
      logger.error({ 
        tenantId: this.tenantId, 
        orderId, 
        error: error.message 
      }, "[WooCommerce] Error actualizando orden");
      throw new Error(`Error actualizando orden ${orderId}: ${error.message}`);
    }
  }

  /**
   * Sincronizar productos de WooCommerce a la base de datos local
   */
  async syncProducts(): Promise<{ synced: number; errors: number }> {
    try {
      logger.info({ tenantId: this.tenantId }, "[WooCommerce] Iniciando sincronización de productos");

      const wooProducts = await this.getProducts({ per_page: 100 });
      let synced = 0;
      let errors = 0;

      for (const wooProduct of wooProducts) {
        try {
          const wooSku = `woo-${wooProduct.id}`;
          const dropiMeta = extractDropiMeta(wooProduct);
          const imageUrls = [
            ...(wooProduct.images || []).map((image) => image.src),
            ...dropiMeta.imageUrls,
          ].filter(Boolean);

          // Buscar por sku (clave estable e idempotente, sin depender de jsonb)
          const existingProduct = await db
            .select()
            .from(products)
            .where(and(eq(products.tenantId, this.tenantId), eq(products.sku, wooSku)))
            .limit(1);

          const productData = {
            tenantId: this.tenantId,
            name: wooProduct.name,
            description: cleanProductCopy(
              wooProduct.description || wooProduct.short_description || dropiMeta.description,
            ) || wooProduct.name,
            price: parseFloat(wooProduct.price || wooProduct.regular_price) || 0,
            currency: "COP", // Ajustar según la configuración de la tienda
            category: wooProduct.categories[0]?.name || "General",
            imageUrl: imageUrls[0] || null,
            sku: wooSku,
            features: wooProduct.attributes.map(attr => `${attr.name}: ${attr.options.join(", ")}`),
            isActive: wooProduct.stock_status === "instock",
            kind: "physical",
            metadata: JSON.stringify({
              woocommerce: {
                id: wooProduct.id,
                sku: wooProduct.sku,
                permalink: wooProduct.permalink,
                stock_quantity: wooProduct.stock_quantity,
                price: wooProduct.price,
                regular_price: wooProduct.regular_price,
                sale_price: wooProduct.sale_price,
                imageUrls: [...new Set(imageUrls)],
              },
            }),
          };

          if (existingProduct.length > 0) {
            // Actualizar producto existente
            await db
              .update(products)
              .set(productData)
              .where(eq(products.id, existingProduct[0].id as number));
          } else {
            // Crear nuevo producto
            await db.insert(products).values(productData);
          }

          synced++;
        } catch (error) {
          logger.error({ 
            tenantId: this.tenantId, 
            productId: wooProduct.id, 
            error: error.message 
          }, "[WooCommerce] Error sincronizando producto");
          errors++;
        }
      }

      // Actualizar última sincronización
      await db
        .update(tenants)
        .set({
          woocommerceIntegration: {
            ...((await db.select().from(tenants).where(eq(tenants.id, this.tenantId)).limit(1))[0]
              .woocommerceIntegration as any),
            lastSync: new Date().toISOString(),
          },
        })
        .where(eq(tenants.id, this.tenantId));

      logger.info({ 
        tenantId: this.tenantId, 
        synced, 
        errors 
      }, "[WooCommerce] Sincronización completada");

      return { synced, errors };
    } catch (error) {
      logger.error({ 
        tenantId: this.tenantId, 
        error: error.message 
      }, "[WooCommerce] Error en sincronización");
      throw new Error(`Error sincronizando productos: ${error.message}`);
    }
  }

  /**
   * Crear orden automáticamente desde una conversación
   */
  async createOrderFromConversation(data: {
    productId: number;
    customerName: string;
    customerEmail?: string;
    customerPhone: string;
    quantity?: number;
    paymentMethod?: string;
  }): Promise<any> {
    try {
      // Obtener el producto local
      const [localProduct] = await db
        .select()
        .from(products)
        .where(eq(products.id, data.productId))
        .limit(1);

      const wooRef =
        localProduct && localProduct.metadata
          ? (JSON.parse(String(localProduct.metadata))?.woocommerce as any)
          : null;

      if (!localProduct || !wooRef?.id) {
        throw new Error("Producto no encontrado o no está sincronizado con WooCommerce");
      }

      const wooProductId = parseInt(String(wooRef.id));

      // Separar nombre en first_name y last_name
      const nameParts = data.customerName.split(" ");
      const firstName = nameParts[0] || data.customerName;
      const lastName = nameParts.slice(1).join(" ") || "";

      const orderData: WooCommerceOrder = {
        billing: {
          first_name: firstName,
          last_name: lastName,
          email: data.customerEmail || `${data.customerPhone}@whatsapp.com`,
          phone: data.customerPhone,
        },
        line_items: [
          {
            product_id: wooProductId,
            quantity: data.quantity || 1,
          },
        ],
        payment_method: data.paymentMethod || "bacs",
        payment_method_title: data.paymentMethod || "Transferencia Bancaria",
        status: "pending",
        customer_note: `Orden creada automáticamente desde WhatsApp Bot - Teléfono: ${data.customerPhone}`,
      };

      const order = await this.createOrder(orderData);

      logger.info({ 
        tenantId: this.tenantId, 
        orderId: order.id,
        productId: data.productId,
        customerPhone: data.customerPhone
      }, "[WooCommerce] Orden creada desde conversación");

      return order;
    } catch (error) {
      logger.error({ 
        tenantId: this.tenantId, 
        error: error.message 
      }, "[WooCommerce] Error creando orden desde conversación");
      throw new Error(`Error creando orden: ${error.message}`);
    }
  }
}

/**
 * Obtener instancia de WooCommerceService para un tenant
 */
export async function getWooCommerceService(tenantId: number): Promise<WooCommerceService | null> {
  try {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant || !tenant.woocommerceIntegration) {
      return null;
    }

    const config = tenant.woocommerceIntegration as any;

    if (!config.enabled || !config.storeUrl || !config.consumerKey || !config.consumerSecret) {
      return null;
    }

    return new WooCommerceService(
      {
        storeUrl: config.storeUrl,
        consumerKey: config.consumerKey,
        consumerSecret: config.consumerSecret,
      },
      tenantId
    );
  } catch (error) {
    logger.error({ tenantId, error: error.message }, "[WooCommerce] Error obteniendo servicio");
    return null;
  }
}
