import { describe, test, expect } from "vitest";
import { construirPromptDeSistema, comoHablaElPais, type VozDelNegocio } from "../motor";
import { estadoInicial } from "../estado-conversacion";
import { guionDelNegocio } from "../nicho";
import type { Producto } from "../herramientas";

const CORRECTOR: Producto = { id: 2, name: "Corrector de postura", description: "", price: 36000, currency: "COP", kind: "physical", disponible: true };
const voz = (pais: string | null): VozDelNegocio => ({ nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T", pais });

// Formas de voseo que el vendedor imitaba del prompt (chats del 25-09-2026).
const VOSEO = /\b(querés|tenés|podés|sabés|confirmás|llevás|preferís|necesitás|pagás|hacé|mirá|decile|pedile|contame|mandame|mandámelos|escuchá|cerrá|dejá|mostrá|preguntá|entendé|decilo|ubicalo|usala|llamala|pasale|sos)\b/i;

describe("el vendedor habla español colombiano, sin voseo", () => {
  test("el prompt entero está en tuteo (salvo los ejemplos de lo que NO debe decir)", () => {
    const guion = guionDelNegocio({ catalogo: [CORRECTOR], negocio: { nombre: "T" }, medios: [] });
    const prompt = construirPromptDeSistema({ voz: voz("CO"), estado: estadoInicial(1), catalogo: [CORRECTOR], guion, nombrePorProducto: () => "Corrector" });
    const sinEjemplos = prompt.replace(/Nunca uses voseo \(nada de[^)]*\)/g, "");
    const encontrado = sinEjemplos.match(VOSEO);
    expect(encontrado?.[0] ?? null).toBeNull();
    expect(prompt).toMatch(/español colombiano normal/);
  });

  test("Colombia (y sin país) tutea; un negocio rioplatense vosea", () => {
    expect(comoHablaElPais("CO")).toMatch(/tutea/);
    expect(comoHablaElPais(null)).toMatch(/colombiano/);
    expect(comoHablaElPais("AR")).toMatch(/voseo/);
    expect(comoHablaElPais("MX")).toMatch(/Nunca uses voseo/);
  });
});
