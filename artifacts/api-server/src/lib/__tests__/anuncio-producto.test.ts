/**
 * Reproducción del incidente del 2026-08-22 12:06 (hora Colombia).
 *
 * Un cliente hizo clic en un anuncio de Instagram del *Curso de Piano* y el
 * bot le ofreció un *Cojín Moto Viajero 3D*, y después un *Pack Contabilidad*.
 * Ninguno de los dos tenía nada que ver con el anuncio que se pagó para
 * traerlo.
 *
 * Meta manda el MISMO texto ("¡Hola! Quiero más información") para todos los
 * anuncios: el dato que dice a qué le hizo clic viaja aparte, en el
 * `externalAdReply`. O sea que el texto del cliente no alcanza nunca, y si el
 * contexto del anuncio se pierde, lo único que queda es adivinar.
 */
import { describe, it, expect } from "vitest";
import { findBestProductMatch, mensajeNombraProducto } from "../conversation-engine";

// Un catálogo mezclado como el real: digitales, físicos y de temas dispares.
const CATALOGO = [
  { id: 163, name: "Cojín Moto Viajero 3D", description: "Sillín Cojín Moto Viajero 3D Confort, para una conducción inigualable en viajes largos.", category: "Hogar", categoryId: 1 },
  { id: 87, name: "Pack Contabilidad", description: "Principios contables, registros, estados financieros y declaraciones. Ideal para emprendedores.", category: "Megapacks", categoryId: 2 },
  { id: 311, name: "Curso de Piano Completo", description: "Aprende a tocar piano desde cero, a tu ritmo y sin leer partituras.", category: "Cursos", categoryId: 3 },
  { id: 92, name: "Megapack Excel Avanzado", description: "Tablas dinámicas, macros y fórmulas avanzadas.", category: "Megapacks", categoryId: 2 },
];
const CATEGORIAS = new Map([[1, "Hogar"], [2, "Megapacks"], [3, "Cursos"]]);

// El texto exacto que Meta autocompleta, idéntico para TODOS los anuncios.
const TEXTO_DE_META = "¡Hola! Quiero más información";

describe("Cliente que llega de un anuncio pago", () => {
  it("el texto de Meta por sí solo NO puede elegir producto: debe devolver null", async () => {
    const r = await findBestProductMatch(TEXTO_DE_META, CATALOGO, CATEGORIAS);

    // Si devuelve algo, es una adivinanza: ese texto no nombra ningún producto.
    // Mostrarle un cojín de moto a quien vino por un curso de piano es peor
    // que decirle "contame qué buscás".
    expect(r).toBeNull();
  });

  it("con el titular del anuncio pegado al texto, encuentra el producto del anuncio", async () => {
    // Es lo que hace agent.ts: lastText + anuncio.titulo + anuncio.cuerpo
    const conAnuncio = `${TEXTO_DE_META} Curso de Piano Completo Aprende a tocar desde cero`;
    const r = await findBestProductMatch(conAnuncio, CATALOGO, CATEGORIAS);

    expect(r).not.toBeNull();
    expect(r!.product.id).toBe(311);
  });

  it("un saludo suelto tampoco elige producto", async () => {
    expect(await findBestProductMatch("hola", CATALOGO, CATEGORIAS)).toBeNull();
    expect(await findBestProductMatch("buenas, información por favor", CATALOGO, CATEGORIAS)).toBeNull();
  });

  it("cuando el cliente SÍ nombra algo, lo sigue encontrando", async () => {
    const piano = await findBestProductMatch("quiero el curso de piano", CATALOGO, CATEGORIAS);
    expect(piano?.product.id).toBe(311);

    const cojin = await findBestProductMatch("el cojín de la moto", CATALOGO, CATEGORIAS);
    expect(cojin?.product.id).toBe(163);

    const conta = await findBestProductMatch("pack de contabilidad", CATALOGO, CATEGORIAS);
    expect(conta?.product.id).toBe(87);
  });
});

describe("Distinguir 'no tengo eso' de 'todavia no pidio nada'", () => {
  it("el texto de Meta NO nombra producto", () => {
    expect(mensajeNombraProducto(TEXTO_DE_META)).toBe(false);
  });

  it("un saludo o un gracias tampoco", () => {
    expect(mensajeNombraProducto("hola")).toBe(false);
    expect(mensajeNombraProducto("buenas tardes")).toBe(false);
    expect(mensajeNombraProducto("gracias!")).toBe(false);
    expect(mensajeNombraProducto("quiero info")).toBe(false);
  });

  it("pero un producto inexistente SI lo nombra: ahi corresponde decir que no se maneja", () => {
    expect(mensajeNombraProducto("tienen saxofon?")).toBe(true);
    expect(mensajeNombraProducto("busco un curso de aleman")).toBe(true);
  });

  it("y un producto real tambien", () => {
    expect(mensajeNombraProducto("el cojin de la moto")).toBe(true);
    expect(mensajeNombraProducto("curso de piano")).toBe(true);
  });
});
