/**
 * LA BANDERA
 * ==========
 *
 * El motor nuevo está en producción desde el primer día, pero APAGADO. Esta
 * prueba es la que garantiza que así sea: si algún cambio lo prende para todos
 * sin querer, acá se ve antes de que un cliente real reciba una respuesta
 * distinta a la que venía recibiendo.
 */

import { test, describe, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, tenants } from "@workspace/db";

const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
};

import {
  motorDelTenant,
  motorEnCache,
  fijarMotorDelTenant,
  describirActivacion,
  invalidarMotor,
} from "../activacion";

const VARS = ["MOTOR_VENDEDOR", "MOTOR_VENDEDOR_TENANTS", "MOTOR_VENDEDOR_PORCENTAJE"];
const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) original[v] = process.env[v];
  invalidarMotor(null);
});

afterEach(() => {
  for (const v of VARS) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
  invalidarMotor(null);
});

async function tenantDePrueba() {
  const [t] = await db
    .insert(tenants)
    .values({
      name: "Motor Test",
      email: `motor-flag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`,
      slug: `motor-flag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      brandName: "Motor Test",
    } as any)
    .returning();
  return t;
}

describe("la bandera del motor", () => {
  test("por defecto sigue el motor viejo: desplegar esto no cambia nada", async () => {
    delete process.env.MOTOR_VENDEDOR;
    const t = await tenantDePrueba();
    assert.equal(await motorDelTenant(t.id), "v1");
  });

  test("la variable global lo prende para todos", async () => {
    process.env.MOTOR_VENDEDOR = "v2";
    const t = await tenantDePrueba();
    assert.equal(await motorDelTenant(t.id), "v2");
  });

  test("la lista por variable prende solo a los que están en la lista", async () => {
    delete process.env.MOTOR_VENDEDOR;
    const t = await tenantDePrueba();
    assert.equal(await motorDelTenant(t.id), "v1");

    process.env.MOTOR_VENDEDOR_TENANTS = String(t.id);
    invalidarMotor(null);
    assert.equal(await motorDelTenant(t.id), "v2");

    process.env.MOTOR_VENDEDOR_TENANTS = String(t.id + 5000);
    invalidarMotor(null);
    assert.equal(await motorDelTenant(t.id), "v1");
  });

  test("el porcentaje es ESTABLE: el mismo negocio no parpadea entre motores", async () => {
    delete process.env.MOTOR_VENDEDOR;
    const t = await tenantDePrueba();

    process.env.MOTOR_VENDEDOR_PORCENTAJE = "100";
    invalidarMotor(null);
    assert.equal(await motorDelTenant(t.id), "v2");
    invalidarMotor(null);
    assert.equal(await motorDelTenant(t.id), "v2", "la segunda vez cae del mismo lado");

    process.env.MOTOR_VENDEDOR_PORCENTAJE = "0";
    invalidarMotor(null);
    assert.equal(await motorDelTenant(t.id), "v1");
  });

  test("lo que decida el dueño gana sobre el porcentaje y la variable global", async () => {
    process.env.MOTOR_VENDEDOR = "v2";
    process.env.MOTOR_VENDEDOR_PORCENTAJE = "100";
    const t = await tenantDePrueba();

    // El dueño lo apaga para su negocio aunque la plataforma lo prenda.
    const r = await fijarMotorDelTenant(t.id, "v1");
    assert.equal(r.ok, true);

    const [fila] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, t.id)).limit(1);
    const meta = typeof fila.metadata === "string" ? JSON.parse(fila.metadata) : fila.metadata;
    assert.equal(meta.motorVendedor, "v1");

    invalidarMotor(null);
    assert.equal(await motorDelTenant(t.id), "v1", "la decisión del dueño manda");
  });

  test("se puede prender y apagar por negocio, y la caché no lo esconde", async () => {
    delete process.env.MOTOR_VENDEDOR;
    const t = await tenantDePrueba();

    await fijarMotorDelTenant(t.id, "v2");
    assert.equal(await motorDelTenant(t.id), "v2");
    assert.equal(motorEnCache(t.id), "v2", "queda disponible sin ir a la base");

    await fijarMotorDelTenant(t.id, "v1");
    assert.equal(await motorDelTenant(t.id), "v1", "volver atrás es inmediato, sin redesplegar");
  });

  test("un negocio que no existe no rompe: cae al valor por defecto", async () => {
    assert.equal(await motorDelTenant(999999999), "v1");
    assert.equal(await motorDelTenant(null), "v1");
  });

  test("la explicación dice de dónde salió la decisión", async () => {
    process.env.MOTOR_VENDEDOR = "v1";
    const t = await tenantDePrueba();
    const texto = await describirActivacion(t.id);

    assert.match(texto, /motor v1/);
    assert.match(texto, /Valor por defecto de la plataforma: v1/);
  });
});
