/**
 * BORRADORES PROFESIONALES (pedido del dueño, 07-10-2026).
 *
 * Borradores generados con productos REALES del catálogo de prueba
 * (scripts/catalogo-real.json) y medidos con la rúbrica (anuncio-rubrica.ts).
 * Sin red ni base: el contexto del negocio y el destino se mockean, y el
 * "modelo" de crear_anuncio se simula con su salida típica mala.
 *
 * Lo medido ANTES del arreglo (mismo catálogo, mismas condiciones):
 *   · descripciones de 44-52 letras (Meta corta en 30) en los 7 productos;
 *   · Corrector Trenza abría con "Política de Garantía de 10 Días" y sus
 *     "beneficios" eran "Por ello" y "Condiciones de la Garantía";
 *   · la Cámara abría con 150 letras de ficha terminadas en ";" y repetía el
 *     gancho como primer punto; titular "📸 Cámara Seguridad Videollamada…";
 *   · AB Roller: cero beneficios (ficha de un párrafo);
 *   · el portátil abría con "6\" HD, sistema operativo…" (el recorte saltaba texto);
 *   · la acción decía SIEMPRE "Escríbenos por WhatsApp", aunque el anuncio
 *     fuera a la landing publicada.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const estado = { objetivo: "mensajes" as "mensajes" | "trafico" | "ventas" };

vi.mock("../business-context", () => ({
  getBusinessContext: async () => ({
    condiciones: { pais: "CO", envio: { plazo: "3 a 5 días hábiles", pago: "contraentrega", costo: "incluido", cobertura: "todo el país" }, fuente: "perfil" },
  }),
}));
vi.mock("../landing/destino-del-producto", () => ({
  destinoPorDefecto: async () => ({ objetivo: estado.objetivo, preferencia: estado.objetivo === "mensajes" ? null : "landing" }),
  destinoWebDelProducto: async () => ({ url: "https://ventasproia.com/l/x", landingId: 1 }),
}));

import { AdStrategist } from "../ad-strategist";
import { evaluarBorrador, reparosDeRedaccion } from "../anuncio-rubrica";
import {
  planDeAnuncio,
  titularDelProducto,
  recortarAPalabra,
  esTextoDeProveedor,
  accionCoherenteConDestino,
  ajustarCopyAMeta,
  LIMITES_META,
} from "../anuncio-por-modelo";

const catalogo: any[] = JSON.parse(readFileSync(new URL("../../../scripts/catalogo-real.json", import.meta.url), "utf8"));
const producto = (id: number) => {
  const p = catalogo.find((x) => x.id === id);
  if (!p) throw new Error(`falta el producto ${id} en catalogo-real.json`);
  return { ...p, imageUrl: `/images/products/${id}.jpg` };
};
const FOTO = (id: number) => `https://ventasproia.com/images/products/${id}.jpg`;

async function borrador(id: number, grounded?: any) {
  const s = new AdStrategist({ id: 1, country: "CO" } as any);
  const p = producto(id);
  const r = await s.generateAdCopy(s.getStrategyForProduct(p), p, grounded);
  return { ...r, images: [FOTO(id)], strategy: { ...r.strategy, ageMin: 24, ageMax: 45, interests: [] } };
}
const ctxDe = (id: number, destino: "whatsapp" | "web") => ({ producto: producto(id), destino, fotosDelProducto: [FOTO(id)], negocioTieneGarantia: false });

beforeEach(() => { estado.objetivo = "mensajes"; });

describe("rúbrica sobre borradores de productos REALES (a WhatsApp)", () => {
  for (const id of [163, 154, 168, 173, 123]) {
    it(`producto ${id}: cumple los 8 criterios`, async () => {
      const b = await borrador(id);
      const e = evaluarBorrador(b, ctxDe(id, "whatsapp"));
      expect(e.reparos, `${b.headline}\n${b.primaryText}`).toEqual([]);
      expect(e.puntaje).toBe(100);
    });
  }

  it("Pañalera: el gancho es la frase del producto y la descripción entra en 30", async () => {
    const b = await borrador(163);
    expect(b.primaryText.split("\n")[0]).toMatch(/bebé necesita/);
    expect(b.description.length).toBeLessThanOrEqual(30);
    expect(b.description).toBe("$110.990 · Pagas al recibir");
    expect(b.primaryText).not.toMatch(/BENEFICIOS PRINCIPALES/);
  });

  it("Cámara: el gancho no repite como punto, sin coma de decimal partida, titular sin emoji adivinado ni '…'", async () => {
    const b = await borrador(154);
    const [gancho] = b.primaryText.split("\n");
    expect(gancho!.length).toBeLessThanOrEqual(LIMITES_META.primeraVista);
    expect(b.primaryText.split("\n").filter((l) => l.includes("Alta calidad de imagen")).length).toBe(1);
    expect(b.primaryText).not.toMatch(/IPS LPS de 2\s*$/m);
    expect(b.headline).toBe("Cámara Seguridad Videollamada Robótica");
  });

  it("AB Roller (ficha de UN párrafo): abre con para qué sirve y lista beneficios", async () => {
    const b = await borrador(173);
    expect(b.primaryText.split("\n")[0]).toMatch(/^Sirve para tonificar/);
    expect(b.primaryText).toMatch(/✔️ Rueda abdominal de diseño grueso/);
  });

  it("Mascotas: el voseo de la ficha sale en tuteo ya en el borrador", async () => {
    const b = await borrador(168);
    expect(b.primaryText).toMatch(/^Lleva a tu mascota/);
    expect(b.primaryText).not.toMatch(/Llevá|Pagás|Escribinos/);
  });

  it("Piano: titular sin gritar, gancho que interpela, 'de por vida' solo porque la ficha lo dice", async () => {
    const b = await borrador(123);
    expect(b.headline).toBe("Curso de piano completo");
    expect(b.primaryText.split("\n")[0]).toMatch(/^Aprende a tocar/);
    expect(b.primaryText).toMatch(/♾️ Acceso de por vida/);
  });

  it("Portátil: no abre con un pedazo de frase ni con el código del proveedor", async () => {
    const b = await borrador(146);
    expect(b.primaryText).not.toMatch(/^6" HD/);
    expect(b.primaryText).not.toMatch(/proveedor/i);
    expect(b.headline).toBe("Portátil HP 15-DY0700TG");
  });
});

describe("ficha sin un solo beneficio (Corrector Trenza: solo la política del proveedor)", () => {
  it("no publica la política de garantía del proveedor ni rótulos sueltos", async () => {
    const b = await borrador(157);
    expect(b.primaryText).not.toMatch(/Política|Por ello|Condiciones de la Garantía|devolución/i);
  });
  it("el titular NO repite el gancho: pasa a decir la oferta", async () => {
    const b = await borrador(157);
    expect(b.primaryText.split("\n")[0]).toBe("Corrector de Postura Trenza");
    expect(b.headline).toBe("Pagas al recibir · $45.000");
  });
  it("la rúbrica lo dice honesto: falta gancho y beneficio (hay que curar la ficha), el resto cumple", async () => {
    const b = await borrador(157);
    const e = evaluarBorrador(b, ctxDe(157, "whatsapp"));
    expect(e.criterios.filter((c) => !c.ok).map((c) => c.id).sort()).toEqual(["beneficio", "gancho"]);
    expect(reparosDeRedaccion(e)).toBeNull(); // no es culpa de la redacción
  });
});

describe("destino: la acción del texto es la del botón", () => {
  it("con landing publicada (objetivo tráfico) el texto NO pide WhatsApp y la estrategia guarda el objetivo", async () => {
    estado.objetivo = "trafico";
    const b = await borrador(163);
    const accion = b.primaryText.split("\n").filter((l) => l.startsWith("👉"));
    expect(accion).toEqual(["👉 Pídelo en el enlace y lo pagas cuando llegue."]);
    expect((b.strategy as any).objetivo).toBe("trafico");
    expect(evaluarBorrador(b, ctxDe(163, "web")).reparos).toEqual([]);
  });

  it("el objetivo explícito manda sobre la regla por defecto", async () => {
    estado.objetivo = "trafico";
    const s = new AdStrategist({ id: 1 } as any);
    const p = producto(123);
    const r = await s.generateAdCopy(s.getStrategyForProduct(p), p, undefined, { objetivo: "mensajes" });
    expect(r.primaryText).toMatch(/👉 Escríbenos por WhatsApp y empiezas hoy\./);
  });

  it("un texto a WhatsApp subido como tráfico se corrige en la última barrera", () => {
    const plan = planDeAnuncio(producto(163), { envio: { pago: "contraentrega" } } as any, { destino: "whatsapp" });
    const r = accionCoherenteConDestino(plan.primaryText, "fisico", "web", "contraentrega");
    expect(r.corregido).toBe(true);
    expect(r.texto).toMatch(/👉 Pídelo en el enlace/);
    expect(r.texto).not.toMatch(/👉 Escríbenos/);
    // Ya coherente: no se toca.
    expect(accionCoherenteConDestino(r.texto, "fisico", "web", "contraentrega").corregido).toBe(false);
  });
});

describe("copy del MODELO (crear_anuncio) simulado: lo que se guarda es lo que Meta muestra", () => {
  // Salida típica del modelo antes del arreglo: rioplatense (el prompt lo
  // pedía), titular y descripción largos, y la acción a WhatsApp.
  const LLM = {
    primaryText:
      "¿Salís con tu bebé y nunca encontrás nada en la pañalera? 👶\n\nOrganizá todo en un solo lugar.\n\n🍼 Compartimentos para pañales y teteros\n🛏️ Se convierte en cuna portátil\n\n🔥 $110.990 COP\n\n👉 Escribinos por WhatsApp y pedila hoy",
    headline: "Pañalera Mochila Multifuncional 2 En 1 con cuna portátil",
    description: "Pagás al recibir en toda Colombia con envío incluido",
  };

  it("tuteo, titular ≤40 y descripción ≤30 sin cortar a mitad de frase", async () => {
    const b = await borrador(163, LLM);
    expect(b.primaryText).not.toMatch(/Salís|encontrás|Organizá|Escribinos/);
    expect(b.primaryText).toMatch(/^¿Sales con tu bebé/);
    expect(b.headline.length).toBeLessThanOrEqual(40);
    expect(b.headline.endsWith("con")).toBe(false);
    expect(b.description).toBe("$110.990 · Pagas al recibir"); // la del plan, con datos reales
  });

  it("si el anuncio va a la landing, la rúbrica le devuelve al modelo el reparo de la acción", async () => {
    estado.objetivo = "trafico";
    const b = await borrador(163, LLM);
    const e = evaluarBorrador(b, ctxDe(163, "web"));
    expect(e.criterios.find((c) => c.id === "cta")!.ok).toBe(false);
    expect(reparosDeRedaccion(e)).toMatch(/WhatsApp y el anuncio lleva a la página/);
  });

  it("un precio que no es el del producto no pasa la rúbrica", async () => {
    const b = await borrador(163, { ...LLM, primaryText: LLM.primaryText.replace("$110.990", "$89.900") });
    const e = evaluarBorrador(b, ctxDe(163, "whatsapp"));
    expect(e.criterios.find((c) => c.id === "oferta")!.ok).toBe(false);
  });

  it("testimonios y garantía sin dato del negocio no pasan", () => {
    const e = evaluarBorrador(
      { primaryText: "¿Te duele la espalda?\n\n✔️ Alinea hombros\n\n⭐ Testimonios de clientes satisfechos y garantía de 30 días\n\n💰 $45.000 COP\n\n👉 Escríbenos por WhatsApp", headline: "Corrector", description: "$45.000", images: [FOTO(157)] },
      ctxDe(157, "whatsapp"),
    );
    expect(e.criterios.find((c) => c.id === "prueba")!.ok).toBe(false);
  });
});

describe("piezas deterministas", () => {
  it("titularDelProducto: siglas, gritos, fichas técnicas con |", () => {
    expect(titularDelProducto("CURSO REVIT BIM")).toBe("Curso revit BIM");
    expect(titularDelProducto("📂2 OFFICE")).toBe("2 office");
    expect(titularDelProducto('Portátil Lenovo LOQ 15AHP10 | Ryzen 7 250 | 24GB DDR5')).toBe("Portátil Lenovo LOQ 15AHP10");
    for (const p of catalogo) expect(titularDelProducto(p.name).length).toBeLessThanOrEqual(40);
  });

  it("recortarAPalabra no deja conector colgando ni '…'", () => {
    expect(recortarAPalabra("Mochila de viaje para cabina de avión con puerto USB", 40)).toBe("Mochila de viaje para cabina de avión");
    expect(recortarAPalabra("Supercalifragilisticoespialidosamente", 10)).toHaveLength(10);
  });

  it("texto del proveedor: políticas, links y logística; NO el producto", () => {
    expect(esTextoDeProveedor("Política de Garantía de 10 Días")).toBe(true);
    expect(esTextoDeProveedor("COPIA ESTE LINK Y PEGALO https://bit.ly/x")).toBe(true);
    expect(esTextoDeProveedor("Código del proveedor 3369.")).toBe(true);
    expect(esTextoDeProveedor("Mochila transportadora con burbuja 360°")).toBe(false);
    expect(esTextoDeProveedor("Incluye guías de nutrición y recetas")).toBe(false);
  });

  it("todo el catálogo real: titular ≤40, descripción ≤30, primera línea ≤125, una sola acción", () => {
    for (const p of catalogo) {
      for (const destino of ["whatsapp", "web"] as const) {
        const plan = planDeAnuncio(p, { pais: "CO", envio: { plazo: "3 a 5 días hábiles", pago: "contraentrega", costo: "incluido", cobertura: "todo el país" }, fuente: "perfil" }, { destino });
        const c = ajustarCopyAMeta(plan, { esFisico: plan.modelo === "fisico", respaldo: plan });
        const msg = `${p.id} ${p.name} (${destino})`;
        expect(c.headline.length, msg).toBeLessThanOrEqual(40);
        expect(c.description.length, msg).toBeLessThanOrEqual(30);
        expect(c.primaryText.split("\n")[0]!.length, msg).toBeLessThanOrEqual(125);
        expect(c.primaryText.split("\n").filter((l) => l.startsWith("👉")).length, msg).toBe(1);
        expect(c.primaryText, msg).not.toMatch(/https?:\/\/|bit\.ly|Política de|NOTA IMPORTANTE/i);
        const e = evaluarBorrador({ ...c, images: [FOTO(p.id)] }, { producto: p, destino, fotosDelProducto: [FOTO(p.id)] });
        for (const id of ["oferta", "cta", "longitudes", "prueba"]) {
          expect(e.criterios.find((x) => x.id === id)!.ok, `${msg}: ${e.reparos.join(" | ")}`).toBe(true);
        }
      }
    }
  });
});
