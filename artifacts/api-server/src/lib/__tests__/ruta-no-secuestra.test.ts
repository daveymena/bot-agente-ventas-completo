import { describe, it, expect } from "vitest";
import { detectarInicioDeRuta, separarAccionesDeLaRuta, sinEncabezadoDePaso } from "../ruta-guiada";

/**
 * Sesión real del 24-09-2026: el admin pegó la pantalla de Marketing (que trae
 * de ejemplo “quiero vender más el curso de piano”), la ruta guiada arrancó
 * sola, y durante 10 mensajes cada "si" avanzó un paso mientras el borrado de
 * campañas que pedía se descartaba en silencio.
 */
describe("la ruta guiada no se lleva puesto lo que pide el admin", () => {
  it("un texto pegado con un ejemplo entre comillas NO arranca la ruta", () => {
    const pegado = "Por que acá se ve así Marketing & Growth Equipo especializado del orquestador. Chat del orquestador Decí en lenguaje natural: “quiero vender más el curso de piano”, “¿qué está fallando?”";
    expect(detectarInicioDeRuta(pegado)).toBeNull();
  });
  it("una pantalla larga pegada NO arranca la ruta aunque diga 'quiero vender'", () => {
    expect(detectarInicioDeRuta("quiero vender " + "x ".repeat(200))).toBeNull();
  });
  it("pedirla con una frase propia SÍ la arranca", () => {
    expect(detectarInicioDeRuta("quiero vender un producto nuevo")).toBe("producto-nuevo");
  });
  it("borrar campañas es OTRO pedido: se conserva", () => {
    const { duplicadas, otroPedido } = separarAccionesDeLaRuta([
      { tool: "fb_delete_campaign", args: { campaignId: "1" } },
      { tool: "crear_anuncio", args: {} },
    ]);
    expect(otroPedido.map((a) => a.tool)).toEqual(["fb_delete_campaign"]);
    expect(duplicadas.map((a) => a.tool)).toEqual(["crear_anuncio"]);
  });
  it("lo que la ruta ya hace sola se descarta como duplicado", () => {
    const { otroPedido } = separarAccionesDeLaRuta([{ tool: "landing_crear" }, { tool: "fb_upload_draft_to_meta" }]);
    expect(otroPedido).toEqual([]);
  });
  it("si la ruta se cierra, el 'Paso N de 5' sale del texto", () => {
    expect(sinEncabezadoDePaso("**Paso 3 de 5 · La página de venta**\n\n🧹 Preparé el borrado")).toBe("🧹 Preparé el borrado");
  });
});
