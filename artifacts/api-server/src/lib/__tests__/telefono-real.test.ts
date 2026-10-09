/** Venta real 06-10: el LID de WhatsApp salió como celular en el resumen. */
import { describe, it, expect } from "vitest";
import { telefonoReal } from "../motor-nuevo/adaptador";

describe("telefonoReal", () => {
  it("un LID no es teléfono", () => {
    expect(telefonoReal("198874299904173")).toBeNull();
    expect(telefonoReal("215814204608627@lid")).toBeNull();
  });
  it("celulares reales pasan", () => {
    expect(telefonoReal("573146241530")).toBe("573146241530");
    expect(telefonoReal("3146241530")).toBe("3146241530");
    expect(telefonoReal("573042748687@s.whatsapp.net")).toBe("573042748687");
  });
});
