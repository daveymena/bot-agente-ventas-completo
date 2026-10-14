/**
 * IA sobre la foto REAL del producto — el "espacio de IA" del Estudio.
 *
 * Regla de oro: la IA nunca inventa el producto. Toda petición parte de la
 * foto real (normalizada por `recorte.ts`) y, cuando el proveedor lo permite,
 * de una máscara que protege los píxeles del producto. Lo que la IA aporta es
 * el ENTORNO (fondo, mesa, luz, escenario) o el MOVIMIENTO (vídeo a partir de
 * la foto). Después, `estudio.ts` verifica la fidelidad y, si el producto
 * sigue en su sitio, vuelve a pegar encima el recorte original.
 *
 * Proveedores (todos opcionales, por variables de entorno; sin clave el
 * Estudio sigue funcionando en local y lo dice con claridad):
 *  - OpenAI  `OPENAI_API_KEY`          imágenes con máscara (images/edits)
 *  - Gemini  `GOOGLE_API_KEY`          imágenes (modelo de imagen) y vídeo (Veo)
 *  - Replicate `REPLICATE_API_TOKEN`   imágenes (FLUX Kontext) y vídeo (Kling)
 *
 * Los modelos se cambian con `ESTUDIO_IA_MODELO_IMAGEN_<PROVEEDOR>` y
 * `ESTUDIO_IA_MODELO_VIDEO_<PROVEEDOR>`. No se usa ningún SDK: `fetch` plano,
 * para que el servidor no cargue nada cuando no hay claves.
 */

export type ProveedorId = "openai" | "gemini" | "replicate";

export interface ProveedorIA {
  id: ProveedorId;
  nombre: string;
  /** Variable de entorno que lo activa. */
  variable: string;
  configurado: boolean;
  imagen: boolean;
  video: boolean;
  /** true cuando el proveedor acepta máscara: el producto queda protegido por construcción. */
  conMascara: boolean;
  modeloImagen: string;
  modeloVideo: string | null;
}

export interface PedidoImagenIA {
  /** Foto real del producto (JPEG/PNG, ≤ 2500 px de lado). */
  foto: Buffer;
  /** PNG RGBA del tamaño de la foto: alfa 255 = conservar (producto), 0 = la IA puede pintar. */
  mascara?: Buffer | null;
  instruccion: string;
  producto: string;
  ancho: number;
  alto: number;
  proveedor?: ProveedorId | null;
  timeoutMs?: number;
}

export interface PedidoVideoIA {
  foto: Buffer;
  instruccion: string;
  producto: string;
  /** Segundos (los proveedores aceptan 4–10). */
  duracion?: number;
  proveedor?: ProveedorId | null;
  timeoutMs?: number;
}

export interface ResultadoIA {
  buffer: Buffer;
  mime: "image/png" | "image/jpeg" | "video/mp4";
  proveedor: ProveedorId;
  modelo: string;
  ms: number;
}

const env = (k: string) => String(process.env[k] || "").trim();
const claveOpenAI = () => env("OPENAI_API_KEY") || env("AI_INTEGRATIONS_OPENAI_API_KEY");
const claveGemini = () => env("GOOGLE_API_KEY") || env("GEMINI_API_KEY");
const claveReplicate = () => env("REPLICATE_API_TOKEN") || env("REPLICATE_API_KEY");

export function proveedoresDeIA(): ProveedorIA[] {
  return [
    { id: "openai", nombre: "OpenAI (imágenes con máscara)", variable: "OPENAI_API_KEY", configurado: !!claveOpenAI(), imagen: true, video: false, conMascara: true, modeloImagen: env("ESTUDIO_IA_MODELO_IMAGEN_OPENAI") || "gpt-image-1", modeloVideo: null },
    { id: "gemini", nombre: "Google Gemini / Veo", variable: "GOOGLE_API_KEY", configurado: !!claveGemini(), imagen: true, video: true, conMascara: false, modeloImagen: env("ESTUDIO_IA_MODELO_IMAGEN_GEMINI") || "gemini-2.5-flash-image", modeloVideo: env("ESTUDIO_IA_MODELO_VIDEO_GEMINI") || "veo-3.1-fast-generate-preview" },
    { id: "replicate", nombre: "Replicate (FLUX Kontext / Kling)", variable: "REPLICATE_API_TOKEN", configurado: !!claveReplicate(), imagen: true, video: true, conMascara: false, modeloImagen: env("ESTUDIO_IA_MODELO_IMAGEN_REPLICATE") || "black-forest-labs/flux-kontext-pro", modeloVideo: env("ESTUDIO_IA_MODELO_VIDEO_REPLICATE") || "kwaivgi/kling-v2.1" },
  ];
}

/** Proveedor a usar para un tipo de trabajo: el pedido si sirve, si no el primero configurado que sirva. */
export function elegirProveedor(tipo: "imagen" | "video", pedido?: ProveedorId | null, conMascara?: boolean): ProveedorIA | null {
  const lista = proveedoresDeIA().filter((p) => p.configurado && p[tipo]);
  if (pedido) return lista.find((p) => p.id === pedido) || null;
  // Para imágenes, si hay máscara se prefiere quien la respeta por construcción.
  if (tipo === "imagen" && conMascara) return lista.find((p) => p.conMascara) || lista[0] || null;
  return lista[0] || null;
}

export function hayIAConfigurada(tipo?: "imagen" | "video"): boolean {
  return proveedoresDeIA().some((p) => p.configurado && (!tipo || p[tipo]));
}

/**
 * Instrucción que acompaña SIEMPRE a la foto: deja claro al modelo qué puede
 * tocar (entorno, luz, cámara) y qué no (el producto, su forma, color, textos
 * y logotipos). La instrucción del dueño va entre comillas, tal cual.
 */
export function instruccionFiel(producto: string, instruccion: string, tipo: "imagen" | "video"): string {
  const base = `This is a real photo of the product "${producto}" that is for sale. The product must stay EXACTLY as it is in the photo: same shape, colours, proportions, labels, printed text and logos. Do not add text, watermarks, logos, extra products or people. Do not redraw or reinterpret the product.`;
  const deseo = instruccion.trim() ? `Requested scene: "${instruccion.trim()}".` : "";
  if (tipo === "video") {
    return `${base} Animate the photo into a short vertical product video: subtle, realistic camera motion (slow push-in, gentle parallax, soft light sweep) and ambient details only. The product remains the fixed, recognisable hero of every frame. ${deseo}`.trim();
  }
  return `${base} Only change the environment around it (background, surface, lighting, shadows, atmosphere) so it looks like a professional product advertisement. Keep the product in the same position and size. ${deseo}`.trim();
}

function limiteTiempo(ms: number): AbortSignal { return AbortSignal.timeout(Math.max(5_000, ms)); }
/** Intervalo entre sondeos a los proveedores (los tests lo bajan). */
const sondeoMs = () => Math.max(1, Number(env("ESTUDIO_IA_SONDEO_MS")) || 8_000);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function leerError(res: Response): Promise<string> {
  let texto = "";
  try { texto = (await res.text()).slice(0, 400); } catch { /* sin cuerpo */ }
  return `${res.status} ${res.statusText}${texto ? `: ${texto}` : ""}`;
}

/** Tamaño admitido por OpenAI más parecido a la foto (la respuesta se reescala después al tamaño original). */
function tamanoOpenAI(ancho: number, alto: number): string {
  const r = ancho / Math.max(1, alto);
  if (r > 1.2) return "1536x1024";
  if (r < 0.83) return "1024x1536";
  return "1024x1024";
}

// ─── OpenAI: images/edits con máscara ────────────────────────────────────────

async function imagenOpenAI(p: PedidoImagenIA, modelo: string): Promise<Buffer> {
  const fd = new FormData();
  fd.append("model", modelo);
  fd.append("prompt", instruccionFiel(p.producto, p.instruccion, "imagen"));
  fd.append("size", tamanoOpenAI(p.ancho, p.alto));
  fd.append("quality", env("ESTUDIO_IA_CALIDAD_OPENAI") || "medium");
  fd.append("n", "1");
  fd.append("image", new Blob([new Uint8Array(p.foto)], { type: "image/png" }), "producto.png");
  if (p.mascara) fd.append("mask", new Blob([new Uint8Array(p.mascara)], { type: "image/png" }), "mascara.png");
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${claveOpenAI()}` }, body: fd, signal: limiteTiempo(p.timeoutMs ?? 180_000) });
  if (!res.ok) throw new Error(`OpenAI: ${await leerError(res)}`);
  const j: any = await res.json();
  const b64 = j?.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");
  const url = j?.data?.[0]?.url;
  if (url) return descargar(url, p.timeoutMs ?? 180_000);
  throw new Error("OpenAI no devolvió imagen.");
}

// ─── Gemini: generateContent con imagen de entrada / Veo: predictLongRunning ─

async function imagenGemini(p: PedidoImagenIA, modelo: string): Promise<Buffer> {
  const cuerpo = {
    contents: [{ parts: [
      { text: instruccionFiel(p.producto, p.instruccion, "imagen") },
      { inline_data: { mime_type: "image/jpeg", data: p.foto.toString("base64") } },
    ] }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": claveGemini() }, body: JSON.stringify(cuerpo), signal: limiteTiempo(p.timeoutMs ?? 180_000),
  });
  if (!res.ok) throw new Error(`Gemini: ${await leerError(res)}`);
  const j: any = await res.json();
  const partes: any[] = j?.candidates?.[0]?.content?.parts || [];
  const img = partes.find((x) => x?.inlineData?.data || x?.inline_data?.data);
  const data = img?.inlineData?.data || img?.inline_data?.data;
  if (!data) {
    const texto = partes.map((x) => x?.text).filter(Boolean).join(" ").slice(0, 200);
    throw new Error(`Gemini no devolvió imagen${texto ? ` (${texto})` : ""}.`);
  }
  return Buffer.from(data, "base64");
}

async function videoGemini(p: PedidoVideoIA, modelo: string): Promise<Buffer> {
  const clave = claveGemini();
  const inicio = Date.now();
  const limite = p.timeoutMs ?? 8 * 60_000;
  const cuerpo = {
    instances: [{ prompt: instruccionFiel(p.producto, p.instruccion, "video"), image: { bytesBase64Encoded: p.foto.toString("base64"), mimeType: "image/jpeg" } }],
    parameters: { aspectRatio: "9:16", durationSeconds: Math.min(8, Math.max(4, Math.round(p.duracion ?? 6))), numberOfVideos: 1 },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:predictLongRunning`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": clave }, body: JSON.stringify(cuerpo), signal: limiteTiempo(60_000),
  });
  if (!res.ok) throw new Error(`Veo: ${await leerError(res)}`);
  const op: any = await res.json();
  const nombre = op?.name;
  if (!nombre) throw new Error("Veo no devolvió la operación.");
  // Sondeo hasta que termine (los vídeos tardan 1–6 min).
  while (Date.now() - inicio < limite) {
    await esperar(sondeoMs());
    const s = await fetch(`https://generativelanguage.googleapis.com/v1beta/${nombre}`, { headers: { "x-goog-api-key": clave }, signal: limiteTiempo(30_000) });
    if (!s.ok) throw new Error(`Veo (estado): ${await leerError(s)}`);
    const j: any = await s.json();
    if (j?.error) throw new Error(`Veo: ${j.error.message || JSON.stringify(j.error).slice(0, 200)}`);
    if (!j?.done) continue;
    const muestra = j?.response?.generateVideoResponse?.generatedSamples?.[0] || j?.response?.generatedVideos?.[0] || j?.response?.videos?.[0];
    const uri = muestra?.video?.uri || muestra?.uri;
    const b64 = muestra?.video?.bytesBase64Encoded || muestra?.bytesBase64Encoded;
    if (b64) return Buffer.from(b64, "base64");
    if (uri) return descargar(uri, 120_000, { "x-goog-api-key": clave });
    throw new Error("Veo terminó sin vídeo (¿filtro de seguridad?).");
  }
  throw new Error("Veo tardó demasiado; vuelve a intentarlo.");
}

// ─── Replicate: predicciones con sondeo ──────────────────────────────────────

async function prediccionReplicate(modelo: string, input: Record<string, unknown>, timeoutMs: number): Promise<any> {
  const token = claveReplicate();
  const inicio = Date.now();
  const [owner, rest] = modelo.split("/");
  if (!owner || !rest) throw new Error(`Modelo de Replicate inválido: ${modelo}`);
  const [name, version] = rest.split(":");
  const url = version ? "https://api.replicate.com/v1/predictions" : `https://api.replicate.com/v1/models/${owner}/${name}/predictions`;
  const cuerpo = version ? { version, input } : { input };
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=60" }, body: JSON.stringify(cuerpo), signal: limiteTiempo(90_000) });
  if (!res.ok) throw new Error(`Replicate: ${await leerError(res)}`);
  let pred: any = await res.json();
  while (pred?.status !== "succeeded") {
    if (pred?.status === "failed" || pred?.status === "canceled") throw new Error(`Replicate: ${pred?.error || pred.status}`);
    if (Date.now() - inicio > timeoutMs) throw new Error("Replicate tardó demasiado; vuelve a intentarlo.");
    await esperar(sondeoMs());
    const s = await fetch(pred?.urls?.get || `https://api.replicate.com/v1/predictions/${pred?.id}`, { headers: { Authorization: `Bearer ${token}` }, signal: limiteTiempo(30_000) });
    if (!s.ok) throw new Error(`Replicate (estado): ${await leerError(s)}`);
    pred = await s.json();
  }
  return pred.output;
}

function primeraSalida(output: any): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return typeof output[0] === "string" ? output[0] : output[0]?.url || null;
  return output.url || output.video || output.image || null;
}

async function imagenReplicate(p: PedidoImagenIA, modelo: string): Promise<Buffer> {
  const dataUri = `data:image/jpeg;base64,${p.foto.toString("base64")}`;
  const prompt = instruccionFiel(p.producto, p.instruccion, "imagen");
  // FLUX Kontext y familia editan conservando el sujeto; otros modelos i2i usan "image".
  const input: Record<string, unknown> = /kontext/i.test(modelo)
    ? { prompt, input_image: dataUri, aspect_ratio: "match_input_image", output_format: "png", safety_tolerance: 2 }
    : { prompt, image: dataUri, output_format: "png" };
  const out = await prediccionReplicate(modelo, input, p.timeoutMs ?? 180_000);
  const url = primeraSalida(out);
  if (!url) throw new Error("Replicate no devolvió imagen.");
  return url.startsWith("data:") ? Buffer.from(url.split(",")[1] || "", "base64") : descargar(url, 120_000);
}

async function videoReplicate(p: PedidoVideoIA, modelo: string): Promise<Buffer> {
  const dataUri = `data:image/jpeg;base64,${p.foto.toString("base64")}`;
  const prompt = instruccionFiel(p.producto, p.instruccion, "video");
  const duracion = Math.round(p.duracion ?? 5) >= 8 ? 10 : 5;
  const input: Record<string, unknown> = /kling/i.test(modelo)
    ? { prompt, start_image: dataUri, duration: duracion, mode: "standard", negative_prompt: "text, watermark, logo, extra objects, deformed product" }
    : { prompt, image: dataUri };
  const out = await prediccionReplicate(modelo, input, p.timeoutMs ?? 8 * 60_000);
  const url = primeraSalida(out);
  if (!url) throw new Error("Replicate no devolvió vídeo.");
  return descargar(url, 180_000);
}

async function descargar(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<Buffer> {
  const res = await fetch(url, { headers, signal: limiteTiempo(timeoutMs), redirect: "follow" });
  if (!res.ok) throw new Error(`Descarga: ${await leerError(res)}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Entrada pública ─────────────────────────────────────────────────────────

export async function imagenConIA(p: PedidoImagenIA): Promise<ResultadoIA> {
  const prov = elegirProveedor("imagen", p.proveedor, !!p.mascara);
  if (!prov) throw new Error(p.proveedor ? `El proveedor "${p.proveedor}" no está configurado para imágenes.` : "No hay ningún proveedor de IA de imágenes configurado (OPENAI_API_KEY, GOOGLE_API_KEY o REPLICATE_API_TOKEN).");
  const inicio = Date.now();
  const buffer = prov.id === "openai" ? await imagenOpenAI(p, prov.modeloImagen) : prov.id === "gemini" ? await imagenGemini(p, prov.modeloImagen) : await imagenReplicate(p, prov.modeloImagen);
  if (!buffer?.length) throw new Error(`${prov.nombre} devolvió una imagen vacía.`);
  return { buffer, mime: buffer[0] === 0x89 ? "image/png" : "image/jpeg", proveedor: prov.id, modelo: prov.modeloImagen, ms: Date.now() - inicio };
}

export async function videoConIA(p: PedidoVideoIA): Promise<ResultadoIA> {
  const prov = elegirProveedor("video", p.proveedor);
  if (!prov?.modeloVideo) throw new Error(p.proveedor ? `El proveedor "${p.proveedor}" no está configurado para vídeo.` : "No hay ningún proveedor de IA de vídeo configurado (GOOGLE_API_KEY para Veo o REPLICATE_API_TOKEN).");
  const inicio = Date.now();
  const buffer = prov.id === "gemini" ? await videoGemini(p, prov.modeloVideo) : await videoReplicate(p, prov.modeloVideo);
  if (!buffer?.length) throw new Error(`${prov.nombre} devolvió un vídeo vacío.`);
  return { buffer, mime: "video/mp4", proveedor: prov.id, modelo: prov.modeloVideo, ms: Date.now() - inicio };
}
