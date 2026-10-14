import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { paqueteDeDisenos, escenasAutomaticas, disenoDePlantilla, validarDiseno, FORMATOS, PAQUETE_POR_DEFECTO, FORMATOS_LISTA, type Contenido, type CapaTexto } from "../estudio-anuncios/diseno";
import { contenidoDelProducto, ctaDeBoton, precioCorto } from "../estudio-anuncios/contenido";
import { renderizarDiseno } from "../estudio-anuncios/render";
import { Cola } from "../estudio-anuncios/cola";
import { CONDICIONES_DE_RESPALDO } from "../modelo-de-negocio";

/**
 * Estudio de anuncios: una petición por producto → paquete de imágenes +
 * vídeo desde sus fotos reales. Regla de la casa: nada se afirma si no está
 * en el producto, y las piezas tienen que salir aunque falte la foto, la IA
 * o el navegador.
 */
const CORRECTOR = {
  id: 7,
  name: "Corrector de postura en X",
  kind: "physical",
  price: 45000,
  currency: "COP",
  description: "Alinea hombros y espalda para que dejes de encorvarte frente al computador.\n🧵 Neopreno acolchado y transpirable\n📏 Ajustable con velcro",
  imageUrl: "/images/products/7.jpg",
  metadata: JSON.stringify({ imagenes: ["/images/products/7.jpg", "https://ejemplo.com/foto2.jpg"] }),
};
const CURSO = { id: 8, name: "Curso de piano completo", kind: "digital", price: 60000, deliveryLink: "https://drive.google.com/x", description: "Aprende a tocar piano desde cero con clases en video paso a paso.\n🎹 19 módulos\n🎼 Partituras incluidas" };

const PROHIBIDO = /descarg|contenido digital|acceso (inmediato y )?permanente|miles de clientes|\+\d+ alumnos|garantizado|el mejor/i;

function textosDe(capas: any[]): string[] {
  return capas.filter((c): c is CapaTexto => c.tipo === "texto").map((c) => c.texto);
}

describe("contenido del anuncio", () => {
  const c = contenidoDelProducto(CORRECTOR, { marca: "TecnoVariedades", color: "#4F46E5", condiciones: CONDICIONES_DE_RESPALDO });

  it("usa solo lo que el producto y el negocio respaldan", () => {
    for (const t of [...c.ganchos, ...c.puntos, c.cta, c.titular]) expect(t).not.toMatch(PROHIBIDO);
    expect(c.puntos.length).toBeGreaterThan(0);
    for (const p of c.puntos) expect(CORRECTOR.description.toLowerCase()).toContain(p.toLowerCase().slice(0, 12));
  });

  it("precio corto, sellos del negocio y botón según el destino", () => {
    expect(c.precio).toBe("$45.000");
    expect(c.sellos.length).toBeGreaterThan(0);
    expect(c.cta).toMatch(/whatsapp/i);
    expect(ctaDeBoton("fisico", "web")).not.toMatch(/whatsapp/i);
    expect(precioCorto({ price: null })).toBeNull();
  });

  it("toma las fotos reales en orden y la marca del negocio", () => {
    expect(c.fotos[0]).toBe("/images/products/7.jpg");
    expect(c.fotos).toHaveLength(2);
    expect(c.marca).toBe("TecnoVariedades");
  });

  it("un digital no promete envío ni pago contra entrega", () => {
    const d = contenidoDelProducto(CURSO, { condiciones: CONDICIONES_DE_RESPALDO });
    expect(d.sellos.join(" ")).not.toMatch(/env[ií]o|recibir/i);
    expect(d.fotos).toEqual([]);
  });

  it("los ganchos aprobados van primero", () => {
    const g = contenidoDelProducto(CORRECTOR, { ganchosExtra: ["¿Te duele la espalda al final del día?"] });
    expect(g.ganchos[0]).toBe("¿Te duele la espalda al final del día?");
  });
});

describe("diseños del paquete", () => {
  const c: Contenido = contenidoDelProducto(CORRECTOR, { marca: "TecnoVariedades", condiciones: CONDICIONES_DE_RESPALDO });
  const piezas = paqueteDeDisenos(c);

  it("plantillas × formatos, con las medidas de Meta", () => {
    // El paquete por defecto sigue siendo el de siempre: 4 maquetas × 3 formatos = 12 piezas.
    expect(piezas).toHaveLength(PAQUETE_POR_DEFECTO.length * FORMATOS_LISTA.length);
    expect(piezas).toHaveLength(12);
    for (const p of piezas) {
      expect(p.diseno.ancho).toBe(FORMATOS[p.formato].ancho);
      expect(p.diseno.alto).toBe(FORMATOS[p.formato].alto);
      expect(validarDiseno(p.diseno)).toBe(true);
    }
  });

  it("todas las capas caben dentro del lienzo", () => {
    for (const p of piezas) for (const k of p.diseno.capas) {
      expect(k.x, `${p.plantilla}/${p.formato}/${k.nombre}`).toBeGreaterThanOrEqual(0);
      expect(k.y, `${p.plantilla}/${p.formato}/${k.nombre}`).toBeGreaterThanOrEqual(0);
      expect(k.x + k.w, `${p.plantilla}/${p.formato}/${k.nombre}`).toBeLessThanOrEqual(p.diseno.ancho + 0.5);
      expect(k.y + k.h, `${p.plantilla}/${p.formato}/${k.nombre}`).toBeLessThanOrEqual(p.diseno.alto + 0.5);
    }
  });

  it("cada texto sale del contenido (no inventa frases)", () => {
    const permitido = [...c.ganchos, ...c.puntos, c.titular, c.nombre, c.cta, c.marca.toUpperCase(), c.marca, c.precio || "", ...c.sellos, "Llévalo por", "pagas al recibir", "Precio"].map((s) => s.toLowerCase());
    for (const p of piezas) for (const t of textosDe(p.diseno.capas)) {
      expect(permitido.some((x) => x && t.toLowerCase().includes(x) || x.includes(t.toLowerCase())), `${p.plantilla}/${p.formato}: "${t}"`).toBe(true);
      expect(t).not.toMatch(PROHIBIDO);
    }
  });

  it("usa la foto real del producto y la rota entre plantillas", () => {
    const fotos = new Set(piezas.flatMap((p) => p.diseno.capas.filter((k) => k.tipo === "imagen").map((k: any) => k.src)));
    expect(fotos.has("/images/products/7.jpg")).toBe(true);
    expect(fotos.size).toBe(2);
  });

  it("sin fotos, el diseño sale igual (sin capa de imagen)", () => {
    const d = disenoDePlantilla("destacado", "historia", { ...c, fotos: [] });
    expect(d.capas.some((k) => k.tipo === "imagen")).toBe(false);
    expect(textosDe(d.capas).length).toBeGreaterThan(1);
  });

  it("valida lo que llega del editor", () => {
    expect(validarDiseno(null)).toBe(false);
    expect(validarDiseno({ formato: "raro", capas: [] })).toBe(false);
    expect(validarDiseno({ formato: "cuadrado", capas: [{ tipo: "texto", x: "a", y: 0, w: 1, h: 1, texto: "Hola" }] })).toBe(false);
    // Un texto sin `texto` o un icono sin referencia tampoco pasan.
    expect(validarDiseno({ formato: "cuadrado", capas: [{ tipo: "texto", x: 0, y: 0, w: 1, h: 1 }] })).toBe(false);
    expect(validarDiseno({ formato: "cuadrado", capas: [{ tipo: "icono", x: 0, y: 0, w: 1, h: 1 }] })).toBe(false);
    expect(validarDiseno({ formato: "cuadrado", capas: [{ tipo: "texto", x: 0, y: 0, w: 1, h: 1, texto: "Hola" }, { tipo: "icono", x: 0, y: 0, w: 1, h: 1, icono: "emoji:fire" }] })).toBe(true);
  });
});

describe("escenas del vídeo", () => {
  const c = contenidoDelProducto(CORRECTOR, { marca: "TecnoVariedades", condiciones: CONDICIONES_DE_RESPALDO });
  const escenas = escenasAutomaticas(c);

  it("gancho → producto → beneficios → precio → cierre, todas 9:16", () => {
    expect(escenas.length).toBeGreaterThanOrEqual(5);
    expect(escenas[0]!.diseno.plantilla).toBe("escena-gancho");
    expect(escenas[escenas.length - 1]!.diseno.plantilla).toBe("escena-cierre");
    for (const e of escenas) {
      expect(e.diseno.ancho).toBe(1080);
      expect(e.diseno.alto).toBe(1920);
      expect(e.duracion).toBeGreaterThan(1);
      expect(e.locucion.length).toBeGreaterThan(0);
    }
  });

  it("la locución no inventa nada", () => {
    for (const e of escenas) expect(e.locucion).not.toMatch(PROHIBIDO);
    expect(escenas.find((e) => e.diseno.plantilla === "escena-precio")!.locucion).toContain("$45.000");
  });
});

describe("render con sharp (sin navegador, sin fuentes del sistema)", () => {
  it("pinta un diseño completo a su tamaño aunque una foto no exista", async () => {
    const c = contenidoDelProducto(CORRECTOR, { marca: "TecnoVariedades", condiciones: CONDICIONES_DE_RESPALDO, fotos: ["/images/products/no-existe-999.jpg"] });
    const d = disenoDePlantilla("destacado", "cuadrado", c);
    const png = await renderizarDiseno(d, { escala: 0.25 });
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(270);
    expect(meta.height).toBe(270);
  }, 30_000);

  it("el texto sí se dibuja (el lienzo no queda liso)", async () => {
    const d = { version: 1 as const, formato: "cuadrado" as const, ancho: 1080, alto: 1080, plantilla: "prueba", capas: [
      { id: "f", tipo: "fondo" as const, x: 0, y: 0, w: 1080, h: 1080, relleno: "#ffffff" },
      { id: "t", tipo: "texto" as const, x: 40, y: 400, w: 1000, h: 200, texto: "Pídelo por WhatsApp", tam: 120, peso: 900 as const, color: "#111827", alinear: "centro" as const, resaltado: "#FFD60A" },
    ] };
    const jpg = await renderizarDiseno(d, { salida: "jpg", escala: 0.2 });
    const { data, info } = await sharp(jpg).greyscale().raw().toBuffer({ resolveWithObject: true });
    let oscuros = 0;
    for (let i = 0; i < info.width * info.height; i++) if (data[i]! < 80) oscuros++;
    expect(oscuros).toBeGreaterThan(200);
  }, 30_000);

  it("una foto que se sale del lienzo se recorta en vez de romper el render", async () => {
    const foto = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const d = { version: 1 as const, formato: "cuadrado" as const, ancho: 400, alto: 400, plantilla: "prueba", capas: [
      { id: "f", tipo: "fondo" as const, x: 0, y: 0, w: 400, h: 400, relleno: "#ffffff" },
      { id: "i", tipo: "imagen" as const, src: "data:image/png;base64," + foto.toString("base64"), ajuste: "cubrir" as const, x: 250, y: -50, w: 300, h: 200, radio: 20, sombra: true },
    ] };
    const png = await renderizarDiseno(d);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(400);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * info.width + x) * info.channels]!;
    expect(px(390, 100)).toBeGreaterThan(200); // rojo donde cae la foto
    expect(px(20, 300)).toBeGreaterThan(240); // blanco fuera de ella
  }, 30_000);
});

describe("cola de trabajos", () => {
  it("reintenta con espera creciente y termina en listo", async () => {
    const esperas: number[] = [];
    const cola = new Cola({ concurrencia: 1, intentos: 3, esperaMs: 10, dormir: async (ms) => { esperas.push(ms); } });
    let veces = 0;
    cola.encolar("a", async () => { veces++; if (veces < 3) throw new Error("todavía no"); return "ok"; });
    const t = await cola.esperar<string>("a")!;
    expect(t.estado).toBe("listo");
    expect(t.resultado).toBe("ok");
    expect(t.intento).toBe(3);
    expect(esperas).toEqual([10, 20]);
  });

  it("agota los intentos y queda en fallo con el último error", async () => {
    const cola = new Cola({ intentos: 2, esperaMs: 0, dormir: async () => {} });
    cola.encolar("b", async () => { throw new Error("sin fotos"); });
    const t = await cola.esperar("b")!;
    expect(t.estado).toBe("fallo");
    expect(t.error).toBe("sin fotos");
    expect(cola.estado("b")?.estado).toBe("fallo");
  });

  it("no duplica una clave en curso y corre de a uno en orden", async () => {
    const orden: string[] = [];
    const cola = new Cola({ concurrencia: 1, intentos: 1 });
    let soltar!: () => void;
    const traba = new Promise<void>((r) => { soltar = r; });
    const t1 = cola.encolar("x", async () => { await traba; orden.push("x"); return 1; });
    const t2 = cola.encolar("x", async () => { orden.push("x-dup"); return 2; });
    cola.encolar("y", async () => { orden.push("y"); return 3; });
    expect(t2.clave).toBe(t1.clave);
    await new Promise((r) => setTimeout(r, 5));
    expect(cola.estado("y")?.estado).toBe("pendiente");
    expect(cola.estado("y")?.posicion).toBe(1);
    soltar();
    await cola.esperar("y");
    expect(orden).toEqual(["x", "y"]);
    expect(cola.resumen().enCurso).toBe(0);
  });

  it("informa el avance que reporta la tarea", async () => {
    const cola = new Cola({ intentos: 1 });
    cola.encolar("p", async (avance) => { avance({ progreso: 40, detalle: "pintando" }); await new Promise((r) => setTimeout(r, 5)); return true; });
    await new Promise((r) => setTimeout(r, 2));
    expect(cola.estado("p")?.progreso).toBe(40);
    expect(cola.estado("p")?.detalle).toBe("pintando");
    const t = await cola.esperar("p")!;
    expect(t.progreso).toBe(100);
  });
});
