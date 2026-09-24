import { describe, it, expect } from "vitest";
import { leerCuando, porQueNoSePuedeProgramar, horaLegible } from "../atlas-agenda";

/**
 * La agenda de Atlas (24-09-2026). Lo que no puede fallar: que "mañana a las 8"
 * sea mañana a las 8 EN LA HORA DEL NEGOCIO, y que lo irreversible no se pueda
 * dejar programado con una confirmación vieja.
 */
const BOG = "America/Bogota"; // UTC-5, sin horario de verano
// jueves 24-09-2026 22:30 en Bogotá = viernes 25-09 03:30 UTC
const AHORA = new Date("2026-09-25T03:30:00Z");

const ok = (r: ReturnType<typeof leerCuando>) => {
  if (!r.ok) throw new Error(r.error);
  return r.fecha.toISOString();
};

describe("cuándo corre una acción programada", () => {
  it("'mañana 08:00' es el viernes a las 8 de Bogotá (13:00 UTC)", () => {
    expect(ok(leerCuando({ cuando: "mañana 08:00" }, BOG, AHORA))).toBe("2026-09-25T13:00:00.000Z");
  });
  it("'hoy 23:00' es dentro de media hora", () => {
    expect(ok(leerCuando({ cuando: "hoy 23:00" }, BOG, AHORA))).toBe("2026-09-25T04:00:00.000Z");
  });
  it("'jueves 9:00' dicho un jueves a la noche es el jueves que viene", () => {
    expect(ok(leerCuando({ cuando: "jueves 9:00" }, BOG, AHORA))).toBe("2026-10-01T14:00:00.000Z");
  });
  it("'lunes a las 07:30' es el próximo lunes", () => {
    expect(ok(leerCuando({ cuando: "lunes a las 07:30" }, BOG, AHORA))).toBe("2026-09-28T12:30:00.000Z");
  });
  it("una fecha sin zona se lee en la hora del negocio", () => {
    expect(ok(leerCuando({ cuando: "2026-09-26 18:00" }, BOG, AHORA))).toBe("2026-09-26T23:00:00.000Z");
  });
  it("una fecha con zona se respeta", () => {
    expect(ok(leerCuando({ cuando: "2026-09-26T18:00:00Z" }, BOG, AHORA))).toBe("2026-09-26T18:00:00.000Z");
  });
  it("enMinutos cuenta desde ahora", () => {
    expect(ok(leerCuando({ enMinutos: 120 }, BOG, AHORA))).toBe("2026-09-25T05:30:00.000Z");
  });
  it("una hora que ya pasó se rechaza, no se ejecuta al instante", () => {
    expect(leerCuando({ cuando: "hoy 20:00" }, BOG, AHORA).ok).toBe(false);
  });
  it("más de 90 días adelante se rechaza", () => {
    expect(leerCuando({ cuando: "2027-06-01 08:00" }, BOG, AHORA).ok).toBe(false);
  });
  it("lo que no se entiende se rechaza en vez de adivinar", () => {
    expect(leerCuando({ cuando: "cuando puedas" }, BOG, AHORA).ok).toBe(false);
  });
  it("la hora que lee el admin está en su zona", () => {
    expect(horaLegible(new Date("2026-09-25T13:00:00Z"), BOG)).toContain("08:00");
  });
});

describe("qué se puede dejar programado", () => {
  const base = { existe: true, esLectura: false, esCodigo: false };
  it("activar, pausar y publicar sí", () => {
    for (const h of ["fb_resume_campaign", "fb_pause_campaign", "fb_page_post", "fb_set_budget"]) {
      expect(porQueNoSePuedeProgramar(h, base)).toBeNull();
    }
  });
  it("borrar NO: una confirmación de días antes no alcanza", () => {
    expect(porQueNoSePuedeProgramar("fb_delete_campaign", base)).toMatch(/irreversible/i);
  });
  it("código NO", () => {
    expect(porQueNoSePuedeProgramar("git_commit_push", { ...base, esCodigo: true })).toMatch(/código/);
  });
  it("la agenda misma NO (sería una recursión)", () => {
    expect(porQueNoSePuedeProgramar("programar_accion", base)).not.toBeNull();
  });
  it("una lectura no, y una herramienta inventada tampoco", () => {
    expect(porQueNoSePuedeProgramar("list_products", { ...base, esLectura: true })).not.toBeNull();
    expect(porQueNoSePuedeProgramar("fb_activar_todo", { ...base, existe: false })).toMatch(/no existe/);
  });
});
