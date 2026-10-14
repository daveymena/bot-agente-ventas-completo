/**
 * Regresión de la integración Canva Connect.
 *
 * Cubre los bugs reales encontrados en `canva-connector.ts`:
 *  - Canva envuelve los trabajos asíncronos en `{ job: {...} }`. Leer `j.id`
 *    hacía que la exportación fallara SIEMPRE aunque el job se creara.
 *  - El sondeo leía `sj.status` en vez de `sj.job.status`, así que nunca
 *    detectaba el éxito ni el fallo.
 *  - Las URLs de descarga se devolvían sin validar el dominio.
 *
 * Se mockea `fetch` global: no hay red ni credenciales reales.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const TENANT = 1;
const CANVA_API = "https://api.canva.com/rest/v1";

/** Respuesta de token válido para que `tokenCanvaDelTenant` no intente refrescar. */
function metaConToken() {
  return {
    canva: {
      accessToken: "enc:token-valido",
      refreshToken: "enc:refresh-valido",
      expiraEn: Date.now() + 3_600_000,
    },
  };
}

/**
 * Carga el conector con un `fetch` simulado y el metadata del tenant ya listo.
 * Se re-importa en cada test para partir de estado limpio.
 *
 * Se usa `importOriginal` para conservar el resto de `@workspace/db`: el
 * `vitest.setup.js` global llama a `ensureDbReady()`, y un mock total lo rompe.
 */
async function cargarConector(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.resetModules();
  vi.doMock("@workspace/db", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@workspace/db")>();
    return {
      ...actual,
      db: {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ metadata: metaConToken() }] }) }) }),
        update: () => ({ set: () => ({ where: async () => {} }) }),
      },
      tenants: { id: "id", metadata: "metadata" },
    };
  });
  vi.doMock("drizzle-orm", async (importOriginal) => {
    const actual = await importOriginal<typeof import("drizzle-orm")>();
    return { ...actual, eq: () => ({}) };
  });
  vi.doMock("../credentials-vault", () => ({
    encryptSecret: (v: string) => `enc:${v}`,
    decryptSecret: (v: string) => String(v).replace(/^enc:/, ""),
  }));
  vi.doMock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

  const fetchMock = vi.fn(async (input: any, init?: RequestInit) => handler(String(input), init));
  vi.stubGlobal("fetch", fetchMock);

  const mod = await import("../canva-connector");
  return { mod, fetchMock };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Canva — exportación de diseños", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("@workspace/db");
    vi.doUnmock("drizzle-orm");
    vi.doUnmock("../credentials-vault");
    vi.doUnmock("../logger");
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("lee el id del job anidado ({job:{id}}) al crear la exportación", async () => {
    const { mod, fetchMock } = await cargarConector((url) => {
      if (url === `${CANVA_API}/exports`) {
        // Forma REAL documentada por Canva: el id va dentro de `job`.
        return json({ job: { id: "e08861ae-1111", status: "in_progress" } });
      }
      if (url === `${CANVA_API}/exports/e08861ae-1111`) {
        return json({
          job: { id: "e08861ae-1111", status: "success", urls: ["https://export-download.canva.com/f.png"] },
        });
      }
      throw new Error(`URL inesperada: ${url}`);
    });

    const r = await mod.exportarDisenoCanva(TENANT, "DAF1234abcd", "png");

    // Con el bug anterior esto devolvía { error: "Exportar falló (200): ..." }
    expect(r).toEqual({ urls: ["https://export-download.canva.com/f.png"], formato: "png" });
    // Debe haber sondeado el job con el id correcto, no con "undefined".
    const sondeo = fetchMock.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/exports/"));
    expect(sondeo).toBe(`${CANVA_API}/exports/e08861ae-1111`);
    expect(fetchMock.mock.calls.map((c) => String(c[0])).join(" ")).not.toContain("undefined");
  });

  it("detecta el estado success leyendo sj.job.status (no sj.status)", async () => {
    const { mod } = await cargarConector((url) => {
      if (url === `${CANVA_API}/exports`) return json({ job: { id: "job-2", status: "in_progress" } });
      return json({ job: { id: "job-2", status: "success", urls: ["https://export-download.canva.com/a.jpg"] } });
    });

    const r: any = await mod.exportarDisenoCanva(TENANT, "DAF1234abcd", "jpg");
    expect("error" in r).toBe(false);
    expect(r.urls).toHaveLength(1);
    expect(r.formato).toBe("jpg");
  });

  it("propaga el error real del job cuando falla (no un timeout genérico)", async () => {
    const { mod } = await cargarConector((url) => {
      if (url === `${CANVA_API}/exports`) return json({ job: { id: "job-3", status: "in_progress" } });
      return json({
        job: { id: "job-3", status: "failed", error: { code: "license_required", message: "Premium element" } },
      });
    });

    const r: any = await mod.exportarDisenoCanva(TENANT, "DAF1234abcd", "png");
    expect(r.error).toMatch(/license_required/);
    expect(r.error).not.toMatch(/tardó más de/);
  });

  it("rechaza URLs de descarga de un dominio que no es canva.com", async () => {
    const { mod } = await cargarConector((url) => {
      if (url === `${CANVA_API}/exports`) return json({ job: { id: "job-4", status: "in_progress" } });
      return json({ job: { id: "job-4", status: "success", urls: ["http://evil.example.com/x.png"] } });
    });

    const r: any = await mod.exportarDisenoCanva(TENANT, "DAF1234abcd", "png");
    expect(r.error).toMatch(/dominio no permitido/);
    expect(r.urls).toBeUndefined();
  });

  it("acepta subdominios legítimos de canva.com", async () => {
    const { mod } = await cargarConector((url) => {
      if (url === `${CANVA_API}/exports`) return json({ job: { id: "job-5", status: "in_progress" } });
      return json({
        job: { id: "job-5", status: "success", urls: ["https://export-download.canva.com/ok.png"] },
      });
    });

    const r: any = await mod.exportarDisenoCanva(TENANT, "DAF1234abcd", "png");
    expect(r.urls).toEqual(["https://export-download.canva.com/ok.png"]);
  });

  it("reintenta ante un 429 transitorio en vez de abortar", async () => {
    let sondeos = 0;
    const { mod } = await cargarConector((url) => {
      if (url === `${CANVA_API}/exports`) return json({ job: { id: "job-6", status: "in_progress" } });
      sondeos += 1;
      if (sondeos === 1) return json({ code: "rate_limited" }, 429);
      return json({ job: { id: "job-6", status: "success", urls: ["https://export-download.canva.com/r.png"] } });
    });

    const r: any = await mod.exportarDisenoCanva(TENANT, "DAF1234abcd", "png");
    expect(r.urls).toEqual(["https://export-download.canva.com/r.png"]);
    expect(sondeos).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("devuelve error (no token vacío) cuando no hay job en la respuesta", async () => {
    const { mod } = await cargarConector(() => json({ mensaje: "sin job" }));
    const r: any = await mod.exportarDisenoCanva(TENANT, "DAF1234abcd", "png");
    expect(r.error).toMatch(/Exportar falló/);
  });
});
