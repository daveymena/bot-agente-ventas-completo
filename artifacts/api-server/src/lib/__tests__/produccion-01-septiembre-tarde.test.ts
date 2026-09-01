import { describe, it, expect } from "vitest";
import { pideAlgoEntregable, seccionQueCorresponde } from "../ficha-parcial";
import { contextoDeDropshipping } from "../dropshipping";
import { videoDeProducto } from "../video-de-producto";
import { sinElMontoQueVaEnLaFicha } from "../promesas";

/**
 * ============================================================
 * LO QUE EL BOT LE CONTESTO A DUVIER EL 01-09-2026 POR LA TARDE
 * ============================================================
 *
 * Leido de produccion (conversacion 1). Peor que la del transcript de la
 * mañana, y por motivos distintos: acá no fallo el clasificador del cierre,
 * fallo que el SERVIDOR no llego a contestar ni una vez. Los mensajes del
 * agente salieron todos con `cardSent: null` -- ninguna ficha, ninguna
 * seccion. El modelo improviso el turno entero.
 *
 * De ahi salieron las tres cosas que estas pruebas cubren.
 */

/** El curso de piano, tal como esta hoy en produccion (id 123). */
const PIANO = {
  id: 123,
  name: "Curso de Piano Completo: De Cero a Nivel Avanzado",
  kind: "digital",
  price: "60000.00",
  metadata: '{"videoIntro": "https://drive.google.com/file/d/1p5zY9fupC46BU8B1rbqMQTLArCUmdUnr/view"}',
};

describe("Un curso digital no se entrega en la puerta de la casa", () => {
  /**
   *   15:20 cliente: "kuanto bale el kurso d piano"
   *   15:20 bot:     "Y lo mejor: no pagas nada hasta tenerlo en la mano."
   *   15:22 bot:     "Pagas solo cuando lo recibes en tu puerta. Nada por
   *                   adelantado. Llega en 3 a 5 dias habiles."
   *
   * Catorce minutos antes le habia dicho que le llegaba por un enlace de
   * acceso. Dos entregas incompatibles para el mismo producto.
   */
  it("el bloque de envio a domicilio habla de cosas que un curso no tiene", () => {
    const bloque = contextoDeDropshipping();
    expect(bloque).toMatch(/CONTRA ENTREGA/i);
    expect(bloque).toMatch(/3 a 5 d[ií]as/i);
    expect(bloque).toMatch(/direcci[oó]n/i);
    // Inyectarle esto a una conversacion sobre un curso es lo que produjo
    // "pagas cuando lo recibes en tu puerta" sobre un producto descargable.
  });

  it("el producto en juego es digital, asi que ese bloque no corresponde", () => {
    const esFisico = String(PIANO.kind) === "physical";
    expect(esFisico).toBe(false);

    // La regla nueva: si hay producto identificado, manda su `kind`; la
    // especialidad del agente solo decide cuando no se sabe de que se habla.
    const decidir = (producto: { kind: string } | null, agenteEsDropshipping: boolean) =>
      producto ? String(producto.kind) === "physical" : agenteEsDropshipping;

    expect(decidir(PIANO, true), "curso digital con agente de dropshipping").toBe(false);
    expect(decidir({ kind: "physical" }, false), "producto fisico").toBe(true);
    expect(decidir(null, true), "sin producto identificado").toBe(true);
    expect(decidir(null, false)).toBe(false);
  });
});

describe("La ficha ya enviada no puede bloquear lo que el cliente pide ahora", () => {
  /**
   * Con la ficha ya mandada, `resolvedId` se ponia en -1 para no repetirla.
   * Correcto para "contame otra vez". Pero tumbaba TODAS las secciones, y el
   * video, la tienda y el precio no son repeticiones.
   */
  it("reconoce los pedidos que el servidor sabe contestar", () => {
    for (const m of [
      "muéstrame el video",
      "¿tienes página web?",
      "¿cuánto vale?",
      "¿cómo pago?",
      "por nequi",
      "¿cómo me llega?",
      "kuanto bale el kurso d piano",
    ]) {
      expect(pideAlgoEntregable(m), m).toBe(true);
    }
  });

  it("no se dispara con un mensaje que no pide nada entregable", () => {
    for (const m of [
      "hola",
      "¿me sirve si nunca he tocado un instrumento?",
      "estoy entre el de piano y el de inglés",
      "🙂",
    ]) {
      expect(pideAlgoEntregable(m), m).toBe(false);
    }
  });

  it("y esos pedidos siguen resolviendo a su seccion con la ficha ya enviada", () => {
    const yaLaVio = { fichaYaEnviada: true };
    expect(seccionQueCorresponde({ mensaje: "muéstrame el video", ...yaLaVio })).toBe("video");
    expect(seccionQueCorresponde({ mensaje: "¿tienes página web?", ...yaLaVio })).toBe("tienda");
    expect(seccionQueCorresponde({ mensaje: "¿cuánto vale?", ...yaLaVio })).toBe("precio");
    expect(seccionQueCorresponde({ mensaje: "por nequi", ...yaLaVio })).toBe("pago_transferencia");
  });
});

describe("El video existe: negarlo es negar algo que si tenemos", () => {
  /**
   *   15:11 cliente: "muéstrame el video"
   *   15:11 bot:     "por aquí no puedo enviarte el video de muestra. Lo que
   *                   sí puedo hacer es pasarte el enlace de pago"
   *
   * El producto TIENE el video cargado. Y encima cambio la negativa por un
   * pedido de plata.
   */
  it("el curso de piano tiene video cargado en produccion", () => {
    expect(videoDeProducto(PIANO.metadata)).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
  });

  it("pedir el video resuelve a la seccion de video, no al pago", () => {
    const seccion = seccionQueCorresponde({
      mensaje: "muéstrame el video",
      intent: "payment_intent", // aunque el clasificador se equivoque
      fichaYaEnviada: true,
    });
    expect(seccion).toBe("video");
  });
});

describe("Sacar el monto no puede dejar la frase con un hueco", () => {
  /**
   *   14:43 cliente: "¿cuánto vale?"
   *   14:43 bot:     "💰 El curso de piano completo tiene un valor de ,
   *                   pago único."
   *
   * El modelo escribio el precio; la limpieza se lo quito para que lo pusiera
   * la ficha una sola vez; el unico control era que quedaran seis caracteres.
   * Quedaron cincuenta.
   */
  // Se importa la funcion real: copiar la logica en la prueba es como se
  // separan las dos reglas, que es el defecto que se viene corrigiendo.
  const limpiar = sinElMontoQueVaEnLaFicha;

  it("descarta la frase que quedaba anunciando un precio ausente", () => {
    expect(limpiar("💰 El curso de piano completo tiene un valor de $60.000, pago único.")).toBe("");
    expect(limpiar("El curso cuesta $60.000 y viene con acceso de por vida.")).not.toMatch(/cuesta\s*y/);
  });

  it("no toca las frases que no hablaban de precio", () => {
    const t = "Claro que sí 😊 Te cuento cómo funciona.";
    expect(limpiar(t)).toBe(t);
  });

  it("sigue quitando el monto cuando la frase se sostiene sin el", () => {
    const r = limpiar("Te dejo la info completa acá abajo, son $60.000 en total para que lo veas.");
    expect(r).not.toMatch(/60\.000/);
    expect(r.length).toBeGreaterThan(6);
  });
});
