import { describe, it, expect } from "vitest";
import { leerConversacion, rolDeLinea, depurarPropuestas } from "../aprender-de-ejemplo";

const README = `# Conversación ideal de ventas

Este es un ejemplo de cómo debería vender el asesor.

**Cliente:** Hola, vi el corrector de postura en Instagram
**Asesor:** ¡Hola! 😊 Qué bueno que te interesó.
¿Lo buscas para dolor de espalda o para mejorar la postura en general?

👤 Cliente: Para el dolor, trabajo sentado todo el día
> Vendedor — Te entiendo perfecto.
Cliente: ¿Cuánto cuesta?
Cliente: ¿y tiene garantía?
Sofía: Tiene garantía de 30 días.

## Por qué funciona
- Pregunta antes de vender
`;

describe("aprender de un ejemplo — leer el README", () => {
  it("reconoce los roles con el markdown típico de ChatGPT y el nombre del agente", () => {
    const t = leerConversacion(README, "Sofía");
    expect(t.map((x) => x.role)).toEqual(["customer", "agent", "customer", "agent", "customer", "agent"]);
    expect(t[1].content).toContain("¿Lo buscas para dolor de espalda");
  });

  it("junta dos mensajes seguidos del cliente y corta en el título del final", () => {
    const t = leerConversacion(README, "Sofía");
    expect(t[4].content).toBe("¿Cuánto cuesta?\n\n¿y tiene garantía?");
    expect(t[5].content).not.toContain("Por qué funciona");
  });

  it("no toma cualquier 'algo: texto' como un rol", () => {
    expect(rolDeLinea("Precio: 60.000")).toBeNull();
    expect(rolDeLinea("Nota: esto es importante")).toBeNull();
  });
});

describe("aprender de un ejemplo — propuestas seguras", () => {
  const catalogo = [{ id: 2, name: "Corrector de postura", price: 36000 }];
  const inventados = (t: string) => ((t.match(/\d{2,3}\.\d{3}/g) || []).map((m) => Number(m.replace(".", ""))).filter((n) => n !== 36000));

  it("un precio del ejemplo que no está en el catálogo nunca se aplica", () => {
    const r = depurarPropuestas({ propuestas: [{ tipo: "dato", pregunta: "Precio con descuento", texto: "Hoy está a 29.900", porque: "x" }] }, catalogo, inventados);
    expect(r[0].tipo).toBe("no_aplica");
    expect(r[0].aplicable).toBe(false);
  });

  it("un dato del ejemplo se propone sin marcar y con aviso de verificar", () => {
    const r = depurarPropuestas({ propuestas: [{ tipo: "dato", pregunta: "Tiene garantía", texto: "Sí, 30 días", productoId: 2, porque: "x" }] }, catalogo, inventados);
    expect(r[0]).toMatchObject({ tipo: "dato", sugerida: false, aplicable: true, productoId: 2 });
    expect(r[0].aviso).toMatch(/verdad/);
  });

  it("la forma de vender viene marcada; configurar y no_aplica son informativas", () => {
    const r = depurarPropuestas({ propuestas: [
      { tipo: "forma", texto: "Antes de dar el precio, preguntá para qué lo necesita.", porque: "x" },
      { tipo: "configurar", texto: "Subir un video del producto", porque: "x" },
      { tipo: "rara", texto: "algo" },
      { tipo: "forma", texto: "Antes de dar el precio, preguntá para qué lo necesita.", porque: "repetida" },
    ] }, catalogo, inventados);
    expect(r.map((p) => [p.tipo, p.sugerida, p.aplicable])).toEqual([["forma", true, true], ["configurar", false, false]]);
  });

  it("un producto que no es del catálogo no se asigna", () => {
    const r = depurarPropuestas({ propuestas: [{ tipo: "dato", pregunta: "Talla", texto: "Única", productoId: 999, porque: "x" }] }, catalogo, inventados);
    expect(r[0].productoId).toBeNull();
  });
});
