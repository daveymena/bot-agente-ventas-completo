/**
 * CHAT DEL DUEÑO (27-09-2026) — CURSO DE PIANO, MOTOR V2
 *
 * Dos defectos en la misma conversación, con la misma raíz: el modelo escribe
 * sobre la ficha sin saber qué dice la ficha.
 *
 *   cliente: tienes curso de piano
 *   bot:     [ficha info] "🎼 19 módulos con 283 clases en video HD ·
 *             cerca de 19 horas · partituras y ejercicios descargables"
 *
 *   cliente: precio
 *   bot:     "Es un solo pago y el acceso te queda de por vida, con
 *             garantía de 7 días."                              ← INVENTADO
 *            [maqueta de precio: 💰 $60.000 COP (Pago único)]
 *
 *   cliente: que viene en el contenido del curso?
 *   bot:     "Lo que sí quiero confirmarte con el equipo es el detalle
 *             exacto de los módulos y las horas."      ← SE DESMIENTE SOLO
 *
 * El número estuvo bien: lo pone la maqueta. Lo que falló fue la letra chica
 * (una garantía y un acceso de por vida que nadie cargó en ese negocio) y la
 * memoria (la ficha se guardaba como `[ficha info de Curso de Piano]`, sin un
 * solo dato de lo que mostró).
 *
 * Ver `condiciones-sin-respaldo.ts` y `lo-que-dice-la-ficha.ts`.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import type { Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";
import {
  condicionesSinRespaldo,
  sinCondicionesSinRespaldo,
} from "../condiciones-sin-respaldo";
import {
  bloqueDeLaFichaEnFoco,
  laSeccionMuestraContenido,
  puntosDeLaFicha,
  resumenDeLaFicha,
} from "../lo-que-dice-la-ficha";

/** La descripción real del producto, como la escribió el dueño. */
const DESCRIPCION_PIANO = [
  "🎼 Curso de Piano Completo: De Cero a Nivel Avanzado",
  "Formación práctica para llevar tus habilidades al siguiente nivel.",
  "📚 19 módulos con 283 clases en video HD",
  "⏱️ Cerca de 19 horas de contenido",
  "🎼 Partituras y ejercicios descargables",
  "💻 100% digital: pc o celular, a tu ritmo",
].join("\n");

const PIANO: Producto = {
  id: 1,
  name: "Curso de Piano Completo: De Cero a Nivel Avanzado",
  description: DESCRIPCION_PIANO,
  price: 60000,
  currency: "COP",
  kind: "digital",
  disponible: true,
};

/** El negocio del chat: NO tiene garantía ni acceso cargados. */
const negocioSinLetraChica = () =>
  guionDelNegocio({
    catalogo: [PIANO],
    negocio: { nombre: "VentasPro" },
    medios: [{ etiqueta: "Nequi", tipo: "transferencia" }],
  });

/** El mismo negocio, pero con la garantía y el acceso SÍ cargados. */
const negocioConLetraChica = () =>
  guionDelNegocio({
    catalogo: [PIANO],
    negocio: {
      nombre: "VentasPro",
      garantia: { dias: 7, descripcion: "7 días de garantía o te devolvemos el dinero" },
      acceso: { tipo: "de por vida" },
    },
    medios: [{ etiqueta: "Nequi", tipo: "transferencia" }],
  });

const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "VentasPro" };

/* ══════════════════════════════════════════════════════════════════════════
 * 1. LA LETRA CHICA QUE NADIE CARGÓ
 * ══════════════════════════════════════════════════════════════════════════ */

describe("condiciones que el negocio no cargó", () => {
  const sinRespaldo = { producto: PIANO, guion: negocioSinLetraChica() };
  const conRespaldo = { producto: PIANO, guion: negocioConLetraChica() };

  test("la frase exacta del chat se detecta", () => {
    const texto = "Es un solo pago y el acceso te queda de por vida, con garantía de 7 días.";
    const malas = condicionesSinRespaldo(texto, sinRespaldo);
    expect(malas.length).toBe(1);
    expect(malas[0].promesa).toMatch(/garantia|acceso_perpetuo/);
  });

  test("y se saca del texto, dejando lo que sí es cierto", () => {
    const texto =
      "Es un solo pago y el acceso te queda de por vida, con garantía de 7 días.\n\n" +
      "¿Quieres hacer el pago o tienes alguna duda antes?";
    const limpio = sinCondicionesSinRespaldo(texto, sinRespaldo);
    expect(limpio).not.toMatch(/garant[ií]a/i);
    expect(limpio).not.toMatch(/de por vida/i);
    // La pregunta de cierre no se toca: es el resto de la respuesta.
    expect(limpio).toMatch(/¿Quieres hacer el pago/);
  });

  test("si el dueño SÍ cargó garantía y acceso, la frase queda intacta", () => {
    const texto = "Es un solo pago y el acceso te queda de por vida, con garantía de 7 días.";
    expect(condicionesSinRespaldo(texto, conRespaldo)).toEqual([]);
    expect(sinCondicionesSinRespaldo(texto, conRespaldo)).toBe(texto);
  });

  test("decir la verdad NO se borra", () => {
    const honesto = "Sobre la garantía te confirmo con el equipo y te escribo 🙌";
    expect(condicionesSinRespaldo(honesto, sinRespaldo)).toEqual([]);
    const negativo = "No manejamos devoluciones en los cursos digitales.";
    expect(condicionesSinRespaldo(negativo, sinRespaldo)).toEqual([]);
  });

  test("preguntar no es prometer", () => {
    const pregunta = "¿Te cuento cómo funciona la garantía?";
    expect(condicionesSinRespaldo(pregunta, sinRespaldo)).toEqual([]);
  });

  test("una respuesta normal de venta no se toca", () => {
    const normal = "Mira, el curso va desde lo más básico hasta nivel avanzado. ¿Te paso los datos de pago?";
    expect(sinCondicionesSinRespaldo(normal, sinRespaldo)).toBe(normal);
  });

  test("certificado, soporte y actualizaciones: mismas reglas", () => {
    expect(condicionesSinRespaldo("Al terminar te entregamos el certificado.", sinRespaldo)).toHaveLength(1);
    expect(condicionesSinRespaldo("Incluye soporte personalizado.", sinRespaldo)).toHaveLength(1);
    expect(condicionesSinRespaldo("Las actualizaciones te llegan gratis.", sinRespaldo)).toHaveLength(1);
  });
});

describe('el turno "precio" completo, de punta a punta', () => {
  test("la maqueta manda el número y la garantía inventada NO llega al cliente", async () => {
    const e = estadoInicial(101);
    e.productoEnFoco = 1;
    // Ya le había mandado la ficha de info: es el turno siguiente del chat.
    e.seccionesEnviadas = { 1: { info: new Date().toISOString() } } as any;

    const llm = clienteFalso([
      {
        content: "Es un solo pago y el acceso te queda de por vida, con garantía de 7 días.\n\n¿Quieres hacer el pago o tienes alguna duda antes?",
      },
    ]);

    const r = await responder({
      llm,
      estado: e,
      historial: [{ role: "customer", content: "precio", createdAt: new Date() }],
      catalogo: [PIANO],
      conocimiento: [],
      guion: negocioSinLetraChica(),
      voz: VOZ,
    });

    const texto = r.partes
      .filter((p: any) => p.kind === "text" || p.kind === "voz")
      .map((p: any) => p.content)
      .join("\n");

    expect(texto).not.toMatch(/garant[ií]a/i);
    expect(texto).not.toMatch(/de por vida/i);
    // Y el cliente igual se entera de cuánto cuesta: el dato lo pone el servidor.
    const dioElPrecio =
      r.partes.some((p: any) => p.kind === "card" && /precio|completa/.test(String(p.seccion))) ||
      /60\.?000/.test(texto);
    expect(dioElPrecio).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. LA FICHA QUE EL MODELO NO RECORDABA
 * ══════════════════════════════════════════════════════════════════════════ */

describe("lo que la ficha le mostró al cliente", () => {
  test("los puntos salen de la descripción, sin el título repetido", () => {
    const puntos = puntosDeLaFicha(PIANO);
    expect(puntos).toContain("19 módulos con 283 clases en video HD");
    expect(puntos).toContain("Cerca de 19 horas de contenido");
    expect(puntos).toContain("Partituras y ejercicios descargables");
    // El título lo pone la tarjeta arriba: no vuelve como punto.
    expect(puntos.join(" ")).not.toMatch(/Curso de Piano Completo: De Cero/);
  });

  test("el resumen que va al historial trae los módulos, las clases y las horas", () => {
    const resumen = resumenDeLaFicha(PIANO);
    expect(resumen).toMatch(/19 módulos/);
    expect(resumen).toMatch(/283 clases/);
    expect(resumen).toMatch(/19 horas/);
  });

  test("solo las secciones que muestran contenido lo guardan", () => {
    expect(laSeccionMuestraContenido("info")).toBe(true);
    expect(laSeccionMuestraContenido("completa")).toBe(true);
    expect(laSeccionMuestraContenido("precio")).toBe(false);
    expect(laSeccionMuestraContenido("pago")).toBe(false);
  });

  test("un producto sin descripción no inventa nada", () => {
    expect(puntosDeLaFicha({ name: "Algo", description: null })).toEqual([]);
    expect(resumenDeLaFicha({ name: "Algo", description: "" })).toBe("");
    expect(bloqueDeLaFichaEnFoco({ name: "Algo", description: null })).toBe("");
  });

  test("el bloque del prompt le prohíbe desmentir lo que ya está en la ficha", () => {
    const bloque = bloqueDeLaFichaEnFoco(PIANO);
    expect(bloque).toMatch(/19 módulos con 283 clases/);
    expect(bloque).toMatch(/NUNCA digas que tienes que confirmar algo que esté en esta lista/);
  });

  test("con el producto en foco, el prompt del turno lleva la ficha", async () => {
    const e = estadoInicial(102);
    e.productoEnFoco = 1;
    const llm = clienteFalso([{ content: "ok" }]);
    await responder({
      llm,
      estado: e,
      historial: [{ role: "customer", content: "que viene en el contenido del curso?", createdAt: new Date() }],
      catalogo: [PIANO],
      conocimiento: [],
      guion: negocioSinLetraChica(),
      voz: VOZ,
    });
    const messages = (llm as any).llamadas[0].messages as { role: string; content: string }[];
    const delTurno = messages.at(-1)!.content;
    expect(delTurno).toMatch(/19 módulos con 283 clases en video HD/);
    expect(delTurno).toMatch(/Cerca de 19 horas de contenido/);
  });

  test("el prefijo cacheable NO cambia: la ficha va en el bloque del turno", async () => {
    const llm = clienteFalso([{ content: "ok" }]);
    const e = estadoInicial(103);
    e.productoEnFoco = 1;
    await responder({
      llm,
      estado: e,
      historial: [{ role: "customer", content: "hola", createdAt: new Date() }],
      catalogo: [PIANO],
      conocimiento: [],
      guion: negocioSinLetraChica(),
      voz: VOZ,
    });
    const messages = (llm as any).llamadas[0].messages as { role: string; content: string }[];
    expect(messages[0].content).not.toMatch(/19 módulos con 283 clases/);
  });
});
