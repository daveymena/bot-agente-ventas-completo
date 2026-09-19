import axios, { AxiosInstance } from "axios";
import { db, products, tenants } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { customerProductCopy } from "./dropi";

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
  // WooCommerce los devuelve siempre; faltaba declararlos, y por eso
  // nadie los miraba al decidir si el producto se despacha o no.
  type?: string;
  virtual?: boolean;
  downloadable?: boolean;
}

function extractDropiMeta(product: WooCommerceProduct): { description?: string; imageUrls: string[]; cost?: number; stock?: number } {
  const raw = product.meta_data?.find((item) => item.key === "_dropi_product")?.value || "";
  if (!raw || typeof raw !== "string") return { imageUrls: [] };

  const readString = (key: string) => {
    const match = raw.match(new RegExp(`s:${key.length}:"${key}";s:\\d+:"([\\s\\S]*?)";s:`, "i"));
    return match?.[1]?.replace(/\\"/g, '"') || "";
  };
  const readNumber = (key: string) => Number(readString(key).replace(/[^\d.-]/g, "")) || 0;
  const stockMatch = raw.match(/s:\d+:"stock";i:(-?\d+)/i);

  const imageUrls = [...raw.matchAll(/s:\d+:"urlS3";s:\d+:"([^"\\]+)"/gi)]
    .map((match) => match[1])
    .filter(Boolean)
    .map((url) => /^https?:\/\//i.test(url) ? url : `https://d39ru7awumhhs2.cloudfront.net/${encodeURI(url)}`);

  return {
    description: readString("description") || undefined,
    imageUrls: [...new Set(imageUrls)],
    cost: readNumber("sale_price") || undefined,
    stock: stockMatch ? Number(stockMatch[1]) : undefined,
  };
}

async function firstUsableImage(urls: string[]): Promise<string | null> {
  for (const url of [...new Set(urls)]) {
    try {
      const response = await fetch(url, {
        headers: { Range: "bytes=0-1023", "User-Agent": "VentasPro/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      const contentType = response.headers.get("content-type") || "";
      const bytes = await response.arrayBuffer();
      if (response.ok && contentType.toLowerCase().startsWith("image/") && bytes.byteLength > 100) {
        return url;
      }
    } catch {
      // Try the next source; one broken provider image must not block sync.
    }
  }
  return null;
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
   * Últimos pedidos de WooCommerce: es la única forma de saber si lo que el
   * bot mandó de verdad llegó (y en qué estado lo dejó Dropify).
   */
  async getOrders(params: { per_page?: number; status?: string } = {}): Promise<any[]> {
    try {
      const response = await this.client.get("/orders", {
        params: { per_page: params.per_page || 10, orderby: "date", order: "desc", ...(params.status ? { status: params.status } : {}) },
      });
      return response.data;
    } catch (error: any) {
      logger.error({ tenantId: this.tenantId, error: error.message }, "[WooCommerce] Error obteniendo pedidos");
      throw new Error(`Error obteniendo pedidos de WooCommerce: ${error.message}`);
    }
  }

  /**
   * Un pedido puntual, con su `meta_data`. Es donde Dropify deja escrito qué
   * hizo con él (`_is_dropi_order`): la respuesta del POST que lo crea NO lo
   * trae, porque el plugin escribe sobre otra instancia del pedido.
   */
  async getOrder(orderId: number): Promise<any> {
    try {
      const response = await this.client.get(`/orders/${orderId}`);
      return response.data;
    } catch (error: any) {
      logger.error({ tenantId: this.tenantId, orderId, error: error.message }, "[WooCommerce] Error obteniendo pedido");
      throw new Error(`Error obteniendo pedido ${orderId}: ${error.message}`);
    }
  }

  /**
   * Escribe metadatos en un producto (p. ej. el `_dropi_token` que Dropify
   * necesita para empujar el pedido a Dropi). WooCommerce acepta claves con
   * guion bajo por REST: `_dropi_product` ya se lee por acá.
   */
  async updateProductMeta(productId: number, meta: Array<{ key: string; value: any }>): Promise<any> {
    try {
      const response = await this.client.put(`/products/${productId}`, { meta_data: meta });
      logger.info({ tenantId: this.tenantId, productId, keys: meta.map((m) => m.key) }, "[WooCommerce] Meta de producto actualizada");
      return response.data;
    } catch (error: any) {
      logger.error({ tenantId: this.tenantId, productId, error: error.message }, "[WooCommerce] Error actualizando meta del producto");
      throw new Error(`Error actualizando el producto ${productId}: ${error.message}`);
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
          const shipping = 20000;
          const profit = 20000;
          const cost = dropiMeta.cost || parseFloat(wooProduct.price || wooProduct.regular_price) || 0;
          // El envío se cobra aparte al cliente; no se suma al precio publicado.
          const finalPrice = cost + profit;
          const imageUrls = [
            ...dropiMeta.imageUrls,
            ...(wooProduct.images || []).map((image) => image.src),
          ].filter(Boolean);
          // ── Una URL sin verificar vale mas que ninguna ────────────────
          //
          // `firstUsableImage` comprueba la foto BAJANDOLA DESDE EL SERVIDOR.
          // Las de Dropi viven en un CloudFront, y ese chequeo falla por
          // motivos que no tienen nada que ver con si la foto existe: un
          // timeout de 8s, un 403 al datacenter, una CDN lenta. Cuando fallan
          // todas devolvia null, y el cliente terminaba viendo el producto sin
          // foto aunque en su navegador la URL cargue perfecto.
          //
          // Verificada es mejor. Pero entre "sin verificar" y "ninguna", gana
          // sin verificar: el navegador del cliente sale a internet desde otra
          // IP y por otra ruta que este servidor.
          const imagenVerificada = await firstUsableImage(imageUrls);
          const imageUrl = imagenVerificada || imageUrls.find(Boolean) || null;
          if (!imagenVerificada && imageUrl) {
            logger.warn(
              { tenantId: this.tenantId, productId: wooProduct.id },
              "[WooCommerce] Ninguna imagen se pudo verificar desde el servidor: se guarda la primera igual",
            );
          }

          // Buscar por sku (clave estable e idempotente, sin depender de jsonb)
          const existingProduct = await db
            .select()
            .from(products)
            .where(and(eq(products.tenantId, this.tenantId), eq(products.sku, wooSku)))
            .limit(1);

          const productData = {
            tenantId: this.tenantId,
            name: wooProduct.name,
            description: customerProductCopy(
              wooProduct.description || wooProduct.short_description || dropiMeta.description,
              wooProduct.name,
            ),
            price: finalPrice,
            currency: "COP", // Ajustar según la configuración de la tienda
            category: wooProduct.categories[0]?.name || "General",
            imageUrl,
            sku: wooSku,
            features: wooProduct.attributes.map(attr => `${attr.name}: ${attr.options.join(", ")}`),
            isActive: dropiMeta.stock == null ? wooProduct.stock_status === "instock" : dropiMeta.stock > 0,
            // ── El tipo SALE DE WOO, no se asume ──────────────────────────
            //
            // Esto decia `kind: "physical"` fijo, para TODOS. En la base el
            // default es "digital", asi que cada sincronizacion convertia los
            // cursos en productos que se despachan por transportadora -- y el
            // bot les pedia cedula, ciudad y departamento a clientes que
            // compraban un curso que llega por correo (visto el 2026-09-02).
            //
            // Woo ya lo dice: `virtual` es "no se envia" y `downloadable` es
            // "es un archivo". Solo habia que leerlo.
            kind: (wooProduct.virtual || wooProduct.downloadable) ? "digital" : "physical",
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
                dropiCost: cost,
                shipping,
                profit,
                finalPrice,
                dropiStock: dropiMeta.stock ?? null,
              },
            }),
          };

          if (existingProduct.length > 0) {
            // ── Nunca se pisa una foto que YA funciona con nada ────────────
            //
            // Esto hacia `.set(productData)` entero, con `imageUrl: null`
            // adentro cuando la verificacion fallaba. O sea que un timeout de
            // la CDN borraba la foto buena que ya estaba guardada, y como la
            // sincronizacion corre sola, se volvia a borrar cada vez.
            //
            // Es el mismo defecto que `fixAllProductImages` (bcb972a): un
            // "arreglador" que, cuando no puede comprobar, destruye el dato en
            // vez de dejarlo quieto. Borrar lo que funciona nunca es el paso
            // seguro.
            const anterior = existingProduct[0] as any;
            const aGuardar: any = { ...productData };
            if (!aGuardar.imageUrl && anterior.imageUrl) {
              delete aGuardar.imageUrl;
              logger.warn(
                { tenantId: this.tenantId, productId: wooProduct.id },
                "[WooCommerce] Sin imagen nueva: se conserva la que ya tenia",
              );
            }
            await db
              .update(products)
              .set(aGuardar)
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
