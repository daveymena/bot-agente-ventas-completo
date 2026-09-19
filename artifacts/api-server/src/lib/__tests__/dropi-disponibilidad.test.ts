import { describe, it, expect } from "vitest";
import { interpretarProductoDeDropi, mensajeAlClienteSinDisponibilidad } from "../dropi-disponibilidad";

/**
 * El #323 (18-09-2026) llegó a Dropi y Dropi lo rechazó por producto
 * archivado; el bot se enteró DESPUÉS de crear la orden. Ahora se pregunta
 * antes. Como el formato de Dropi no está documentado, la lectura tolera
 * varios nombres de campo y, si no entiende, NO bloquea (desconocido).
 */
describe("leer la disponibilidad que devuelve Dropi", () => {
  it("archivado por bandera o por texto de estado", () => {
    expect(interpretarProductoDeDropi({ id: 1, archived: true }, 1).estado).toBe("archivado");
    expect(interpretarProductoDeDropi({ id: 1, status: "ARCHIVED" }, 1).estado).toBe("archivado");
    expect(interpretarProductoDeDropi({ id: 1, active: false, stock: 40 }, 1).estado).toBe("archivado");
    expect(interpretarProductoDeDropi({ objects: { id: 1, state: "inactivo" } }, 1).estado).toBe("archivado");
  });
  it("sin stock cuando el número es 0, con el nombre de campo que sea", () => {
    expect(interpretarProductoDeDropi({ id: 1, status: "ACTIVE", stock: 0 }, 1).estado).toBe("sin_stock");
    expect(interpretarProductoDeDropi({ id: 1, stock_quantity: "0" }, 1).estado).toBe("sin_stock");
  });
  it("disponible con stock o con estado activo", () => {
    const d = interpretarProductoDeDropi({ id: 1, status: "ACTIVE", stock: 12 }, 1);
    expect(d.estado).toBe("disponible");
    expect(d.stock).toBe(12);
    expect(interpretarProductoDeDropi({ id: 1, status: "active" }, 1).estado).toBe("disponible");
  });
  it("si no entiende la respuesta, dice desconocido y no bloquea", () => {
    expect(interpretarProductoDeDropi({ id: 1, name: "x" }, 1).estado).toBe("desconocido");
    expect(interpretarProductoDeDropi(null, 1).estado).toBe("desconocido");
    expect(interpretarProductoDeDropi("texto", 1).estado).toBe("desconocido");
  });
  it("el mensaje al cliente no promete fechas ni culpa a nadie", () => {
    const m = mensajeAlClienteSinDisponibilidad("Bolso by lola", { estado: "archivado", detalle: "x", dropiProductId: 1, stock: null });
    expect(m).toContain("Bolso by lola");
    expect(m).not.toMatch(/proveedor archiv|Dropi/);
    expect(m).toMatch(/alternativa/);
  });
});
