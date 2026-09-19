import { describe, it, expect } from "vitest";
import { construirSeccion, vinetasDeLoQueIncluye } from "../whatsapp";
import { queOfrecioElBot } from "../ficha-parcial";

/**
 * La presentación del producto, copiada del agente de Meta Business que el
 * dueño probó el 16-09-2026 y pidió replicar:
 *
 *   🎹 *CURSO DE PIANO COMPLETO*
 *   <una frase>
 *   ✅ *Lo que incluye:*  + viñetas cortas con emoji
 *   <línea de entrega digital>
 *   <cierre>
 *
 * Antes salía la descripción cruda cortada a 240 caracteres con "…" y el
 * cierre en otra burbuja. Se prueba el render directo (sin modelo), que es
 * lo que el cliente recibe.
 */
const PIANO: any = {
  id: 123,
  name: "CURSO DE PIANO COMPLETO",
  description:
    "Curso completo de piano de cero a avanzado. Aprende a tocar desde la primera clase con 19 módulos en video: presentación, ejercicios básicos, independencia de manos, 5 valses de Alberto Martínez, piezas para piano, teoría musical aplicada, lenguaje musical, baladas. Ideal para principiantes y avanzados. 100% online y descargable. Acceso ilimitado de por vida.",
  price: 60000,
  currency: "COP",
  kind: "digital",
  features: ["19 módulos en video HD", "De cero a avanzado", "Valses, baladas, blues, jazz y pop", "Teoría musical aplicada", "Acceso de por vida"],
  deliveryLink: "https://drive.google.com/x",
  metadata: {},
};
const SIN_LINKS = { transfer: { options: [] } };

describe("presentación al estilo Meta", () => {
  it("un solo mensaje con la foto: título, frase, 'Lo que incluye', entrega y cierre", async () => {
    const r = await construirSeccion(PIANO, "completa", SIN_LINKS, "573001111333");
    expect(r.conFoto).toBe(true);
    expect(r.mensajes).toHaveLength(1);
    const m = r.mensajes[0]!;
    expect(m).toMatch(/^.+ \*CURSO DE PIANO COMPLETO\*\n\n/);
    // La primera oración entera, no un corte a 240 con "…".
    expect(m).toContain("Curso completo de piano de cero a avanzado.");
    expect(m).not.toContain("…");
    expect(m).toContain("✅ *Lo que incluye:*");
    expect(m).toContain("🎬 19 módulos en video HD");
    expect(m.split(/\r?\n/).filter((l) => /^\p{Extended_Pictographic}\uFE0F? .+/u.test(l) && !l.includes("*"))).toHaveLength(4);
    expect(m).toMatch(/100% digital, sin suscripciones/);
    // Sin precio: el precio es la pregunta siguiente.
    expect(m).not.toMatch(/60\.000|\$/);
    // Y cierra preguntando por el precio (lo que hace Meta).
    expect(m).toMatch(/precio|cuánto está/i);
  });

  it("máximo 4 viñetas, sin repetidas, con el emoji adelante", () => {
    const v = vinetasDeLoQueIncluye(
      ["19 módulos en video HD", "De cero a avanzado"],
      [{ emoji: "🎼", texto: "Partituras y ejercicios" }, { emoji: "", texto: "19 módulos en video HD" }],
      ["Acceso de por vida", "Soporte técnico", "Contenido actualizable"],
      "CURSO DE PIANO COMPLETO",
    );
    expect(v).toHaveLength(4);
    expect(v[0]).toBe("🎬 19 módulos en video HD");
    expect(v[2]).toBe("🎼 Partituras y ejercicios");
    expect(v.filter((x) => /19 módulos/.test(x))).toHaveLength(1);
  });

  it("el precio va con el nombre y '(Pago único)', y ofrece los medios de pago", async () => {
    const r = await construirSeccion(PIANO, "precio", SIN_LINKS, "573001111333", true);
    const m = r.mensajes[0]!;
    expect(m).toContain("La inversión para el *CURSO DE PIANO COMPLETO* es de:");
    expect(m).toMatch(/💰 \*\$?\s?60\.000/);
    expect(m).toContain("(Pago único)");
    expect(m).toMatch(/medios de pago|datos de pago/i);
  });

  it("la entrega digital son 3 pasos y no promete tiempos", async () => {
    const r = await construirSeccion(PIANO, "entrega", SIN_LINKS, "573001111333");
    const m = r.mensajes[0]!;
    expect(m).toContain("🚀 *ENTREGA DIGITAL*");
    expect(m).toMatch(/1\. Realizas el pago/);
    expect(m).toMatch(/2\. Me envías el comprobante/);
    expect(m).toMatch(/3\. Apenas se confirme/);
    expect(m).not.toMatch(/inmediato|minutos|al instante/i);
  });

  it("un 'sí' a '¿Te gustaría empezar hoy mismo?' no se lee como pedido de VIDEO aunque arriba diga 'video HD'", () => {
    const texto = ["De una 😊", "", "🎹 *CONTENIDO DEL CURSO DE PIANO*", "", "Son 19 módulos en video HD (283 clases), en 4 bloques:", "", "🎼 Formación musical.", "", "¿Te gustaría empezar hoy mismo? ⚡"].join("\n");
    expect(queOfrecioElBot(texto)).not.toBe("video");
    expect(queOfrecioElBot(["Trae 19 módulos en video HD.", "", "¿Te cuento cuánto vale? 💰"].join("\n"))).toBe("precio");
    expect(queOfrecioElBot(["Lo recibes por Drive.", "", "¿Te paso los datos de pago? 💳"].join("\n"))).toBe("pago");
  });

  it("'¿Te gustaría empezar hoy mismo?' ofrece pasar a la compra (un 'sí' trae el pago)", () => {
    expect(queOfrecioElBot("Acceso de por vida.\n\n¿Te gustaría empezar hoy mismo? ⚡")).toBe("pago");
    expect(queOfrecioElBot("¿Arrancamos? 🚀")).toBe("pago");
  });

  it("una pregunta que OFRECE no es una promesa incumplida: no se borra", async () => {
    const { promesasDe } = await import("../promesas");
    expect(promesasDe("👍 Listo para avanzar 💳 ¿Te envío el precio y los medios de pago?")).toEqual([]);
    expect(promesasDe("¿Te paso los datos de pago? 💳")).toEqual([]);
    // Afirmado sí promete (y si no sale la ficha, se quita).
    expect(promesasDe("Te paso el precio aquí abajo.")).toContain("precio");
  });
});
