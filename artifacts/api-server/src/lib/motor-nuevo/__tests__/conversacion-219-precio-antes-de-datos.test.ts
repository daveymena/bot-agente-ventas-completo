/**
 * CONVERSACIÓN 219 (23-09-2026) -- llegó del anuncio del corrector
 *
 *   cliente: El primero
 *   bot:     ...¿Te lo llevás? Si sí, me pasás tu nombre completo y cédula
 *   cliente: Sí que vale            (= "¿qué vale?", preguntaba el PRECIO)
 *   bot:     Listo... pasame tu nombre completo y cédula
 *
 * Nunca supo el precio. El pedido de datos iba en el TEXTO, así que el
 * candado de tomar_pedido no saltó.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import type { Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder, pideDatosDeCompra } from "../motor";
import { clienteFalso } from "../cliente-llm";

const corrector: Producto[] = [
  { id: 1, name: "Corrector de postura", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true },
];
const guion = () => guionDelNegocio({ catalogo: corrector, negocio: { nombre: "T" }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }] });
const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };

describe("precio antes que datos, también en el texto", () => {
  test("detecta el pedido de datos", () => {
    expect(pideDatosDeCompra("Mientras tanto, pasame tu nombre completo y cédula para ir armando el envío.")).toBe(true);
    expect(pideDatosDeCompra("¿Me das tu dirección con barrio?")).toBe(true);
    expect(pideDatosDeCompra("Llega contraentrega en 3 a 5 días.")).toBe(false);
    // conv 218, 25-09-2026: la forma que se escapó.
    expect(pideDatosDeCompra("Excelente elección. Para coordinar el envío, ¿me podrías dar tu nombre completo y número de cédula?")).toBe(true);
  });

  test('"Sí que vale" sin precio dado: el precio sale igual aunque el modelo insista en pedir la cédula', async () => {
    const e = estadoInicial(219);
    e.productoEnFoco = 1;
    const llm = clienteFalso([{ content: "Listo, vamos con el Corrector de postura. Pasame tu nombre completo y cédula para armar el envío." }]);
    const r = await responder({ llm, estado: e, historial: [{ role: "customer", content: "Sí que vale", createdAt: new Date() }], catalogo: corrector, conocimiento: [], guion: guion(), voz: VOZ });
    const mostroPrecio = r.partes.some((p: any) => p.kind === "card" && String(p.seccion) === "precio")
      || r.partes.some((p: any) => p.kind === "text" && /45\.?000/.test(String(p.content)));
    expect(mostroPrecio).toBe(true);
  });
});

describe("conv 218 (25-09-2026): interesarse no es comprar", () => {
  test('"Me interesa este" con precio ya dado: el texto final NO pide nombre ni cédula', async () => {
    const e = estadoInicial(218);
    e.productoEnFoco = 1;
    e.seccionesEnviadas = { 1: { precio: new Date().toISOString() } } as any;
    const llm = clienteFalso([{ content: "Excelente elección. Para coordinar el envío, ¿me podrías dar tu nombre completo y número de cédula?" }]);
    const r = await responder({ llm, estado: e, historial: [{ role: "customer", content: "Me interesa este", createdAt: new Date() }], catalogo: corrector, conocimiento: [], guion: guion(), voz: VOZ });
    const texto = r.partes.filter((p: any) => p.kind === "text").map((p: any) => p.content).join(" ");
    expect(texto).not.toMatch(/c[eé]dula|nombre completo/i);
  });
});
