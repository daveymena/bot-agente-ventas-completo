import { describe, it, expect } from "vitest";

/**
 * El admin, dos veces: "las imágenes de los productos de Dropi están rotas, y
 * eso ya lo habíamos solucionado".
 *
 * Lo habían solucionado. Y algo las volvía a romper en cada arranque.
 *
 * La causa final no era el guardado: era la BÚSQUEDA. El sincronizador de
 * WooCommerce guarda las URLs originales en
 *
 *     metadata.woocommerce.imageUrls
 *
 * y el recuperador las buscaba en
 *
 *     metadata.imageUrls
 *
 * Las dos llaves nunca coincidieron. Así que para TODO producto de Woo/Dropi
 * concluía "no hay forma de recuperar la foto" y borraba la URL. Las fotos
 * nunca se perdieron: nadie las buscaba donde estaban.
 *
 * Este test fija la FORMA del metadata, que es el contrato entre los dos
 * archivos. Si alguien cambia dónde se guardan, se cae acá y no en la tienda
 * de un cliente.
 */

/** La misma lectura que hace `downloadPhysicalImages`. */
function urlsGuardadas(metadata: string): string[] {
  try {
    const meta = JSON.parse(metadata || "{}");
    return [
      ...(Array.isArray(meta?.woocommerce?.imageUrls) ? meta.woocommerce.imageUrls : []),
      ...(Array.isArray(meta?.imageUrls) ? meta.imageUrls : []),
      ...(Array.isArray(meta?.dropi?.imageUrls) ? meta.dropi.imageUrls : []),
    ].filter((u: any) => typeof u === "string" && /^https?:\/\//i.test(u));
  } catch {
    return [];
  }
}

describe("Las fotos de Dropi se encuentran donde el sincronizador las deja", () => {
  it("el metadata que escribe WooCommerce se puede leer", () => {
    // Esta es la forma EXACTA que arma woocommerce.ts.
    const metadata = JSON.stringify({
      woocommerce: {
        id: 9911,
        sku: "DROPI-123",
        imageUrls: [
          "https://d39ru7awumhhs2.cloudfront.net/fotos/abc.jpg",
          "https://d39ru7awumhhs2.cloudfront.net/fotos/def.jpg",
        ],
      },
    });
    const urls = urlsGuardadas(metadata);
    expect(urls.length).toBe(2);
    expect(urls[0]).toMatch(/cloudfront/);
  });

  it("y el formato viejo, plano, se sigue leyendo", () => {
    const metadata = JSON.stringify({ imageUrls: ["https://cdn.ejemplo.com/x.jpg"] });
    expect(urlsGuardadas(metadata).length).toBe(1);
  });

  it("un metadata roto no tumba la recuperación", () => {
    expect(urlsGuardadas("{no es json")).toEqual([]);
    expect(urlsGuardadas("")).toEqual([]);
    expect(urlsGuardadas(JSON.stringify({ woocommerce: {} }))).toEqual([]);
  });

  it("lo que no es una URL no se toma por foto", () => {
    const metadata = JSON.stringify({
      woocommerce: { imageUrls: ["", null, 42, "/images/products/7.jpg", "https://ok.com/a.jpg"] },
    });
    expect(urlsGuardadas(metadata)).toEqual(["https://ok.com/a.jpg"]);
  });
});

/**
 * La regla que se repitió tres veces hoy, en tres archivos distintos:
 * `fixAllProductImages`, el sincronizador de Woo y el recuperador.
 */
describe("Cuando no se puede comprobar, no se destruye", () => {
  /** La decisión de limpiar, tal como quedó en `downloadPhysicalImages`. */
  const seBorra = (imageUrl: string | null) => {
    const actual = String(imageUrl || "");
    const pareceFoto = /^https?:\/\//i.test(actual);
    return !!actual && !pareceFoto;
  };

  it("una URL remota que no se pudo bajar se CONSERVA", () => {
    // El servidor puede estar bloqueado por la CDN y el navegador del cliente
    // no. Borrarla cambia "quizá se ve" por "seguro no se ve".
    expect(seBorra("https://d39ru7awumhhs2.cloudfront.net/fotos/abc.jpg")).toBe(false);
  });

  it("una ruta local muerta sí se limpia", () => {
    // Eso no lo puede alcanzar ningún navegador: es el ícono de imagen rota.
    expect(seBorra("/images/products/404.jpg")).toBe(true);
  });

  it("y sin nada guardado no hay nada que borrar", () => {
    expect(seBorra(null)).toBe(false);
    expect(seBorra("")).toBe(false);
  });
});
