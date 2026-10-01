/**
 * EL NICHO QUE NO EXISTE TODAVÍA
 * ==============================
 *
 * La prueba que importa de este archivo es la última: un negocio que nadie
 * clasificó, del que no hay plantilla, y que el sistema tiene que saber
 * vender igual. Si eso pasa, el agente sirve para cualquier negocio que se
 * registre mañana; si no, sirve para los seis rubros que alguien escribió.
 */

import { test, describe, expect } from "vitest";
const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
  doesNotMatch: (a: string, re: RegExp, m?: string) => expect(a, m).not.toMatch(re),
};

import {
  derivarFormaDeVenta,
  guionDelNegocio,
  calificacionDe,
  datosQueFaltan,
  renderGuion,
  type NegocioParaNicho,
  type ProductoParaNicho,
} from "../nicho";

const DIGITALES: ProductoParaNicho[] = [
  { id: 1, name: "Curso de piano", description: "Aprendé piano desde cero", price: 60000, kind: "digital", deliveryLink: "https://drive.google.com/x" },
  { id: 2, name: "Curso de IA", description: "Inteligencia artificial aplicada", price: 80000, kind: "digital", deliveryLink: "https://drive.google.com/y" },
];

const FISICOS: ProductoParaNicho[] = [
  { id: 1, name: "Rodillera térmica", description: "Alivio para las rodillas", price: 89000, kind: "physical", opciones: ["S", "M", "L"] },
  { id: 2, name: "Corrector de postura", description: "Corrige la espalda", price: 75000, kind: "physical" },
];

const SERVICIOS: ProductoParaNicho[] = [
  { id: 1, name: "Limpieza dental", description: "Profilaxis completa", price: 120000, kind: "service" },
  { id: 2, name: "Ortodoncia", description: "Brackets", price: 2500000, kind: "service" },
];

/* ═══════════════════════════════════════════════════════════════════
 * 1. LA FORMA DE VENTA SE DERIVA, NO SE ELIGE DE UNA LISTA
 * ═══════════════════════════════════════════════════════════════════ */

describe("la forma de venta", () => {
  test("un catálogo digital con enlace de entrega vende digital", () => {
    const { forma } = derivarFormaDeVenta(DIGITALES, { nombre: "Cursos Ya" });
    assert.equal(forma, "digital");
  });

  test("un catálogo de productos físicos vende físico", () => {
    const { forma } = derivarFormaDeVenta(FISICOS, { nombre: "Tienda" });
    assert.equal(forma, "fisico");
  });

  test("un catálogo de servicios vende servicio", () => {
    const { forma } = derivarFormaDeVenta(SERVICIOS, { nombre: "Clínica" });
    assert.equal(forma, "servicio");
  });

  test("lo que el DUEÑO escribió pesa más que las palabras del catálogo", () => {
    // Un gimnasio que carga clases: el kind dice "digital" (es como lo
    // factura) pero la entrega que configuró es presencial.
    const { forma, senales } = derivarFormaDeVenta(
      [{ id: 1, name: "Plan mensual", description: "Acceso al gimnasio", price: 90000, kind: "digital" }],
      { nombre: "Gimnasio", entrega: { metodo: "presencial con cita previa", plazo: "según agenda" } },
    );
    assert.equal(forma, "servicio");
    assert.ok(senales.some((s) => s.includes("agenda")), senales.join(" | "));
  });

  test("un catálogo mezclado se vende como mixto, no adivinando", () => {
    const { forma } = derivarFormaDeVenta(
      [
        { id: 1, name: "Curso de guitarra", price: 50000, kind: "digital", deliveryLink: "https://drive.google.com/z" },
        { id: 2, name: "Guitarra acústica", price: 900000, kind: "physical" },
      ],
      { nombre: "Música y Todo" },
    );
    assert.equal(forma, "mixto");
  });

  test("sin ninguna señal no inventa: cae en mixto y lo declara", () => {
    const { forma, confianza, senales } = derivarFormaDeVenta([], {});
    assert.equal(forma, "mixto");
    assert.equal(confianza, 0);
    assert.ok(senales.some((s) => s.includes("sin señales")));
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 2. LOS HECHOS Y LAS PROHIBICIONES
 *    Lo que no está cargado NO se afirma: se convierte en prohibición.
 *    Antes un dato faltante se rellenaba con el de TecnoVariedades y el
 *    agente inventaba con total seguridad.
 * ═══════════════════════════════════════════════════════════════════ */

describe("lo que se puede afirmar", () => {
  test("con todo cargado, los hechos salen tal cual", () => {
    const guion = guionDelNegocio({
      catalogo: DIGITALES,
      negocio: {
        nombre: "Cursos Ya",
        nicho: "educación online",
        entrega: { metodo: "Google Drive", plazo: "inmediato" },
        garantia: { dias: 7, descripcion: "7 días de garantía" },
        cobertura: "todo el país",
      },
      medios: [{ etiqueta: "Nequi", tipo: "transferencia" }],
    });

    const texto = renderGuion(guion);
    assert.match(texto, /Google Drive/);
    assert.match(texto, /7 días de garantía/);
    assert.match(texto, /Se cobra con: Nequi/);
    assert.match(texto, /todo el país/);
  });

  test("digital sin entrega cargada: se sabe CÓMO llega (por el chat, al verificar el pago), no se promete el tiempo exacto", () => {
    // 30-09-2026: antes se prohibía hablar de la entrega y el vendedor
    // contestaba "lo consulto" a "¿cómo me llega el curso?", algo que el
    // sistema sí sabe (verificacion-pago.ts entrega el acceso en el chat).
    const guion = guionDelNegocio({ catalogo: DIGITALES, negocio: { nombre: "Sin Datos" } });
    const texto = renderGuion(guion);

    assert.match(texto, /NO TIENES ESTOS DATOS/);
    assert.ok(guion.hechos.some((h) => /acceso se envía por este mismo chat/.test(h)), guion.hechos.join(" | "));
    assert.ok(guion.prohibiciones.some((p) => /No prometas minutos exactos/.test(p)), guion.prohibiciones.join(" | "));
  });

  test("sin medios de pago cargados, se prohíbe dar cuentas o enlaces", () => {
    const guion = guionDelNegocio({ catalogo: DIGITALES, negocio: { nombre: "Sin Datos" }, medios: [] });
    assert.ok(guion.prohibiciones.some((p) => /No des números de cuenta/.test(p)), guion.prohibiciones.join(" | "));
  });

  test("por defecto NO se puede rebajar el precio", () => {
    const guion = guionDelNegocio({ catalogo: DIGITALES, negocio: { nombre: "X" } });
    assert.ok(guion.prohibiciones.some((p) => /No rebajes el precio/.test(p)));
  });

  test("si el negocio autoriza a negociar, eso se dice y no se prohíbe", () => {
    const guion = guionDelNegocio({ catalogo: DIGITALES, negocio: { nombre: "Concesionario", negociaPrecio: true } });
    assert.ok(guion.hechos.some((h) => /autoriza a negociar/.test(h)));
    assert.ok(!guion.prohibiciones.some((p) => /No rebajes el precio/.test(p)));
  });

  test("a un negocio físico no se le permite prometer entrega digital", () => {
    const guion = guionDelNegocio({
      catalogo: FISICOS,
      negocio: { nombre: "Tienda", entrega: { metodo: "transportadora", plazo: "3 a 5 días hábiles" } },
    });
    const texto = renderGuion(guion);
    assert.doesNotMatch(texto, /No hables de envíos/);
    assert.match(texto, /transportadora/);
  });

  test("a un negocio digital se le prohíbe hablar de envíos", () => {
    const guion = guionDelNegocio({
      catalogo: DIGITALES,
      negocio: { nombre: "Cursos", entrega: { metodo: "enlace", plazo: "inmediato" } },
    });
    assert.ok(guion.prohibiciones.some((p) => /No hables de envíos/.test(p)), guion.prohibiciones.join(" | "));
  });

  test("las prohibiciones del dueño se respetan tal cual", () => {
    const guion = guionDelNegocio({
      catalogo: SERVICIOS,
      negocio: { nombre: "Clínica", noPuede: ["prometer resultados médicos"] },
    });
    assert.ok(guion.prohibiciones.some((p) => /resultados médicos/.test(p)));
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 3. QUÉ HAY QUE SABER ANTES DE CERRAR
 *    No es un formulario: es lo mínimo sin lo cual la venta no se puede
 *    concretar, derivado de cómo se entrega.
 * ═══════════════════════════════════════════════════════════════════ */

describe("qué hace falta para cerrar", () => {
  test("vender algo físico exige ciudad y dirección", () => {
    const campos = calificacionDe("fisico", FISICOS).filter((d) => d.obligatorio).map((d) => d.campo);
    assert.ok(campos.includes("ciudad"));
    assert.ok(campos.includes("direccion"));
  });

  test("vender algo digital NO pide dirección", () => {
    const campos = calificacionDe("digital", DIGITALES).map((d) => d.campo);
    assert.ok(!campos.includes("direccion"));
    assert.ok(!campos.includes("ciudad"));
  });

  test("un servicio exige saber qué necesita y cuándo", () => {
    const obligatorios = calificacionDe("servicio", SERVICIOS).filter((d) => d.obligatorio).map((d) => d.campo);
    assert.ok(obligatorios.includes("necesidad"));
    assert.ok(obligatorios.includes("cuando"));
  });

  test("si el producto tiene tallas, hay que saber cuál mandar", () => {
    const conTallas = calificacionDe("fisico", FISICOS, FISICOS[0]).map((d) => d.campo);
    assert.ok(conTallas.includes("variante"));

    const sinTallas = calificacionDe("fisico", FISICOS, FISICOS[1]).map((d) => d.campo);
    assert.ok(!sinTallas.includes("variante"));
  });

  test("lo que ya se sabe no se vuelve a pedir", () => {
    const faltan = datosQueFaltan(calificacionDe("fisico", FISICOS), { nombre: "Duvier", ciudad: "Cali" });
    assert.ok(!faltan.some((d) => d.campo === "ciudad"));
    assert.ok(faltan.some((d) => d.campo === "direccion"));
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 4. LAS OBJECIONES SE DERIVAN DE LA FORMA DE ENTREGA
 * ═══════════════════════════════════════════════════════════════════ */

describe("las objeciones", () => {
  test("en un físico aparece el tiempo de entrega y la contraentrega", () => {
    const guion = guionDelNegocio({ catalogo: FISICOS, negocio: { nombre: "Tienda" } });
    const suenan = guion.objeciones.map((o) => o.suena).join(" | ");
    assert.match(suenan, /cuánto demora/);
    assert.match(suenan, /contraentrega/);
  });

  test("en un servicio aparece la zona y el resultado", () => {
    const guion = guionDelNegocio({ catalogo: SERVICIOS, negocio: { nombre: "Clínica" } });
    const suenan = guion.objeciones.map((o) => o.suena).join(" | ");
    assert.match(suenan, /cubren mi zona/);
    assert.match(suenan, /no resulta/);
  });

  test("'lo voy a pensar' nunca se responde con una despedida", () => {
    const guion = guionDelNegocio({ catalogo: DIGITALES, negocio: { nombre: "Cursos" } });
    const piensa = guion.objeciones.find((o) => /lo voy a pensar/.test(o.suena));
    assert.ok(piensa);
    assert.match(piensa!.como, /no te despidas/);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 5. LA PRUEBA QUE IMPORTA: UN NEGOCIO QUE NO EXISTE TODAVÍA
 * ═══════════════════════════════════════════════════════════════════ */

describe("un nicho que nadie clasificó", () => {
  const FUNERARIA: NegocioParaNicho = {
    nombre: "Funeraria La Paz",
    descripcion: "Servicios funerarios completos y traslados",
    entrega: { metodo: "traslado y ceremonia", plazo: "el mismo día" },
    cobertura: "Cali y municipios cercanos",
    horario: "24 horas",
    noPuede: ["prometer precio final sin ver el plan contratado"],
    loQueDebeSaber: ["Atienden 24 horas", "Se paga con la aseguradora o de contado"],
  };

  test("entiende que es un servicio aunque el rubro no figure en ninguna lista", () => {
    const guion = guionDelNegocio({
      catalogo: [{ id: 1, name: "Plan funerario básico", description: "Traslado, ataúd y trámites", price: 3200000, kind: "service" }],
      negocio: FUNERARIA,
      medios: [{ etiqueta: "Transferencia bancaria", tipo: "transferencia" }],
    });

    assert.equal(guion.forma, "servicio");
    assert.match(renderGuion(guion), /24 horas/);
    assert.ok(!guion.prohibiciones.some((p) => /envíos/.test(p)), "no le habla de paquetes a una funeraria");
  });

  test("el adiestramiento canino: servicio, con agenda y cobertura", () => {
    const guion = guionDelNegocio({
      catalogo: [
        { id: 1, name: "Adiestramiento básico", description: "10 sesiones de obediencia", price: 900000, kind: "service" },
        { id: 2, name: "Corrección de conducta", description: "Trabajo en casa", price: 1200000, kind: "service" },
      ],
      negocio: { nombre: "K9", entrega: { metodo: "sesiones en tu casa", plazo: "a convenir" }, cobertura: "Cali" },
    });

    assert.equal(guion.forma, "servicio");
    const obligatorios = guion.calificacion.filter((d) => d.obligatorio).map((d) => d.campo);
    assert.ok(obligatorios.includes("cuando"), obligatorios.join(","));
    assert.ok(guion.prohibiciones.some((p) => /resultado/.test(p)));
  });

  test("una tienda de repuestos: físico, con variantes y envío", () => {
    const guion = guionDelNegocio({
      catalogo: [
        { id: 1, name: "Pastillas de freno", description: "Para moto", price: 45000, kind: "physical", opciones: ["Delantera", "Trasera"] },
      ],
      negocio: { nombre: "Repuestos JJ", entrega: { metodo: "transportadora", plazo: "2 a 4 días hábiles" }, cobertura: "Colombia" },
      medios: [{ etiqueta: "Nequi", tipo: "transferencia" }],
    });

    assert.equal(guion.forma, "fisico");
    assert.ok(guion.calificacion.some((d) => d.campo === "variante"), "hay dos variantes: hay que saber cuál");
    assert.ok(guion.calificacion.some((d) => d.campo === "ciudad"));
    assert.match(renderGuion(guion), /2 a 4 días hábiles/);
  });

  test("un negocio sin perfil ni kind: no afirma nada y aún así puede vender", () => {
    const guion = guionDelNegocio({
      catalogo: [{ id: 1, name: "Algo", description: "Algo que se vende", price: 50000 }],
      negocio: { nombre: "Sin Perfil" },
    });

    const texto = renderGuion(guion);
    assert.ok(guion.sinConfirmar.length >= 3, "declara todo lo que no sabe");
    assert.ok(guion.confianza < 1);
    // Y todavía tiene con qué sostener la charla: el producto y su precio.
    assert.match(texto, /FORMA DE VENTA/);
    assert.ok(guion.objeciones.length > 0);
  });
});

/* ═══════════════════════════════════════════════════════════════════
 * 6. EL VOCABULARIO
 * ═══════════════════════════════════════════════════════════════════ */

describe("el vocabulario", () => {
  test("a un producto físico se le dice 'el pedido' y 'te llega'", () => {
    const g = guionDelNegocio({ catalogo: FISICOS, negocio: { nombre: "T" } });
    assert.equal(g.vocabulario.producto, "el pedido");
    assert.equal(g.vocabulario.entregar, "te llega");
  });

  test("a un servicio se le dice 'el servicio' y 'lo agendamos'", () => {
    const g = guionDelNegocio({ catalogo: SERVICIOS, negocio: { nombre: "C" } });
    assert.equal(g.vocabulario.producto, "el servicio");
    assert.equal(g.vocabulario.entregar, "lo agendamos");
  });
});
