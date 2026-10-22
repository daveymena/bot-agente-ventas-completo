/**
 * LO QUE LA FICHA LE DIJO AL CLIENTE, EL VENDEDOR TAMBIÉN LO SABE
 * ================================================================
 *
 * Chat de prueba del dueño (30-09-2026), cámara de seguridad, sofia-premium:
 *
 *   bot:     [ficha] "🚚 Envío incluido en el precio. Llega en 3 a 5 días
 *             hábiles. 💵 Pagas contraentrega, cuando lo recibes"
 *   cliente: ¿Cuánto se demora en llegar a Pasto y puedo pagar cuando llegue?
 *   bot:     "déjame confirmarlo con el equipo para darte la información
 *             exacta. Te respondo en un momentico"
 *
 * Reproducido dos veces. La ficha arma esas líneas con las `condiciones` del
 * negocio (whatsapp.ts), pero el guion del modelo (nicho.ts) nunca las leía:
 * sin `entrega` en el perfil le PROHIBÍA dar plazos ("di que lo confirmas").
 * Además el adaptador pasaba `pagoEnvio`/`costoEnvio`, campos que no existen
 * en CondicionesDelNegocio: la contraentrega nunca llegaba como medio de pago.
 */
import { describe, expect, test } from "vitest";
import { guionDelNegocio, renderGuion, type ProductoParaNicho } from "../nicho";
import { condicionesSinRespaldo } from "../condiciones-sin-respaldo";
import { CONDICIONES_DE_RESPALDO, condicionesDesdePerfil } from "../../modelo-de-negocio";

// Las condiciones que el dueño SÍ cargó en su perfil. Hasta el 23-10-2026
// estas pruebas usaban el respaldo como si fueran las del negocio; el
// respaldo ya no trae plazo, costo ni cobertura (no se inventan).
const DEL_NEGOCIO = condicionesDesdePerfil({ pais: "CO", envio: { plazo: "3 a 5 días hábiles", pago: "contraentrega", costo: "incluido", cobertura: "todo el país" } });

const CAMARA: ProductoParaNicho = { id: 153, name: "Cámara de Seguridad 3 Antenas con Puerto LAN", description: "Full HD", price: 137900, kind: "physical" };
const CURSO: ProductoParaNicho = { id: 7, name: "Curso de piano", description: "283 clases", price: 60000, kind: "digital", deliveryLink: "https://drive.google.com/x" };

describe("condiciones de despacho en el guion (las mismas de la ficha)", () => {
  const guion = guionDelNegocio({ catalogo: [CAMARA], negocio: { condiciones: DEL_NEGOCIO } });
  const texto = renderGuion(guion);

  test("el plazo, el costo y el pago del envío son DATOS del negocio", () => {
    expect(texto).toMatch(/3 a 5 días hábiles/);
    expect(texto).toMatch(/contraentrega/i);
    expect(texto).toMatch(/Envío incluido en el precio/);
  });

  test("ya no le prohíbe dar el plazo ni lo manda a 'confirmarlo'", () => {
    expect(guion.sinConfirmar).not.toContain("cómo se entrega y cuánto tarda");
    expect(guion.prohibiciones.join(" ")).not.toMatch(/No prometas ninguna forma de entrega ni ningún plazo/);
  });

  test("la cobertura del envío responde '¿llega a Pasto?'", () => {
    expect(texto).toMatch(/todo el país/);
    expect(guion.sinConfirmar).not.toContain("a qué ciudades o zonas llega");
  });

  test("el filtro de salida deja pasar la respuesta correcta", () => {
    const respuesta = "Llega a Pasto en 3 a 5 días hábiles y pagas contraentrega, cuando lo recibes.";
    expect(condicionesSinRespaldo(respuesta, { producto: CAMARA as any, guion, conocimiento: [] })).toEqual([]);
  });

  test("no cambia un plazo por otro: el guion prohíbe prometer uno distinto", () => {
    expect(guion.prohibiciones.join(" ")).toMatch(/3 a 5 días hábiles/);
  });
});

describe("lo que NO se despacha no hereda condiciones de envío", () => {
  test("un negocio solo digital no habla de contraentrega aunque haya condiciones de respaldo", () => {
    const guion = guionDelNegocio({ catalogo: [CURSO], negocio: { condiciones: DEL_NEGOCIO } });
    expect(renderGuion(guion)).not.toMatch(/Llega en 3 a 5 días hábiles/);
    expect(guion.hechos.join(" ")).not.toMatch(/contraentrega/i);
  });

  test("en un catálogo mixto el plazo queda dicho SOLO para lo que se despacha", () => {
    const guion = guionDelNegocio({ catalogo: [CAMARA, CURSO], negocio: { condiciones: DEL_NEGOCIO } });
    const h = guion.hechos.find((x) => /3 a 5 días/.test(x)) || "";
    expect(h).toMatch(/físicos/i);
  });

  test("el perfil del dueño manda sobre el respaldo", () => {
    const guion = guionDelNegocio({
      catalogo: [CAMARA],
      negocio: { entrega: { metodo: "Servientrega", plazo: "2 días" }, condiciones: DEL_NEGOCIO },
    });
    const t = renderGuion(guion);
    expect(t).toMatch(/Servientrega — 2 días/);
    expect(t).not.toMatch(/Llega en 3 a 5 días/);
  });
});

describe("sin envío configurado el vendedor no afirma plazo, costo ni cobertura", () => {
  const guion = guionDelNegocio({ catalogo: [CAMARA], negocio: { condiciones: CONDICIONES_DE_RESPALDO } });
  const texto = renderGuion(guion);

  test("no hay plazo, 'envío incluido' ni 'todo el país' como hecho", () => {
    expect(texto).not.toMatch(/3 a 5 días/);
    expect(texto).not.toMatch(/Envío incluido/);
    expect(guion.hechos.join(" ")).not.toMatch(/todo el país/);
  });

  test("lo deja como algo a confirmar", () => {
    expect(guion.sinConfirmar).toContain("cómo se entrega y cuánto tarda");
    expect(guion.sinConfirmar).toContain("a qué ciudades o zonas llega");
  });

  test("con plazo pero sin costo, el costo se confirma (no es 'incluido')", () => {
    const c = condicionesDesdePerfil({ envio: { plazo: "2 días", pago: "contraentrega" } });
    const t = renderGuion(guionDelNegocio({ catalogo: [CAMARA], negocio: { condiciones: c } }));
    expect(t).toMatch(/Llega en 2 días/);
    expect(t).not.toMatch(/Envío incluido/);
    expect(t).toMatch(/Costo de envío por confirmar/);
  });
});
