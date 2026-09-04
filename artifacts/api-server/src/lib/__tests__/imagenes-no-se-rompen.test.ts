import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { db, products } from "@workspace/db";
import { imageUrlFixer } from "../image-url-fixer";

/**
 * El "arreglador" de imágenes era el que las rompía.
 *
 * El admin lo reportó el 2026-09-02: *"las imágenes de los productos de Dropi
 * están rotas o no se ven, y eso ya lo habíamos solucionado"*. Lo habían
 * solucionado, sí -- y algo lo volvía a romper en cada arranque.
 *
 * `fixAllProductImages` reescribía la URL de TODOS los productos a
 * `/images/products/{id}.jpg`, existiera o no ese archivo. A un producto de
 * Dropi con su foto remota funcionando le pisaba la URL con una ruta local
 * vacía. Y corre en cada arranque: aunque alguien la arreglara a mano, el
 * siguiente reinicio la rompía de nuevo.
 *
 * Por eso "ya lo habíamos solucionado" era cierto y el problema seguía.
 */

const T = 1;
const DIR = process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");
const carpeta = path.join(DIR, "products");

const idsDePrueba = [900001, 900002, 900003];

const limpiar = async () => {
  for (const id of idsDePrueba) {
    await db.delete(products).where(eq(products.id, id));
    const f = path.join(carpeta, `${id}.jpg`);
    if (existsSync(f)) rmSync(f);
  }
};

beforeEach(limpiar);
afterEach(limpiar);

const crear = async (id: number, imageUrl: string | null) => {
  await db.insert(products).values({
    id, tenantId: T, name: `Prueba ${id}`, description: "x",
    price: "1000", currency: "COP", kind: "physical", imageUrl,
  } as any);
};

const urlDe = async (id: number) => {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  return p?.imageUrl ?? null;
};

describe("el arreglador no rompe lo que funciona", () => {
  it("NO pisa una URL remota cuando no hay archivo local", () => {
    // Es el caso exacto de Dropi: la foto vive en su CDN, acá no hay nada, y
    // reescribirla a una ruta local vacía la deja rota.
    return (async () => {
      await crear(900001, "https://cdn.dropi.co/foto-real.jpg");
      await imageUrlFixer.fixAllProductImages(T);
      expect(await urlDe(900001)).toBe("https://cdn.dropi.co/foto-real.jpg");
    })();
  });

  it("SÍ apunta a la ruta local cuando el archivo existe de verdad", async () => {
    if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true });
    writeFileSync(path.join(carpeta, "900002.jpg"), Buffer.alloc(2048, 1));
    await crear(900002, "https://cdn.dropi.co/vieja.jpg");
    await imageUrlFixer.fixAllProductImages(T);
    expect(await urlDe(900002)).toBe("/images/products/900002.jpg");
  });

  it("sin archivo Y sin URL, no inventa una ruta", async () => {
    // Poner una ruta que no existe solo cambia "sin foto" por "foto rota". El
    // campo vacío deja que la tienda dibuje su marcador de posición.
    await crear(900003, null);
    await imageUrlFixer.fixAllProductImages(T);
    expect(await urlDe(900003)).toBeNull();
  });
});
