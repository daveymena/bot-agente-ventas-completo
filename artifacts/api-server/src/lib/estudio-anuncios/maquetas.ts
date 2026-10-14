/**
 * Maquetas: DÓNDE va cada cosa (foto, gancho, precio, botón) en cada formato.
 *
 * Cada maqueta es una función (formato, contenido, estilo) → capas, pensada
 * para los tres formatos de Meta. Los colores y letras los pone el estilo
 * (estilos.ts); la decoración, el tema (temas.ts). Lo que dicen los textos
 * sale solo del Contenido (contenido.ts): la maqueta no inventa frases.
 */
import { FORMATOS, FORMATOS_LISTA, AMARILLO, aclararHex, marcaChip, nuevoId, pildora, selloPrecio, texto, textoSobre, zonaSegura, oscurecerHex, type Animacion, type Capa, type CapaFondo, type Contenido, type Diseno, type Entrada, type Formato, type Zona } from "./esquema";
import { botonPara, resolverEstilo, type EstiloResuelto } from "./estilos";
import { cintaDeTema, decoracionesDeTema, temaPorId, type PosicionDecoracion } from "./temas";

export type Plantilla = "destacado" | "oferta" | "beneficios" | "minimal" | "pregunta" | "lista" | "collage" | "etiqueta" | "marco" | "precio" | "banda";

export type CategoriaMaqueta = "producto" | "oferta" | "beneficios" | "gancho";

export interface Maqueta {
  nombre: string;
  descripcion: string;
  categoria: CategoriaMaqueta;
  tags: string[];
  /** Fotos mínimas para que luzca (con menos, se adapta). */
  fotos: number;
  /** Necesita precio para tener sentido. */
  precio?: boolean;
  /** Esquinas que ocupa la maqueta (el tema no decora ahí). */
  evitar: PosicionDecoracion[];
}

export const PLANTILLAS: Record<Plantilla, Maqueta> = {
  destacado: { nombre: "Producto protagonista", descripcion: "La foto real a pantalla completa, gancho resaltado, precio y botón.", categoria: "producto", tags: ["clasico", "foto", "versatil"], fotos: 1, evitar: ["abajo-der"] },
  oferta: { nombre: "Oferta", descripcion: "Tarjeta con la foto, precio grande y sellos reales del negocio.", categoria: "oferta", tags: ["precio", "sellos", "contraentrega"], fotos: 1, evitar: ["abajo-izq", "abajo-der"] },
  beneficios: { nombre: "Beneficios", descripcion: "Tres razones de compra sacadas de la ficha, con la foto al lado.", categoria: "beneficios", tags: ["razones", "ficha", "informativo"], fotos: 1, evitar: ["abajo-izq"] },
  minimal: { nombre: "Minimal", descripcion: "Fondo limpio, producto grande y precio. Estilo premium.", categoria: "producto", tags: ["premium", "limpio", "elegante"], fotos: 1, evitar: ["abajo-der"] },
  pregunta: { nombre: "Pregunta gancho", descripcion: "Bloque de color con la pregunta en grande y la foto debajo.", categoria: "gancho", tags: ["pregunta", "dolor", "curiosidad"], fotos: 1, evitar: ["arriba-izq", "arriba-der"] },
  lista: { nombre: "Lista numerada", descripcion: "Foto arriba y los beneficios numerados en grande.", categoria: "beneficios", tags: ["lista", "numeros", "razones"], fotos: 1, evitar: ["abajo-izq"] },
  collage: { nombre: "Collage de fotos", descripcion: "Dos o tres fotos reales en mosaico y una franja con el gancho.", categoria: "producto", tags: ["fotos", "mosaico", "variedad"], fotos: 2, evitar: ["arriba-izq", "arriba-der", "abajo-izq", "abajo-der"] },
  etiqueta: { nombre: "Sello de precio", descripcion: "Foto a sangre, sello de precio con forma y gancho con contorno.", categoria: "oferta", tags: ["precio", "sello", "impacto"], fotos: 1, precio: true, evitar: ["arriba-der"] },
  marco: { nombre: "Polaroid", descripcion: "La foto en un marco blanco inclinado con una nota a mano.", categoria: "producto", tags: ["artesanal", "cercano", "manuscrito"], fotos: 1, evitar: ["abajo-der"] },
  precio: { nombre: "Precio protagonista", descripcion: "El precio enorme, el producto al lado y los sellos del negocio.", categoria: "oferta", tags: ["precio", "numeros", "directo"], fotos: 1, precio: true, evitar: ["abajo-izq", "abajo-der"] },
  banda: { nombre: "Franja de color", descripcion: "Foto en círculo, franja con el gancho y botón grande.", categoria: "gancho", tags: ["franja", "circulo", "redes"], fotos: 1, evitar: ["abajo-izq", "abajo-der"] },
};

export const PLANTILLAS_LISTA = Object.keys(PLANTILLAS) as Plantilla[];

export interface OpcionesPlantilla {
  /** Índice del gancho a usar (rota entre las variantes). */
  gancho?: number;
  /** Índice de la foto a usar. */
  foto?: number;
  estilo?: string | null;
  tema?: string | null;
  /** Sin decoraciones de tema aunque el tema las tenga. */
  sinDecoracion?: boolean;
}

const A = (entrada: Entrada, retraso = 0, duracion = 0.5): Animacion => ({ entrada, retraso, duracion });

/** Fondo según el estilo: foto difuminada, color, degradado o patrón. */
function fondoDe(E: EstiloResuelto, z: Zona, foto: string | null, forzar?: EstiloResuelto["fondo"]): CapaFondo {
  const modo = forzar || E.fondo;
  const base: CapaFondo = { id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: E.paleta.fondo, nombre: "Fondo" };
  if (modo === "foto" && foto) return { ...base, imagen: foto, desenfoque: 40, oscurecer: 0.55 };
  if (modo === "degradado") return { ...base, relleno: { degradado: E.degradado || [E.paleta.fondo, E.paleta.superficie], angulo: 160 } };
  if (modo === "patron") return { ...base, relleno: { patron: E.patron?.id || "puntos", color: E.patron?.color || "#ffffff14", fondo: E.paleta.fondo, escala: E.patron?.escala ?? 1 } };
  return base;
}

/** Color del texto principal sobre el fondo del estilo. */
const textoDe = (E: EstiloResuelto, foto: string | null) => (E.fondo === "foto" && foto ? "#FFFFFF" : E.paleta.texto);
const suaveDe = (E: EstiloResuelto, foto: string | null) => (E.fondo === "foto" && foto ? "#E2E8F0" : E.paleta.suave);
const subPrecio = (c: Contenido) => (c.sellos.find((s) => /recibir/i.test(s)) ? "pagas al recibir" : null);

export function disenoDePlantilla(plantilla: Plantilla, formato: Formato, c: Contenido, o: OpcionesPlantilla = {}): Diseno {
  const gancho = c.ganchos[(o.gancho ?? 0) % Math.max(1, c.ganchos.length)] || c.titular || c.nombre;
  const foto = c.fotos.length ? c.fotos[(o.foto ?? 0) % c.fotos.length]! : null;
  const E = resolverEstilo(o.estilo, c);
  const tema = temaPorId(o.tema);
  if (tema.fuenteTitular && !o.estilo) E.fuentes = { ...E.fuentes, titular: tema.fuenteTitular };
  const base = { version: 1 as const, formato, ancho: FORMATOS[formato].ancho, alto: FORMATOS[formato].alto, plantilla, gancho, estilo: E.id, tema: tema.id };
  const fotos = c.fotos.length ? [...c.fotos.slice(o.foto ?? 0), ...c.fotos.slice(0, o.foto ?? 0)] : [];
  const ctx: Ctx = { f: formato, c, gancho, foto, fotos, E, z: zonaSegura(formato) };
  const capas = MAQUETAS[plantilla] ? MAQUETAS[plantilla](ctx) : capasDestacado(ctx);
  if (!o.sinDecoracion) {
    // Primero la cinta (ocupa la esquina superior derecha) y luego los stickers esquivando textos, botones y chips.
    capas.push(...cintaDeTema(tema, formato, E));
    capas.push(...decoracionesDeTema(tema, formato, { evitar: PLANTILLAS[plantilla]?.evitar || [], esquivar: capas }));
  }
  return { ...base, capas };
}

interface Ctx { f: Formato; c: Contenido; gancho: string; foto: string | null; fotos: string[]; E: EstiloResuelto; z: Zona }

/** 1) Producto protagonista: foto a pantalla completa sobre su versión difuminada. */
function capasDestacado({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const capas: Capa[] = [fondoDe(E, z, foto, E.fondo === "solido" ? "foto" : undefined)];
  const colorTexto = textoDe(E, foto) === "#FFFFFF" || E.fondo === "solido" ? "#FFFFFF" : E.paleta.texto;
  const g = texto({ x: z.m, y: z.top + 8, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 92 : 76, min: 44, peso: 900, fuente: E.fuentes.titular, color: E.paleta.textoResaltado, alinear: "centro", maxLineas: f === "historia" ? 3 : 2, resaltado: E.paleta.resaltado, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-arriba", 0.1) });
  capas.push(...marcaChip(z, c.marca, colorTexto, f === "historia" ? z.top - 60 : undefined, E.fuentes.cuerpo));
  if (f !== "historia") g.capa.y = z.top + 44;
  capas.push(g.capa);
  const botonAlto = f === "cuadrado" ? 92 : 104;
  const yFoto = g.capa.y + g.alto + 28;
  const yBoton = z.bottom - botonAlto;
  const hFoto = Math.max(300, yBoton - 40 - yFoto);
  if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m, y: yFoto, w: z.W - z.m * 2, h: hFoto, sombra: true, radio: Math.max(8, E.radio), nombre: "Foto del producto", anim: A("zoom", 0.3, 0.6) });
  if (c.precio) {
    const r = f === "cuadrado" ? 120 : 150;
    capas.push(...selloPrecio(z.W - z.m - r, yBoton - r - 24, r, c.precio, subPrecio(c), E.paleta.resaltado, E.paleta.textoResaltado, { fuente: E.fuentes.titular, anim: A("rebote", 0.8) }));
  }
  const b = botonPara(E, c.cta);
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 38 : 44, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1) }).capas);
  return capas;
}

/** 2) Oferta: tarjeta con la foto, precio grande y sellos reales. */
function capasOferta({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const acento = E.paleta.acento;
  const capas: Capa[] = [{ id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: { degradado: [acento, oscurecerHex(acento, 0.55)], angulo: 160 }, nombre: "Fondo" }];
  const colorSobre = textoSobre(acento);
  capas.push(...marcaChip(z, c.marca, colorSobre, undefined, E.fuentes.cuerpo));
  const yCard = z.top + 56;
  const hCard = Math.round((z.bottom - yCard) * (f === "historia" ? 0.52 : 0.56));
  capas.push({ id: nuevoId("r"), tipo: "rect", x: z.m, y: yCard, w: z.W - z.m * 2, h: hCard, relleno: E.paleta.superficie, radio: Math.max(0, E.radio + 8), nombre: "Tarjeta", anim: A("zoom", 0.1) });
  if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m + 28, y: yCard + 28, w: z.W - z.m * 2 - 56, h: hCard - 56, radio: Math.max(0, E.radio - 8), nombre: "Foto del producto", anim: A("zoom", 0.2) });
  let y = yCard + hCard + 36;
  const g = texto({ x: z.m, y, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 72 : 60, min: 38, peso: 900, fuente: E.fuentes.titular, color: colorSobre, alinear: "izq", maxLineas: 2, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-izq", 0.4) });
  capas.push(g.capa); y += g.alto + 18;
  if (c.precio) {
    const antes = texto({ x: z.m, y, w: z.W - z.m * 2, texto: "Llévalo por", tam: 30, min: 24, peso: 700, fuente: E.fuentes.cuerpo, color: colorSobre, alinear: "izq", maxLineas: 1, nombre: "Etiqueta de precio", anim: A("aparecer", 0.6) });
    antes.capa.opacidad = 0.85;
    capas.push(antes.capa); y += antes.alto + 2;
    const p = texto({ x: z.m, y, w: z.W - z.m * 2, texto: c.precio, tam: f === "cuadrado" ? 88 : 104, min: 60, peso: 900, fuente: E.fuentes.titular, color: colorSobre === "#ffffff" ? E.paleta.resaltado === acento ? AMARILLO : E.paleta.resaltado : "#111827", alinear: "izq", maxLineas: 1, nombre: "Precio", anim: A("rebote", 0.7) });
    capas.push(p.capa); y += p.alto + 16;
  }
  let x = z.m;
  for (const s of c.sellos.slice(0, 3)) {
    const pil = pildora(x, y, s, { alto: 56, tam: 26, fondo: colorSobre === "#ffffff" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)", color: colorSobre, peso: 700, fuente: E.fuentes.cuerpo, nombre: "Sello", anim: A("aparecer", 0.9) });
    if (x + pil.w > z.W - z.m) break;
    capas.push(...pil.capas); x += pil.w + 14;
  }
  if (c.sellos.length) y += 56 + 24;
  const botonAlto = f === "cuadrado" ? 88 : 100;
  const yBoton = Math.max(y, z.bottom - botonAlto);
  const wa = /whatsapp/i.test(c.cta);
  if (yBoton + botonAlto <= z.H) capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 36 : 42, fondo: wa ? botonPara(E, c.cta).fondo : E.paleta.superficie, color: wa ? "#ffffff" : acento, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.1) }).capas);
  return capas;
}

/** 3) Beneficios: lista con viñetas y la foto al lado o arriba. */
function capasBeneficios({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const claro = E.fondo === "foto" ? { ...E, fondo: "solido" as const, paleta: { ...E.paleta, fondo: "#F8FAFC", texto: "#0F172A", suave: "#475569" } } : E;
  const capas: Capa[] = [fondoDe(claro, z, null)];
  const colorTexto = claro.paleta.texto;
  capas.push({ id: nuevoId("r"), tipo: "rect", x: 0, y: 0, w: z.W, h: f === "historia" ? 200 : 18, relleno: E.paleta.acento, nombre: "Franja de marca" });
  capas.push(...marcaChip(z, c.marca, f === "historia" ? textoSobre(E.paleta.acento) : E.paleta.acento, f === "historia" ? 110 : z.top, E.fuentes.cuerpo));
  const puntos = c.puntos.length ? c.puntos : [c.titular];
  const apilado = f !== "cuadrado";
  let y = z.top + 60;
  if (apilado) {
    const hFoto = Math.round((z.bottom - z.top) * (f === "historia" ? 0.4 : 0.44));
    if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: z.m, y, w: z.W - z.m * 2, h: hFoto, radio: Math.max(0, E.radio + 4), sombra: true, nombre: "Foto del producto", anim: A("zoom", 0.1) });
    y += hFoto + 40;
  }
  const colTexto = apilado ? { x: z.m, w: z.W - z.m * 2 } : { x: z.m, w: Math.round(z.W * 0.52) };
  if (!apilado && foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: z.m + colTexto.w + 32, y: z.top + 60, w: z.W - z.m * 2 - colTexto.w - 32, h: z.bottom - z.top - 60 - 120, radio: Math.max(0, E.radio), sombra: true, nombre: "Foto del producto", anim: A("zoom", 0.1) });
  const g = texto({ x: colTexto.x, y, w: colTexto.w, texto: gancho, tam: f === "historia" ? 68 : 54, min: 34, peso: 900, fuente: E.fuentes.titular, color: colorTexto, alinear: "izq", maxLineas: 2, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-izq", 0.3) });
  capas.push(g.capa); y += g.alto + 26;
  puntos.slice(0, 3).forEach((p, i) => {
    const r = 22;
    capas.push({ id: nuevoId("k"), tipo: "icono", icono: "formas:check-circulo", color: E.paleta.acento, x: colTexto.x, y: y + 4, w: r * 2, h: r * 2, nombre: "Viñeta", anim: A("zoom", 0.5 + i * 0.25) });
    const t = texto({ x: colTexto.x + r * 2 + 18, y, w: colTexto.w - r * 2 - 18, texto: p, tam: f === "historia" ? 38 : 32, min: 24, peso: 700, fuente: E.fuentes.cuerpo, color: claro.paleta.texto, alinear: "izq", maxLineas: 2, nombre: "Beneficio", anim: A("deslizar-izq", 0.5 + i * 0.25) });
    capas.push(t.capa); y += Math.max(t.alto, r * 2 + 8) + 18;
  });
  const botonAlto = f === "cuadrado" ? 84 : 96;
  const yBoton = z.bottom - botonAlto;
  if (c.precio) {
    const p = texto({ x: z.m, y: yBoton - 100, w: colTexto.w, texto: c.precio, tam: 72, min: 48, peso: 900, fuente: E.fuentes.titular, color: E.paleta.acento, alinear: "izq", maxLineas: 1, nombre: "Precio", anim: A("rebote", 1.2) });
    if (p.capa.y > y) capas.push(p.capa);
  }
  const b = botonPara(E, c.cta);
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 34 : 40, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: apilado ? Math.round(z.W * 0.6) : colTexto.w, anchoMax: apilado ? z.W - z.m * 2 : colTexto.w, centrarEn: apilado ? z.W / 2 : undefined, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.4) }).capas);
  return capas;
}

/** 4) Minimal: fondo claro, producto enorme, nombre y precio. */
function capasMinimal({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const esFoto = E.fondo === "foto";
  const fondo: CapaFondo = esFoto
    ? { id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: { degradado: ["#FFFFFF", aclararHex(E.paleta.acento, 0.88)], angulo: 180 }, nombre: "Fondo" }
    : fondoDe(E, z, null);
  const capas: Capa[] = [fondo];
  const colorTexto = esFoto ? "#0F172A" : E.paleta.texto;
  const suave = esFoto ? "#64748B" : E.paleta.suave;
  capas.push(...marcaChip(z, c.marca, suave, undefined, E.fuentes.cuerpo));
  const g = texto({ x: z.m, y: z.top + 48, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 80 : 64, min: 40, peso: 900, fuente: E.fuentes.titular, color: colorTexto, alinear: "centro", maxLineas: 2, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("aparecer", 0.1, 0.6) });
  capas.push(g.capa);
  const yPie = z.bottom - (f === "cuadrado" ? 150 : 190);
  const yFoto = g.capa.y + g.alto + 30;
  if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m + 20, y: yFoto, w: z.W - z.m * 2 - 40, h: Math.max(260, yPie - 24 - yFoto), sombra: true, radio: Math.max(0, E.radio - 8), nombre: "Foto del producto", anim: A("zoom", 0.3, 0.7) });
  const n = texto({ x: z.m, y: yPie, w: c.precio ? Math.round(z.W * 0.58) : z.W - z.m * 2, texto: c.titular, tam: 40, min: 26, peso: 700, fuente: E.fuentes.cuerpo, color: colorTexto, alinear: "izq", maxLineas: 2, nombre: "Nombre del producto", anim: A("deslizar-izq", 0.7) });
  capas.push(n.capa);
  if (c.precio) capas.push(texto({ x: z.W - z.m - Math.round(z.W * 0.38), y: yPie - 6, w: Math.round(z.W * 0.38), texto: c.precio, tam: 64, min: 40, peso: 900, fuente: E.fuentes.titular, color: E.paleta.acento, alinear: "der", maxLineas: 1, nombre: "Precio", anim: A("deslizar-der", 0.7) }).capa);
  const botonAlto = f === "cuadrado" ? 72 : 84;
  const b = /whatsapp/i.test(c.cta) ? botonPara(E, c.cta) : { fondo: colorTexto, color: textoSobre(colorTexto) };
  capas.push(...pildora(z.m, z.bottom - botonAlto, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 30 : 34, fondo: b.fondo, color: b.color, peso: 700, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.5), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1) }).capas);
  return capas;
}

/** 5) Pregunta gancho: bloque de acento con la pregunta en grande y la foto debajo cubriendo. */
function capasPregunta({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const acento = E.paleta.acento;
  const sobre = textoSobre(acento);
  const capas: Capa[] = [{ id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: acento, nombre: "Fondo" }];
  const hBloque = Math.round(z.H * (f === "historia" ? 0.46 : f === "vertical" ? 0.44 : 0.46));
  capas.push(...marcaChip(z, c.marca, sobre, f === "historia" ? z.top - 60 : z.top, E.fuentes.cuerpo));
  const pregunta = /\?$/.test(gancho.trim()) || /^¿/.test(gancho.trim()) ? gancho : gancho;
  const g = texto({ x: z.m, y: z.top + (f === "historia" ? 20 : 56), w: z.W - z.m * 2, texto: pregunta, tam: f === "historia" ? 104 : 84, min: 46, peso: 900, fuente: E.fuentes.titular, color: sobre, alinear: "izq", maxLineas: 3, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-izq", 0.1, 0.6) });
  capas.push(g.capa);
  const yFoto = Math.max(hBloque, g.capa.y + g.alto + 40);
  const botonAlto = f === "cuadrado" ? 88 : 100;
  if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: 0, y: yFoto, w: z.W, h: z.H - yFoto, radio: 0, nombre: "Foto del producto", anim: A("deslizar-abajo", 0.4, 0.7) });
  // Velo abajo para que el botón y el precio se lean sobre la foto.
  capas.push({ id: nuevoId("r"), tipo: "rect", x: 0, y: z.H - 300, w: z.W, h: 300, relleno: "rgba(0,0,0,0.42)", nombre: "Velo" });
  const yBoton = z.bottom - botonAlto;
  const b = botonPara(E, c.cta);
  if (c.precio) capas.push(...selloPrecio(z.W - z.m - (f === "cuadrado" ? 110 : 140), yFoto + (f === "cuadrado" ? 110 : 140) + 10, f === "cuadrado" ? 110 : 140, c.precio, subPrecio(c), E.paleta.resaltado, E.paleta.textoResaltado, { forma: "sello-20", fuente: E.fuentes.titular, anim: A("rebote", 0.9) }));
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 36 : 42, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.1) }).capas);
  return capas;
}

/** 6) Lista numerada: foto arriba, beneficios con números grandes. */
function capasLista({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const capas: Capa[] = [fondoDe(E, z, foto)];
  const colorTexto = textoDe(E, foto);
  const suave = suaveDe(E, foto);
  capas.push(...marcaChip(z, c.marca, suave, f === "historia" ? z.top - 60 : undefined, E.fuentes.cuerpo));
  const puntos = (c.puntos.length ? c.puntos : [c.titular]).slice(0, 3);
  const apilado = f !== "cuadrado";
  const hFoto = apilado ? Math.round((z.bottom - z.top) * (f === "historia" ? 0.36 : 0.4)) : 0;
  let y = z.top + (f === "historia" ? 10 : 40);
  if (apilado && foto) { capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: z.m, y, w: z.W - z.m * 2, h: hFoto, radio: Math.max(0, E.radio + 4), sombra: true, nombre: "Foto del producto", anim: A("zoom", 0.1) }); y += hFoto + 36; }
  const col = apilado ? { x: z.m, w: z.W - z.m * 2 } : { x: z.m, w: Math.round(z.W * 0.56) };
  if (!apilado && foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: z.m + col.w + 28, y: z.top + 40, w: z.W - z.m * 2 - col.w - 28, h: z.bottom - z.top - 40 - 110, radio: Math.max(0, E.radio), sombra: true, nombre: "Foto del producto", anim: A("zoom", 0.1) });
  const g = texto({ x: col.x, y, w: col.w, texto: gancho, tam: f === "historia" ? 66 : 50, min: 32, peso: 900, fuente: E.fuentes.titular, color: colorTexto, alinear: "izq", maxLineas: 2, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-izq", 0.3) });
  capas.push(g.capa); y += g.alto + 28;
  puntos.forEach((p, i) => {
    const num = texto({ x: col.x, y: y - 8, w: 90, texto: String(i + 1), tam: f === "historia" ? 84 : 64, min: 48, peso: 900, fuente: E.fuentes.titular, color: E.paleta.acento, alinear: "izq", maxLineas: 1, nombre: `Número ${i + 1}`, anim: A("zoom", 0.5 + i * 0.25) });
    capas.push(num.capa);
    const t = texto({ x: col.x + 96, y: y + 6, w: col.w - 96, texto: p, tam: f === "historia" ? 38 : 30, min: 22, peso: 700, fuente: E.fuentes.cuerpo, color: colorTexto, alinear: "izq", maxLineas: 2, nombre: "Beneficio", anim: A("deslizar-izq", 0.5 + i * 0.25) });
    capas.push(t.capa); y += Math.max(t.alto + 6, num.alto - 8) + 16;
  });
  const botonAlto = f === "cuadrado" ? 84 : 96;
  const b = botonPara(E, c.cta);
  const yBoton = z.bottom - botonAlto;
  if (c.precio && yBoton - 90 > y) capas.push(texto({ x: col.x, y: yBoton - 90, w: col.w, texto: c.precio, tam: 64, min: 44, peso: 900, fuente: E.fuentes.titular, color: E.paleta.acento, alinear: "izq", maxLineas: 1, nombre: "Precio", anim: A("rebote", 1.3) }).capa);
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 34 : 40, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: apilado ? Math.round(z.W * 0.6) : col.w, anchoMax: apilado ? z.W - z.m * 2 : col.w, centrarEn: apilado ? z.W / 2 : undefined, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.5) }).capas);
  return capas;
}

/** 7) Collage: dos o tres fotos reales en mosaico y una franja con el gancho. */
function capasCollage({ f, c, gancho, fotos, E, z }: Ctx): Capa[] {
  const capas: Capa[] = [fondoDe(E, z, null, E.fondo === "foto" ? "solido" : undefined)];
  const lista = fotos.slice(0, 3);
  const sep = 14;
  const hFranja = f === "historia" ? 560 : f === "vertical" ? 460 : 400;
  const yFranja = z.bottom - hFranja;
  const areaTop = f === "historia" ? 180 : 0, areaH = yFranja - sep - areaTop;
  const r = Math.max(0, E.radio);
  const foto = (src: string, x: number, y: number, w: number, h: number, i: number): Capa => ({ id: nuevoId("i"), tipo: "imagen", src, ajuste: "cubrir", x, y, w, h, radio: r, nombre: `Foto ${i + 1}`, anim: A(i % 2 ? "deslizar-der" : "deslizar-izq", 0.1 + i * 0.2, 0.6) });
  if (lista.length >= 3) {
    const wIzq = Math.round(z.W * 0.58);
    capas.push(foto(lista[0]!, 0, areaTop, wIzq - sep / 2, areaH, 0));
    capas.push(foto(lista[1]!, wIzq + sep / 2, areaTop, z.W - wIzq - sep / 2, Math.round(areaH / 2) - sep / 2, 1));
    capas.push(foto(lista[2]!, wIzq + sep / 2, areaTop + Math.round(areaH / 2) + sep / 2, z.W - wIzq - sep / 2, areaH - Math.round(areaH / 2) - sep / 2, 2));
  } else if (lista.length === 2) {
    capas.push(foto(lista[0]!, 0, areaTop, Math.round(z.W / 2) - sep / 2, areaH, 0));
    capas.push(foto(lista[1]!, Math.round(z.W / 2) + sep / 2, areaTop, z.W - Math.round(z.W / 2) - sep / 2, areaH, 1));
  } else if (lista.length === 1) {
    capas.push(foto(lista[0]!, 0, areaTop, z.W, areaH, 0));
  }
  capas.push({ id: nuevoId("r"), tipo: "rect", x: 0, y: yFranja, w: z.W, h: z.H - yFranja, relleno: E.paleta.acento, nombre: "Franja", anim: A("deslizar-abajo", 0.5) });
  const sobre = textoSobre(E.paleta.acento);
  let y = yFranja + 36;
  capas.push(...marcaChip(z, c.marca, sobre, y, E.fuentes.cuerpo));
  if (c.marca) y += 44;
  const g = texto({ x: z.m, y, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 76 : 58, min: 36, peso: 900, fuente: E.fuentes.titular, color: sobre, alinear: "izq", maxLineas: 2, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-arriba", 0.7) });
  capas.push(g.capa); y += g.alto + 20;
  const botonAlto = f === "cuadrado" ? 76 : 92;
  const yBoton = z.bottom - botonAlto - (f === "historia" ? 0 : 0);
  if (c.precio) capas.push(texto({ x: z.m, y: Math.min(y, yBoton - 90), w: z.W - z.m * 2, texto: c.precio, tam: 72, min: 46, peso: 900, fuente: E.fuentes.titular, color: sobre, alinear: "izq", maxLineas: 1, nombre: "Precio", anim: A("rebote", 1) }).capa);
  const wa = /whatsapp/i.test(c.cta);
  const b = wa ? botonPara(E, c.cta) : { fondo: sobre, color: E.paleta.acento };
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 32 : 40, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.5), anchoMax: z.W - z.m * 2, centrarEn: c.precio ? undefined : z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.2) }).capas);
  if (c.precio) {
    // Botón a la derecha del precio.
    const btn = capas.slice(-2) as Capa[];
    const w = btn[0]!.w;
    btn[0]!.x = z.W - z.m - w; btn[1]!.x = z.W - z.m - w;
  }
  return capas;
}

/** 8) Sello de precio: foto a sangre, sello con forma y gancho con contorno. */
function capasEtiqueta({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const capas: Capa[] = [{ id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: E.paleta.fondo, nombre: "Fondo" }];
  if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: 0, y: 0, w: z.W, h: z.H, nombre: "Foto del producto", bloqueada: false, anim: A("zoom", 0, 0.8) });
  capas.push({ id: nuevoId("r"), tipo: "rect", x: 0, y: Math.round(z.H * 0.5), w: z.W, h: Math.round(z.H * 0.5), relleno: "rgba(0,0,0,0.55)", nombre: "Degradado oscuro" });
  capas.push(...marcaChip(z, c.marca, "#FFFFFF", f === "historia" ? z.top - 60 : z.top, E.fuentes.cuerpo));
  if (c.precio) {
    const r = f === "cuadrado" ? 130 : 160;
    capas.push(...selloPrecio(z.W - z.m - r + 10, z.top + r + (f === "historia" ? 40 : 60), r, c.precio, subPrecio(c), E.paleta.resaltado, E.paleta.textoResaltado, { forma: "sello-20", fuente: E.fuentes.titular, anim: A("rebote", 0.3) }));
  }
  const botonAlto = f === "cuadrado" ? 88 : 100;
  const yBoton = z.bottom - botonAlto;
  const g = texto({ x: z.m, y: 0, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 100 : 80, min: 44, peso: 900, fuente: E.fuentes.titular, color: "#FFFFFF", alinear: "izq", maxLineas: 3, contorno: { color: "#111111", grosor: 3 }, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-arriba", 0.5, 0.6) });
  g.capa.y = yBoton - 30 - g.alto - (c.sellos.length ? 70 : 0);
  capas.push(g.capa);
  let x = z.m;
  for (const s of c.sellos.slice(0, 3)) {
    const pil = pildora(x, yBoton - 30 - 56, s, { alto: 56, tam: 24, fondo: "rgba(255,255,255,0.22)", color: "#FFFFFF", peso: 700, fuente: E.fuentes.cuerpo, nombre: "Sello", anim: A("aparecer", 0.9) });
    if (x + pil.w > z.W - z.m) break;
    capas.push(...pil.capas); x += pil.w + 12;
  }
  const b = botonPara(E, c.cta);
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 36 : 42, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.1) }).capas);
  return capas;
}

/** 9) Polaroid: marco blanco inclinado con una nota a mano. */
function capasMarco({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const capas: Capa[] = [fondoDe(E, z, foto, E.fondo === "foto" ? "patron" : undefined)];
  if (capas[0] && (capas[0] as CapaFondo).relleno && typeof (capas[0] as CapaFondo).relleno === "object" && "patron" in ((capas[0] as CapaFondo).relleno as object) && E.fondo === "foto") {
    (capas[0] as CapaFondo).relleno = { patron: "puntos-finos", color: "#ffffff22", fondo: E.paleta.fondo };
  }
  const colorTexto = E.fondo === "foto" ? "#FFFFFF" : E.paleta.texto;
  capas.push(...marcaChip(z, c.marca, suaveDe(E, null), f === "historia" ? z.top - 60 : undefined, E.fuentes.cuerpo));
  const g = texto({ x: z.m, y: z.top + (f === "historia" ? 10 : 40), w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 84 : 64, min: 40, peso: 900, fuente: E.fuentes.titular, color: colorTexto, alinear: "centro", maxLineas: 2, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-arriba", 0.1) });
  capas.push(g.capa);
  const botonAlto = f === "cuadrado" ? 80 : 92;
  const yBoton = z.bottom - botonAlto;
  const yMarco = g.capa.y + g.alto + 40;
  const hDisp = yBoton - 40 - yMarco;
  const lado = Math.min(z.W - z.m * 2 - 60, hDisp - 120);
  const borde = 28;
  const xMarco = Math.round(z.W / 2 - lado / 2);
  const rot = -3;
  capas.push({ id: nuevoId("r"), tipo: "rect", x: xMarco, y: yMarco, w: lado, h: lado + 120, relleno: "#FFFFFF", radio: 6, rot, nombre: "Marco", anim: A("zoom", 0.3, 0.7) });
  if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: xMarco + borde, y: yMarco + borde, w: lado - borde * 2, h: lado - borde * 2, radio: 0, rot, nombre: "Foto del producto", anim: A("zoom", 0.3, 0.7) });
  const nota = texto({ x: xMarco + borde, y: yMarco + lado + 10, w: lado - borde * 2, texto: c.precio ? `${c.titular} · ${c.precio}` : c.titular, tam: 44, min: 26, peso: 700, fuente: "caveat", color: "#1F2937", alinear: "centro", maxLineas: 2, nombre: "Nota a mano", anim: A("aparecer", 0.9) });
  nota.capa.rot = rot;
  capas.push(nota.capa);
  const b = botonPara(E, c.cta);
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 34 : 40, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.55), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.2) }).capas);
  return capas;
}

/** 10) Precio protagonista: el precio enorme, el producto al lado y los sellos. */
function capasPrecio({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const capas: Capa[] = [fondoDe(E, z, foto)];
  const colorTexto = textoDe(E, foto);
  capas.push(...marcaChip(z, c.marca, suaveDe(E, foto), f === "historia" ? z.top - 60 : undefined, E.fuentes.cuerpo));
  const apilado = f !== "cuadrado";
  const colW = apilado ? z.W - z.m * 2 : Math.round(z.W * 0.5);
  let y = z.top + (f === "historia" ? 0 : 40);
  const g = texto({ x: z.m, y, w: colW, texto: gancho, tam: f === "historia" ? 64 : 48, min: 30, peso: 700, fuente: E.fuentes.cuerpo, color: colorTexto, alinear: "izq", maxLineas: 2, nombre: "Gancho", anim: A("deslizar-izq", 0.1) });
  capas.push(g.capa); y += g.alto + 16;
  const precio = c.precio || c.titular;
  const p = texto({ x: z.m, y, w: colW, texto: precio, tam: f === "historia" ? 190 : f === "vertical" ? 160 : 130, min: 70, peso: 900, fuente: E.fuentes.titular, color: E.paleta.acento === E.paleta.fondo ? E.paleta.resaltado : E.paleta.acento, alinear: "izq", maxLineas: 1, nombre: c.precio ? "Precio" : "Nombre del producto", anim: A("rebote", 0.4, 0.7) });
  capas.push(p.capa); y += p.alto + 10;
  if (c.precio) { const n = texto({ x: z.m, y, w: colW, texto: c.titular, tam: f === "historia" ? 40 : 32, min: 24, peso: 700, fuente: E.fuentes.cuerpo, color: colorTexto, alinear: "izq", maxLineas: 2, nombre: "Nombre del producto", anim: A("aparecer", 0.7) }); capas.push(n.capa); y += n.alto + 24; }
  let x = z.m;
  for (const s of c.sellos.slice(0, 3)) {
    const pil = pildora(x, y, s, { alto: 54, tam: 24, fondo: colorTexto === "#FFFFFF" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)", color: colorTexto, peso: 700, fuente: E.fuentes.cuerpo, nombre: "Sello", anim: A("aparecer", 0.9) });
    if (x + pil.w > z.m + colW) { if (apilado) break; x = z.m; y += 66; }
    capas.push(...pil.capas); x += pil.w + 12;
  }
  if (c.sellos.length) y += 54 + 30;
  const botonAlto = f === "cuadrado" ? 84 : 96;
  const yBoton = z.bottom - botonAlto;
  if (foto) {
    if (apilado) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m, y, w: z.W - z.m * 2, h: Math.max(240, yBoton - 30 - y), radio: Math.max(0, E.radio), sombra: true, nombre: "Foto del producto", anim: A("zoom", 0.3) });
    else capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "contener", x: z.m + colW + 24, y: z.top + 40, w: z.W - z.m * 2 - colW - 24, h: yBoton - 30 - z.top - 40, radio: Math.max(0, E.radio), sombra: true, nombre: "Foto del producto", anim: A("zoom", 0.3) });
  }
  const b = botonPara(E, c.cta);
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 34 : 40, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.2) }).capas);
  return capas;
}

/** 11) Franja: foto en círculo, franja de acento con el gancho y botón grande. */
function capasBanda({ f, c, gancho, foto, E, z }: Ctx): Capa[] {
  const capas: Capa[] = [fondoDe(E, z, foto, E.fondo === "foto" ? "degradado" : undefined)];
  if (E.fondo === "foto") (capas[0] as CapaFondo).relleno = { degradado: [E.paleta.fondo, oscurecerHex(E.paleta.acento, 0.5)], angulo: 180 };
  const colorTexto = E.fondo === "foto" ? "#FFFFFF" : E.paleta.texto;
  capas.push(...marcaChip(z, c.marca, suaveDe(E, null), f === "historia" ? z.top - 60 : undefined, E.fuentes.cuerpo));
  const botonAlto = f === "cuadrado" ? 88 : 100;
  const yBoton = z.bottom - botonAlto;
  const hFranja = f === "historia" ? 330 : 260;
  const yFranja = yBoton - 40 - hFranja - (c.sellos.length ? 70 : 0);
  const diam = Math.min(z.W - z.m * 2, yFranja + 60 - (z.top + 40));
  const yFoto = z.top + 40;
  if (foto) capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: "cubrir", x: Math.round(z.W / 2 - diam / 2), y: yFoto, w: diam, h: diam, radio: Math.round(diam / 2), sombra: true, nombre: "Foto del producto", anim: A("zoom", 0.1, 0.7) });
  capas.push({ id: nuevoId("r"), tipo: "rect", x: 0, y: yFranja, w: z.W, h: hFranja, relleno: E.paleta.acento, nombre: "Franja", anim: A("deslizar-izq", 0.4, 0.6) });
  const sobre = textoSobre(E.paleta.acento);
  const g = texto({ x: z.m, y: yFranja + 30, w: z.W - z.m * 2, texto: gancho, tam: f === "historia" ? 78 : 60, min: 36, peso: 900, fuente: E.fuentes.titular, color: sobre, alinear: "centro", maxLineas: 2, nombre: "Gancho", mayusculas: E.mayusculas, anim: A("deslizar-izq", 0.5, 0.6) });
  g.capa.y = yFranja + Math.round((hFranja - g.alto) / 2);
  capas.push(g.capa);
  if (c.precio) capas.push(...selloPrecio(z.W - z.m - (f === "cuadrado" ? 100 : 125), yFranja - 10, f === "cuadrado" ? 100 : 125, c.precio, null, E.paleta.resaltado, E.paleta.textoResaltado, { fuente: E.fuentes.titular, anim: A("rebote", 0.9) }));
  let x = z.m;
  for (const s of c.sellos.slice(0, 3)) {
    const pil = pildora(x, yBoton - 30 - 54, s, { alto: 54, tam: 24, fondo: colorTexto === "#FFFFFF" ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.08)", color: colorTexto, peso: 700, fuente: E.fuentes.cuerpo, nombre: "Sello", anim: A("aparecer", 1) });
    if (x + pil.w > z.W - z.m) break;
    capas.push(...pil.capas); x += pil.w + 12;
  }
  const b = botonPara(E, c.cta);
  capas.push(...pildora(z.m, yBoton, c.cta, { alto: botonAlto, tam: f === "cuadrado" ? 36 : 42, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: Math.round(z.W * 0.6), anchoMax: z.W - z.m * 2, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("deslizar-abajo", 1.2) }).capas);
  return capas;
}

const MAQUETAS: Record<Plantilla, (ctx: Ctx) => Capa[]> = {
  destacado: capasDestacado, oferta: capasOferta, beneficios: capasBeneficios, minimal: capasMinimal, pregunta: capasPregunta,
  lista: capasLista, collage: capasCollage, etiqueta: capasEtiqueta, marco: capasMarco, precio: capasPrecio, banda: capasBanda,
};

// ─── Paquete ─────────────────────────────────────────────────────────────────

export interface PiezaDelPaquete { plantilla: Plantilla; formato: Formato; diseno: Diseno }

/** Las cuatro maquetas de siempre: el paquete por defecto sigue siendo 4 × 3 = 12 piezas. */
export const PAQUETE_POR_DEFECTO: Plantilla[] = ["destacado", "oferta", "beneficios", "minimal"];

/** Diseños del paquete: maquetas × formatos, rotando ganchos y fotos. */
export function paqueteDeDisenos(c: Contenido, opts: { plantillas?: Plantilla[]; formatos?: Formato[]; estilo?: string | null; tema?: string | null } = {}): PiezaDelPaquete[] {
  const plantillas = opts.plantillas?.length ? opts.plantillas : PAQUETE_POR_DEFECTO;
  const formatos = opts.formatos?.length ? opts.formatos : FORMATOS_LISTA;
  const out: PiezaDelPaquete[] = [];
  plantillas.forEach((plantilla, i) => {
    for (const formato of formatos) out.push({ plantilla, formato, diseno: disenoDePlantilla(plantilla, formato, c, { gancho: i, foto: i, estilo: opts.estilo, tema: opts.tema }) });
  });
  return out;
}

