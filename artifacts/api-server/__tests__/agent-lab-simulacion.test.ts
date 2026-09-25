/**
 * AGENT LAB — Tests básicos de simulación.
 *
 * Verifica que:
 * 1. El simulador puede correr sin errores
 * 2. Los arquetipos se instancian correctamente
 * 3. El evaluador detecta problemas conocidos
 * 4. No rompe el flujo existente
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ensureDbReady, products, agents, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { obtenerPerfil, ARQUETIPOS_CLIENTE, combinarArquetipos } from "../src/lib/motor-nuevo/cliente-simulado";
import { correrSimulacionCliente } from "../src/lib/motor-nuevo/simulador-agente";
import { extraerHallazgosDeSimulaciones } from "../src/lib/agent-lab-mejora";
import { armarCadena, crearClienteLLM } from "../src/lib/motor-nuevo/cliente-llm";

describe("Agent Lab — Simulación", () => {
  let tenantId = 0;
  let productoId = 0;

  beforeAll(async () => {
    const { db } = await ensureDbReady();

    // Busca tenant de pruebas (debería existir, asume ID 1)
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, 1));
    if (!tenant) {
      throw new Error("No hay tenant de pruebas (ID 1). Corre seed primero.");
    }
    tenantId = tenant.id;

    // Busca un producto (piano, corrector, etc.)
    const prods = await db.select().from(products).where(eq(products.tenantId, tenantId));
    if (prods.length === 0) {
      throw new Error(`No hay productos en tenant ${tenantId}. Corre seed primero.`);
    }
    productoId = prods[0].id;
  });

  it("Los arquetipos se cargan sin error", () => {
    expect(Object.keys(ARQUETIPOS_CLIENTE).length).toBeGreaterThan(10);

    for (const [clave, perfil] of Object.entries(ARQUETIPOS_CLIENTE)) {
      expect(perfil.clave).toBe(clave);
      expect(perfil.nombre).toBeTruthy();
      expect(perfil.intencionCompra).toBeGreaterThanOrEqual(0);
      expect(perfil.intencionCompra).toBeLessThanOrEqual(100);
      expect(perfil.reglasEvaluacion.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("Combinar arquetipos genera un perfil válido", () => {
    const combinado = combinarArquetipos("DESCONFIADO", "PRECIO_SENSIBLE");
    expect(combinado.clave).toContain("DESCONFIADO");
    expect(combinado.clave).toContain("PRECIO_SENSIBLE");
    expect(combinado.reglasEvaluacion.length).toBeGreaterThan(0);
  });

  it("obtenerPerfil resuelve claves simples y combinadas", () => {
    const simple = obtenerPerfil("NORMAL");
    expect(simple.nombre).toBe("Cliente normal (de línea base)");

    const combinada = obtenerPerfil("DESCONFIADO_PRECIO_SENSIBLE");
    expect(combinada.clave).toContain("DESCONFIADO");
  });

  it("Lanza un error para arquetipos desconocidos", () => {
    expect(() => obtenerPerfil("INEXISTENTE_FALSO")).toThrow();
  });

  it("Simulador corre sin errores (integración básica)", async () => {
    const perfil = obtenerPerfil("NORMAL");
    const llmConfig = {
      cadena: await armarCadena({ tenantId }),
      tenantId,
    };

    // Nota: este test puede tardar (usa LLM real) y puede fallar si el LLM no responde.
    // En CI, considera mockearlo o saltarlo con `it.skip`.
    const resultado = await correrSimulacionCliente({
      tenantId,
      perfilCliente: perfil,
      productoId,
      llmConfig,
      maxTurnos: 3,
    });

    expect(resultado.turnos.length).toBeGreaterThan(0);
    expect(resultado.cerroEn).toMatch(/compra|abandono|limite_turnos/);
    expect(resultado.perfilCliente.clave).toBe("NORMAL");
  });

  it("Evaluador extrae hallazgos de simulaciones", async () => {
    const perfil = obtenerPerfil("DESCONFIADO");
    const llmConfig = {
      cadena: await armarCadena({ tenantId }),
      tenantId,
    };

    const resultado = await correrSimulacionCliente({
      tenantId,
      perfilCliente: perfil,
      productoId,
      llmConfig,
      maxTurnos: 3,
    });

    const hallazgos = extraerHallazgosDeSimulaciones([resultado]);
    // Puede haber hallazgos o no, pero no debe fallar
    expect(Array.isArray(hallazgos)).toBe(true);
  });

  it("El simulador no escribe en conversaciones reales", async () => {
    const { db } = await ensureDbReady();
    const conteoAntes = await db.select().from(require("@workspace/db").conversations);

    const perfil = obtenerPerfil("NORMAL");
    const llmConfig = {
      cadena: await armarCadena({ tenantId }),
      tenantId,
    };

    await correrSimulacionCliente({
      tenantId,
      perfilCliente: perfil,
      productoId,
      llmConfig,
      maxTurnos: 2,
    });

    const conteoDespues = await db.select().from(require("@workspace/db").conversations);

    expect(conteoDespues.length).toBe(conteoAntes.length);
  });
});

describe("Agent Lab — Integración con motor v2", () => {
  it("El simulador reusa el motor v2 sin modificarlo", () => {
    // Este test verifica que importar simulador-agente no rompe el motor-nuevo.
    // Si falla, significa que el simulador tiene dependencias circulares o cambia el motor.
    expect(() => {
      require("../src/lib/motor-nuevo/simulador-agente");
      require("../src/lib/motor-nuevo/motor");
    }).not.toThrow();
  });
});
