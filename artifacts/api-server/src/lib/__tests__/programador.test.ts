import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, trabajosProgramados } from "@workspace/db";
import {
  programar,
  cancelar,
  correrVencidos,
  registrarManejador,
  _limpiarManejadores,
  proximaVuelta,
} from "../programador";
import { toDbDate } from "../date-utils";

/**
 * El reloj del sistema.
 *
 * Se prueba con la misma severidad que el cobro, y por el mismo motivo: los
 * dos hacen cosas irreversibles sin nadie mirando. Un post duplicado ensucia
 * la página de un cliente y no se puede "des-publicar" con elegancia; una
 * campaña que se enciende cuando no debía gasta plata real de madrugada.
 *
 * Los cuatro casos que importan, y por qué cada uno:
 *
 *   1. No corre antes de tiempo   -- publicar el lunes algo agendado para el
 *                                    viernes es peor que no publicarlo.
 *   2. No se duplica              -- reprogramar la semana dos veces, o dos
 *                                    instancias del servidor, no pueden
 *                                    generar dos posts iguales.
 *   3. Un fallo se reintenta y se rinde -- Meta caída no puede dejar el
 *                                    trabajo colgado ni reintentando para
 *                                    siempre.
 *   4. Sin manejador NO se marca hecho -- decir "publicado" sobre algo que
 *                                    nunca salió es la clase de mentira que
 *                                    este proyecto viene sacando a mano.
 */

const T = 1;

const limpiar = () => db.delete(trabajosProgramados).where(eq(trabajosProgramados.tenantId, T));

beforeEach(async () => {
  _limpiarManejadores();
  await limpiar();
});
afterEach(limpiar);

const enMinutos = (m: number) => new Date(Date.now() + m * 60_000);

describe("el programador respeta la hora", () => {
  it("no corre un trabajo que todavía no vence", async () => {
    let corrio = false;
    registrarManejador("prueba", async () => { corrio = true; });
    await programar({ tenantId: T, tipo: "prueba", clave: "k1", correAt: enMinutos(60) });

    const r = await correrVencidos(new Date());
    expect(corrio).toBe(false);
    expect(r.corridos).toBe(0);
  });

  it("corre el que ya venció, y una sola vez", async () => {
    let veces = 0;
    registrarManejador("prueba", async () => { veces++; });
    await programar({ tenantId: T, tipo: "prueba", clave: "k2", correAt: enMinutos(-5) });

    expect((await correrVencidos()).corridos).toBe(1);
    // Segunda vuelta: ya está hecho, no se repite.
    expect((await correrVencidos()).corridos).toBe(0);
    expect(veces).toBe(1);

    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "k2"));
    expect(fila.estado).toBe("hecho");
  });

  it("el repetitivo se vuelve a agendar en vez de terminar", async () => {
    let veces = 0;
    registrarManejador("ronda", async () => { veces++; });
    await programar({ tenantId: T, tipo: "ronda", clave: "k3", correAt: enMinutos(-1), repiteCadaMin: 15 });

    await correrVencidos();
    expect(veces).toBe(1);

    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "k3"));
    expect(fila.estado).toBe("pendiente");
    // Y su próxima hora quedó en el futuro: no se vuelve a disparar enseguida.
    expect(new Date(fila.correAt as any).getTime()).toBeGreaterThan(Date.now());

    await correrVencidos();
    expect(veces).toBe(1);
  });
});

describe("el programador no duplica", () => {
  it("la misma clave dos veces deja UN solo trabajo", async () => {
    await programar({ tenantId: T, tipo: "prueba", clave: "igual", correAt: enMinutos(30) });
    await programar({ tenantId: T, tipo: "prueba", clave: "igual", correAt: enMinutos(30) });

    const filas = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "igual"));
    expect(filas).toHaveLength(1);
  });

  it("reprogramar mueve la hora del pendiente, no crea otro", async () => {
    await programar({ tenantId: T, tipo: "prueba", clave: "mover", correAt: enMinutos(30) });
    await programar({ tenantId: T, tipo: "prueba", clave: "mover", correAt: enMinutos(120) });

    const filas = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "mover"));
    expect(filas).toHaveLength(1);
    expect(new Date(filas[0].correAt as any).getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);
  });

  it("un trabajo YA EJECUTADO no se revive al reprogramar", async () => {
    // El caso que publicaría dos veces: se corre el plan de la semana, y el
    // lunes alguien lo vuelve a generar. El post del martes ya salió; si la
    // reprogramación lo devolviera a "pendiente", saldría de nuevo.
    let veces = 0;
    registrarManejador("post", async () => { veces++; });
    await programar({ tenantId: T, tipo: "post", clave: "mar", correAt: enMinutos(-1) });
    await correrVencidos();
    expect(veces).toBe(1);

    await programar({ tenantId: T, tipo: "post", clave: "mar", correAt: enMinutos(-1) });
    await correrVencidos();
    expect(veces).toBe(1);
  });
});

describe("el programador aguanta los fallos", () => {
  it("reintenta más tarde y termina rindiéndose", async () => {
    registrarManejador("rompe", async () => { throw new Error("Meta no responde"); });
    await programar({ tenantId: T, tipo: "rompe", clave: "kf", correAt: enMinutos(-1) });

    // Intento 1: falla y se reprograma.
    await correrVencidos();
    let [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "kf"));
    expect(fila.estado).toBe("pendiente");
    expect(fila.intentos).toBe(1);
    expect(fila.error).toContain("Meta no responde");

    // Se avanza el reloj en vez de esperar la espera real.
    await correrVencidos(new Date(Date.now() + 60 * 60_000));
    await correrVencidos(new Date(Date.now() + 6 * 60 * 60_000));

    [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "kf"));
    expect(fila.estado).toBe("fallado");
    expect(fila.intentos).toBe(3);
  });

  it("un tipo sin manejador queda PENDIENTE, nunca 'hecho'", async () => {
    await programar({ tenantId: T, tipo: "nadie-lo-atiende", clave: "kh", correAt: enMinutos(-1) });
    const r = await correrVencidos();

    expect(r.corridos).toBe(0);
    expect(r.sinManejador).toContain("nadie-lo-atiende");

    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "kh"));
    expect(fila.estado).toBe("pendiente");
  });

  it("un trabajo que falla no frena a los demás de la vuelta", async () => {
    let buenos = 0;
    registrarManejador("rompe", async () => { throw new Error("boom"); });
    registrarManejador("anda", async () => { buenos++; });
    await programar({ tenantId: T, tipo: "rompe", clave: "r1", correAt: enMinutos(-3) });
    await programar({ tenantId: T, tipo: "anda", clave: "b1", correAt: enMinutos(-2) });
    await programar({ tenantId: T, tipo: "anda", clave: "b2", correAt: enMinutos(-1) });

    const r = await correrVencidos();
    expect(buenos).toBe(2);
    expect(r.fallados).toBe(1);
  });
});

describe("cancelar", () => {
  it("un trabajo cancelado no corre", async () => {
    let corrio = false;
    registrarManejador("prueba", async () => { corrio = true; });
    await programar({ tenantId: T, tipo: "prueba", clave: "kc", correAt: enMinutos(-1) });

    expect(await cancelar("kc")).toBe(true);
    await correrVencidos();
    expect(corrio).toBe(false);
  });

  it("cancelar algo ya hecho devuelve false y no lo toca", async () => {
    registrarManejador("prueba", async () => {});
    await programar({ tenantId: T, tipo: "prueba", clave: "kd", correAt: enMinutos(-1) });
    await correrVencidos();

    expect(await cancelar("kd")).toBe(false);
    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "kd"));
    expect(fila.estado).toBe("hecho");
  });
});

describe("un deploy a mitad de trabajo no lo deja colgado", () => {
  // Cada deploy mata el proceso. Si lo agarraba con un trabajo en "corriendo",
  // la fila quedaba así para siempre: el programador solo mira "pendiente" y
  // programar() con la misma clave no la tocaba. La ronda diaria del orgánico
  // y el barrido de aprobadas morían en silencio.
  const colgar = async (clave: string, minutosAtras: number) => {
    await db.update(trabajosProgramados)
      .set({ estado: "corriendo", actualizadoAt: toDbDate(enMinutos(-minutosAtras)) as any })
      .where(eq(trabajosProgramados.clave, clave));
  };

  it("una ronda colgada vuelve a correr", async () => {
    let veces = 0;
    registrarManejador("ronda", async () => { veces++; });
    await programar({ tenantId: T, tipo: "ronda", clave: "h1", correAt: enMinutos(-60), repiteCadaMin: 24 * 60 });
    await colgar("h1", 45);

    await correrVencidos();
    expect(veces).toBe(1);
    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "h1"));
    expect(fila.estado).toBe("pendiente");
  });

  it("una publicación colgada queda fallada con el motivo, sin re-publicarse", async () => {
    let veces = 0;
    registrarManejador("post", async () => { veces++; });
    await programar({ tenantId: T, tipo: "post", clave: "h2", correAt: enMinutos(-60) });
    await colgar("h2", 45);

    await correrVencidos();
    expect(veces).toBe(0);
    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "h2"));
    expect(fila.estado).toBe("fallado");
    expect(fila.error).toMatch(/reinicio/);
  });

  it("lo que está corriendo AHORA no se toca", async () => {
    registrarManejador("ronda", async () => {});
    await programar({ tenantId: T, tipo: "ronda", clave: "h3", correAt: enMinutos(-5), repiteCadaMin: 15 });
    await colgar("h3", 2);

    await correrVencidos();
    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "h3"));
    expect(fila.estado).toBe("corriendo");
  });

  it("volver a programar una ronda fallada la revive", async () => {
    registrarManejador("ronda", async () => { throw new Error("caída"); });
    await programar({ tenantId: T, tipo: "ronda", clave: "h4", correAt: enMinutos(-1), repiteCadaMin: 60 });
    await db.update(trabajosProgramados).set({ estado: "fallado" }).where(eq(trabajosProgramados.clave, "h4"));

    await programar({ tenantId: T, tipo: "ronda", clave: "h4", correAt: enMinutos(10), repiteCadaMin: 60 });
    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "h4"));
    expect(fila.estado).toBe("pendiente");
  });
});

describe("las rondas no se corren de hora ni se apagan", () => {
  it("la próxima vuelta se ancla a la hora pactada, no a cuándo terminó", () => {
    const seis = new Date("2026-10-07T11:00:00Z");
    const tarde = new Date("2026-10-07T11:07:00Z");
    expect(proximaVuelta(seis, 24 * 60, tarde).toISOString()).toBe("2026-10-08T11:00:00.000Z");
    // Servidor caído tres días: salta a la próxima del futuro, no corre tres veces.
    const tresDias = new Date("2026-10-10T15:00:00Z");
    expect(proximaVuelta(seis, 24 * 60, tresDias).toISOString()).toBe("2026-10-11T11:00:00.000Z");
  });

  it("una ronda que se rinde pierde la vuelta, no la rutina", async () => {
    registrarManejador("ronda", async () => { throw new Error("Meta caída"); });
    await programar({ tenantId: T, tipo: "ronda", clave: "r1", correAt: enMinutos(-1), repiteCadaMin: 24 * 60 });
    await correrVencidos();
    await correrVencidos(new Date(Date.now() + 60 * 60_000));
    await correrVencidos(new Date(Date.now() + 6 * 60 * 60_000));

    const [fila] = await db.select().from(trabajosProgramados).where(eq(trabajosProgramados.clave, "r1"));
    expect(fila.estado).toBe("pendiente");
    expect(fila.error).toContain("Meta caída");
    expect(new Date(fila.correAt as any).getTime()).toBeGreaterThan(Date.now() + 6 * 60 * 60_000);
  });
});
