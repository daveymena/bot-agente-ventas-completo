/**
 * EL CLIENTE QUE VUELVE CON UN "HOLA"
 *
 * Queja del dueño (23-09-2026): la memoria está bien, pero es atosigante. Si
 * una persona vuelve a escribir "hola" al otro día, el agente le contesta de
 * una "¿y pudiste decidirte por el corrector?". Se siente como un vendedor que
 * quiere vender a toda costa en vez de ayudar.
 *
 * La causa no era el modelo: el estado seguía empujando la venta vieja
 * (producto en foco, última oferta, pregunta pendiente, "lo próximo: esperar
 * respuesta a la oferta") y el prompt decía "retomá donde quedaron".
 */
import { describe, test, expect } from "vitest";
import { estadoInicial, abrirVisitaNueva, describirEstado } from "../estado-conversacion";
import type { Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder } from "../motor";
import { clienteFalso } from "../cliente-llm";

const CORRECTOR: Producto = { id: 7, name: "Corrector de postura", description: "Ajustable", price: 59900, currency: "COP", kind: "physical", disponible: true };
const CAT = [CORRECTOR];
const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };
const guion = () => guionDelNegocio({ catalogo: CAT, negocio: { nombre: "T", entrega: { metodo: "transportadora", plazo: "2-4 días" } }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }] });
const hace = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

/** Una venta que quedó a medias: se le mostró precio y se le preguntó si lo lleva. */
function ventaAMedias(horasSinEscribir: number) {
  const e = estadoInicial(1);
  e.productoEnFoco = 7;
  e.compra = "precio_dado";
  e.seccionesEnviadas = { 7: { precio: hace(horasSinEscribir) } };
  e.ultimaOferta = { tipo: "precio", productoId: 7, resumen: "el precio del Corrector de postura", at: hace(horasSinEscribir) } as any;
  e.ultimaPreguntaAgente = "¿Te lo llevas en talla M?";
  e.preguntaPendiente = "¿Te lo llevas en talla M?";
  e.siguienteAccion = "esperar_respuesta_a_oferta";
  e.datos = { nombre: "Ana" } as any;
  e.ultimoMensajeCliente = hace(horasSinEscribir);
  return e;
}

async function hola(estado: any) {
  const llm = clienteFalso([{ content: "¡Hola Ana! Qué gusto leerte. ¿En qué te puedo ayudar hoy?" }]);
  const r = await responder({
    llm,
    estado,
    historial: [
      { role: "customer", content: "cuánto vale el corrector?", createdAt: hace(30) },
      { role: "agent", content: "Vale $59.900. ¿Te lo llevas en talla M?", createdAt: hace(30) },
      { role: "customer", content: "hola", createdAt: new Date() },
    ],
    catalogo: CAT,
    conocimiento: [],
    guion: guion(),
    voz: VOZ,
  });
  const mensajes = (llm as any).llamadas[0].messages as { role: string; content: string }[];
  return { r, system: mensajes[0].content, mensajes };
}

describe("un 'hola' al otro día es una visita nueva", () => {
  test("el prompt ya no manda a retomar la venta vieja", async () => {
    const { system } = await hola(ventaAMedias(30));
    expect(system).toMatch(/VISITA NUEVA/);
    expect(system).toMatch(/no le nombres el producto de antes/i);
    expect(system).not.toMatch(/Retomá donde quedaron/);
    // Nada de la venta vieja queda empujando como pendiente.
    expect(system).not.toMatch(/LO ÚLTIMO QUE LE OFRECISTE/);
    expect(system).not.toMatch(/Tu última pregunta fue/);
    expect(system).not.toMatch(/esperar_respuesta_a_oferta/);
    expect(system).not.toMatch(/Producto en foco: Corrector/);
  });

  test("el historial marca el corte entre la visita de ayer y el 'hola' de hoy", async () => {
    const { mensajes } = await hola(ventaAMedias(30));
    const i = mensajes.findIndex((m) => m.role === "system" && /Fin de la visita anterior/.test(m.content));
    expect(i).toBeGreaterThan(0);
    expect(mensajes[i - 1].content).toMatch(/Te lo llevas/);
    expect(mensajes[i + 1]).toMatchObject({ role: "user", content: "hola" });
  });

  test("la memoria se conserva: sabe su nombre, lo que ya se le mandó y de qué hablaron", async () => {
    const { r, system } = await hola(ventaAMedias(30));
    expect(system).toMatch(/nombre: Ana/);
    expect(system).toMatch(/De Corrector de postura ya le enviaste/);
    expect(system).toMatch(/Hablaban antes de: Corrector de postura/);
    expect(r.estado.productoAnterior).toBe(7);
    expect(r.estado.productoEnFoco).toBeNull();
  });

  test("dentro de la misma charla (1 hora) NO se corta nada", async () => {
    const { system, mensajes } = await hola(ventaAMedias(1));
    expect(system).not.toMatch(/VISITA NUEVA/);
    expect(system).toMatch(/Producto en foco: Corrector/);
    expect(system).toMatch(/Tu última pregunta fue/);
    expect(mensajes.some((m) => /Fin de la visita anterior/.test(m.content))).toBe(false);
  });

  test("una compra ya comprometida no se borra: puede venir a preguntar por su pedido", () => {
    const e = ventaAMedias(30);
    e.compra = "pago_reportado";
    e.comprobanteRecibido = true;
    abrirVisitaNueva(e);
    expect(e.compra).toBe("pago_reportado");
    expect(describirEstado(e, () => "Corrector de postura")).toMatch(/NINGUNA persona lo verificó/);
  });

  test("los datos de pago ya enviados siguen siendo un hecho (un 'ya' de vuelta se entiende)", () => {
    const e = ventaAMedias(30);
    e.pago = "datos_enviados";
    abrirVisitaNueva(e);
    expect(e.pago).toBe("datos_enviados");
    expect(e.compra).toBe("ninguno");
  });
});
