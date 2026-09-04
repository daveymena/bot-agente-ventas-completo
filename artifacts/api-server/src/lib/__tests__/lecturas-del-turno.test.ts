/**
 * QUÉ CONSULTÓ ATLAS DE VERDAD: el registro que nunca guardó nada.
 *
 * Encontrado el 2026-09-04 leyendo el diagnóstico nuevo contra producción: diez
 * turnos seguidos con `lecturas: []`, incluido uno cuyo pedido era literalmente
 * "Consulta los números". Ninguna herramienta figuraba.
 *
 * La causa no era que Atlas no las llamara: era que nadie podía anotarlo.
 * `registrarLecturaDelTurno` insertaba sin `title`, que es `notNull()` en los
 * DOS esquemas (pg y sqlite). Cada inserción fallaba con violación de NOT NULL
 * y el `catch` se la tragaba en silencio.
 *
 * ── Por qué importa más que una métrica perdida ──────────────────────────
 *
 * Porque `lecturasDelTurno` alimenta el candado que le avisa al admin cuando
 * Atlas da números sin consultarlos. Con la lista SIEMPRE vacía, ese aviso se
 * disparaba aunque Atlas hubiera consultado de verdad. Es exactamente lo que
 * el admin reportó: "dice que esto no fue consultado cuando sí".
 *
 * Un aviso que se dispara sobre trabajo bien hecho enseña a ignorarlo. Y el día
 * que sea cierto --que Atlas SÍ invente un número-- tampoco lo van a leer.
 *
 * ── Por qué esta prueba existe ───────────────────────────────────────────
 *
 * La función no se podía llamar desde afuera, así que no había forma de
 * comprobar que guardara. El silencio del catch más la imposibilidad de
 * probarla es lo que la mantuvo rota todo este tiempo.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

let dbMod: any;
let tenantId = 0;

describe("registro de lo que Atlas consultó (integración)", () => {
  beforeAll(async () => {
    dbMod = await import("@workspace/db");
    await dbMod.ensureDbReady();
    const [tenant] = await dbMod.db.insert(dbMod.tenants).values({
      name: "Lecturas Test",
      email: `lecturas-${Date.now()}@test.local`,
      slug: `lecturas-${Date.now()}`,
      brandName: "Lecturas Test",
    }).returning();
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (!dbMod) return;
    try {
      await dbMod.db.delete(dbMod.architectMemory);
      await dbMod.db.delete(dbMod.tenants);
    } catch { /* noop */ }
  });

  /** LA PRUEBA. Antes devolvía [] siempre, porque la inserción fallaba. */
  it("lo que se anota se puede volver a leer", async () => {
    const { registrarLecturaDelTurno, lecturasDelTurno } = await import("../opencode-mcp-tools");
    const turnId = `turno-${Date.now()}`;

    await registrarLecturaDelTurno({ tenantId, turnId }, "dashboard_summary");
    await registrarLecturaDelTurno({ tenantId, turnId }, "list_products");

    const leidas = await lecturasDelTurno(tenantId, turnId);
    expect(leidas).toContain("dashboard_summary");
    expect(leidas).toContain("list_products");
  });

  /** Cada turno tiene lo suyo: si se mezclaran, el candado miraría el turno
   *  equivocado y avisaría --o dejaría pasar-- por el motivo incorrecto. */
  it("no mezcla las lecturas de dos turnos", async () => {
    const { registrarLecturaDelTurno, lecturasDelTurno } = await import("../opencode-mcp-tools");
    const a = `turno-a-${Date.now()}`;
    const b = `turno-b-${Date.now()}`;

    await registrarLecturaDelTurno({ tenantId, turnId: a }, "fb_status");
    await registrarLecturaDelTurno({ tenantId, turnId: b }, "list_categories");

    expect(await lecturasDelTurno(tenantId, a)).toEqual(["fb_status"]);
    expect(await lecturasDelTurno(tenantId, b)).toEqual(["list_categories"]);
  });

  /** Sin contexto válido no se anota nada, y tampoco se rompe. */
  it("sin tenant o sin turno no rompe", async () => {
    const { registrarLecturaDelTurno } = await import("../opencode-mcp-tools");
    await expect(registrarLecturaDelTurno({}, "list_products")).resolves.toBeUndefined();
    await expect(registrarLecturaDelTurno({ tenantId }, "list_products")).resolves.toBeUndefined();
  });
});
