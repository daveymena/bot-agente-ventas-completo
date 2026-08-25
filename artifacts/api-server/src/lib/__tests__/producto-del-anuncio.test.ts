import { describe, it, expect } from "vitest";
import { productoDelAnuncio } from "../agent";

/**
 * El producto del anuncio se resolvia SOLO por parecido de texto, con una
 * unica via dura: un link con ID numerico (/p/123). Los productos reales
 * vienen de WooCommerce y sus links son por SLUG, asi que esa via nunca
 * enganchaba y todo quedaba en manos del parecido.
 *
 * Con dos productos del MISMO nombre en el catalogo (ids 125 y 128, $37.950 y
 * $33.000) el parecido no puede acertar: es una moneda al aire sobre cual
 * cotizarle al cliente.
 *
 * La via del adId contra facebook_drafts consulta la BD real, asi que no se
 * cubre aca; estas pruebas fijan la resolucion por LINK, que es la que estaba
 * rota y la que se puede probar sin datos cargados.
 */
const CATALOGO = [
  {
    id: 128, name: "Renovador Negro Perfecto x 200ml", price: 33000,
    metadata: { woocommerce: { permalink: "https://tienda.test/producto/renovador-negro-perfecto-x-200ml/" } },
  },
  {
    id: 125, name: "Renovador Negro Perfecto x 200ml", price: 37950,
    metadata: { woocommerce: { permalink: "https://tienda.test/producto/renovador-negro-perfecto-x-200ml-2/" } },
  },
  { id: 123, name: "Curso de Piano Completo", price: 20000, metadata: {} },
];

describe("el producto del anuncio se resuelve por dato duro", () => {
  it("un link de WooCommerce por slug ya no se pierde", async () => {
    const r = await productoDelAnuncio(
      { url: "https://tienda.test/producto/renovador-negro-perfecto-x-200ml/" }, CATALOGO);
    expect(r?.id).toBe(128);
    expect(r?.via).toBe("url-slug");
  });

  it("distingue dos productos cuyo slug es prefijo del otro", async () => {
    const r = await productoDelAnuncio(
      { url: "https://tienda.test/producto/renovador-negro-perfecto-x-200ml-2/" }, CATALOGO);
    expect(r?.id).toBe(125);
  });

  it("el slug corto no se lleva al producto '-2' aunque venga primero", async () => {
    // El caso que de verdad distingue comparar el segmento COMPLETO de
    // comparar por "contiene": el permalink de 125 CONTIENE el slug de 128
    // como prefijo. Con includes() y 125 primero en la lista, el cliente que
    // hizo clic en el de $33.000 recibe la cotizacion del de $37.950.
    const alReves = [CATALOGO[1]!, CATALOGO[0]!, CATALOGO[2]!];
    const r = await productoDelAnuncio(
      { url: "https://tienda.test/producto/renovador-negro-perfecto-x-200ml/" }, alReves);
    expect(r?.id).toBe(128);
  });

  it("un link con id numerico sigue funcionando", async () => {
    const r = await productoDelAnuncio({ url: "https://tienda.test/p/123" }, CATALOGO);
    expect(r?.id).toBe(123);
    expect(r?.via).toBe("url-id");
  });

  it("sin anuncio no inventa nada", async () => {
    expect(await productoDelAnuncio(null, CATALOGO)).toBeNull();
  });

  it("si nada resuelve devuelve null y decide el motor por texto", async () => {
    expect(await productoDelAnuncio({ url: "https://facebook.com/algo" }, CATALOGO)).toBeNull();
  });

  it("un slug que no esta en el catalogo no engancha con otro producto", async () => {
    expect(await productoDelAnuncio({ url: "https://tienda.test/producto/gorra-negra/" }, CATALOGO)).toBeNull();
  });
});
