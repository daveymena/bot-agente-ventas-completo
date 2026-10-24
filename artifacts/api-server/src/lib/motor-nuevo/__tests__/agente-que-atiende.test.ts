/**
 * LO QUE ATLAS CONFIGURA TIENE QUE LLEGAR AL VENDEDOR
 *
 * Hasta el 23-09-2026 el motor v2 (el que atiende WhatsApp desde el 22-09)
 * tomaba el nombre del PRIMER agente activo y el catálogo entero. Atlas creaba
 * agentes especialistas con indicaciones, y le decía al dueño "el sistema ya
 * lo enruta automáticamente" -- pero nada de eso llegaba al cliente.
 */
import { describe, test, expect } from "vitest";
import { db, tenants, agents } from "@workspace/db";
import type { Producto } from "../herramientas";
import { catalogoDeLaEspecialidad, cargarVozDelNegocio } from "../adaptador";
import { construirPromptDeSistema } from "../motor";
import { estadoInicial } from "../estado-conversacion";
import { guionDelNegocio } from "../nicho";

const CURSO: Producto = { id: 1, name: "Curso de piano", description: "", price: 60000, currency: "COP", kind: "digital", disponible: true };
const CORRECTOR: Producto = { id: 2, name: "Corrector de postura", description: "", price: 59900, currency: "COP", kind: "physical", disponible: true };
const CAT = [CURSO, CORRECTOR];

describe("cada especialista ve SUS productos", () => {
  test("el de dropshipping ve lo físico", () => {
    expect(catalogoDeLaEspecialidad(CAT, "dropshipping").map((p) => p.id)).toEqual([2]);
  });
  test("el digital ve lo que no es físico", () => {
    expect(catalogoDeLaEspecialidad(CAT, "digital").map((p) => p.id)).toEqual([1]);
  });
  test("sin especialidad (o la recepcionista) ve todo", () => {
    expect(catalogoDeLaEspecialidad(CAT, null)).toHaveLength(2);
  });
  test("si su especialidad no tiene productos, ve todo antes que quedarse sin nada", () => {
    expect(catalogoDeLaEspecialidad([CURSO], "dropshipping")).toHaveLength(1);
  });
  test("si NADIE más vende lo físico, la única agente (digital) ve el corrector", () => {
    // Simulación real del 23-09: con el filtro sin esta regla, dijo
    // "correctores no manejamos" y vendió un curso de bicicletas.
    expect(catalogoDeLaEspecialidad(CAT, "digital", ["digital"]).map((p) => p.id)).toEqual([1, 2]);
  });
});

async function negocioConDosAgentes() {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [t] = await db.insert(tenants).values({ name: "Dos Agentes", email: `dos-${s}@test.local`, slug: `dos-${s}`, brandName: "Dos Agentes" } as any).returning();
  const [sofia] = await db.insert(agents).values({ tenantId: t.id, name: "Sofía", role: "Recepcionista", tone: "cálido", systemPrompt: "x", isActive: true } as any).returning();
  const [max] = await db
    .insert(agents)
    .values({
      tenantId: t.id, name: "Max", role: "Especialista en productos físicos", tone: "directo", especialidad: "dropshipping",
      systemPrompt: "PLANTILLA LARGA DEL MOTOR VIEJO [CARD: ID]", isActive: true,
      metadata: { indicaciones: "Antes de cerrar, confirmá siempre la ciudad de entrega." },
    } as any)
    .returning();
  return { t, sofia, max };
}

describe("la voz es la del agente que atiende", () => {
  test("con varios agentes, cada uno se presenta con SU nombre y SU rol", async () => {
    const { t, max } = await negocioConDosAgentes();
    const voz = await cargarVozDelNegocio(t.id, max);
    expect(voz.nombreAgente).toBe("Max");
    expect(voz.rolAgente).toMatch(/físicos/);
  });

  test("las indicaciones que escribió Atlas llegan al prompt del vendedor", async () => {
    const { t, max } = await negocioConDosAgentes();
    const voz = await cargarVozDelNegocio(t.id, max);
    const guion = guionDelNegocio({ catalogo: [CORRECTOR], negocio: { nombre: "T" }, medios: [] });
    const prompt = construirPromptDeSistema({ voz, estado: estadoInicial(1), catalogo: [CORRECTOR], guion, nombrePorProducto: () => "x" });
    expect(prompt).toMatch(/INDICACIONES DEL DUEÑO/);
    expect(prompt).toMatch(/confirmá siempre la ciudad de entrega/);
  });

  test("el estilo de WhatsApp responde directo, breve y con emojis medidos", async () => {
    const { t, max } = await negocioConDosAgentes();
    const voz = await cargarVozDelNegocio(t.id, max);
    const guion = guionDelNegocio({ catalogo: [CORRECTOR], negocio: { nombre: "T" }, medios: [] });
    const prompt = construirPromptDeSistema({ voz, estado: estadoInicial(1), catalogo: [CORRECTOR], guion, nombrePorProducto: () => "x" });
    const texto = prompt.replace(/\s+/g, " ");
    expect(texto).toMatch(/pregunta simple en 1 o 2 frases/i);
    expect(texto).toMatch(/Contesta PRIMERO lo que preguntó/i);
    expect(texto).toMatch(/Los emojis no son obligatorios/i);
    expect(texto).toMatch(/sin evasivas/i);
    expect(texto).toMatch(/no significa complacerlo inventando datos/i);
    expect(texto).toMatch(/NO aplanes, elimines ni reescribas las tarjetas estructuradas/i);
    expect(texto).toMatch(/formato, separadores y emojis/i);
    expect(prompt).not.toMatch(/Mensajes de 2 a 4 frases/);
  });

  test("la plantilla larga del motor viejo NO se mete en el prompt del v2", async () => {
    const { t, max } = await negocioConDosAgentes();
    const voz = await cargarVozDelNegocio(t.id, max);
    expect(String(voz.instruccionesExtra)).not.toMatch(/PLANTILLA LARGA|\[CARD/);
  });
});
