import { describe, it, expect } from "vitest";
import { buildMcpToolRegistry } from "../opencode-mcp-tools";

// 08-10, producción (sesión "default"): el dueño pidió eliminar los anuncios
// y Atlas contestó tres veces "no tengo acceso al listado de campañas". Estos
// son sus mensajes TAL CUAL, con su ortografía ("anucio", "anucioso").
const nombres = (pedido: string) => (buildMcpToolRegistry(pedido) as any[]).map((t) => t.name);

describe("pedir eliminar anuncios trae la lista de campañas", () => {
  it.each([
    "Vamos a eliminar todos esos anucio en meta y lu3go creamos uno de cero",
    "Elimina todos los anucioso que estén publicados en pausa o borrador en meta",
    "pausa las campañas del corrector",
    "apaga los anuncios de facebook",
  ])("%s", (pedido) => {
    expect(nombres(pedido)).toContain("fb_list_campaigns");
  });

  it("seguimiento corto ('Elimina entonces los de corrector'): con la charla de antes también", () => {
    // Así lo arma operator-opencode para mensajes cortos: los últimos turnos + el pedido.
    const conHistoria = ["Vamos a eliminar todos esos anucio en meta", "⚠️ Encontré 4 productos con ese nombre", "Elimina entonces los de corrector"].join("\n");
    expect(nombres(conHistoria)).toContain("fb_list_campaigns");
  });

  it("'anucio' con su ortografía activa las herramientas de anuncios", () => {
    expect(nombres("quiero ver mis anucios")).toContain("fb_list_drafts");
  });
});

describe("borrar borradores también es posible", () => {
  it("fb_borrar_borrador viaja con su contrato cuando pide eliminar borradores", () => {
    const reg: any[] = buildMcpToolRegistry("Elimina todos los anucioso que estén publicados en pausa o borrador en meta") as any;
    const d = String(reg.find((t) => t.name === "propose_action")?.description || "");
    expect(d).toContain("fb_borrar_borrador:");
    expect(d).toContain("fb_delete_campaign:");
  });
});
