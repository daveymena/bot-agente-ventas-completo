import { describe, expect, it } from "vitest";
import { rangoHoyColombia } from "../date-utils";

describe("rangoHoyColombia", () => {
  it("usa medianoche de Bogotá aunque el servidor ya esté en el día UTC siguiente", () => {
    const r = rangoHoyColombia(new Date("2026-10-10T04:30:00.000Z"));
    expect(r.etiqueta).toBe("2026-10-09");
    expect(r.desde.toISOString()).toBe("2026-10-09T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });
});
