import { describe, it, expect } from "vitest";
import { pareceComprobante, leerDecisionDelAdmin, avisoParaElAdmin, codigoDe, tenantsQueAdministra, mismoTelefono } from "../verificacion-pago";

/**
 * Los pagos por Nequi/Daviplata no tienen webhook: nadie le avisa al sistema
 * que el dinero llegó. El bot resolvía eso diciendo "apenas el sistema lo
 * verifique te llega el acceso" -- una verificación que no existía -- y en un
 * caso afirmó "ya confirmé tu pago" sin que nadie hubiera pagado.
 *
 * La regla de fondo: el dinero lo confirma UNA PERSONA que lo vio en su
 * cuenta. Ni el cliente diciendo que pagó, ni el modelo, ni un comprobante.
 */

describe("reconocer un comprobante sin confundirlo con cualquier foto", () => {
  it("una señal fuerte alcanza sola, aunque no se esté cobrando", () => {
    expect(pareceComprobante("captura de una transferencia de Nequi por $20.000", false)).toBe(true);
    expect(pareceComprobante("comprobante de pago de Bancolombia", false)).toBe(true);
  });

  it("una señal débil solo cuenta si se estaba cobrando", () => {
    // "pago exitoso" en medio de una charla de venta: sí.
    expect(pareceComprobante("pantallazo que dice pago exitoso", true)).toBe(true);
    // La misma foto sin contexto de cobro: no se asume.
    expect(pareceComprobante("pantallazo que dice pago exitoso", false)).toBe(false);
  });

  it("la foto del perro NO es un comprobante, ni en plena venta", () => {
    // Caso real posible: se vende un curso de adiestramiento canino.
    expect(pareceComprobante("un perro labrador sentado en el pasto", true)).toBe(false);
    expect(pareceComprobante("una persona sonriendo frente a una cámara", true)).toBe(false);
  });

  // Este test decía lo contrario ("sin descripción no se inventa nada") y la
  // política se invirtió a propósito el 2026-09-05. El motivo: `VISION_MODELS`
  // apuntaba en producción a tres candidatos de OpenRouter y NVIDIA sin clave
  // de ninguno de los dos, así que `describirImagen` devolvía null SIEMPRE y
  // este `false` hacía que el pago no se registrara ni se avisara a nadie.
  // Silencio total sobre plata ya transferida.
  //
  // Se prefiere el falso positivo: el admin recibe la foto y decide en dos
  // segundos. La etapa de cobro acota bastante -- una foto suelta en una
  // charla de exploración sigue sin molestar a nadie.
  it("sin descripción, la etapa decide", () => {
    expect(pareceComprobante(null, true)).toBe(true);
    expect(pareceComprobante("", true)).toBe(true);
    expect(pareceComprobante(null, false)).toBe(false);
  });
});

describe("leer la decisión del admin", () => {
  it("acepta las formas naturales de aprobar", () => {
    for (const t of ["APROBAR 47", "aprobar 47", "Aprobar #47", "ok 47", "confirmo 47", "apruebo 47"]) {
      expect(leerDecisionDelAdmin(t), t).toEqual({ accion: "aprobar", pagoId: 47 });
    }
  });

  it("acepta las formas de rechazar", () => {
    for (const t of ["RECHAZAR 47", "rechazo 47", "no 47"]) {
      expect(leerDecisionDelAdmin(t), t).toEqual({ accion: "rechazar", pagoId: 47 });
    }
  });

  it("un mensaje normal del admin no se confunde con una decisión", () => {
    expect(leerDecisionDelAdmin("hola, cómo va todo")).toBeNull();
    expect(leerDecisionDelAdmin("aprobar")).toBeNull();          // sin número
    expect(leerDecisionDelAdmin("cuántos pagos hay")).toBeNull();
  });

  it("no confunde un mensaje que EMPIEZA distinto", () => {
    // "no me llegó el 47" no es un rechazo del comprobante 47.
    expect(leerDecisionDelAdmin("no me llegó el 47")).toBeNull();
  });
});

describe("el aviso que le llega al admin", () => {
  const aviso = avisoParaElAdmin({
    pagoId: 47,
    cliente: "Leonel",
    telefono: "573176650010",
    producto: "PACK IDIOMAS",
    monto: 20000,
    moneda: "COP",
    descripcion: "transferencia Nequi aprobada por $20.000",
  });

  it("trae lo mínimo para decidir sin abrir el panel", () => {
    expect(aviso).toContain("Leonel");
    expect(aviso).toContain("573176650010");
    expect(aviso).toContain("PACK IDIOMAS");
    expect(aviso).toContain("$20.000");
  });

  it("dice exactamente qué responder", () => {
    expect(aviso).toContain("APROBAR 47");
    expect(aviso).toContain("RECHAZAR 47");
  });

  it("pide verificar la cuenta, no confiar en el comprobante", () => {
    expect(aviso).toMatch(/dinero est[eé] en tu cuenta/i);
  });

  it("un monto desconocido no se inventa", () => {
    const sinMonto = avisoParaElAdmin({
      pagoId: 1, cliente: "X", telefono: "1", producto: "Y", monto: 0, moneda: "COP",
    });
    expect(sinMonto).toMatch(/sin confirmar/i);
  });

  it("el código es el id del pago", () => {
    expect(codigoDe(47)).toBe("47");
  });
});

/**
 * Lo que pasa DESPUÉS de aprobar. El riesgo acá no es técnico sino de
 * promesa: decirle al cliente "ya tienes el acceso" cuando el producto no
 * tiene enlace cargado es exactamente la mentira que este proceso vino a
 * eliminar, solo que dicha por otro camino.
 */
describe("aprobar entrega de verdad, o lo dice claro", () => {
  it("el mensaje de entrega nombra el producto y trae el acceso", async () => {
    const { mensajeDeEntrega } = await import("../verificacion-pago");
    // Sin BD real esto devuelve null; lo que se fija acá es el contrato:
    // null significa "no hay con qué entregar", nunca "entregado".
    const r = await mensajeDeEntrega(-1);
    expect(r).toBeNull();
  });
});

describe("aprobar indicando a dónde mandar el acceso por correo", () => {
  it("captura el correo después del número", () => {
    expect(leerDecisionDelAdmin("APROBAR 12 daveymena16@gmail.com"))
      .toEqual({ accion: "aprobar", pagoId: 12, correo: "daveymena16@gmail.com" });
  });

  it("sin correo sigue funcionando igual", () => {
    expect(leerDecisionDelAdmin("APROBAR 12"))
      .toEqual({ accion: "aprobar", pagoId: 12, correo: undefined });
  });

  it("el aviso le dice al admin que puede hacerlo", () => {
    const a = avisoParaElAdmin({ pagoId: 12, cliente: "X", telefono: "1", producto: "Y", monto: 1000, moneda: "COP" });
    expect(a).toMatch(/correo@cliente\.com/);
  });
});

/**
 * ¿Quién puede aprobar una entrega?
 *
 * El agujero era de multi-tenant: `esTelefonoDeAdmin` comparaba contra el
 * `contact_phone` de TODOS los negocios sin filtrar, y la búsqueda del pago
 * tampoco filtraba. Así, el admin del negocio A podía aprobar un pago del
 * negocio B escribiendo "aprobar 47" -- y el número del comprobante va impreso
 * en el aviso, así que ni siquiera había que adivinarlo.
 *
 * Nadie lo habría notado: el cliente de B recibe su producto y el dueño de B
 * nunca sabe quién lo autorizó.
 */
describe("un admin solo aprueba pagos de SU negocio", () => {

  it("un número que no es de nadie no administra nada", async () => {
    expect(await tenantsQueAdministra("573001112233")).toEqual([]);
  });

  it("un número corto o vacío se rechaza sin consultar la base", async () => {
    for (const malo of ["", "123", null, undefined]) {
      expect(await tenantsQueAdministra(malo as any), String(malo)).toEqual([]);
    }
  });

  it("la comparación es EXACTA, no por subcadena", async () => {
    // `isAdminPhone` compara con includes() en las dos direcciones: un número
    // que contenga al del admin pasaría el chequeo. Y este chequeo aprueba
    // dinero.
    const admin = process.env.ADMIN_PHONE;
    process.env.ADMIN_PHONE = "573042748687";
    try {
      // Un número que CONTIENE al del admin no debe administrar nada.
      expect(await tenantsQueAdministra("5730427486871")).toEqual([]);
      // Y uno contenido POR el del admin, tampoco.
      expect(await tenantsQueAdministra("3042748687")).toEqual([]);
    } finally {
      if (admin === undefined) delete process.env.ADMIN_PHONE;
      else process.env.ADMIN_PHONE = admin;
    }
  });
});

/**
 * ── Lo que el aviso IMPRIME, el parser tiene que saber LEERLO ──────────────
 *
 * El sistema le decía al admin, con todas las letras:
 *
 *     ✅ *APROBAR 47*
 *     ❌ *RECHAZAR 47*
 *
 * y no sabía leer ninguna de las dos. En el celular lo natural es dejar
 * pulsada esa línea y copiarla; WhatsApp copia el texto CRUDO, con los
 * asteriscos y con el emoji adelante, y el parser estaba anclado con `^` a la
 * palabra.
 *
 * Reportado el 2026-09-06: el admin rechazó un comprobante y el cliente nunca
 * recibió el aviso. No parseaba → el pago quedaba `pending` para siempre y el
 * mensaje del admin seguía de largo hasta el agente de ventas.
 *
 * Este test no comprueba una lista de formatos: recorre el aviso REAL y exige
 * que cada línea de acción se pueda leer de vuelta. Si alguien cambia el
 * texto del aviso, el test cae acá y no en producción.
 */
describe("El aviso al admin y el parser hablan el mismo idioma", () => {
  const aviso = avisoParaElAdmin({
    pagoId: 47,
    cliente: "Leonel",
    telefono: "573001112233",
    producto: "Curso de Piano",
    monto: 60000,
    moneda: "COP",
  });

  // Las lineas que SON el comando (las que el admin deja pulsadas y copia), no
  // la prosa que habla de el. El filtro tolera el emoji y los asteriscos
  // justamente porque ese es el texto crudo que WhatsApp pone en el
  // portapapeles.
  const lineasDeAccion = aviso
    .split("\n")
    .filter((l) => /^[^A-Za-z]*\*?(aprobar|rechazar)\b/i.test(l));

  it("el aviso trae al menos las dos acciones", () => {
    expect(lineasDeAccion.length).toBeGreaterThanOrEqual(2);
  });

  it("TODA línea de acción del aviso se puede leer de vuelta", () => {
    for (const linea of lineasDeAccion) {
      const leido = leerDecisionDelAdmin(linea);
      expect(leido, `no se pudo leer: ${JSON.stringify(linea)}`).not.toBe(null);
      expect(leido!.pagoId).toBe(47);
    }
  });

  it("y cada una hace lo que dice", () => {
    for (const linea of lineasDeAccion) {
      const esperado = /rechazar/i.test(linea) ? "rechazar" : "aprobar";
      expect(leerDecisionDelAdmin(linea)!.accion).toBe(esperado);
    }
  });

  it("el caso exacto del reporte, copiado del celular", () => {
    const r = leerDecisionDelAdmin("❌ *RECHAZAR 47*");
    expect(r).toEqual({ accion: "rechazar", pagoId: 47, correo: undefined });
  });

  it("con adornos de todo tipo alrededor", () => {
    for (const t of ["*RECHAZAR 47*", "❌ RECHAZAR 47", "- rechazar 47", "«RECHAZAR 47»", "_rechazo 47_"]) {
      expect(leerDecisionDelAdmin(t)?.accion, t).toBe("rechazar");
    }
  });

  it("el correo opcional sobrevive a los asteriscos", () => {
    const r = leerDecisionDelAdmin("*APROBAR 47 juan@correo.com*");
    expect(r?.accion).toBe("aprobar");
    expect(r?.correo).toBe("juan@correo.com");
  });

  it("y una charla normal sigue sin ser una decisión", () => {
    for (const t of ["hola como estas", "no tengo el comprobante todavia", "ok gracias"]) {
      expect(leerDecisionDelAdmin(t), t).toBe(null);
    }
  });
});

/**
 * ── El indicativo del país ────────────────────────────────────────────────
 *
 * WhatsApp entrega el número con indicativo ("573136174267"); el dueño del
 * negocio escribe el suyo en el panel como se escribe en Colombia
 * ("3136174267"). Con comparación exacta, el dueño de un negocio nuevo NO
 * podía aprobar ninguno de sus pagos — y su "APROBAR 47" se iba de largo
 * hasta el agente de ventas.
 *
 * Pero esto aprueba dinero, así que la tolerancia es estrecha: nada de
 * `includes()`.
 */
describe("Reconocer el teléfono del admin con o sin indicativo", () => {
  it("el mismo número, con y sin indicativo", () => {
    expect(mismoTelefono("3136174267", "573136174267")).toBe(true);
    expect(mismoTelefono("573136174267", "3136174267")).toBe(true);
    expect(mismoTelefono("+57 313 617 4267", "573136174267")).toBe(true);
  });

  it("idéntico, obvio", () => {
    expect(mismoTelefono("573136174267", "573136174267")).toBe(true);
  });

  it("NO acepta un sufijo corto: eso aprobaría plata ajena", () => {
    expect(mismoTelefono("6174267", "573136174267")).toBe(false);
    expect(mismoTelefono("4267", "573136174267")).toBe(false);
  });

  it("NO acepta una diferencia mayor que un indicativo", () => {
    expect(mismoTelefono("136174267", "99999573136174267")).toBe(false);
  });

  it("números distintos siguen siendo distintos", () => {
    expect(mismoTelefono("3136174267", "573001112233")).toBe(false);
    expect(mismoTelefono("573136174267", "573136174268")).toBe(false);
  });

  it("vacío o basura no es nadie", () => {
    expect(mismoTelefono("", "573136174267")).toBe(false);
    expect(mismoTelefono("123", "573136174267")).toBe(false);
    expect(mismoTelefono("", "")).toBe(false);
  });
});
