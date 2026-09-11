import { describe, it, expect } from "vitest";
import {
  confirmaElPedido,
  extraerDatosDeEnvio,
  listaDeDatosQueFaltan,
  resumenDelPedido,
  verificarZona,
  contextoDeDropshipping,
  type PedidoDropshipping,
} from "../dropshipping";
import { normalizarArgsDeConocimiento } from "../app-operator";
import { entregaDesdeTexto, garantiaDesdeTexto } from "../perfil-negocio-desde-texto";

/**
 * Lo que pasó el 11-09-2026, en orden:
 *
 *  1. El dueño le pidió a Atlas el flujo de pedidos físicos: "pedir todos los
 *     datos, verificar la ciudad y la disponibilidad de transporte, confirmar
 *     el pedido y el envío, y dar la información de cuándo llega".
 *  2. Atlas llamó a `agente_conocimiento` con `{ agenteId: 2, loQueDebeSaber:
 *     [...] }` -- forma plana -- y la herramienta contestó "✅ Conocimiento
 *     actualizado: 3 cosas" sin agregar NADA (3 era lo que ya había).
 *  3. Atlas mandó `entrega: "3 a 5 días hábiles, envío incluido"` como texto;
 *     se guardó el string, `leerEntrega` lo descartó, y el agente quedó con
 *     "DATOS QUE NO TENÉS: cómo se entrega".
 *  4. La prueba real ("Hola tienes Mini Licuadora") devolvió el curso de
 *     piano: `modoCatalogo: digital` escondía los 56 físicos.
 *
 * Estas pruebas cubren las piezas que se tocaron para que eso no vuelva.
 */

const base: PedidoDropshipping = {
  id: 1, tenantId: 1, conversationId: 10, productId: 159,
  productName: "Mini Licuadora Portatil Batidora Recarga", quantity: 1,
  unitPrice: "48000.00", total: "48000.00", metodoPago: "contraentrega",
  estado: "borrador", wooOrderId: null, wooError: null,
};

describe("el sí solo cuenta cuando se mostró el resumen", () => {
  it("con el pedido en por_confirmar, las formas colombianas de decir que sí confirman", () => {
    const p = { ...base, estado: "por_confirmar" };
    for (const m of ["sí", "si", "Si, confirmo", "dale", "listo", "confirmado", "correcto ✅", "todo bien", "de una", "hágale"]) {
      expect(confirmaElPedido(m, p), m).toBe(true);
    }
  });

  it("el mismo sí en borrador NO despacha nada", () => {
    expect(confirmaElPedido("sí", { ...base, estado: "borrador" })).toBe(false);
    expect(confirmaElPedido("sí", { ...base, estado: "completo" })).toBe(false);
    expect(confirmaElPedido("sí", null)).toBe(false);
  });

  it("una corrección no es una confirmación, aunque empiece con sí", () => {
    const p = { ...base, estado: "por_confirmar" };
    expect(confirmaElPedido("sí pero la dirección es calle 50 #20-10", p)).toBe(false);
    expect(confirmaElPedido("no, el barrio está mal", p)).toBe(false);
    expect(confirmaElPedido("cambia el celular por 3001112233", p)).toBe(false);
  });
});

describe("verificar la ciudad y el departamento antes de prometer despacho", () => {
  it("ciudad y departamento coherentes → hay despacho", () => {
    expect(verificarZona({ ciudad: "Medellín", departamento: "Antioquia" }).ok).toBe(true);
    expect(verificarZona({ ciudad: "Bogotá", departamento: "Bogotá D.C." }).ok).toBe(true);
    expect(verificarZona({ ciudad: "Bogotá", departamento: "Bogotá" }).ok).toBe(true);
    expect(verificarZona({ ciudad: "Leticia", departamento: "Amazonas" }).ok).toBe(true);
    // Ciudad chica que no está en el mapa: se acepta si el departamento existe.
    expect(verificarZona({ ciudad: "Sabaneta", departamento: "Antioquia" }).ok).toBe(true);
  });

  it("Medellín en Cundinamarca se frena con el motivo", () => {
    const r = verificarZona({ ciudad: "Medellín", departamento: "Cundinamarca" });
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/Antioquia/);
  });

  it("un departamento inventado se frena", () => {
    expect(verificarZona({ ciudad: "Medellín", departamento: "Narnia" }).ok).toBe(false);
    expect(verificarZona({ ciudad: "Medellín", departamento: "" }).ok).toBe(false);
  });
});

describe("todos los datos de una vez (decisión del dueño)", () => {
  it("la lista numerada pide SOLO lo que falta", () => {
    const lista = listaDeDatosQueFaltan({ nombre: "Juan Pérez", telefono: "3001234567" });
    expect(lista).not.toMatch(/Nombre/);
    expect(lista).not.toMatch(/Celular/);
    expect(lista).toMatch(/1\. Cédula/);
    expect(lista).toMatch(/Dirección/);
    expect(lista).toMatch(/punto de referencia/i);
  });

  it("el contexto ya no manda pedir de a uno", () => {
    const ctx = contextoDeDropshipping();
    expect(ctx).not.toMatch(/UNO a la vez/);
    expect(ctx).toMatch(/TODOS JUNTOS/);
    expect(ctx).toMatch(/envío va INCLUIDO/);
    expect(ctx).toMatch(/confirma con un sí/);
  });

  it("el mensaje con todo junto captura el nombre sin anunciar y el punto de referencia", () => {
    const d = extraerDatosDeEnvio(
      "Juan Pérez Gómez, cc 1020304050, cel 3001234567, Calle 45 #12-30 apto 302 barrio La Floresta, Medellín, Antioquia, frente a la panadería El Trigal",
    );
    expect(d.nombre).toBe("Juan Pérez Gómez");
    expect(d.documento).toBe("1020304050");
    expect(d.telefono).toBe("3001234567");
    expect(d.direccion).toMatch(/^Calle 45 #12-30/);
    expect(d.barrio).toBe("La Floresta");
    expect(d.ciudad).toBe("Medellin");
    expect(d.departamento).toBe("Antioquia");
    expect(d.notas).toMatch(/panadería El Trigal/);
  });

  it("la lista numerada como la pedimos también se lee", () => {
    const d = extraerDatosDeEnvio(
      "1. Ana Ruiz\n2. 43654789\n3. 3105558899\n4. Cra 8 #20-15 apto 501\n5. Bogotá\n6. Bogotá D.C.\n7. cerca de la estación Calle 26",
    );
    expect(d.nombre).toBe("Ana Ruiz");
    expect(d.telefono).toBe("3105558899");
    expect(d.ciudad).toBe("Bogota");
    expect(d.notas).toMatch(/estación Calle 26/);
  });

  it("una frase suelta NO se convierte en nombre", () => {
    const d = extraerDatosDeEnvio("Quiero la licuadora, vivo en Medellín");
    expect(d.nombre).toBeUndefined();
  });

  it("el resumen lleva todo lo que el cliente tiene que verificar", () => {
    const r = resumenDelPedido({
      ...base, nombre: "Juan Pérez Gómez", documento: "1020304050", telefono: "3001234567",
      direccion: "Calle 45 #12-30 apto 302", barrio: "La Floresta", ciudad: "Medellín",
      departamento: "Antioquia", notas: "frente a la panadería El Trigal",
    });
    for (const parte of ["Mini Licuadora", "48.000", "contraentrega", "Juan Pérez Gómez", "1020304050", "3001234567", "Calle 45", "La Floresta", "Medellín, Antioquia", "El Trigal", "3 a 5 días"]) {
      expect(r, parte).toContain(parte);
    }
  });
});

describe("agente_conocimiento acepta la forma plana con que Atlas la llama", () => {
  it("{ agenteId, loQueDebeSaber, noPuede } se convierte en agregar", () => {
    const n = normalizarArgsDeConocimiento({
      agenteId: 2,
      loQueDebeSaber: ["REGLA DE DECISIÓN: identificá si es físico o digital"],
      noPuede: ["registrar un pedido sin un sí explícito"],
    });
    expect(n.agregar?.debeSaber).toEqual(["REGLA DE DECISIÓN: identificá si es físico o digital"]);
    expect(n.agregar?.noPuede).toEqual(["registrar un pedido sin un sí explícito"]);
  });

  it("la forma del contrato sigue funcionando igual", () => {
    const n = normalizarArgsDeConocimiento({ agregar: { debeSaber: ["a"] }, quitar: { noPuede: ["b"] } });
    expect(n.agregar?.debeSaber).toEqual(["a"]);
    expect(n.quitar?.noPuede).toEqual(["b"]);
  });

  it("sin nada útil devuelve vacío (y la herramienta lo reporta como fallo)", () => {
    expect(normalizarArgsDeConocimiento({ agenteId: 2 })).toEqual({});
  });
});

describe("agente_perfil_negocio no pierde la entrega cuando viene como texto", () => {
  it("el texto que mandó Atlas se vuelve el objeto que lee business-context", () => {
    const e = entregaDesdeTexto("3 a 5 días hábiles, envío incluido en el precio");
    expect(e).not.toBeNull();
    expect(e!.metodo).toMatch(/envío incluido/);
    expect(e!.plazo).toBe("3 a 5 días hábiles");
  });

  it("el objeto del contrato pasa intacto", () => {
    expect(entregaDesdeTexto({ metodo: "transportadora", plazo: "3 a 5 días hábiles" }))
      .toEqual({ metodo: "transportadora", plazo: "3 a 5 días hábiles", detalle: undefined });
  });

  it("'no ofrecer garantías' NO se guarda como garantía", () => {
    expect(garantiaDesdeTexto("No ofrecer garantías que no estén cargadas en el catálogo")).toBeNull();
    expect(garantiaDesdeTexto("30 días por defecto de fábrica")).toEqual({ dias: 30, descripcion: "30 días por defecto de fábrica" });
  });
});
