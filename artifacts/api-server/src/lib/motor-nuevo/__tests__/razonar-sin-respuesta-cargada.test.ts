/**
 * SIN RESPUESTA CARGADA, EL VENDEDOR RAZONA CON LA FICHA
 * =======================================================
 *
 * Chat de prueba del dueño (30-09-2026), cámara de seguridad:
 *
 *   cliente: ¿Y graba si se va la luz? allá se va seguido
 *   bot:     "Déjame confirmarlo con el equipo técnico para darte el dato
 *             exacto. Apenas me respondan te aviso por acá mismo"
 *
 * Nadie recibe esa pregunta: no existe ningún aviso al dueño. La promesa no
 * se cumple nunca y el cliente se va. El prompt ya decía "preguntas del
 * PRODUCTO: responde RAZONANDO con la ficha", pero la herramienta devolvía
 * "No inventes: dile que lo confirmas con el equipo y le respondes" — la
 * última instrucción que el modelo lee, y la que ganaba.
 */
import { describe, expect, test } from "vitest";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";

const CAMARA: Producto = {
  id: 153,
  name: "Cámara de Seguridad 3 Antenas con Puerto LAN",
  description:
    "Cámara de seguridad Full HD 1080p con visión nocturna y conectividad Wi-Fi.\n" +
    "📹 Resolución Full HD 1080p para imágenes nítidas\n" +
    "📶 Conectividad Wi-Fi y puerto LAN para acceso remoto sin cables\n" +
    "🌙 Visión nocturna integrada que permite monitoreo 24/7",
  price: 137900,
  currency: "COP",
  kind: "physical",
} as any;

function ctx(): ContextoHerramientas {
  return {
    estado: { ...estadoInicial(1), productoEnFoco: CAMARA.id },
    catalogo: [CAMARA],
    partes: [],
    conocimiento: [],
    guion: guionDelNegocio({ catalogo: [CAMARA as any], negocio: {} }),
    mensajeDelCliente: "¿Y graba si se va la luz?",
    efectos: [],
  };
}

describe("consultar_conocimiento sin respuesta cargada", () => {
  test("le pasa al modelo lo que dice la ficha del producto en foco", () => {
    const r = ejecutores.consultar_conocimiento(ctx(), { pregunta: "¿graba si se va la luz?" }) as any;
    expect(r.mensaje).toMatch(/Wi-?Fi/i);
    expect(r.mensaje).toMatch(/acceso remoto/i);
  });

  test("le pide razonar, no mandar la pregunta a un equipo que nunca la recibe", () => {
    const r = ejecutores.consultar_conocimiento(ctx(), { pregunta: "¿graba si se va la luz?" }) as any;
    expect(r.mensaje).toMatch(/razon/i);
    expect(r.mensaje).not.toMatch(/dile que lo confirmas con el equipo y le respondes/i);
    expect(r.mensaje).toMatch(/no prometas que alguien/i);
  });

  test("las condiciones comerciales siguen sin inventarse", () => {
    const r = ejecutores.consultar_conocimiento(ctx(), { pregunta: "¿tiene garantía?" }) as any;
    expect(r.mensaje).toMatch(/garant[ií]a, devoluci[oó]n|condici[oó]n comercial/i);
    expect(r.mensaje).toMatch(/no la afirmes|no afirmes/i);
  });

  test("sin producto en foco no inventa una ficha", () => {
    const c = ctx();
    c.estado.productoEnFoco = null as any;
    const r = ejecutores.consultar_conocimiento(c, { pregunta: "¿funciona sin internet?" }) as any;
    expect(r.mensaje).not.toMatch(/Lo que dice la ficha/);
  });
});
