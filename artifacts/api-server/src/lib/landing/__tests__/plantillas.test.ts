/**
 * Las plantillas deciden la estructura de la página. Lo que se prueba acá es
 * que esa decisión no dependa del modelo y que no se pueda inventar un hecho.
 */
import { describe, expect, it } from "vitest";
import {
  bloqueDePlantilla,
  casillasQueAplican,
  elegirPlantilla,
  hechosQueTiene,
  PLANTILLAS,
  tipoDeProducto,
} from "../plantillas";

const CURSO = { name: "Curso de IA", kind: "digital", price: "60000", description: "Aprende IA", features: ["8 módulos"], imageUrl: "x.jpg" };
const EBOOK = { name: "Ebook", kind: "digital", price: "20000", description: "d" };
const ZAPATOS = { name: "Zapatos", kind: "fisico", price: "120000", description: "d", imageUrl: "z.jpg" };

describe("tipoDeProducto: el catálogo trae el campo sucio", () => {
  // Los valores conviven de verdad en la base porque se llenó desde pantallas
  // distintas. Un `kind === "fisico"` a secas se come la mitad del catálogo.
  it.each(["fisico", "físico", "physical", "FISICO", " Physical "])(
    "%s es físico",
    (k) => expect(tipoDeProducto(k)).toBe("fisico"),
  );

  it.each(["dropshipping", "DROPSHIPPING"])(
    "%s es dropshipping (se pide y paga al recibir)",
    (k) => expect(tipoDeProducto(k)).toBe("dropshipping"),
  );

  it.each(["service", "servicio", "cita", "asesoria", "consulta"])(
    "%s es servicio (se agenda)",
    (k) => expect(tipoDeProducto(k)).toBe("servicio"),
  );

  it.each(["digital", "card", "text", "", null, undefined])(
    "%s va por digital",
    (k) => expect(tipoDeProducto(k)).toBe("digital"),
  );
});

describe("hechos: solo lo que existe de verdad", () => {
  it("un precio en cero no cuenta como precio", () => {
    // Postgres devuelve numeric como texto: "0.00" es lo que llega de un
    // producto sin precio cargado, y no es un precio.
    expect(hechosQueTiene({ price: "0.00" }).has("precio")).toBe(false);
    expect(hechosQueTiene({ price: "0" }).has("precio")).toBe(false);
    expect(hechosQueTiene({ price: "60000" }).has("precio")).toBe(true);
  });

  it("un producto físico se envía sin necesidad de un campo de envío", () => {
    expect(hechosQueTiene({ kind: "physical" }).has("envio")).toBe(true);
    expect(hechosQueTiene({ kind: "digital" }).has("envio")).toBe(false);
  });

  it("la autoridad sale de la marca del negocio, no del producto", () => {
    expect(hechosQueTiene(CURSO).has("autor")).toBe(false);
    expect(hechosQueTiene(CURSO, { brandName: "TecnoVariedades" }).has("autor")).toBe(true);
  });

  it("testimonios y garantía NUNCA están disponibles", () => {
    // No son columnas de ninguna tabla. Que no estén es lo que impide que el
    // modelo los invente: sin casilla no hay nada que llenar.
    const todo = hechosQueTiene({ ...CURSO, ...ZAPATOS }, { brandName: "X" });
    expect(todo.has("testimonios")).toBe(false);
    expect(todo.has("garantia")).toBe(false);
  });
});

describe("elegir plantilla", () => {
  it("un físico sin link de pago va a contraentrega", () => {
    // Sin forma de pagar online, paga al recibir. Es la señal real.
    expect(elegirPlantilla(ZAPATOS).id).toBe("fisico-contraentrega");
  });

  it("un físico con link de pago no usa la de contraentrega", () => {
    expect(elegirPlantilla({ ...ZAPATOS, paymentLink: "https://pago" }).id).toBe("fisico-visual");
  });

  it("un digital barato va a la corta", () => {
    expect(elegirPlantilla(EBOOK).id).toBe("digital-directa");
  });

  it("un digital caro con marca va a la de autoridad", () => {
    expect(elegirPlantilla({ ...CURSO, price: "800000" }, null, { brandName: "X" }).id).toBe("digital-autoridad");
  });

  it("un dropshipping va a la de pedido a domicilio, no a la de físico", () => {
    expect(elegirPlantilla({ ...ZAPATOS, kind: "dropshipping" }).id).toBe("dropshipping-pedido");
  });

  it("un servicio va a la de agendar, no a la de curso", () => {
    expect(elegirPlantilla({ ...CURSO, kind: "service" }).id).toBe("servicio-agendamiento");
  });

  it("nunca devuelve una plantilla del otro tipo", () => {
    for (const kind of ["digital", "fisico", "physical", "service", "dropshipping"]) {
      const p = elegirPlantilla({ ...CURSO, kind });
      expect(p.para).toBe(tipoDeProducto(kind));
    }
  });

  it("si el dueño pide una, gana la suya", () => {
    expect(elegirPlantilla(ZAPATOS, "fisico-comparativa").id).toBe("fisico-comparativa");
  });

  it("pero no una del tipo equivocado: un curso no tiene envío que contar", () => {
    expect(elegirPlantilla(CURSO, "fisico-contraentrega").para).toBe("digital");
  });

  it("una plantilla inexistente no rompe", () => {
    expect(elegirPlantilla(CURSO, "no-existe").para).toBe("digital");
  });
});

describe("casillas: lo que no se puede sostener, se cae", () => {
  it("testimonios se cae siempre, en todas las plantillas", () => {
    for (const p of PLANTILLAS) {
      const tipos = casillasQueAplican(p, ZAPATOS, { brandName: "X" }).map((c) => c.type);
      expect(tipos).not.toContain("testimonials");
    }
  });

  it("las obligatorias no se caen aunque falte todo", () => {
    for (const p of PLANTILLAS) {
      const conNada = casillasQueAplican(p, {}).map((c) => c.type);
      for (const c of p.casillas.filter((c) => c.obligatoria)) {
        expect(conNada).toContain(c.type);
      }
    }
  });

  it("toda plantilla termina en cta y empieza en hero", () => {
    for (const p of PLANTILLAS) {
      const tipos = casillasQueAplican(p, ZAPATOS).map((c) => c.type);
      expect(tipos[0]).toBe("hero");
      expect(tipos[tipos.length - 1]).toBe("cta");
    }
  });

  it("toda plantilla tiene precio y botón: sin eso no es una landing", () => {
    for (const p of PLANTILLAS) {
      const tipos = p.casillas.filter((c) => c.obligatoria).map((c) => c.type);
      expect(tipos).toContain("offer");
      expect(tipos).toContain("cta");
    }
  });

  it("en las físicas la logística va ANTES del precio", () => {
    // El orden importa: en contraentrega la duda es si le llega, no cuánto
    // cuesta. Responder el precio primero es contestar la pregunta equivocada.
    const p = PLANTILLAS.find((x) => x.id === "fisico-contraentrega")!;
    const tipos = p.casillas.map((c) => c.type);
    expect(tipos.indexOf("logistics")).toBeLessThan(tipos.indexOf("offer"));
  });

  it("ninguna plantilla digital pide logística", () => {
    for (const p of PLANTILLAS.filter((x) => x.para === "digital")) {
      expect(p.casillas.map((c) => c.type)).not.toContain("logistics");
    }
  });
});

describe("el bloque que va al prompt", () => {
  it("lista las casillas numeradas y con su type", () => {
    const p = PLANTILLAS.find((x) => x.id === "digital-directa")!;
    const bloque = bloqueDePlantilla(p, EBOOK);
    for (const c of casillasQueAplican(p, EBOOK)) {
      expect(bloque).toContain(`type="${c.type}"`);
    }
    expect(bloque).toContain("1.");
  });

  it("no nombra una sección que se cayó", () => {
    const p = PLANTILLAS.find((x) => x.id === "fisico-contraentrega")!;
    expect(bloqueDePlantilla(p, ZAPATOS)).not.toContain('type="testimonials"');
  });

  it("le prohíbe inventar plazos de envío", () => {
    // Es el hueco por donde se cuela "llega en 24-48 horas": no hay ninguna
    // tabla de envíos en el sistema de donde pueda salir ese dato.
    const p = PLANTILLAS.find((x) => x.id === "fisico-contraentrega")!;
    const bloque = bloqueDePlantilla(p, ZAPATOS).toLowerCase();
    expect(bloque).toContain("no inventes plazos");
  });

  it("dice cuántas secciones espera, y coincide con las que quedaron", () => {
    const p = PLANTILLAS.find((x) => x.id === "digital-clasica")!;
    const n = casillasQueAplican(p, CURSO).length;
    expect(bloqueDePlantilla(p, CURSO)).toContain(`estas ${n} secciones`);
  });
});

describe("integridad del catálogo de plantillas", () => {
  it("los ids son únicos", () => {
    const ids = PLANTILLAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("hay al menos una de cada tipo", () => {
    expect(PLANTILLAS.some((p) => p.para === "digital")).toBe(true);
    expect(PLANTILLAS.some((p) => p.para === "fisico")).toBe(true);
    expect(PLANTILLAS.some((p) => p.para === "dropshipping")).toBe(true);
    expect(PLANTILLAS.some((p) => p.para === "servicio")).toBe(true);
  });

  it("toda casilla explica qué va adentro: es la instrucción al modelo", () => {
    for (const p of PLANTILLAS) {
      for (const c of p.casillas) {
        expect(c.queVa.length).toBeGreaterThan(20);
      }
    }
  });

  it("no hay casillas repetidas dentro de una plantilla", () => {
    // Dos secciones del mismo type se pisan al encajar la respuesta del modelo.
    for (const p of PLANTILLAS) {
      const tipos = p.casillas.map((c) => c.type);
      expect(new Set(tipos).size).toBe(tipos.length);
    }
  });
});
