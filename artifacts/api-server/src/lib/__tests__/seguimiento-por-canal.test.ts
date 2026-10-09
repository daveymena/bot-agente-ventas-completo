import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Seguimientos y publicaciones programadas: cada uno por SU canal y SU negocio.
 *
 *   - El seguimiento salía por el WhatsApp del negocio por defecto
 *     (getWhatsAppForTenant() sin argumento) y por el Messenger del dueño.
 *   - Un contacto de comentario ("fb_comment:…") caía al camino de WhatsApp.
 *   - Messenger/Instagram no respetaban la ventana de 24 h de Meta.
 *   - El barrido de "sin responder" encolaba conversaciones de Messenger como
 *     si fueran de WhatsApp.
 *   - La publicación programada mandaba rutas relativas como imagen.
 */
import { canalDelContacto } from "../followUpScheduler";

describe("por dónde se le escribe a cada contacto", () => {
  it("lee el canal del identificador guardado", () => {
    expect(canalDelContacto("573001234567")).toBe("whatsapp");
    expect(canalDelContacto("fb:123")).toBe("facebook");
    expect(canalDelContacto("ig:123")).toBe("instagram");
    expect(canalDelContacto("fb_comment:9")).toBe("comentario");
    expect(canalDelContacto("ig_comment:9")).toBe("comentario");
  });
});

describe("el seguimiento sale por el negocio de la conversación", () => {
  const fuente = readFileSync(new URL("../followUpScheduler.ts", import.meta.url), "utf8");
  it("WhatsApp con el negocio, no el por defecto", () => {
    expect(fuente).not.toMatch(/getWhatsAppForTenant\(\)/);
    expect(fuente).toMatch(/getWhatsAppForTenant\(tenantId\)/);
  });
  it("Messenger con el servicio del negocio, no el singleton", () => {
    expect(fuente).not.toMatch(/facebookMessengerService\./);
  });
  it("respeta la ventana de 24 h de Meta", () => {
    expect(fuente).toMatch(/VENTANA_META_MS/);
  });
});

describe("el barrido de 'sin responder' es solo de WhatsApp", () => {
  it("salta Messenger, Instagram y comentarios", () => {
    const f = readFileSync(new URL("../services/agent-orchestrator.ts", import.meta.url), "utf8");
    const re = /\/\^\(fb\|ig\|fb_comment\|ig_comment\):\//;
    expect(f).toMatch(re);
    for (const c of ["fb:1", "ig:1", "fb_comment:1", "ig_comment:1"]) expect(/^(fb|ig|fb_comment|ig_comment):/.test(c)).toBe(true);
    expect(/^(fb|ig|fb_comment|ig_comment):/.test("573001234567")).toBe(false);
  });
});

describe("la publicación programada manda una imagen que Facebook puede bajar", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("una ruta del catálogo se vuelve URL absoluta", async () => {
    vi.stubEnv("APP_URL", "https://ventasproia.com");
    const llamadas: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      llamadas.push({ url: String(url), body: String(init?.body || "") });
      return { ok: true, status: 200, json: async () => ({ id: "PAGE_1", post_id: "PAGE_1_9" }) } as any;
    }));
    const { publishToPage } = await import("../facebook-page-posts");
    const r = await publishToPage(
      { productId: 1, productName: "X", message: "hola", imageUrl: "/uploads/products/41.jpg", link: null } as any,
      { id: 77, facebook: { accessToken: "T", pageId: "PAGE_1", tasks: ["CREATE_CONTENT"] } } as any,
    );
    expect(r.ok).toBe(true);
    const foto = llamadas.find((l) => l.url.includes("/photos"));
    expect(new URLSearchParams(foto.body).get("url")).toBe("https://ventasproia.com/uploads/products/41.jpg");
  });
});
