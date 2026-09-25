/**
 * LOS CHATS REALES DEL CORRECTOR (22 y 23-09-2026)
 *
 * El dueño pegó dos conversaciones de su WhatsApp. Cada prueba es un fallo
 * que se vio ahí o en la simulación de venta del mismo día.
 */
import { describe, test, expect } from "vitest";
import { db, tenants, conversations, messages } from "@workspace/db";
import { estadoInicial, describirEstado } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";
import { responder, anunciaUnEnvio } from "../motor";
import { clienteFalso } from "../cliente-llm";
import { cargarHistorial } from "../adaptador";
import { vinetasDeLoQueIncluye, emojiDelProducto } from "../../whatsapp";
import { invitacionesDe } from "../../ficha-parcial";

const correctores: Producto[] = [1, 2, 3, 4, 5].map((i) => ({
  id: i, name: ["Corrector de postura", "Corrector ortopédico Back", "Corrector trenza", "Corrector unisex", "Corrector espalda Black"][i - 1],
  description: "", price: 45000 + i * 1000, currency: "COP", kind: "physical", disponible: true,
}));
const guion = () => guionDelNegocio({ catalogo: correctores, negocio: { nombre: "T" }, medios: [{ etiqueta: "Nequi", tipo: "transferencia" }] });
const VOZ = { nombreAgente: "Sofía", rolAgente: "asesora", nombreNegocio: "T" };

describe('"Me interesa este" citando una ficha', () => {
  test("el historial le muestra al modelo QUÉ ficha citó", async () => {
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const [t] = await db.insert(tenants).values({ name: "Cita", email: `cita-${s}@test.local`, slug: `cita-${s}`, brandName: "Cita" } as any).returning();
    const [c] = await db.insert(conversations).values({ tenantId: t.id, contactName: "Duvier", contactPhone: `57301${s.slice(-6)}`, status: "ai" } as any).returning();
    await db.insert(messages).values({ conversationId: c.id, role: "customer", content: "Me interesa este", metadata: { citado: "💅 *Corrector de postura*\n\nCorrector diseñado para alinear hombros" } } as any);
    const h = await cargarHistorial(c.id);
    expect(h.at(-1)!.content).toMatch(/Responde citando este mensaje: ".*Corrector de postura/);
    expect(h.at(-1)!.content).toMatch(/Me interesa este$/);
  });
});

describe("5 correctores y solo entran 4 fichas", () => {
  test("se le dice al modelo cuál quedó afuera, y las fichas salen sin cierre repetido", () => {
    const ctx: ContextoHerramientas = { estado: estadoInicial(1), catalogo: correctores, partes: [], conocimiento: [], guion: guion(), mensajeDelCliente: "me los mostrás?", efectos: [] };
    const r: any = ejecutores.mostrar_opciones(ctx, { productoIds: [1, 2, 3, 4, 5] });
    expect(ctx.partes).toHaveLength(4);
    expect(r.mensaje).toMatch(/NO se mostró Corrector espalda Black/);
    expect(ctx.partes.every((p: any) => p.sinCierre)).toBe(true);
  });
});

describe("la ficha que arma el servidor", () => {
  test("no apila emojis cuando la característica ya trae el suyo (\"✅ 🧵\")", () => {
    const v = vinetasDeLoQueIncluye(["🧵 Material de neopreno acolchado", "🎽 Se puede usar debajo o sobre la ropa"], [], [], "Corrector de postura");
    expect(v).toEqual(["🧵 Material de neopreno acolchado", "🎽 Se puede usar debajo o sobre la ropa"]);
  });
  test("un corrector de postura no sale con 💅 aunque Dropi lo ponga en belleza", () => {
    expect(emojiDelProducto("Corrector de postura", "Salud y belleza")).toBe("🦴");
  });
  test("la palabra \"una\" ya no es \"uña\"", () => {
    expect(emojiDelProducto("Lámpara de una luz", null)).not.toBe("💅");
  });
  test("si ya sabe el precio, la ficha no cierra ofreciéndole el precio", () => {
    const cierres = invitacionesDe("info", true, false, false, true).join(" ");
    expect(cierres).not.toMatch(/cuánto (está|vale)/i);
    expect(cierres).toMatch(/pedido|pedimos/i);
  });
});

describe('"Me muestra" después de una pregunta del bot', () => {
  test("el estado ya no le ordena insistir con la pregunta pendiente", () => {
    const e = estadoInicial(1);
    e.ultimaPreguntaAgente = "¿Te lo mando a domicilio en Colombia?";
    e.preguntaPendiente = "¿Te lo mando a domicilio en Colombia?";
    const s = describirEstado(e, () => "x");
    expect(s).not.toMatch(/antes de cambiar de tema/);
    expect(s).toMatch(/pide OTRA cosa .* no le repitas tu pregunta/);
  });
});

describe('"Ahí te van los medios de nuevo" sin mandar nada', () => {
  test("se detecta el anuncio de un envío (y el pasado no cuenta)", () => {
    expect(anunciaUnEnvio("Ahí te van los medios de nuevo, Ana.")).toBe(true);
    expect(anunciaUnEnvio("Acá te dejo el valor:")).toBe(true);
    expect(anunciaUnEnvio("Ya te los dejé arriba, Ana.")).toBe(false);
    expect(anunciaUnEnvio("¿Te lo mando a domicilio?")).toBe(false);
  });

  test("si lo anuncia sin herramienta, se le avisa una vez y termina MANDÁNDOLO", async () => {
    const e = estadoInicial(1);
    e.productoEnFoco = 1;
    // Precio y pago ya salieron antes: ahora pide los medios OTRA vez.
    e.seccionesEnviadas = { 1: { precio: new Date().toISOString(), pago: new Date().toISOString() } };
    const llm = clienteFalso([
      { content: "Ahí te van los medios de nuevo, Ana." },
      { toolCalls: [{ id: "a", name: "mostrar", arguments: '{"productoId":1,"seccion":"pago","reenviar":true}' }] },
      { content: "Listo, ahí están." },
    ]);
    const r = await responder({ llm, estado: e, historial: [{ role: "customer", content: "cómo pago?", createdAt: new Date() }], catalogo: correctores, conocimiento: [], guion: guion(), voz: VOZ });
    expect(r.partes.some((p: any) => p.kind === "card" && String(p.seccion).startsWith("pago"))).toBe(true);
  });

  test("si no hacía falta mandar nada y lo reescribe, sale el texto corregido", async () => {
    const llm = clienteFalso([
      { content: "Ahí te va la info." },
      { content: "Contame qué te gustaría saber y te respondo." },
    ]);
    const r = await responder({ llm, estado: estadoInicial(1), historial: [{ role: "customer", content: "hola", createdAt: new Date() }], catalogo: correctores, conocimiento: [], guion: guion(), voz: VOZ });
    expect((r.partes[0] as any).content).toMatch(/qué te gustaría saber y te respondo\.$/);
  });
});
