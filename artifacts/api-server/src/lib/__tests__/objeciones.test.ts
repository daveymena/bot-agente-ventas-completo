import { describe, it, expect } from "vitest";
import { detectarObjecion, responderObjecion } from "../objeciones";

/**
 * Las objeciones que frenan la venta y que hoy el modelo improvisaba.
 *
 * La regla que las gobierna a todas: NINGUNA se contesta con adjetivos.
 * "Somos serios", "es la mejor inversión", "miles de alumnos" son exactamente
 * lo que dice un estafador — y esta app ya rechaza la prueba social inventada.
 *
 * Se contestan con HECHOS del negocio. Si el negocio no cargó el dato, la
 * respuesta no se inventa: prometer una garantía que no existe es peor que no
 * tener garantía.
 */
const CURSO = { name: "IA 2026", features: ["3 cursos en uno", "n8n sin código"], kind: "digital" };

describe("Reconocer qué está frenando al cliente", () => {
  it("las formas reales de decir 'lo voy a pensar'", () => {
    for (const m of ["lo voy a pensar", "déjame pensarlo", "después te digo", "ahorita no", "lo consulto con mi esposa"]) {
      expect(detectarObjecion(m), m).toBe("lo_pienso");
    }
  });

  it("la desconfianza", () => {
    for (const m of ["esto es real?", "no será estafa?", "cómo sé que me va a llegar", "me da miedo"]) {
      expect(detectarObjecion(m), m).toBe("desconfia");
    }
  });

  it("el 'no sé si me sirve'", () => {
    for (const m of ["me servirá a mí?", "soy principiante", "nunca he tocado nada de eso", "desde cero puedo?"]) {
      expect(detectarObjecion(m), m).toBe("no_se_si_me_sirve");
    }
  });

  it("y no marca lo que no es objeción", () => {
    for (const m of ["cuánto vale", "quiero comprarlo", "hola", "cómo pago"]) {
      expect(detectarObjecion(m), m).toBeNull();
    }
  });
});

describe("Contestar con hechos, nunca con adjetivos", () => {
  it("a quien lo va a pensar NO se lo apura", () => {
    // Ya dijo que no está listo. Presionarlo lo pierde.
    const r = responderObjecion("lo_pienso", { producto: CURSO, tieneVideo: true })!;
    expect(r).not.toMatch(/últim|solo hoy|apurate|no te lo pierdas|oferta|cupos/i);
    expect(r).toMatch(/con calma/);
  });

  it("la desconfianza se contesta con la garantía REAL, o no se contesta", () => {
    // Sin datos cargados devuelve null: "somos serios" lo dice igual el que
    // estafa, y prometer una garantía inexistente es peor que no tenerla.
    expect(responderObjecion("desconfia", { producto: CURSO })).toBeNull();

    const r = responderObjecion("desconfia", {
      producto: CURSO,
      garantia: "7 días para pedir devolución",
      entrega: "te llega el acceso por este mismo chat",
    })!;
    expect(r).toContain("7 días");
    expect(r).not.toMatch(/somos serios|confía en|miles de/i);
  });

  it("al '¿me sirve?' se le PREGUNTA, no se le afirma", () => {
    // Afirmar que le sirve sin saber para qué lo quiere es prometer un
    // resultado. La respuesta correcta es averiguar.
    const r = responderObjecion("no_se_si_me_sirve", { producto: CURSO })!;
    expect(r).toMatch(/\?/);
    expect(r).toMatch(/para qué lo querés usar/i);
    expect(r).not.toMatch(/claro que te sirve|te va a servir/i);
  });

  it("lo del tiempo solo se contesta si el producto es a demanda", () => {
    // A un producto físico esa respuesta no le aplica: no se fuerza.
    expect(responderObjecion("sin_tiempo", { producto: { ...CURSO, kind: "physical" } })).toBeNull();
    const r = responderObjecion("sin_tiempo", { producto: CURSO })!;
    expect(r).toMatch(/a tu ritmo/);
  });

  it("ninguna respuesta inventa prueba social ni urgencia", () => {
    // Es lo que el propio sistema ya rechaza en el copy de anuncios.
    const todas = [
      responderObjecion("lo_pienso", { producto: CURSO }),
      responderObjecion("desconfia", { producto: CURSO, garantia: "7 días" }),
      responderObjecion("no_se_si_me_sirve", { producto: CURSO }),
      responderObjecion("sin_tiempo", { producto: CURSO }),
    ].filter(Boolean).join(" ");
    expect(todas).not.toMatch(/alumnos|clientes satisfechos|miles|cientos|últimos cupos|por tiempo limitado/i);
  });
});
