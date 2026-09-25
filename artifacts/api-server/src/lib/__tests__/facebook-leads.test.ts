/**
 * Leads de formulario por negocio (25-09-2026): antes `tenantId = 1` fijo y
 * todo teléfono con +57.
 */
import { describe, test, expect } from "vitest";
import { telefonoConIndicativo, camposDelLead } from "../facebook-leads";

describe("teléfono del lead con el indicativo del país del negocio", () => {
  test("Colombia", () => expect(telefonoConIndicativo("300 123 4567", "Colombia")).toBe("573001234567"));
  test("México", () => expect(telefonoConIndicativo("55 1234 5678", "México")).toBe("525512345678"));
  test("ya trae el indicativo con +", () => expect(telefonoConIndicativo("+51 987 654 321", "Colombia")).toBe("51987654321"));
  test("vacío", () => expect(telefonoConIndicativo("", "Colombia")).toBe(""));
});

describe("campos del formulario de Meta", () => {
  test("lee nombre, teléfono y ciudad", () => {
    const c = camposDelLead({ field_data: [
      { name: "full_name", values: ["Ana Gómez"] },
      { name: "phone_number", values: ["+573109876543"] },
      { name: "city", values: ["Medellín"] },
    ] });
    expect(c).toMatchObject({ nombre: "Ana Gómez", telefono: "+573109876543", ciudad: "Medellín" });
  });
});
