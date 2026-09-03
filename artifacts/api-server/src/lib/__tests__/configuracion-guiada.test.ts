import { describe, it, expect } from "vitest";
import { loQueFalta, comoPreguntarla, cuantoFalta } from "../configuracion-guiada";

/**
 * Que un dueño que NO sabe de esto pueda dejar su agente listo.
 *
 * El pedido, textual (2026-09-02): *"si yo he pasado trabajo creando mi propio
 * agente, cómo será alguien que no sabe nada de esto. Necesito que Atlas ayude
 * a los clientes a dejar todo bien configurado, darle opciones de elegir, cuál
 * es la mejor opción, y ser guiado — pero todo muy profesional"*.
 *
 * Lo que estas pruebas defienden:
 *
 *   · que SIEMPRE haya opciones concretas, nunca una pregunta abierta;
 *   · que SIEMPRE haya una recomendada, porque una lista neutra deja al dueño
 *     igual de perdido que la pregunta abierta;
 *   · que la recomendación salga de SUS datos cuando se puede -- si el
 *     catálogo es 100% digital, recomendar "envío a domicilio" sería un
 *     asistente que no miró nada.
 */

const digital = { digitales: 84, fisicos: 0, servicios: 0 };
const tienda = { digitales: 0, fisicos: 40, servicios: 0 };
const salon = { digitales: 0, fisicos: 0, servicios: 12 };

const vacio = (catalogo: any, nombre = "Mi Negocio") => ({ perfil: {}, catalogo, nombreDelNegocio: nombre });

describe("nunca deja al dueño frente a una pregunta abierta", () => {
  it("toda decisión pendiente trae opciones concretas", () => {
    for (const d of loQueFalta(vacio(digital))) {
      expect(d.opciones.length, d.campo).toBeGreaterThanOrEqual(2);
      for (const o of d.opciones) {
        expect(o.etiqueta.length, `${d.campo}/${o.id}`).toBeGreaterThan(3);
        // Qué cambia DE VERDAD para su cliente, no una definición.
        expect(o.queCambia.length, `${d.campo}/${o.id}`).toBeGreaterThan(20);
      }
    }
  });

  it("toda decisión dice qué se pierde si no se configura", () => {
    // Es lo que justifica la pregunta. Sin eso suena a trámite.
    for (const d of loQueFalta(vacio(digital))) {
      expect(d.siNoSeConfigura.length, d.campo).toBeGreaterThan(40);
    }
  });

  it("las que importan traen una recomendada, con su motivo", () => {
    const conRecomendacion = loQueFalta(vacio(digital)).filter((d) =>
      d.opciones.some((o) => o.recomendada),
    );
    // Entrega, garantía, acceso, tono y precio: cinco de las seis.
    expect(conRecomendacion.length).toBeGreaterThanOrEqual(5);
    for (const d of conRecomendacion) {
      const r = d.opciones.find((o) => o.recomendada)!;
      expect(r.porQue, d.campo).toBeTruthy();
    }
  });
});

describe("la recomendación mira el catálogo del negocio", () => {
  it("catálogo digital: recomienda acceso inmediato, NO envío", () => {
    const entrega = loQueFalta(vacio(digital)).find((d) => d.campo === "entrega")!;
    const rec = entrega.opciones.find((o) => o.recomendada)!;
    expect(rec.id).toBe("acceso_inmediato");
    expect(rec.porQue).toContain("84");
  });

  it("tienda física: recomienda envío", () => {
    const entrega = loQueFalta(vacio(tienda)).find((d) => d.campo === "entrega")!;
    expect(entrega.opciones.find((o) => o.recomendada)!.id).toBe("envio_domicilio");
  });

  it("servicios: recomienda agendar, porque un servicio no se envía", () => {
    const entrega = loQueFalta(vacio(salon)).find((d) => d.campo === "entrega")!;
    expect(entrega.opciones.find((o) => o.recomendada)!.id).toBe("agenda_cita");
  });

  it("una tienda física NO recibe la pregunta de cuánto dura el acceso", () => {
    // No aplica, y preguntarla haría ver que el asistente no miró el catálogo.
    expect(loQueFalta(vacio(tienda)).map((d) => d.campo)).not.toContain("acceso");
    expect(loQueFalta(vacio(digital)).map((d) => d.campo)).toContain("acceso");
  });
});

describe("lo ya configurado no se vuelve a preguntar", () => {
  it("con el perfil completo no queda nada pendiente", () => {
    const completo = {
      perfil: {
        entrega: { metodo: "digital", plazo: "inmediato" },
        garantia: { dias: 7 },
        acceso: { tipo: "de por vida" },
        tono: "cercano",
        negociaPrecio: false,
        noPuede: ["No emitimos factura electrónica"],
      },
      catalogo: digital,
    };
    expect(loQueFalta(completo)).toEqual([]);
    expect(cuantoFalta(completo).porcentaje).toBe(100);
  });

  it("negociaPrecio en FALSE cuenta como configurado", () => {
    // `false` es una respuesta, no un hueco. Con un chequeo laxo se le
    // preguntaría para siempre a quien ya dijo que no negocia.
    const p = { perfil: { negociaPrecio: false }, catalogo: digital };
    expect(loQueFalta(p).map((d) => d.campo)).not.toContain("negociaPrecio");
  });

  it("el avance se mide y da un número que el dueño entiende", () => {
    const a = cuantoFalta(vacio(digital));
    expect(a.total).toBe(6);
    expect(a.listas).toBe(0);
    const b = cuantoFalta({ perfil: { tono: "cercano", garantia: { dias: 7 } }, catalogo: digital });
    expect(b.listas).toBe(2);
  });
});

describe("la pregunta lista para leer", () => {
  it("trae las opciones y marca la recomendada", () => {
    const d = loQueFalta(vacio(digital)).find((x) => x.campo === "tono")!;
    const t = comoPreguntarla(d);
    expect(t).toContain("Cercano y directo");
    expect(t).toContain("Formal");
    expect(t).toContain("te recomiendo");
    expect(t).toContain("Por qué:");
  });

  it("y dice qué se pierde si lo deja sin configurar", () => {
    const d = loQueFalta(vacio(digital)).find((x) => x.campo === "garantia")!;
    expect(comoPreguntarla(d)).toContain("Si no lo configurás:");
  });
});
