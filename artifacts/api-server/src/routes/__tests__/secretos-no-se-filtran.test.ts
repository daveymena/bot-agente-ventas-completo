/**
 * SECRETOS: SOLO ASTERISCOS, Y UNA MÁSCARA NUNCA PISA LO GUARDADO
 *
 * Pedido del dueño (07-10-2026): "cualquier contraseña que se vea en la app,
 * en las API de Facebook o de cualquier parte, que solo se vean asteriscos".
 *
 * Se prueba contra las rutas reales (Express + la base SQLite de pruebas):
 *  1. ningún GET devuelve un secreto completo;
 *  2. un PUT con el campo vacío o con la máscara ("••••abcd") deja la clave
 *     guardada intacta;
 *  3. los textos que llegan a Atlas y a los logs salen sin tokens.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, tenants } from "@workspace/db";
import { decryptSecret, encryptSecret } from "../../lib/credentials-vault";
import { tenantManager } from "../../lib/tenantManager";
import {
  esValorEnmascarado, secretoNuevo, enmascararSecreto, redactarSecretos, sinSecretos,
} from "../../lib/secretos";

const TOKEN_FB = "EAAGm0PX4ZCpsBAKZCZBtokenrealdefacebook9876";
const APP_SECRET = "a1b2c3d4e5f6a7b8c9d0secretodelaapp";
const VERIFY = "mi_verify_token_secreto_2026";
const WOO_KEY = "ck_0123456789abcdef0123456789abcdef01234567";
const WOO_SECRET = "cs_fedcba9876543210fedcba9876543210fedcba98";
const MP_TOKEN = "APP_USR-1234567890123456-100726-abcdefabcdefabcdefabcdef-123456";
const SMTP_PASS = "abcd efgh ijkl mnop";

let servidor: Server;
let base = "";
let tenantId = 0;

/** El texto de la respuesta no puede contener NINGUNO de los secretos completos. */
function sinNingunSecreto(texto: string) {
  for (const s of [TOKEN_FB, APP_SECRET, VERIFY, WOO_KEY, WOO_SECRET, MP_TOKEN, SMTP_PASS]) {
    expect(texto).not.toContain(s);
  }
}

async function metaDeLaBase(): Promise<any> {
  const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const m = (fila as any)?.metadata;
  return typeof m === "string" ? JSON.parse(m) : m || {};
}

async function pedir(metodo: string, ruta: string, cuerpo?: any) {
  const r = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: any = null;
  try { json = JSON.parse(texto); } catch { /* no json */ }
  return { status: r.status, texto, json };
}

beforeAll(async () => {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [t] = await db.insert(tenants).values({
    name: "Secretos", email: `secretos-${s}@test.local`, slug: `secretos-${s}`, brandName: "Secretos",
    paymentMethods: { mercadopago: { accessToken: encryptSecret(MP_TOKEN), enabled: true } },
    metadata: {
      facebook: {
        accessToken: encryptSecret(TOKEN_FB),
        appSecret: encryptSecret(APP_SECRET),
        messengerVerifyToken: VERIFY,
        pageId: "111",
      },
      email: { host: "smtp.test", port: 587, user: "a@b.co", pass: encryptSecret(SMTP_PASS), enabled: true },
    },
  } as any).returning();
  tenantId = t.id;
  tenantManager.clearCache();

  const app = express();
  app.use(express.json());
  // Lo que hace resolveTenant() con una sesión real.
  app.use(async (req: any, _res, next) => {
    req.signedCookies = { tenant_id: String(tenantId) };
    req.tenant = await tenantManager.getTenantById(tenantId);
    next();
  });
  const [{ default: tenantsRouter }, { default: wooRouter }, { default: fbRouter }, { default: fbCred }, { default: payCred }, { default: emailCred }, { default: aiRouter }] = await Promise.all([
    import("../tenants"), import("../woocommerce"), import("../facebook"),
    import("../facebook-credentials"), import("../payment-credentials"), import("../email-credentials"),
    import("../ai-catalog"),
  ]);
  app.use("/api/ai", aiRouter);
  app.use("/api/tenants", tenantsRouter);
  app.use("/api/woocommerce", wooRouter);
  app.use("/api/facebook", fbRouter);
  app.use("/api/facebook", fbCred);
  app.use("/api/payments", payCred);
  app.use("/api/email-config", emailCred);
  servidor = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => servidor.once("listening", () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => servidor?.close(() => r()));
});

describe("reglas de lib/secretos", () => {
  it("reconoce las máscaras y no las toma como secreto nuevo", () => {
    for (const m of ["••••abcd", "••••••••", "***CONFIGURED***", "APP_...abcd", "••••••••x"]) {
      expect(esValorEnmascarado(m)).toBe(true);
      expect(secretoNuevo(m)).toBeNull();
    }
    expect(secretoNuevo("")).toBeNull();
    expect(secretoNuevo("   ")).toBeNull();
    expect(secretoNuevo(undefined)).toBeNull();
    expect(secretoNuevo(" sk-real ")).toBe("sk-real");
    // Una contraseña real con UN asterisco no es una máscara.
    expect(secretoNuevo("clave*segura")).toBe("clave*segura");
  });

  it("la máscara deja ver solo los últimos 4", () => {
    expect(enmascararSecreto(TOKEN_FB)).toBe(`••••${TOKEN_FB.slice(-4)}`);
    expect(enmascararSecreto("corto")).toBe("••••");
    expect(enmascararSecreto("")).toBe("");
  });

  it("redacta la URL de Postgres del log de arranque, el git push de Atlas y los Bearer", () => {
    const db = redactarSecretos("[DB-ENV] DATABASE_URL=postgres://postgres:6715320@te-host:5432/ventas");
    expect(db).not.toContain("6715320");
    expect(db).toContain("te-host:5432");

    const push = redactarSecretos("Command failed: git push https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/x/y.git");
    expect(push).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123");

    expect(redactarSecretos("Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz")).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(redactarSecretos(`https://graph.facebook.com/me?access_token=${TOKEN_FB}&x=1`)).not.toContain(TOKEN_FB);
    expect(redactarSecretos(`token ${TOKEN_FB}`)).not.toContain(TOKEN_FB);
  });

  it("sinSecretos enmascara a cualquier profundidad", () => {
    const limpio = sinSecretos({ a: { accessToken: TOKEN_FB, n: 1 }, lista: [{ consumerSecret: WOO_SECRET }], apiKeys: { groq: "gsk_1234567890abcdef" } });
    sinNingunSecreto(JSON.stringify(limpio));
    expect(JSON.stringify(limpio)).not.toContain("gsk_1234567890abcdef");
    expect((limpio as any).a.n).toBe(1);
  });
});

describe("ningún GET devuelve un secreto completo", () => {
  it("GET /api/tenants/current (antes devolvía el contexto con todo descifrado)", async () => {
    const r = await pedir("GET", "/api/tenants/current");
    expect(r.status).toBe(200);
    sinNingunSecreto(r.texto);
    expect(r.json.tenant.facebook.accessToken).toBe(`••••${TOKEN_FB.slice(-4)}`);
  });

  it("GET /api/facebook/config no devuelve el token, el app secret ni el verify token", async () => {
    const r = await pedir("GET", "/api/facebook/config");
    expect(r.status).toBe(200);
    sinNingunSecreto(r.texto);
    expect(r.json.hasToken).toBe(true);
    expect(r.json.hasMessengerVerifyToken).toBe(true);
    expect(r.json.messengerVerifyToken).toBe("");
  });

  it("GET /api/facebook/credentials, /api/payments/credentials y /api/email-config", async () => {
    for (const ruta of ["/api/facebook/credentials", "/api/payments/credentials", "/api/email-config"]) {
      const r = await pedir("GET", ruta);
      expect(r.status, ruta).toBe(200);
      sinNingunSecreto(r.texto);
    }
  });
});

describe("una máscara o un vacío NO pisan lo guardado", () => {
  it("Facebook (/config): la máscara + una letra ya no reemplaza el token", async () => {
    const r = await pedir("PUT", "/api/facebook/config", {
      accessToken: "••••••••x",
      appSecret: "",
      messengerVerifyToken: `••••${VERIFY.slice(-4)}`,
      pixelId: "222",
    });
    expect(r.status).toBe(200);
    const fb = (await metaDeLaBase()).facebook;
    expect(decryptSecret(fb.accessToken)).toBe(TOKEN_FB);
    expect(decryptSecret(fb.appSecret)).toBe(APP_SECRET);
    expect(fb.messengerVerifyToken).toBe(VERIFY);
    expect(fb.pixelId).toBe("222");
  });

  it("Facebook (/credentials): reenviar lo que mostró el GET no cambia nada", async () => {
    const antes = (await pedir("GET", "/api/facebook/credentials")).json;
    tenantManager.clearCache();
    const r = await pedir("PUT", "/api/facebook/credentials", {
      accessToken: antes.accessToken, appSecret: antes.appSecret, messengerVerifyToken: antes.messengerVerifyToken,
    });
    expect(r.status).toBe(200);
    const fb = (await metaDeLaBase()).facebook;
    expect(decryptSecret(fb.accessToken)).toBe(TOKEN_FB);
    expect(decryptSecret(fb.appSecret)).toBe(APP_SECRET);
    expect(fb.messengerVerifyToken).toBe(VERIFY);
  });

  it("MercadoPago: la pista enmascarada no reemplaza el token", async () => {
    tenantManager.clearCache();
    const pista = (await pedir("GET", "/api/payments/credentials")).json.mercadopago.pista;
    expect(pista).not.toBe("");
    const r = await pedir("PUT", "/api/payments/credentials", { mercadopago: { accessToken: pista } });
    expect(r.status).toBe(200);
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const pm: any = typeof (fila as any).paymentMethods === "string" ? JSON.parse((fila as any).paymentMethods) : (fila as any).paymentMethods;
    expect(decryptSecret(pm.mercadopago.accessToken)).toBe(MP_TOKEN);
  });

  it("Correo: una máscara en la contraseña no la reemplaza", async () => {
    const r = await pedir("PUT", "/api/email-config", { pass: "••••mnop", host: "smtp.test" });
    expect(r.status).toBe(200);
    const em = (await metaDeLaBase()).email;
    expect(decryptSecret(em.pass)).toBe(SMTP_PASS);
  });

  it("WooCommerce: se guarda CIFRADO, el GET no lo devuelve, y vacío/máscara no lo pisan", async () => {
    let r = await pedir("PUT", "/api/woocommerce/config", {
      enabled: true, storeUrl: "https://tienda.test", consumerKey: WOO_KEY, consumerSecret: WOO_SECRET,
    });
    expect(r.status).toBe(200);
    sinNingunSecreto(r.texto);

    let [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    let woo: any = (fila as any).woocommerceIntegration;
    woo = typeof woo === "string" ? JSON.parse(woo) : woo;
    // En la base ya no queda en texto plano.
    expect(JSON.stringify(woo)).not.toContain(WOO_KEY);
    expect(decryptSecret(woo.consumerKey)).toBe(WOO_KEY);

    r = await pedir("GET", "/api/woocommerce/config");
    sinNingunSecreto(r.texto);
    expect(r.json.consumerKey).toBe("");
    expect(r.json.hasCredentials).toBe(true);

    r = await pedir("PUT", "/api/woocommerce/config", { enabled: true, consumerKey: "••••••••", consumerSecret: "" });
    expect(r.status).toBe(200);
    [fila] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    woo = (fila as any).woocommerceIntegration;
    woo = typeof woo === "string" ? JSON.parse(woo) : woo;
    expect(decryptSecret(woo.consumerKey)).toBe(WOO_KEY);
    expect(decryptSecret(woo.consumerSecret)).toBe(WOO_SECRET);
  });

  it("WooCommerce: las credenciales viejas en texto plano se siguen leyendo", async () => {
    await db.update(tenants).set({ woocommerceIntegration: { enabled: true, storeUrl: "https://t.test", consumerKey: WOO_KEY, consumerSecret: WOO_SECRET } } as any).where(eq(tenants.id, tenantId));
    const { getWooCommerceService } = await import("../../lib/woocommerce");
    const svc: any = await getWooCommerceService(tenantId);
    expect(svc).toBeTruthy();
    const auth = svc.client?.defaults?.auth || svc.api?.defaults?.auth;
    if (auth) expect(auth.username).toBe(WOO_KEY);
  });

  it("Integraciones: guardar Shopify no borra el resto de la metadata ni acepta máscaras", async () => {
    const { guardarCredenciales, leerCredenciales } = await import("../../lib/integraciones/credenciales");
    await guardarCredenciales(tenantId, "shopify", { tienda: "x.myshopify.com", token: "shpat_realtoken1234567890" });
    await guardarCredenciales(tenantId, "shopify", { token: "••••7890" });
    const meta = await metaDeLaBase();
    // Antes la metadata se leía de un objeto que no la tenía: guardar una
    // integración dejaba `metadata = { integraciones }` y borraba Facebook.
    expect(decryptSecret(meta.facebook.accessToken)).toBe(TOKEN_FB);
    const cred = await leerCredenciales(tenantId, "shopify");
    expect(cred?.token).toBe("shpat_realtoken1234567890");
  });
});

describe("claves de IA del negocio (/api/ai/provider)", () => {
  const GROQ = "gsk_claverealdegroq1234567890abcdef";
  it("vacío o máscara no borran ni reemplazan la clave; el catálogo no la devuelve", async () => {
    // Un cliente cualquiera (no el dueño de la plataforma): su clave va a su negocio.
    const previo = process.env.PLATFORM_TENANT_ID;
    process.env.PLATFORM_TENANT_ID = String(tenantId + 100000);
    try {
    const { clavesDelTenant } = await import("../../lib/ai-keys-tenant");
    expect((await pedir("PUT", "/api/ai/provider", { proveedor: "groq", apiKey: GROQ })).status).toBe(200);
    expect((await clavesDelTenant(tenantId)).groq?.apiKey).toBe(GROQ);

    // Antes: apiKey "" BORRABA la clave y una máscara se cifraba como clave.
    await pedir("PUT", "/api/ai/provider", { proveedor: "groq", apiKey: "" });
    await pedir("PUT", "/api/ai/provider", { proveedor: "groq", apiKey: "••••cdef" });
    expect((await clavesDelTenant(tenantId)).groq?.apiKey).toBe(GROQ);

    const cat = await pedir("GET", "/api/ai/catalog");
    expect(cat.texto).not.toContain(GROQ);

    // Borrar sigue siendo posible, pero tiene que pedirse explícitamente.
    await pedir("PUT", "/api/ai/provider", { proveedor: "groq", borrarClave: true });
    expect((await clavesDelTenant(tenantId)).groq?.apiKey).toBeUndefined();
    } finally {
      if (previo === undefined) delete process.env.PLATFORM_TENANT_ID; else process.env.PLATFORM_TENANT_ID = previo;
    }
  });
});

describe("Atlas no recibe tokens en lo que devuelven sus herramientas", () => {
  it("redactarResultado limpia summary y data", async () => {
    const { redactarResultado } = await import("../../lib/app-operator");
    const r = redactarResultado({
      ok: false,
      summary: "No se pudo subir: Command failed: git push https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/a/b.git",
      data: { token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", ok: 1 },
    } as any);
    expect(r.summary).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123");
    expect(JSON.stringify(r.data)).not.toContain("dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U");
  });
});
