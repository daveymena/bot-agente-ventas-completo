/**
 * Orden del dueño (07-10): "cuando se le pida una landing nueva no reutilice la
 * que ya está, a menos que se le pida editar". getOrCreateLanding devolvía
 * SIEMPRE una landing publicada con el mismo nombre de producto (de cualquier
 * negocio: Forge no sabe de negocios).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { getOrCreateLanding } from "../landingforge-client";

afterEach(() => vi.unstubAllGlobals());

function fetchFalso(rutas: string[]) {
  return vi.fn(async (url: any) => {
    const u = String(url);
    rutas.push(new URL(u).pathname);
    if (u.includes("/api/landingforge/list")) {
      return new Response(JSON.stringify({ landings: [{ productName: "Corrector", landing: { id: "vieja", slug: "vieja", status: "published" } }] }), { status: 200 });
    }
    if (u.includes("/api/landingforge/generate")) {
      return new Response(JSON.stringify({ ok: true, landingId: "nueva", url: "https://x/l/nueva", slug: "nueva", sectionsGenerated: 9, sections: [] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
}

describe("landing nueva", () => {
  it("por defecto genera una NUEVA aunque exista una con el mismo nombre", async () => {
    const rutas: string[] = [];
    vi.stubGlobal("fetch", fetchFalso(rutas));
    const r = await getOrCreateLanding("Corrector", "", "physical", { price: "45000" });
    expect(r.landingId).toBe("nueva");
    expect(rutas).not.toContain("/api/landingforge/list");
  });

  it("solo con reutilizar:true devuelve la existente", async () => {
    const rutas: string[] = [];
    vi.stubGlobal("fetch", fetchFalso(rutas));
    const r = await getOrCreateLanding("Corrector", "", "physical", { reutilizar: true });
    expect(r.landingId).toBe("vieja");
  });
});
