import { describe, it, expect } from "vitest";
import {
  modeloDelProducto, seEnvia, condicionesDesdePerfil, CONDICIONES_DE_RESPALDO,
  bloqueTrasElSi, marcaDeModelo, esColombia,
} from "../modelo-de-negocio";
import { contextoDeDropshipping, verificarZona, resumenDelPedido } from "../dropshipping";

/**
 * Pedido del dueño (11-09-2026): "citas, asesorías y todos los modelos de
 * negocio... que el SaaS esté apto para esos modelos que a veces no son
 * físicos o digitales sino de atención personal".
 *
 * Lo que había: dos modelos, y las condiciones de envío del dueño de la
 * plataforma FIJAS en código. Otro negocio heredaba "3 a 5 días hábiles,
 * contraentrega, envío incluido" aunque cobrara el envío aparte.
 */

describe("el modelo se decide por qué pasa después del sí", () => {
  it("los dos de siempre siguen igual", () => {
    expect(modeloDelProducto({ kind: "physical", name: "Mini Licuadora Portátil" })).toBe("fisico");
    expect(modeloDelProducto({ kind: "digital", name: "Curso de Piano", deliveryLink: "https://drive" })).toBe("digital");
    // El importador marca cursos como físicos: la evidencia manda.
    expect(modeloDelProducto({ kind: "physical", name: "Curso completo de IA", description: "39 módulos en video" })).toBe("digital");
  });

  it("kind explícito para los nuevos", () => {
    expect(modeloDelProducto({ kind: "service", name: "Lo que sea" })).toBe("servicio");
    expect(modeloDelProducto({ kind: "subscription", name: "Plan" })).toBe("suscripcion");
    expect(modeloDelProducto({ kind: "quote", name: "Cocina integral" })).toBe("cotizacion");
    expect(modeloDelProducto({ kind: "lead", name: "Apartamento en Envigado" })).toBe("captacion");
    expect(modeloDelProducto({ kind: "cita", name: "Limpieza dental" })).toBe("servicio");
  });

  it("un producto marcado digital por defecto que es atención personal se detecta", () => {
    expect(modeloDelProducto({ kind: "digital", name: "Consulta nutricional 1 a 1" })).toBe("servicio");
    expect(modeloDelProducto({ kind: "digital", name: "Manicure semipermanente", category: "Belleza" })).toBe("servicio");
    expect(modeloDelProducto({ kind: "digital", name: "Membresía gimnasio", description: "" })).toBe("suscripcion");
    expect(modeloDelProducto({ kind: "digital", name: "Closet a medida", price: 0 })).toBe("cotizacion");
  });

  it("un curso con 'sesiones grabadas' en la descripción NO es servicio", () => {
    expect(modeloDelProducto({ kind: "digital", name: "Curso de Piano", description: "12 sesiones grabadas", deliveryLink: "x" })).toBe("digital");
  });

  it("solo lo físico va al flujo de envío", () => {
    expect(seEnvia({ kind: "physical", name: "Faja" })).toBe(true);
    expect(seEnvia({ kind: "service", name: "Masaje" })).toBe(false);
  });

  it("la marca del catálogo es vacía para digital y dice el modelo para el resto", () => {
    expect(marcaDeModelo({ kind: "digital", name: "Curso" })).toBe("");
    expect(marcaDeModelo({ kind: "physical", name: "Faja" })).toBe(" · físico");
    expect(marcaDeModelo({ kind: "service", name: "Masaje" })).toBe(" · servicio");
  });
});

describe("las condiciones salen del perfil del negocio, no del código", () => {
  it("sin perfil se usa el respaldo (lo del dueño), marcado como respaldo", () => {
    const c = condicionesDesdePerfil({});
    expect(c).toBe(CONDICIONES_DE_RESPALDO);
    expect(c.fuente).toBe("respaldo");
    expect(c.envio.plazo).toBe("3 a 5 días hábiles");
  });

  it("un negocio que cobra el envío aparte y por adelantado NO hereda contraentrega", () => {
    const c = condicionesDesdePerfil({ pais: "CO", envio: { plazo: "2 a 4 días", pago: "anticipado", costo: "$12.000", cobertura: "Bogotá y Medellín" } });
    expect(c.fuente).toBe("perfil");
    expect(c.envio.pago).toBe("anticipado");
    expect(c.envio.costo).toBe("$12.000");
    const ctx = contextoDeDropshipping(c);
    expect(ctx).toMatch(/ANTES del despacho/);
    expect(ctx).toMatch(/Costo de envío: \$12\.000/);
    expect(ctx).not.toMatch(/CONTRA ENTREGA/);
    expect(ctx).toMatch(/2 a 4 días/);
  });

  it("tolera lo que escribe un modelo: 'pago al recibir', 'gratis'", () => {
    const c = condicionesDesdePerfil({ envio: { pago: "pago al recibir", costo: "gratis" } });
    expect(c.envio.pago).toBe("contraentrega");
    expect(c.envio.costo).toBe("incluido");
  });

  it("el resumen del pedido usa el plazo del negocio", () => {
    const c = condicionesDesdePerfil({ envio: { plazo: "24 horas en Bogotá" } });
    const r = resumenDelPedido({
      id: 1, tenantId: 2, conversationId: 1, productId: 1, productName: "Faja", quantity: 1,
      unitPrice: "50000", total: "50000", metodoPago: "contraentrega", estado: "por_confirmar",
      wooOrderId: null, wooError: null, nombre: "Ana", documento: "1", telefono: "3", direccion: "Calle 1",
      ciudad: "Bogotá", departamento: "Bogotá D.C.",
    }, c);
    expect(r).toMatch(/24 horas en Bogotá/);
  });
});

describe("otro país no se frena contra la lista de Colombia", () => {
  it("Jalisco en México pasa; Narnia en Colombia no", () => {
    expect(verificarZona({ ciudad: "Guadalajara", departamento: "Jalisco" }, "MX").ok).toBe(true);
    expect(verificarZona({ ciudad: "Medellín", departamento: "Narnia" }, "CO").ok).toBe(false);
    expect(esColombia(undefined)).toBe(true);
    expect(esColombia("México")).toBe(false);
  });

  it("fuera de Colombia se pide 'documento' y 'estado o provincia', no cédula y departamento", () => {
    const ctx = contextoDeDropshipping(condicionesDesdePerfil({ pais: "MX", envio: { plazo: "5 días" } }));
    expect(ctx).toMatch(/documento de identidad/);
    expect(ctx).toMatch(/estado o provincia/);
    expect(ctx).not.toMatch(/cédula/);
  });
});

describe("qué le dice el servidor al bot después del sí, por modelo", () => {
  it("servicio: se agenda, nunca Drive ni transportadora, nunca confirma hora", () => {
    const b = bloqueTrasElSi("servicio", CONDICIONES_DE_RESPALDO);
    expect(b).toMatch(/se AGENDA/);
    expect(b).toMatch(/NUNCA confirmes una fecha/);
    expect(b).toMatch(/Google Drive/); // como prohibición
  });
  it("cotización: prohibido decir precio", () => {
    expect(bloqueTrasElSi("cotizacion", CONDICIONES_DE_RESPALDO)).toMatch(/NUNCA digas un precio/);
  });
  it("suscripción: nunca 'pago único' ni 'de por vida'", () => {
    expect(bloqueTrasElSi("suscripcion", CONDICIONES_DE_RESPALDO)).toMatch(/de por vida/);
  });
  it("captación: pasa a una persona", () => {
    expect(bloqueTrasElSi("captacion", CONDICIONES_DE_RESPALDO)).toMatch(/asesor/);
  });
  it("físico y digital no llevan bloque (tienen su propio flujo)", () => {
    expect(bloqueTrasElSi("fisico", CONDICIONES_DE_RESPALDO)).toBe("");
    expect(bloqueTrasElSi("digital", CONDICIONES_DE_RESPALDO)).toBe("");
  });
});
