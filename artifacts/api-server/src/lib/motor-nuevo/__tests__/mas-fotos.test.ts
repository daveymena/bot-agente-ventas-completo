/**
 * MÁS FOTOS SIN REPETIR + DUDAS QUE SE RAZONAN
 *
 * "Mándame más fotos" tiene que mandar las vistas que el cliente todavía no
 * vio (nunca la misma dos veces, nunca la de la ficha de nuevo). Y las
 * preguntas puntuales se responden razonando con datos reales
 * (características + FAQ), no lanzando la maqueta entera.
 */
import { describe, test, expect } from "vitest";
import { estadoInicial, fotosPendientes } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { datosParaRazonar } from "../maquetas";
import { puntosDeLaFicha } from "../lo-que-dice-la-ficha";
import { guionDelNegocio } from "../nicho";
import { mensajesDeLaFicha } from "../../whatsapp";

const FOTOS = [
  "https://cdn.test/p/1/img_0.webp",
  "https://cdn.test/p/1/img_1.webp",
  "https://cdn.test/p/1/img_2.webp",
  "https://cdn.test/p/1/img_3.webp",
];
const PROD: Producto = {
  id: 7, name: "Faja", description: "Faja reductora de uso diario", price: 45000,
  currency: "COP", kind: "physical", disponible: true, fotos: FOTOS,
  caracteristicas: ["Tela fresca", "Uso diario"],
  preguntas: [{ p: "¿Sirve para posparto?", r: "Sí, desde el día uno" }],
};
const CAT = [PROD];

function ctx(): ContextoHerramientas {
  const e = estadoInicial(1);
  e.productoEnFoco = 7;
  return {
    estado: e, catalogo: CAT, partes: [], conocimiento: [],
    guion: guionDelNegocio({ catalogo: CAT, negocio: { nombre: "T" }, medios: [] }),
    mensajeDelCliente: "más fotos", efectos: [],
  } as ContextoHerramientas;
}

const tarjetas = (c: ContextoHerramientas) => c.partes.filter((p: any) => p.kind === "card");

describe("fotosPendientes", () => {
  test("salta las ya vistas aunque cambie mayúsculas o query", () => {
    expect(fotosPendientes(FOTOS, ["https://CDN.test/p/1/IMG_0.webp?v=2", FOTOS[1]])).toEqual([FOTOS[2], FOTOS[3]]);
  });

  test("sin enviadas devuelve todas, sin nada devuelve vacío", () => {
    expect(fotosPendientes(FOTOS, [])).toEqual(FOTOS);
    expect(fotosPendientes(null, [])).toEqual([]);
    expect(fotosPendientes([FOTOS[0], FOTOS[0]], [])).toEqual([FOTOS[0]]);
  });
});

describe("mostrar(seccion=fotos)", () => {
  test("manda de a 3 sin repetir hasta agotar", async () => {
    const c = ctx();
    const r1 = await ejecutores.mostrar(c, { productoId: 7, seccion: "fotos" });
    expect(r1.ok).toBe(true);
    expect(tarjetas(c)).toHaveLength(1);
    expect((tarjetas(c)[0] as any).fotos).toEqual(FOTOS.slice(0, 3));

    const r2 = await ejecutores.mostrar(c, { productoId: 7, seccion: "fotos" });
    expect(r2.ok).toBe(true);
    expect((tarjetas(c)[1] as any).fotos).toEqual([FOTOS[3]]);
    expect(r2.mensaje).toMatch(/últimas/);

    const r3 = await ejecutores.mostrar(c, { productoId: 7, seccion: "fotos" });
    expect(r3.ok).toBe(false);
    expect(r3.mensaje).toMatch(/todas las fotos/);
    expect(tarjetas(c)).toHaveLength(2);
  });

  test("la foto de la ficha no se repite en 'más fotos'", async () => {
    const c = ctx();
    await ejecutores.mostrar(c, { productoId: 7, seccion: "completa" });
    const r = await ejecutores.mostrar(c, { productoId: 7, seccion: "fotos" });
    expect(r.ok).toBe(true);
    expect(((tarjetas(c).find((p: any) => p.seccion === "fotos") as any).fotos)).toEqual(FOTOS.slice(1, 4));
  });

  test("sin fotos cargadas no promete lo que no hay", async () => {
    const c = ctx();
    (c.catalogo[0] as Producto).fotos = null;
    const r = await ejecutores.mostrar(c, { productoId: 7, seccion: "fotos" });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/no tiene más fotos/);
    expect(tarjetas(c)).toHaveLength(0);
  });
});

describe("mensajesDeLaFicha con fotos", () => {
  const prod = { name: "Faja" } as any;

  test("cada foto sale como imagen con pie", async () => {
    const out = await mensajesDeLaFicha(prod, { seccion: "fotos", fotos: [FOTOS[1], FOTOS[2]] }, {}, "x");
    expect(out).toHaveLength(2);
    expect(out[0].imagen).toBe(FOTOS[1]);
    expect(out[1].imagen).toBe(FOTOS[2]);
  });

  test("sin fotos en la parte, avisa en vez de romper", async () => {
    const out = await mensajesDeLaFicha(prod, { seccion: "fotos", fotos: [] }, {}, "x");
    expect(out).toHaveLength(1);
    expect(out[0].imagen).toBeUndefined();
  });
});

describe("razonar dudas con datos reales", () => {
  test("datosParaRazonar trae características y FAQ", () => {
    const t = datosParaRazonar(PROD, "completa", []);
    expect(t).toMatch(/Tela fresca/);
    expect(t).toMatch(/posparto/);
  });

  test("puntosDeLaFicha incluye las características", () => {
    expect(puntosDeLaFicha(PROD).join(" ")).toMatch(/Uso diario/);
  });
});
