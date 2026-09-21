import { describe, it, expect, vi, afterEach } from "vitest";
import { executeAction, CODE_TOOLS } from "../app-operator";
import { tenantManager } from "../tenantManager";

/**
 * Seguridad pedida por el dueño (21-09-2026): las herramientas de código
 * (leer/editar/testear/commit/deploy) son SOLO para el admin de la plataforma
 * (daveymena16@gmail.com). Un cliente del SaaS —aunque sea dueño de su propio
 * tenant— no debe poder leer el código compartido ni, menos, commitear o
 * reiniciar el servicio de todos.
 */
describe("Herramientas de código: solo el administrador de la plataforma", () => {
  afterEach(() => vi.restoreAllMocks());

  it("CODE_TOOLS cubre las 8 herramientas de código", () => {
    expect([...CODE_TOOLS].sort()).toEqual(
      ["codigo_leer", "codigo_buscar", "codigo_listar", "git_estado", "tests_correr", "codigo_escribir", "git_commit_push", "deploy"].sort(),
    );
  });

  it("un tenant que no es admin no puede leer código", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue({ email: "cliente@gmail.com", isAdmin: false } as any);
    const r = await executeAction("codigo_leer", { ruta: "artifacts/api-server/src/lib/agent.ts" }, { tenantId: 2 } as any);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/solo para el administrador/i);
  });

  it("un tenant que no es admin no puede hacer deploy ni commit", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue({ email: "cliente@gmail.com", isAdmin: false } as any);
    const deploy = await executeAction("deploy", {}, { tenantId: 2 } as any);
    expect(deploy.ok).toBe(false);
    expect(deploy.summary).toMatch(/solo para el administrador/i);

    const commit = await executeAction("git_commit_push", { mensaje: "x" }, { tenantId: 2 } as any);
    expect(commit.ok).toBe(false);
    expect(commit.summary).toMatch(/solo para el administrador/i);
  });

  it("el admin (isAdmin) SÍ pasa el candado y ejecuta la lectura", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue({ email: "daveymena16@gmail.com", isAdmin: true } as any);
    const r = await executeAction("codigo_listar", { ruta: "." }, { tenantId: 1 } as any);
    expect(r.ok).toBe(true);
  });

  it("el admin por email (sin flag isAdmin) también pasa", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue({ email: "daveymena16@gmail.com", isAdmin: false } as any);
    const r = await executeAction("codigo_listar", { ruta: "." }, { tenantId: 1 } as any);
    expect(r.ok).toBe(true);
  });

  it("si no se puede resolver el tenant, se deniega (fail-closed)", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue(null);
    const r = await executeAction("codigo_leer", { ruta: "x" }, { tenantId: 9 } as any);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/solo para el administrador/i);
  });
});
