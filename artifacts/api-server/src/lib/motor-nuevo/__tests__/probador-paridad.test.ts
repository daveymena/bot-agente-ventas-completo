import { afterEach, describe, expect, it, vi } from "vitest";
import { db, settings, tenants, agents, products, conversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { armarCadena, clienteFalso } from "../cliente-llm";
import { correrEnSombra, cargarVozDelNegocio, cargarConocimiento } from "../adaptador";
import { corregirForma, corregirDato, loQueSabeElVendedor } from "../../correcciones-del-dueno";
import { textoDelTurnoParaHistorial } from "../historial-del-turno";
import type { Producto } from "../herramientas";

const piano: Producto = { id: 7, name: "Curso de piano", description: "19 módulos en video HD. Este curso no incluye certificado.", price: 60000, currency: "COP", kind: "digital", disponible: true };
afterEach(() => vi.unstubAllEnvs());

it("lee la elección guardada antes de construir y priorizar la cola", async () => {
  await db.delete(settings);
  vi.stubEnv("DEEPSEEK_API_KEY", "clave-falsa-para-prueba");
  await db.insert(settings).values({ aiProvider: "nvidia", nvidiaApiKey: "nvidia-de-prueba", nvidiaModel: "meta/llama-3.1-8b-instruct" });
  const [fila] = await db.select().from(settings).limit(1);
  const sinFila = await armarCadena({ tenantId: null });
  const conFila = await armarCadena({ tenantId: null, appSettings: fila });
  expect(sinFila[0]?.source).toBe("nvidia/meta/llama-3.1-8b-instruct");
  expect(sinFila[0]).toEqual(conFila[0]);
  expect(sinFila[0].config.apiKey).toBe("nvidia-de-prueba");
  expect((await armarCadena({ appSettings: null })).some((c) => c.config.apiKey === "nvidia-de-prueba")).toBe(false);
});

describe("historial común de WhatsApp y probador", () => {
  it("recuerda precio y contenido aunque la respuesta sea solamente una ficha", () => {
    const texto = textoDelTurnoParaHistorial([{ kind: "card", productId: 7, seccion: "completa" }], [piano]);
    expect(texto).toContain("60.000"); expect(texto).toContain("19 módulos"); expect(texto).toContain("Curso de piano");
  });
  it("una ficha de precio no afirma haber mostrado el contenido", () => {
    const texto = textoDelTurnoParaHistorial([{ kind: "card", productId: 7, seccion: "precio" }], [piano]);
    expect(texto).toContain("60.000"); expect(texto).not.toContain("19 módulos");
  });
  it("una ficha informativa no afirma haber dado el precio", () => {
    const texto = textoDelTurnoParaHistorial([{ kind: "card", productId: 7, seccion: "info" }], [piano]);
    expect(texto).toContain("19 módulos"); expect(texto).not.toContain("60.000");
  });
  it("conserva la voz y no atribuye datos al producto equivocado", () => {
    const texto = textoDelTurnoParaHistorial([{ kind: "voz", content: "Te explico" }, { kind: "card", productId: 999, seccion: "completa" }], [piano]);
    expect(texto).toContain("nota de voz) Te explico"); expect(texto).toContain("999"); expect(texto).not.toContain("19 módulos");
  });
});

it("el turno siguiente conserva las fichas y las correcciones llegan al motor sin crear chats reales", async () => {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [tenant] = await db.insert(tenants).values({ name: "Prueba aislada", brandName: "Prueba aislada", email: `${sufijo}@test.local`, slug: `prueba-${sufijo}` } as any).returning();
  await db.insert(agents).values({ tenantId: tenant.id, name: "Ana", role: "vendedora", tone: "breve", systemPrompt: "x", isActive: true } as any);
  const [producto] = await db.insert(products).values({ tenantId: tenant.id, name: piano.name, description: piano.description, price: "60000", currency: "COP", kind: "digital", isActive: true } as any).returning();
  await db.insert(products).values([
    { tenantId: tenant.id, name: "Portátil ASUS Vivobook 15 | Incluye Morral + Mouse", description: "Computador", price: "2000000", currency: "COP", kind: "physical", isActive: true },
    { tenantId: tenant.id, name: "Bicicleta urbana", description: "Transporte", price: "500000", currency: "COP", kind: "physical", isActive: true },
  ] as any);
  const primerTurno = clienteFalso([{ content: "Este curso no incluye certificado." }]);
  await correrEnSombra({ tenantId: tenant.id, turnos: ["¿El curso de piano incluye certificado?"], llm: primerTurno });
  expect(JSON.stringify(primerTurno.llamadas[0]?.messages)).toContain("Este curso no incluye certificado");
  const llm = clienteFalso([
    { toolCalls: [{ id: "ficha", name: "mostrar", arguments: JSON.stringify({ productoId: producto.id, seccion: "completa" }) }] },
    { content: "Aquí está la información." }, { content: "Son 19 módulos." },
  ]);
  const r = await correrEnSombra({ tenantId: tenant.id, turnos: ["Quiero el curso de piano, precio y contenido", "¿Cuántos módulos dijiste? ¿Incluye certificado?"], llm });
  expect(r.salida.every((t) => !t.error)).toBe(true);
  expect(r.estado.productoEnFoco).toBe(producto.id);
  expect(r.salida[0].textoParaHistorial).toContain("19 módulos");
  expect(r.salida[0].textoParaHistorial).toContain("60.000");
  const ultimaEntrada = JSON.stringify(llm.llamadas.at(-1)?.messages);
  expect(ultimaEntrada).toContain("Lo que le mostró"); expect(ultimaEntrada).toContain("19 módulos");
  expect((await corregirForma(tenant.id, "No cierres todas las respuestas con una pregunta.")).ok).toBe(true);
  expect((await cargarVozDelNegocio(tenant.id)).instruccionesExtra).toContain("No cierres todas");
  expect((await corregirDato(tenant.id, { mensajeDelCliente: "¿Incluye certificado?", respuestaCorrecta: "Este curso de prueba no incluye certificado.", productId: producto.id })).ok).toBe(true);
  expect(await cargarConocimiento(tenant.id)).toEqual(expect.arrayContaining([expect.objectContaining({ productId: producto.id, respuesta: "Este curso de prueba no incluye certificado." })]));
  expect((await loQueSabeElVendedor(tenant.id)).productos).toEqual(expect.arrayContaining([expect.objectContaining({ id: producto.id, nombre: "Curso de piano" })]));
  expect((await corregirDato(tenant.id + 999999, { mensajeDelCliente: "¿Incluye certificado?", respuestaCorrecta: "No incluye certificado.", productId: producto.id })).ok).toBe(false);
  const regenerado = clienteFalso([
    { toolCalls: [{ id: "conocimiento", name: "consultar_conocimiento", arguments: JSON.stringify({ pregunta: "¿Incluye certificado?", productoId: producto.id }) }] },
    { content: "Este curso no incluye certificado." },
  ]);
  await correrEnSombra({ tenantId: tenant.id, turnos: ["¿Incluye certificado?"], estadoInicial: r.estado, historialPrevio: [{ role: "agent", content: r.salida[0].textoParaHistorial }], llm: regenerado });
  const prompt = JSON.stringify(regenerado.llamadas[0]?.messages);
  expect(prompt).toContain("No cierres todas");
  expect(prompt).toContain("Incluye certificado");
  expect(JSON.stringify(regenerado.llamadas.at(-1)?.messages)).toContain("no incluye certificado");
  expect(await db.select().from(conversations).where(eq(conversations.tenantId, tenant.id))).toHaveLength(0);
});
