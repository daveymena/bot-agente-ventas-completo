import { describe, it, expect } from "vitest";
import {
  calcularEstado, calcularEtapa, preguntaSinResponder, contienePregunta, renderEstado,
} from "../estado-cognitivo";

/**
 * El caso que motivó todo esto, textual, de la conversación 1:
 *
 *   19:18  "ya confirmé tu pago del PACK IDIOMAS"
 *   19:23  "Hoy no compraste nada todavía, así que no hay nada que resumir"
 *
 * Los dos son coherentes con su turno y se contradicen entre sí, porque no
 * había un estado: había dos improvisaciones.
 */
const PRODUCTO = { id: 201, name: "PACK IDIOMAS", price: 20000, kind: "digital" };

const hist = (...pares: Array<[string, string]>) =>
  pares.map(([role, content]) => ({ role, content }));

describe("la etapa del trato la calcula el servidor, no el modelo", () => {
  it("sin producto en juego, está explorando", () => {
    expect(calcularEtapa({ historial: hist(["customer", "hola que tienes"]) }).etapa).toBe("explorando");
  });

  it("con un producto resuelto, está interesado", () => {
    expect(calcularEtapa({ historial: hist(["customer", "info del pack"]), producto: PRODUCTO }).etapa)
      .toBe("interesado");
  });

  it("cuando dice que lo quiere, está decidido", () => {
    expect(calcularEtapa({ historial: hist(["customer", "listo lo quiero, voy a pagar por Nequi"]), producto: PRODUCTO }).etapa)
      .toBe("decidido");
  });

  it("decir que pagó lo deja en REPORTADO, nunca en verificado", () => {
    // Esta es la regla dura: ningún texto del cliente puede confirmar un pago.
    const r = calcularEtapa({ historial: hist(["customer", "listo ya te pagué el pack de idiomas, mandame el acceso"]), producto: PRODUCTO });
    expect(r.etapa).toBe("pago_reportado");
    expect(r.porQue).toMatch(/nadie lo verific/i);
  });

  it("solo una verificación REAL llega a pago_verificado", () => {
    const r = calcularEtapa({
      historial: hist(["customer", "ya pagué"]),
      producto: PRODUCTO,
      pagoVerificado: true,
    });
    expect(r.etapa).toBe("pago_verificado");
  });
});

describe("el estado prohíbe la contradicción de las 19:18 vs 19:23", () => {
  const estado = calcularEstado({
    historial: hist(["customer", "listo ya te pagué el pack de idiomas, mandame el acceso"]),
    producto: PRODUCTO,
  });

  it("con pago reportado, no puede decir que lo confirmó", () => {
    expect(estado.prohibido.join(" ")).toMatch(/pago está confirmado/i);
  });

  it("con pago reportado, no puede entregar sin comprobante", () => {
    expect(estado.prohibido.join(" ")).toMatch(/comprobante/i);
  });

  it("no puede decir que ya mandó el acceso", () => {
    expect(estado.prohibido.join(" ")).toMatch(/ya mandaste el acceso/i);
  });

  it("la acción que corresponde es pedir el comprobante, no entregar", () => {
    expect(estado.accionSiguiente).toMatch(/comprobante/i);
  });

  it("explorando, no puede hablar de una compra hecha", () => {
    const e = calcularEstado({ historial: hist(["customer", "hola"]) });
    expect(e.prohibido.join(" ")).toMatch(/NO hables de una compra hecha/i);
  });
});

describe("detecta la pregunta que quedó sin responder", () => {
  it("reconoce preguntas con y sin signo", () => {
    expect(contienePregunta("Donde es la academia.")).toBe(true);
    expect(contienePregunta("¿cuánto vale?")).toBe(true);
    expect(contienePregunta("listo lo quiero")).toBe(false);
  });

  it("caza la respuesta reciclada que no venía al caso (QA 26/08, B4)", () => {
    const h = hist(
      ["customer", "cuánto vale al final y de cuántos idiomas es, porque la imagen dice 12 y tú dijiste 5"],
      ["agent", "Perfecto, ya confirmé tu pago del PACK IDIOMAS. Te acabo de liberar el acceso a la carpeta."],
    );
    // El nombre del producto ("PACK IDIOMAS") no cuenta como haber tocado el
    // tema: nombrarlo es lo mínimo que hace cualquier respuesta.
    expect(preguntaSinResponder(h, ["PACK IDIOMAS"])).toMatch(/cuántos idiomas/i);
  });

  it("no marca nada si la respuesta SÍ habla del tema", () => {
    const h = hist(
      ["customer", "de cuántos idiomas es el pack?"],
      ["agent", "El pack trae cinco idiomas: francés, alemán, italiano, portugués y japonés."],
    );
    expect(preguntaSinResponder(h)).toBeNull();
  });

  it("una pregunta todavía sin respuesta queda marcada", () => {
    expect(preguntaSinResponder(hist(["customer", "tiene garantía?"]))).toMatch(/garant/i);
  });

  it("si el último mensaje no es pregunta, no inventa una pendiente", () => {
    expect(preguntaSinResponder(hist(["customer", "listo gracias"]))).toBeNull();
  });

  it("responder la pregunta pendiente es la primera acción", () => {
    const e = calcularEstado({
      historial: hist(["customer", "de cuántos idiomas es?"]),
      producto: PRODUCTO,
    });
    expect(e.accionSiguiente).toMatch(/Respondé PRIMERO/i);
  });
});

describe("el bloque que lee el modelo", () => {
  it("dice que el estado NO es un recuerdo suyo", () => {
    const b = renderEstado(calcularEstado({ historial: hist(["customer", "ya pagué"]), producto: PRODUCTO }));
    expect(b).toMatch(/lo calculó el sistema/i);
    expect(b).toMatch(/PAGO_REPORTADO/);
  });

  it("lista lo que el negocio NO sabe, para que no lo rellene", () => {
    const b = renderEstado(calcularEstado({
      historial: hist(["customer", "hola"]),
      loQueNoSabe: ["cuánto tarda el envío"],
    }));
    expect(b).toMatch(/cuánto tarda el envío/);
    expect(b).toMatch(/no los rellenes/i);
  });

  it("no repite la ficha si ya se envió", () => {
    const e = calcularEstado({
      historial: hist(["customer", "y cuánto dura?"]),
      producto: PRODUCTO,
      fichasEnviadas: [201],
    });
    expect(e.prohibido.join(" ")).toMatch(/NO repitas la ficha/i);
  });
});
