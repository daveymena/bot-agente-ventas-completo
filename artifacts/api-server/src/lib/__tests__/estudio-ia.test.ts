/**
 * Espacio de IA del Estudio: siempre SOBRE la foto real.
 *  - Sin claves: lo dice y no llama a nadie.
 *  - Con claves (fetch simulado): la foto real viaja en la petición, la
 *    máscara protege el producto en OpenAI y la instrucción exige fidelidad.
 *  - Recortes aplicados a diseños y escenas "vivas" (movimiento interno,
 *    cámara variada, partículas del tema) sin pisar lo que ya venía.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { elegirProveedor, hayIAConfigurada, imagenConIA, instruccionFiel, proveedoresDeIA, videoConIA } from "../estudio-anuncios/ia";
import { ambienteDeTema, aplicarRecortes, darVidaAEscenas } from "../estudio-anuncios/plantillas";
import { escenasAutomaticas, disenoDePlantilla, type Contenido, type Escena } from "../estudio-anuncios/diseno";

const VARS = ["OPENAI_API_KEY", "AI_INTEGRATIONS_OPENAI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "REPLICATE_API_TOKEN", "REPLICATE_API_KEY"];
const guardado: Record<string, string | undefined> = {};
beforeEach(() => { for (const v of VARS) { guardado[v] = process.env[v]; delete process.env[v]; } process.env.ESTUDIO_IA_SONDEO_MS = "1"; });
afterEach(() => { for (const v of VARS) { if (guardado[v] === undefined) delete process.env[v]; else process.env[v] = guardado[v]; } vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const foto = async () => sharp({ create: { width: 640, height: 800, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
const png1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const C: Contenido = {
  nombre: "Botella térmica 1 L", titular: "Botella térmica 1 L", ganchos: ["Fría 24 h"], puntos: ["Acero inoxidable", "1 litro"], precio: "$ 89.900", sellos: ["Envío gratis"], cta: "Pídela por WhatsApp",
  marca: "Tienda", color: "#4f46e5", fotos: ["/images/products/a.jpg", "/images/products/b.jpg"],
  recortes: { "/images/products/a.jpg": { url: "/uploads/anuncios/1/recortes/abc.png", confianza: 0.95 } },
};

describe("IA sobre la foto real — sin claves", () => {
  it("es honesta: ningún proveedor configurado y los errores dicen qué variable falta", async () => {
    expect(proveedoresDeIA().every((p) => !p.configurado)).toBe(true);
    expect(hayIAConfigurada()).toBe(false);
    expect(elegirProveedor("imagen")).toBeNull();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(imagenConIA({ foto: await foto(), instruccion: "mesa de madera", producto: "Botella", ancho: 640, alto: 800 })).rejects.toThrow(/OPENAI_API_KEY|GOOGLE_API_KEY|REPLICATE_API_TOKEN/);
    await expect(videoConIA({ foto: await foto(), instruccion: "", producto: "Botella" })).rejects.toThrow(/GOOGLE_API_KEY|REPLICATE_API_TOKEN/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("la instrucción de fidelidad protege el producto y lleva el pedido del dueño tal cual", () => {
    const t = instruccionFiel("Botella térmica", "sobre una mesa de madera", "imagen");
    expect(t).toContain('"Botella térmica"');
    expect(t).toMatch(/EXACTLY/);
    expect(t).toMatch(/Do not add text/);
    expect(t).toContain('"sobre una mesa de madera"');
    expect(instruccionFiel("X", "", "video")).toMatch(/camera motion/);
  });
});

describe("IA sobre la foto real — proveedores (fetch simulado)", () => {
  it("OpenAI: manda la foto real + la máscara al endpoint de edición y devuelve la imagen", async () => {
    process.env.OPENAI_API_KEY = "sk-prueba";
    const prov = elegirProveedor("imagen", null, true);
    expect(prov?.id).toBe("openai");
    const salida = (await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ff0000" } }).png().toBuffer()).toString("base64");
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe("https://api.openai.com/v1/images/edits");
      expect(init.headers.Authorization).toBe("Bearer sk-prueba");
      const fd = init.body as FormData;
      expect(fd.get("model")).toBe("gpt-image-1");
      expect(String(fd.get("prompt"))).toContain('"Botella"');
      expect(String(fd.get("prompt"))).toContain('"mesa de madera"');
      expect(fd.get("size")).toBe("1024x1536");
      expect((fd.get("image") as Blob).size).toBeGreaterThan(100);
      expect((fd.get("mask") as Blob).size).toBeGreaterThan(10);
      return new Response(JSON.stringify({ data: [{ b64_json: salida }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await imagenConIA({ foto: await foto(), mascara: png1x1, instruccion: "mesa de madera", producto: "Botella", ancho: 640, alto: 800 });
    expect(r.proveedor).toBe("openai");
    expect(r.mime).toBe("image/png");
    expect((await sharp(r.buffer).metadata()).width).toBe(64);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Gemini: la foto va como inline_data y se exige IMAGE en la respuesta; Veo se sondea hasta done y descarga el vídeo", async () => {
    process.env.GOOGLE_API_KEY = "g-prueba";
    const llamadas: string[] = [];
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const u = String(url); llamadas.push(u);
      if (u.includes(":generateContent")) {
        const body = JSON.parse(init.body);
        expect(body.contents[0].parts.some((p: any) => p.inline_data?.mime_type === "image/jpeg" && p.inline_data.data.length > 100)).toBe(true);
        expect(body.generationConfig.responseModalities).toContain("IMAGE");
        expect(init.headers["x-goog-api-key"]).toBe("g-prueba");
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "listo" }, { inlineData: { mimeType: "image/png", data: png1x1.toString("base64") } }] } }] }), { status: 200 });
      }
      if (u.includes(":predictLongRunning")) {
        const body = JSON.parse(init.body);
        expect(body.instances[0].image.bytesBase64Encoded.length).toBeGreaterThan(100);
        expect(body.parameters.aspectRatio).toBe("9:16");
        return new Response(JSON.stringify({ name: "models/veo/operations/op1" }), { status: 200 });
      }
      if (u.endsWith("/operations/op1")) {
        return new Response(JSON.stringify(llamadas.filter((x) => x.endsWith("/operations/op1")).length < 2 ? { done: false } : { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://descarga/vid.mp4" } }] } } }), { status: 200 });
      }
      if (u === "https://descarga/vid.mp4") { expect(init.headers["x-goog-api-key"]).toBe("g-prueba"); return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { status: 200 }); }
      throw new Error(`URL inesperada ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const img = await imagenConIA({ foto: await foto(), instruccion: "", producto: "Botella", ancho: 640, alto: 800, proveedor: "gemini" });
    expect(img.proveedor).toBe("gemini");
    expect(img.buffer.equals(png1x1)).toBe(true);
    const vid = await videoConIA({ foto: await foto(), instruccion: "luz de tarde", producto: "Botella", duracion: 6 });
    expect(vid.proveedor).toBe("gemini");
    expect(vid.mime).toBe("video/mp4");
    expect(vid.buffer.length).toBe(8);
    expect(llamadas.filter((x) => x.endsWith("/operations/op1")).length).toBe(2);
  });

  it("Replicate: FLUX Kontext recibe la foto como input_image y se sondea la predicción", async () => {
    process.env.REPLICATE_API_TOKEN = "r8-prueba";
    let sondeos = 0;
    const fetchMock = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u === "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions") {
        expect(init.headers.Prefer).toBe("wait=60");
        const body = JSON.parse(init.body);
        expect(body.input.input_image).toMatch(/^data:image\/jpeg;base64,/);
        expect(body.input.aspect_ratio).toBe("match_input_image");
        return new Response(JSON.stringify({ id: "p1", status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p1" } }), { status: 201 });
      }
      if (u === "https://api.replicate.com/v1/predictions/p1") { sondeos++; return new Response(JSON.stringify({ id: "p1", status: sondeos < 2 ? "processing" : "succeeded", output: ["https://replicate.delivery/out.png"] }), { status: 200 }); }
      if (u === "https://replicate.delivery/out.png") return new Response(new Uint8Array(png1x1), { status: 200 });
      throw new Error(`URL inesperada ${u}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await imagenConIA({ foto: await foto(), instruccion: "fondo de estudio", producto: "Botella", ancho: 640, alto: 800 });
    expect(r.proveedor).toBe("replicate");
    expect(r.modelo).toBe("black-forest-labs/flux-kontext-pro");
    expect(r.buffer.equals(png1x1)).toBe(true);
    expect(sondeos).toBe(2);
  });

  it("si el proveedor falla, el error llega con su texto y sin tumbar nada", async () => {
    process.env.OPENAI_API_KEY = "sk-prueba";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "billing hard limit reached" } }), { status: 429, statusText: "Too Many Requests" })));
    await expect(imagenConIA({ foto: await foto(), instruccion: "", producto: "Botella", ancho: 640, alto: 800 })).rejects.toThrow(/OpenAI: 429.*billing/);
  });
});

describe("Recortes y producto vivo en diseños y escenas", () => {
  it("aplicarRecortes cambia solo las vitrinas 'contener' por el PNG sin fondo (con sombra, sin esquinas)", () => {
    const d = disenoDePlantilla("destacado", "vertical", C, { estilo: "pop", tema: "ninguno" });
    const r = aplicarRecortes(d, C);
    const fotos = r.capas.filter((k) => k.tipo === "imagen");
    expect(fotos.length).toBeGreaterThan(0);
    for (const k of fotos) {
      if (k.tipo !== "imagen") continue;
      if (k.ajuste === "contener" && k.src === "/uploads/anuncios/1/recortes/abc.png") { expect(k.recortada).toBe(true); expect(k.sombra).toBe(true); expect(k.radio).toBe(0); }
      else expect(k.recortada).toBeFalsy();
    }
    expect(aplicarRecortes(d, { ...C, recortes: undefined })).toBe(d);
    expect(aplicarRecortes(r, C)).toBe(r);
    // El fondo "foto difuminada" de esa misma foto se cambia por un degradado del color de la marca
    // (una foto de estudio difuminada queda gris y deja un fantasma del producto detrás del recorte).
    const conFoto = disenoDePlantilla("destacado", "vertical", C, { estilo: "marca", tema: "ninguno" });
    const fondoAntes = conFoto.capas.find((k) => k.tipo === "fondo");
    if (fondoAntes?.tipo === "fondo" && fondoAntes.imagen) {
      const fondo = aplicarRecortes(conFoto, C).capas.find((k) => k.tipo === "fondo");
      expect(fondo?.tipo === "fondo" && fondo.imagen).toBeFalsy();
      expect(fondo?.tipo === "fondo" && typeof fondo.relleno === "object" && "degradado" in fondo.relleno).toBe(true);
    }
  });

  it("darVidaAEscenas: el producto flota/late, el sello late, las decoraciones se mueven, la cámara varía y el tema trae partículas", () => {
    const escenas = escenasAutomaticas(C, { guion: "clasico", estilo: "pop", tema: "navidad" }).map((e) => ({ ...e, diseno: aplicarRecortes(e.diseno, C) }));
    const vivas = darVidaAEscenas(escenas, { tema: "navidad" });
    expect(vivas.length).toBe(escenas.length);
    const conMovimiento = vivas.flatMap((e) => e.diseno.capas).filter((k) => k.anim?.movimiento);
    expect(conMovimiento.length).toBeGreaterThan(3);
    const fotos = vivas.flatMap((e) => e.diseno.capas).filter((k) => k.tipo === "imagen" && (k as any).recortada);
    expect(fotos.length).toBeGreaterThan(0);
    for (const f of fotos) expect(["flotar", "latido"]).toContain(f.anim?.movimiento);
    const sellos = vivas.flatMap((e) => e.diseno.capas).filter((k) => /sello de precio/i.test(k.nombre || ""));
    for (const s of sellos) expect(s.anim?.movimiento).toBe("latido");
    const camaras = new Set(vivas.map((e) => e.movimiento));
    expect(camaras.size).toBeGreaterThan(1);
    expect(vivas.every((e) => e.ambiente === "nieve")).toBe(true);
    // Idempotente y respetuosa con lo configurado.
    const otra = darVidaAEscenas(vivas.map((e, i): Escena => (i === 0 ? { ...e, ambiente: null, movimiento: "balanceo" } : e)), { tema: "navidad" });
    expect(otra[0]!.ambiente).toBeNull();
    expect(otra[0]!.movimiento).toBe("balanceo");
    expect(JSON.stringify(otra.slice(1))).toBe(JSON.stringify(vivas.slice(1)));
    expect(ambienteDeTema("amor")).toBe("corazones");
    expect(ambienteDeTema("ninguno")).toBeNull();
  });
});
