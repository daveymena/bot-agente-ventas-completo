/**
 * Escenas del vídeo vertical y guiones (plantillas de vídeo).
 *
 * Un guion decide la secuencia de escenas (gancho → producto → beneficios →
 * precio → cierre, o variantes más cortas o por fotos); cada escena es un
 * Diseño 9:16 cuyas capas traen `anim` (entrada en el vídeo) para que el
 * resultado tenga movimiento real y no solo zoom de cámara. El estilo y el
 * tema son los mismos de las imágenes, así el paquete se ve de una pieza.
 */
import { marcaChip, nuevoId, pildora, selloPrecio, texto, textoSobre, zonaSegura, FORMATOS, type Animacion, type Capa, type CapaFondo, type Contenido, type Diseno, type Entrada, type Escena, type RolDeEscena, type Transicion } from "./esquema";
import { botonPara, resolverEstilo, type EstiloResuelto } from "./estilos";
import { decoracionesDeTema, temaPorId } from "./temas";

export interface PasoDeGuion { rol: RolDeEscena; texto: string; locucion: string; dur: number; foto?: number }

export interface Guion {
  id: string;
  nombre: string;
  descripcion: string;
  /** Duración aproximada en segundos. */
  duracion: string;
  pasos: (c: Contenido) => PasoDeGuion[];
  transiciones: Transicion[];
}

const pagoAlRecibir = (c: Contenido) => c.sellos.some((s) => /recibir/i.test(s));

export const GUIONES: Guion[] = [
  {
    id: "clasico", nombre: "Clásico", descripcion: "Gancho, producto, dos beneficios, precio y cierre.", duracion: "18–25 s",
    transiciones: ["smoothleft", "circleopen", "slideup", "fadeblack", "zoomin", "fade"],
    pasos: (c) => {
      const gancho = c.ganchos[0] || c.titular;
      const p: PasoDeGuion[] = [{ rol: "gancho", texto: gancho, locucion: gancho, dur: 3.2 }];
      p.push({ rol: "producto", texto: c.titular, locucion: `${c.titular}: ${c.puntos[0] ? c.puntos[0] : "míralo con tus propios ojos"}.`, dur: 3.5 });
      for (const b of c.puntos.slice(0, 2)) p.push({ rol: "beneficio", texto: b, locucion: b, dur: 3.5 });
      if (c.precio) p.push({ rol: "precio", texto: `Solo ${c.precio}`, locucion: `Solo ${c.precio}${pagoAlRecibir(c) ? ", y lo pagas cuando lo recibes" : ""}.`, dur: 3.5 });
      p.push({ rol: "cierre", texto: c.cta, locucion: `${c.cta}.`, dur: 3.5 });
      return p;
    },
  },
  {
    id: "rapido", nombre: "Rápido (15 s)", descripcion: "Cuatro escenas cortas: gancho, producto, precio y cierre. Para Reels.", duracion: "12–15 s",
    transiciones: ["slideleft", "zoomin", "slideup", "fade"],
    pasos: (c) => {
      const gancho = c.ganchos[0] || c.titular;
      const p: PasoDeGuion[] = [{ rol: "gancho", texto: gancho, locucion: gancho, dur: 2.6 }];
      p.push({ rol: "producto", texto: c.titular, locucion: c.puntos[0] ? `${c.titular}. ${c.puntos[0]}.` : `${c.titular}.`, dur: 3 });
      if (c.precio) p.push({ rol: "precio", texto: c.precio, locucion: `${c.precio}${pagoAlRecibir(c) ? ", pagas al recibir" : ""}.`, dur: 2.8 });
      p.push({ rol: "cierre", texto: c.cta, locucion: `${c.cta}.`, dur: 3 });
      return p;
    },
  },
  {
    id: "beneficios", nombre: "Tres beneficios", descripcion: "Gancho, un beneficio por escena con fotos distintas y cierre con precio.", duracion: "18–22 s",
    transiciones: ["smoothup", "smoothleft", "smoothup", "smoothleft", "fade"],
    pasos: (c) => {
      const gancho = c.ganchos[0] || c.titular;
      const p: PasoDeGuion[] = [{ rol: "gancho", texto: gancho, locucion: gancho, dur: 3 }];
      const puntos = c.puntos.length ? c.puntos.slice(0, 3) : [c.titular];
      puntos.forEach((b, i) => p.push({ rol: "beneficio", texto: b, locucion: b, dur: 3.4, foto: i + 1 }));
      p.push({ rol: "cierre", texto: c.cta, locucion: c.precio ? `${c.precio}. ${c.cta}.` : `${c.cta}.`, dur: 3.6 });
      return p;
    },
  },
  {
    id: "fotos", nombre: "Pasarela de fotos", descripcion: "Cada foto real en su escena, el nombre como pie, precio y cierre.", duracion: "15–24 s",
    transiciones: ["slideleft", "slideleft", "slideleft", "slideleft", "zoomin", "fade"],
    pasos: (c) => {
      const fotos = Math.max(1, Math.min(4, c.fotos.length));
      const p: PasoDeGuion[] = [];
      for (let i = 0; i < fotos; i++) p.push({ rol: "foto", texto: i === 0 ? (c.ganchos[0] || c.titular) : c.titular, locucion: i === 0 ? (c.ganchos[0] || c.titular) : i === 1 && c.puntos[0] ? c.puntos[0] : "", dur: 2.6, foto: i });
      if (c.precio) p.push({ rol: "precio", texto: `Solo ${c.precio}`, locucion: `Solo ${c.precio}${pagoAlRecibir(c) ? ", pagas al recibir" : ""}.`, dur: 3 });
      p.push({ rol: "cierre", texto: c.cta, locucion: `${c.cta}.`, dur: 3.2 });
      return p;
    },
  },
  {
    id: "pregunta", nombre: "Pregunta y respuesta", descripcion: "Una pregunta que duele, la respuesta con el producto, precio y cierre.", duracion: "16–20 s",
    transiciones: ["fadeblack", "circleopen", "smoothleft", "slideup", "fade"],
    pasos: (c) => {
      // Si no hay un gancho en forma de pregunta, se usa una neutra que no afirma nada: "¿Buscas <producto>?".
      const conPregunta = c.ganchos.find((g) => /\?/.test(g));
      const pregunta = conPregunta || `¿Buscas ${c.titular.charAt(0).toLowerCase()}${c.titular.slice(1)}?`;
      const p: PasoDeGuion[] = [{ rol: "pregunta", texto: pregunta, locucion: pregunta, dur: 3 }];
      p.push({ rol: "respuesta", texto: c.puntos[0] || c.titular, locucion: `${c.titular}. ${c.puntos[0] || ""}`.trim(), dur: 3.4, foto: 1 });
      if (c.puntos[1]) p.push({ rol: "beneficio", texto: c.puntos[1], locucion: c.puntos[1], dur: 3.2, foto: 2 });
      if (c.precio) p.push({ rol: "precio", texto: `Solo ${c.precio}`, locucion: `Solo ${c.precio}${pagoAlRecibir(c) ? ", y lo pagas al recibir" : ""}.`, dur: 3.2 });
      p.push({ rol: "cierre", texto: c.cta, locucion: `${c.cta}.`, dur: 3.4 });
      return p;
    },
  },
];

export const GUIONES_LISTA = GUIONES.map((g) => g.id);

export function guionPorId(id?: string | null): Guion {
  return GUIONES.find((g) => g.id === String(id || "").toLowerCase()) || GUIONES[0]!;
}

export interface OpcionesEscenas {
  guion?: string | null;
  estilo?: string | null;
  tema?: string | null;
  maxBeneficios?: number;
}

/** Escenas automáticas según el guion, rotando las fotos para no repetir la misma toma. */
export function escenasAutomaticas(c: Contenido, opts: OpcionesEscenas = {}): Escena[] {
  const g = guionPorId(opts.guion);
  let pasos = g.pasos(c);
  if (opts.maxBeneficios != null) {
    let vistos = 0;
    pasos = pasos.filter((p) => (p.rol !== "beneficio" ? true : ++vistos <= opts.maxBeneficios!));
  }
  const E = resolverEstilo(opts.estilo, c);
  const tema = temaPorId(opts.tema);
  return pasos.map((p, i) => ({
    id: nuevoId("e"),
    diseno: disenoDeEscena(p.rol, p.texto, c, p.foto ?? i, { E, tema: tema.id, guion: g.id }),
    duracion: p.dur,
    locucion: p.locucion,
    transicion: g.transiciones[i % g.transiciones.length],
    movimiento: i % 2 === 0 ? "acercar" : "alejar",
  }));
}

const A = (entrada: Entrada, retraso = 0, duracion = 0.5): Animacion => ({ entrada, retraso, duracion });

export interface OpcionesEscena { E?: EstiloResuelto; estilo?: string | null; tema?: string | null; guion?: string }

/** Fotograma 9:16 de una escena según su papel. */
export function disenoDeEscena(rol: RolDeEscena, textoEscena: string, c: Contenido, indice: number, o: OpcionesEscena = {}): Diseno {
  const f = "historia" as const;
  const z = zonaSegura(f);
  const E = o.E || resolverEstilo(o.estilo, c);
  const foto = c.fotos.length ? c.fotos[indice % c.fotos.length]! : null;
  const fondoFoto = E.fondo === "foto" || E.fondo === "solido";
  const fondo: CapaFondo = fondoFoto
    ? { id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: E.paleta.fondo, imagen: foto, desenfoque: 46, oscurecer: 0.5, nombre: "Fondo" }
    : E.fondo === "degradado"
      ? { id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: { degradado: E.degradado || [E.paleta.fondo, E.paleta.superficie], angulo: 160 }, nombre: "Fondo" }
      : { id: nuevoId("f"), tipo: "fondo", x: 0, y: 0, w: z.W, h: z.H, relleno: { patron: E.patron?.id || "puntos", color: E.patron?.color || "#ffffff14", fondo: E.paleta.fondo }, nombre: "Fondo" };
  const capas: Capa[] = [fondo];
  const colorTexto = fondoFoto && foto ? "#FFFFFF" : E.paleta.texto;
  if (c.marca) capas.push(...marcaChip(z, c.marca, fondoFoto && foto ? "#FFFFFF" : E.paleta.suave, 120, E.fuentes.cuerpo));
  const arriba = rol === "gancho" || rol === "pregunta";
  const esFoto = rol === "foto";
  if (foto) {
    const yFoto = arriba ? 560 : esFoto ? 300 : 330;
    const hFoto = arriba ? 1000 : esFoto ? 1180 : 1080;
    capas.push({ id: nuevoId("i"), tipo: "imagen", src: foto, ajuste: rol === "beneficio" || esFoto || rol === "respuesta" ? "cubrir" : "contener", x: 40, y: yFoto, w: z.W - 80, h: hFoto, radio: Math.max(0, E.radio), sombra: true, nombre: "Foto del producto", anim: A(esFoto ? (indice % 2 ? "deslizar-der" : "deslizar-izq") : "zoom", 0.05, 0.7) });
  }
  const t = texto({
    x: z.m, y: arriba ? 230 : 1470, w: z.W - z.m * 2, texto: textoEscena,
    tam: arriba ? (textoEscena.length > 30 ? 84 : 104) : (textoEscena.length > 34 ? 68 : 84), min: 46, peso: 900, fuente: E.fuentes.titular,
    color: arriba ? E.paleta.textoResaltado : textoSobre(E.paleta.acento), alinear: "centro", maxLineas: 3,
    resaltado: arriba ? E.paleta.resaltado : E.paleta.acento, nombre: "Texto de la escena", mayusculas: E.mayusculas,
    anim: A(arriba ? "deslizar-arriba" : "deslizar-abajo", 0.35, 0.55),
  });
  capas.push(t.capa);
  if (rol === "precio" && c.precio) capas.push(...selloPrecio(z.W - 64 - 165, 1300, 165, c.precio, c.sellos.some((s) => /recibir/i.test(s)) ? "pagas al recibir" : null, E.paleta.resaltado, E.paleta.textoResaltado, { forma: "sello-20", fuente: E.fuentes.titular, anim: A("rebote", 0.8, 0.6) }));
  if (rol === "cierre") {
    const b = botonPara(E, c.cta);
    capas.push(...pildora(80, 1700, c.cta, { alto: 110, tam: 48, fondo: b.fondo, color: b.color, peso: 900, fuente: E.fuentes.cuerpo, anchoMin: 760, anchoMax: z.W - 160, centrarEn: z.W / 2, radio: E.radio === 0 ? 0 : undefined, anim: A("rebote", 0.9, 0.6) }).capas);
    const sello = c.sellos.find((s) => /recibir|env[ií]o/i.test(s));
    if (sello) capas.push(texto({ x: z.m, y: 1830, w: z.W - z.m * 2, texto: sello, tam: 34, min: 26, peso: 700, fuente: E.fuentes.cuerpo, color: colorTexto, alinear: "centro", maxLineas: 1, nombre: "Sello", anim: A("aparecer", 1.3) }).capa);
    if (c.precio) capas.push(...selloPrecio(z.W - 64 - 130, 480, 130, c.precio, null, E.paleta.resaltado, E.paleta.textoResaltado, { fuente: E.fuentes.titular, anim: A("rebote", 0.6, 0.6) }));
  }
  if (arriba || rol === "cierre") capas.push(...decoracionesDeTema(o.tema, f, { evitar: arriba ? ["arriba-centro"] : ["abajo-izq", "abajo-der"], conAnimacion: true, esquivar: capas }));
  return { version: 1, formato: f, ancho: FORMATOS[f].ancho, alto: FORMATOS[f].alto, plantilla: `escena-${rol}`, gancho: textoEscena, estilo: E.id, tema: o.tema || undefined, capas };
}

export function resumenDeGuiones(): Array<{ id: string; nombre: string; descripcion: string; duracion: string }> {
  return GUIONES.map((g) => ({ id: g.id, nombre: g.nombre, descripcion: g.descripcion, duracion: g.duracion }));
}
