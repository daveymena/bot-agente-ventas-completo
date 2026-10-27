import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../lib/credentials-vault";

vi.mock("../../lib/meta-cuentas-publicitarias", () => ({
  listarCuentasAccesibles: async () => ({ cuentas: [], avisos: [], error: null }),
  elegirCuentaAlConectar: () => null,
}));

const nativeFetch = globalThis.fetch;
let server: Server;
let base: string;
let tenantA: number;
let tenantB: number;
const graphCalls: string[] = [];
const pages = [{ id: "page-a", name: "Página A", access_token: "page-token-a", tasks: ["CREATE_CONTENT"] }, { id: "page-b", name: "Página B", access_token: "page-token-b", tasks: ["CREATE_CONTENT"] }];
const envAnterior = { ...process.env };

async function meta(id: number) {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
}
async function post(id: number, body: any) {
  const res = await nativeFetch(base + "/fb-connect", { method: "POST", headers: { "Content-Type": "application/json", "x-test-tenant": String(id) }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() as any };
}

beforeAll(async () => {
  process.env.FB_CONNECT_ENABLED = "true";
  process.env.FB_APP_ID = "platform-app";
  process.env.FB_APP_SECRET = "platform-secret";
  for (const name of ["A", "B"]) {
    const suffix = `${Date.now()}-${name}`;
    const [row] = await db.insert(tenants).values({ name, email: `${suffix}@test.local`, slug: suffix, brandName: name,
      metadata: { facebook: { appId: `app-${name}`, appSecret: encryptSecret(`secret-${name}`) }, keep: "unrelated" },
    } as any).returning();
    if (name === "A") tenantA = row.id; else tenantB = row.id;
  }
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => {
    const url = new URL(String(input));
    if (url.hostname !== "graph.facebook.com") return nativeFetch(input, init);
    graphCalls.push(url.toString());
    let value: any = {};
    if (url.pathname.endsWith("/oauth/access_token")) value = { access_token: url.searchParams.has("code") ? "short-user" : "long-user" };
    else if (url.pathname.endsWith("/me/accounts")) value = { data: pages };
    else if (url.pathname.endsWith("/me/permissions")) value = { data: [{ permission: "pages_manage_posts", status: "granted" }] };
    else if (url.pathname.endsWith("/subscribed_apps")) value = { success: true };
    else throw new Error("Graph call inesperada: " + url.pathname);
    return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.tenant = { id: Number(req.headers["x-test-tenant"]) || undefined }; next(); });
  app.use("/facebook", (await import("../facebook")).default);
  app.use((await import("../public")).default);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()));
  vi.unstubAllGlobals();
  process.env = envAnterior;
});

describe("conexión real Express + BD, Graph simulado", () => {
  it("el botón recibe la app efectiva del negocio sin su secreto", async () => {
    const res = await nativeFetch(base + "/facebook/login-config", { headers: { "x-test-tenant": String(tenantA) } });
    const text = await res.text();
    const data = JSON.parse(text);
    expect(data.appId).toBe("app-A");
    expect(data.enabled).toBe(true);
    expect(data.origen).toBe("negocio");
    expect(data.loginConfigId).toBeNull();
    expect(text).not.toContain("secret-A");
    expect(text).not.toContain("platform-secret");
  });
  it("exige la sesión y no acepta tenantId enviado en el cuerpo", async () => {
    expect((await post(0, { tenantId: tenantB, userToken: "injected" })).status).toBe(401);
  });
  it("canjea con la app del negocio y espera la elección sin tocar el otro negocio", async () => {
    const res = await post(tenantA, { tenantId: tenantB, code: "one-use", redirectUri: "https://app.example/facebook" });
    expect(res.status).toBe(200);
    expect(res.data.requiresPageSelection).toBe(true);
    expect(res.data.pages).toEqual(pages.map(({ id, name }) => ({ id, name })));
    expect(JSON.stringify(res.data)).not.toMatch(/long-user|page-token/);
    const exchange = new URL(graphCalls.find(url => url.includes("code="))!);
    expect(exchange.searchParams.get("client_id")).toBe("app-A");
    expect(exchange.searchParams.get("client_secret")).toBe("secret-A");
    const a = await meta(tenantA);
    expect(a.facebook.pageId).toBeUndefined();
    expect(a.facebookConnectionPending.userAccessToken).not.toBe("long-user");
    expect(decryptSecret(a.facebookConnectionPending.userAccessToken)).toBe("long-user");
    expect((await meta(tenantB)).facebookConnectionPending).toBeUndefined();
  });
  it("otro negocio no puede usar la selección pendiente", async () => {
    expect((await post(tenantB, { pageId: "page-b", tenantId: tenantA })).status).toBe(409);
  });
  it("rechaza una página no compartida sin modificar la conexión", async () => {
    expect((await post(tenantA, { pageId: "foreign-page" })).status).toBe(403);
    expect((await meta(tenantA)).facebook.pageId).toBeUndefined();
  });
  it("conecta la página elegida sin reusar el código ni exponer tokens", async () => {
    const res = await post(tenantA, { pageId: "page-b" });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);
    expect(res.data.page.id).toBe("page-b");
    expect(res.data.canPost).toBe(true);
    expect(JSON.stringify(res.data)).not.toMatch(/long-user|page-token/);
    const a = await meta(tenantA);
    expect(a.facebook.pageId).toBe("page-b");
    expect(decryptSecret(a.facebook.accessToken)).toBe("page-token-b");
    expect(a.keep).toBe("unrelated");
    expect(a.facebookConnectionPending).toBeUndefined();
    expect(graphCalls.filter(url => url.includes("code=")).length).toBe(1);
    expect(new URL(graphCalls.find(url => url.includes("/me/permissions"))!).searchParams.get("access_token")).toBe("long-user");
    expect((await post(tenantA, { pageId: "page-a" })).status).toBe(409);
  });
  it("permite elegir otra página usando el token guardado del mismo negocio", async () => {
    const res = await post(tenantA, { selectPage: true });
    expect(res.data.requiresPageSelection).toBe(true);
    expect((await meta(tenantA)).facebook.pageId).toBe("page-b");
    const changed = await post(tenantA, { pageId: "page-a" });
    expect(changed.data.page.id).toBe("page-a");
    expect(graphCalls.filter(url => url.includes("code=")).length).toBe(1);
  });
  it("rechaza la selección vencida", async () => {
    const b = await meta(tenantB);
    b.facebookConnectionPending = { appId: "app-B", userAccessToken: encryptSecret("long-user"), expiresAt: Date.now() - 1 };
    await db.update(tenants).set({ metadata: b }).where(eq(tenants.id, tenantB));
    expect((await post(tenantB, { pageId: "page-a" })).status).toBe(409);
  });

});
