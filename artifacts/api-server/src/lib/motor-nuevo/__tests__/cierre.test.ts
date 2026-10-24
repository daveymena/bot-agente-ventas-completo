/**
 * EL CIERRE COMPLETO, CON SUS VARIANTES
 * =====================================
 *
 * El flujo que más importa para vender: que el cliente que ya decidió recibir
 * los medios de pago sin tropezar con la regla "primero el precio". Estos casos
 * fijan el comportamiento del bucle (motor.ts), de la herramienta `mostrar` y
 * de la calificación por variantes (nicho.ts) para que el cierre funcione venga
 * de donde venga: con precio ya dado, sin precio, pidiendo el link, y con un
 * producto que tiene opciones.
 */

import { test, describe, expect } from "vitest";
const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
};

import { estadoInicial, type EstadoConversacion } from "../estado-conversacion";
import { type Producto } from "../herramientas";
import { guionDelNegocio, calificacionDe } from "../nicho";
import { responder, construirPromptDeSistema, type Mensaje } from "../motor";
import { clienteFalso, type ClienteLLM } from "../cliente-llm";

const CATALOGO: Producto[] = [
  {
    id: 1,
    name: "Curso de piano",
    description: "Piano desde cero",
    price: 60000,
    currency: "COP",
    kind: "digital",
    disponible: true,
  },
];

const GUION = guionDelNegocio({
  catalogo: CATALOGO,
  negocio: { nombre: "TecnoIA", entrega: { metodo: "enlace de descarga", plazo: "inmediato" } },
  medios: [{ etiqueta: "Nequi", tipo: "transferencia" }],
});

const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "TecnoIA" };

async function correr(llm: ClienteLLM, historial: Mensaje[], estado?: EstadoConversacion) {
  return responder({
    llm,
    estado: estado ?? estadoInicial(1),
    historial,
    catalogo: CATALOGO,
    conocimiento: [],
    guion: GUION,
    voz: VOZ,
  });
}

function tarjetasDe(r: Awaited<ReturnType<typeof responder>>): any[] {
  return r.partes.filter((p) => p.kind === "card") as any[];
}

describe("el cierre, con todas sus variantes", () => {
  test("el prompt manda el orden correcto: primero el precio y después el pago", () => {
    const estado = estadoInicial(1);
    estado.productoEnFoco = 1;

    const prompt = construirPromptDeSistema({
      voz: VOZ,
      estado,
      catalogo: CATALOGO,
      guion: GUION,
      nombrePorProducto: (id) => CATALOGO.find((p) => p.id === id)!.name,
    });

    assert.match(prompt, /intención de compra/);
    // El orden correcto, explícito: nunca "pago" directo sin haber dado el precio.
    // Y después del precio, el cierre depende de qué es: un físico se cierra
    // con tomar_pedido (datos de envío), no con los medios de pago (simulación
    // con la IA real del 23-09-2026: mandaba Nequi a un producto contraentrega).
    assert.match(prompt, /primero mostrar\(seccion="precio"\)[\s\S]*FÍSICO[\s\S]*tomar_pedido[\s\S]*mostrar\(seccion="pago"\)/);
  });

  test("con el precio ya dado, 'lo quiero' manda solo los medios de pago", async () => {
    const estado = estadoInicial(1);
    estado.productoEnFoco = 1;
    estado.seccionesEnviadas[1] = { precio: new Date().toISOString() };

    const r = await correr(
      clienteFalso([
        { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
        { content: "Acá tenés los medios de pago 👇" },
      ]),
      [{ role: "customer", content: "lo quiero", createdAt: new Date() }],
      estado,
    );

    const tarjetas = tarjetasDe(r);
    assert.equal(tarjetas.length, 1);
    assert.equal(tarjetas[0].seccion, "pago");
    assert.equal(r.estado.etapa, "cierre");
  });

  test("'cómo pago' sin precio previo: la herramienta frena y el modelo recupera con precio + pago", async () => {
    // El modelo intenta mandar pago directo; la herramienta lo rechaza porque
    // no había precio; el modelo responde mandando precio y luego pago.
    const r = await correr(
      clienteFalso([
        { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' }] },
        {
          toolCalls: [
            { id: "b", name: "mostrar", arguments: '{"productoId":1,"seccion":"precio"}' },
            { id: "c", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago"}' },
          ],
        },
        { content: "Vale eso y te paso los datos para pagar 👇" },
      ]),
      [{ role: "customer", content: "cómo pago el curso de piano?", createdAt: new Date() }],
    );

    const tarjetas = tarjetasDe(r);
    assert.equal(tarjetas.length, 2);
    assert.equal(tarjetas[0].seccion, "precio");
    assert.equal(tarjetas[1].seccion, "pago");
    // La traza deja constancia de que el primer intento de pago fue rechazado.
    const intentoDePago = r.traza.find((t) => t.herramienta === "mostrar" && (t.args as any)?.seccion === "pago");
    assert.match(intentoDePago?.resultado || "", /todavía no le dijiste cuánto cuesta/i);
    assert.equal(r.estado.etapa, "cierre");
  });

  test("'mándame el link' con precio dado manda el enlace de pago", async () => {
    const estado = estadoInicial(1);
    estado.productoEnFoco = 1;
    estado.seccionesEnviadas[1] = { precio: new Date().toISOString() };

    const r = await correr(
      clienteFalso([
        { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago_link"}' }] },
        { content: "Acá va el enlace 🔗" },
      ]),
      [{ role: "customer", content: "mándame el link", createdAt: new Date() }],
      estado,
    );

    const tarjetas = tarjetasDe(r);
    assert.equal(tarjetas[0].seccion, "pago_link");
  });

  test("un producto digital con opciones exige saber cuál variante antes de cerrar", () => {
    const conOpciones: Producto[] = [
      { id: 1, name: "Curso de piano", description: "", price: 60000, currency: "COP", kind: "digital", opciones: ["Básico", "Premium"], disponible: true },
    ];

    const obligatorios = calificacionDe("digital", conOpciones, conOpciones[0])
      .filter((d) => d.obligatorio)
      .map((d) => d.campo);

    assert.ok(obligatorios.includes("variante"), "hay dos variantes: hay que saber cuál quiere");
  });
});
