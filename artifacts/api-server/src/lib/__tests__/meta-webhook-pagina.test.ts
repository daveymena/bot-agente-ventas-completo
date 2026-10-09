import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db, tenants, conversations, messages } from "@workspace/db";

/**
 * El webhook de Meta: comentarios, Messenger e Instagram, por negocio.
 *
 * Lo que estaba roto (07-10-2026), leyendo el código:
 *   - los comentarios llegaban al ChannelManager SIN negocio y este los
 *     descarta: ningún comentario se contestó nunca;
 *   - Messenger guardaba todo en el negocio 1 con el token del dueño;
 *   - el objeto "instagram" se ignoraba entero;
 *   - cada ruta entendía solo una parte de lo que Meta manda a UNA url.
 *
 * Acá no se llama a Meta: `fetch` está interceptado y se mira QUÉ se le
 * habría mandado y con el token de QUIÉN.
 */
vi.mock("../agent", () => ({
  runAgentReply: vi.fn(async () => ({ content: "Te cuento por privado", parts: [{ kind: "text", content: "Te cuento por privado" }] })),
}));

import { leerEventosDeMeta, procesarWebhookDeMeta, _olvidarMensajesVistos } from "../meta-webhook-pagina";
import { _olvidarVistos } from "../facebook-comments";
import { tenantManager } from "../tenantManager";

type Llamada = { url: string; body: any };
let llamadas: Llamada[] = [];

function instalarFetch(respuestas: Record<string, any> = {}) {
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
    let body: any = init?.body;
    try { body = body ? JSON.parse(body) : undefined; } catch { /* form */ }
    llamadas.push({ url: String(url), body });
    const clave = Object.keys(respuestas).find((k) => String(url).includes(k));
    return { ok: true, status: 200, json: async () => (clave ? respuestas[clave] : { success: true, id: "x" }) } as any;
  }));
}

async function negocioConPagina(pageId: string, token: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [t] = await db.insert(tenants).values({
    name: "Tienda Meta", email: `meta-${sufijo}@test.local`, slug: `meta-${sufijo}`, brandName: "Tienda Meta",
    metadata: { facebook: { pageId, accessToken: token } },
  } as any).returning();
  tenantManager.clearCache();
  return t;
}

const comentarioFb = (pageId: string, commentId: string, de = "USER1") => ({
  object: "page",
  entry: [{ id: pageId, changes: [{ field: "feed", value: {
    item: "comment", verb: "add", comment_id: commentId, post_id: `${pageId}_POST`, message: "¿Cuánto vale?", from: { id: de, name: "Ana Pérez" },
  } }] }],
});

beforeEach(() => { _olvidarVistos(); _olvidarMensajesVistos(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("lectura del webhook", () => {
  it("entiende Messenger, comentarios y leads de la página", () => {
    const ev = leerEventosDeMeta({
      object: "page",
      entry: [{
        id: "P1",
        messaging: [
          { sender: { id: "U1" }, message: { mid: "m1", text: "hola" } },
          { sender: { id: "P1" }, message: { mid: "m2", text: "eco", is_echo: true } },
          { sender: { id: "U1" }, delivery: { mids: ["m1"] } },
        ],
        changes: [
          { field: "feed", value: { item: "comment", verb: "add", comment_id: "c1", message: "precio?", from: { id: "U2", name: "Ana" } } },
          // la respuesta pública de la propia página vuelve como comentario: no se contesta
          { field: "feed", value: { item: "comment", verb: "add", comment_id: "c2", message: "te escribimos", from: { id: "P1", name: "Tienda" } } },
          { field: "feed", value: { item: "reaction", verb: "add", from: { id: "U3" } } },
          { field: "leadgen", value: { leadgen_id: "L1", page_id: "P1", form_id: "F1" } },
        ],
      }],
    });
    expect(ev.map((e) => e.tipo)).toEqual(["mensaje", "comentario", "lead"]);
    expect(ev[0]).toMatchObject({ canal: "facebook", cuentaId: "P1", remitente: "U1", texto: "hola", id: "m1" });
    expect(ev[1]).toMatchObject({ id: "c1", remitente: "U2" });
  });

  it("entiende Instagram: DMs y comentarios (antes se ignoraba el objeto entero)", () => {
    const ev = leerEventosDeMeta({
      object: "instagram",
      entry: [{
        id: "IG1",
        messaging: [{ sender: { id: "IGU" }, recipient: { id: "IG1" }, message: { mid: "im1", text: "info" } }],
        changes: [
          { field: "comments", value: { id: "ic1", text: "precio", from: { id: "IGU2", username: "ana.ig" }, media: { id: "MED1" } } },
          { field: "comments", value: { id: "ic2", text: "gracias", from: { id: "IG1", username: "tienda" }, media: { id: "MED1" } } },
        ],
      }],
    });
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ tipo: "mensaje", canal: "instagram", cuentaId: "IG1", remitente: "IGU" });
    expect(ev[1]).toMatchObject({ tipo: "comentario", canal: "instagram", nombre: "ana.ig", postId: "MED1" });
  });

  it("lo que no es de Meta no se procesa", () => {
    expect(leerEventosDeMeta({ object: "whatsapp_business_account", entry: [{ id: "x", changes: [] }] })).toEqual([]);
    expect(leerEventosDeMeta(null)).toEqual([]);
  });
});

describe("un comentario de Facebook se contesta, en el negocio dueño de la página", () => {
  it("se guarda en SU negocio, privado + pública con SU token, y una sola vez", async () => {
    const t = await negocioConPagina(`PG${Date.now()}`, "TOKEN_DEL_NEGOCIO");
    const pageId = (t.metadata as any).facebook.pageId;
    instalarFetch();

    const cuerpo = comentarioFb(pageId, `CMT_${t.id}`);
    await procesarWebhookDeMeta(cuerpo);

    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.tenantId, t.id), eq(conversations.contactPhone, "fb_comment:USER1")));
    expect(conv, "la conversación queda en el negocio dueño de la página").toBeTruthy();
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id));
    expect(msgs.some((m: any) => m.role === "customer" && m.content === "¿Cuánto vale?")).toBe(true);

    const privado = llamadas.find((l) => l.url.includes("/me/messages"));
    expect(privado?.body?.recipient?.comment_id).toBe(`CMT_${t.id}`);
    expect(privado?.url).toContain("access_token=TOKEN_DEL_NEGOCIO");
    // el edge retirado ya no se usa
    expect(llamadas.some((l) => l.url.includes("private_replies"))).toBe(false);
    const publica = llamadas.find((l) => l.url.includes(`/CMT_${t.id}/comments`));
    expect(publica?.url).toContain("access_token=TOKEN_DEL_NEGOCIO");

    // Meta reintenta el mismo evento: no se contesta dos veces.
    const antes = llamadas.length;
    await procesarWebhookDeMeta(cuerpo);
    expect(llamadas.length).toBe(antes);
  });

  it("una página que no es de ningún negocio no se contesta con el token de otro", async () => {
    instalarFetch();
    const r = await procesarWebhookDeMeta(comentarioFb("PAGINA_DE_NADIE", "CMT_HUERFANO"));
    expect(r.atendidos).toBe(0);
    expect(llamadas.filter((l) => l.url.includes("/me/messages") || l.url.includes("/comments"))).toHaveLength(0);
  });
});

describe("Messenger e Instagram Direct", () => {
  it("un mensaje de Messenger queda en el negocio de la página y se contesta con su token", async () => {
    const t = await negocioConPagina(`PM${Date.now()}`, "TOKEN_MSG");
    const pageId = (t.metadata as any).facebook.pageId;
    instalarFetch();
    await procesarWebhookDeMeta({ object: "page", entry: [{ id: pageId, messaging: [{ sender: { id: "PSID9" }, message: { mid: `mid-${t.id}`, text: "hola" } }] }] });

    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.tenantId, t.id), eq(conversations.contactPhone, "fb:PSID9")));
    expect(conv).toBeTruthy();
    const envio = llamadas.find((l) => l.url.includes("/me/messages") && l.body?.message?.text);
    expect(envio?.body?.recipient?.id).toBe("PSID9");
    expect(envio?.url).toContain("access_token=TOKEN_MSG");
  });

  it("un DM de Instagram encuentra al negocio por la cuenta vinculada a su página", async () => {
    const pageId = `PI${Date.now()}`;
    const t = await negocioConPagina(pageId, "TOKEN_IG");
    const igId = `IGACC_${t.id}`;
    instalarFetch({ [`${pageId}?fields=instagram_business_account`]: { instagram_business_account: { id: igId } } });

    await procesarWebhookDeMeta({ object: "instagram", entry: [{ id: igId, messaging: [{ sender: { id: "IGSID1" }, message: { mid: `igm-${t.id}`, text: "precio?" } }] }] });

    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.tenantId, t.id), eq(conversations.contactPhone, "ig:IGSID1")));
    expect(conv?.channel).toBe("instagram");
    const envio = llamadas.find((l) => l.url.includes("/me/messages") && l.body?.message?.text);
    expect(envio?.body?.recipient?.id).toBe("IGSID1");
    expect(envio?.url).toContain("access_token=TOKEN_IG");
  });

  it("un comentario de Instagram se contesta con /replies (no /comments)", async () => {
    const pageId = `PC${Date.now()}`;
    const t = await negocioConPagina(pageId, "TOKEN_IGC");
    const igId = `IGC_${t.id}`;
    instalarFetch({ [`${pageId}?fields=instagram_business_account`]: { instagram_business_account: { id: igId } } });

    await procesarWebhookDeMeta({ object: "instagram", entry: [{ id: igId, changes: [{ field: "comments", value: {
      id: `IGCOM_${t.id}`, text: "info", from: { id: "IGU7", username: "cliente" }, media: { id: "M1" },
    } }] }] });

    expect(llamadas.some((l) => l.url.includes(`/IGCOM_${t.id}/replies`))).toBe(true);
    const [conv] = await db.select().from(conversations)
      .where(and(eq(conversations.tenantId, t.id), eq(conversations.contactPhone, "ig_comment:IGU7")));
    expect(conv).toBeTruthy();
  });
});

describe("las tres rutas de webhook de página entienden todo y contestan 200 primero", () => {
  it("cada POST usa el mismo procesador", () => {
    const fuente = readFileSync(new URL("../../routes/facebook.ts", import.meta.url), "utf8");
    for (const ruta of ["/lead-ads/webhook", "/messenger/webhook", "/comments/webhook"]) {
      expect(fuente, ruta).toContain(`router.post("${ruta}", verifyFacebookSignature, atenderWebhookDeMeta)`);
    }
    // el 200 sale antes de procesar
    const cuerpo = fuente.slice(fuente.indexOf("function atenderWebhookDeMeta"), fuente.indexOf("function atenderWebhookDeMeta") + 400);
    expect(cuerpo.indexOf("res.status(200)")).toBeLessThan(cuerpo.indexOf("procesarWebhookDeMeta("));
  });
});
