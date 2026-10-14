/**
 * Herramientas de Atlas para el Estudio de anuncios.
 *
 * Con esto Atlas puede buscar plantillas (31.000+ combinaciones de maqueta ×
 * estilo × tema, más las propias del negocio), generar el paquete de imágenes
 * y el vídeo de un producto con sus fotos reales, pintar una pieza suelta
 * ("hazme una de Navidad para el corrector"), cambiar un texto por rol y
 * consultar el estado. Las descripciones van en español y dicen "requiere
 * confirmación" cuando crean archivos, igual que el resto de app-operator.
 *
 * Regla de la casa: los textos que Atlas ponga tienen que salir de la ficha
 * del producto, de las condiciones del negocio o de las palabras del dueño.
 */
import { FORMATOS_LISTA, PLANTILLAS, PLANTILLAS_LISTA, GUIONES, TEMAS, ESTILOS_BASE, type Formato } from "./diseno";
import { buscarPlantillas, listarPersonales, totalDePlantillas } from "./plantillas";

export interface HerramientaEstudio {
  name: string;
  description: string;
  args: string;
  run: (args: any, ctx: { tenantId: number }) => Promise<{ ok: boolean; summary: string; data?: any }>;
}

const num = (v: any) => (v === undefined || v === null || v === "" ? undefined : Number(v));
const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const formato = (v: any): Formato | undefined => (FORMATOS_LISTA.includes(v as Formato) ? (v as Formato) : undefined);
const appUrl = () => (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");

async function avisar(tenantId: number, texto: string): Promise<void> {
  try { const { avisarAlDueno } = await import("../avisos"); await avisarAlDueno(tenantId, texto); } catch { /* sin aviso */ }
}

export const HERRAMIENTAS_ESTUDIO: HerramientaEstudio[] = [
  {
    name: "estudio_plantillas",
    description: "Busca plantillas del Estudio de anuncios (solo lee): maquetas × estilos × temas (Navidad, Amor y Amistad, Día de la Madre, Halloween, Black Friday, mascotas, fitness…) y las propias del negocio. Devuelve ids para estudio_generar / estudio_pieza.",
    args: '{ "q"?: string (palabras, p. ej. "navidad oferta"), "categoria"?: "producto"|"oferta"|"beneficios"|"gancho", "tema"?: string, "estilo"?: string, "pagina"?: number }',
    run: async (args, ctx) => {
      const r = buscarPlantillas({ q: str(args?.q), categoria: str(args?.categoria), tema: str(args?.tema), estilo: str(args?.estilo), pagina: num(args?.pagina) || 1, porPagina: 10 });
      const propias = await listarPersonales(ctx.tenantId).catch(() => []);
      const maquetas = PLANTILLAS_LISTA.map((m) => `${m} (${PLANTILLAS[m].nombre}: ${PLANTILLAS[m].descripcion})`).join("; ");
      const temas = TEMAS.map((t) => `${t.id}=${t.nombre}`).join(", ");
      const estilos = ESTILOS_BASE.map((e) => e.id).join(", ");
      const guiones = GUIONES.map((g) => `${g.id} (${g.nombre}, ${g.duracion})`).join("; ");
      const resultados = r.items.map((p) => `• ${p.id} — ${p.nombre} [${p.categoria}]`).join("\n");
      const summary = [
        `🎨 Estudio de anuncios: ${totalDePlantillas().toLocaleString("es-CO")} plantillas (maqueta.estilo.tema). Un id se arma así: "oferta.pop.navidad" (maqueta.estilo.tema); también sirve solo la maqueta ("oferta") o maqueta.estilo.`,
        `Maquetas: ${maquetas}.`,
        `Temas: ${temas}.`,
        `Estilos base (hay ${estilos.split(", ").length} + 100 paletas): ${estilos}.`,
        `Guiones de vídeo: ${guiones}.`,
        propias.length ? `Plantillas propias del negocio (id personal:<id>): ${propias.slice(0, 10).map((p) => `personal:${p.id} "${p.nombre}" (${p.formato})`).join(", ")}.` : "Plantillas propias: ninguna todavía (se guardan desde el editor del panel en /estudio-anuncios).",
        r.total ? `Resultados${str(args?.q) ? ` para "${str(args?.q)}"` : ""} (${r.total.toLocaleString("es-CO")}, página ${r.pagina}):\n${resultados}` : `Sin resultados para esa búsqueda; prueba con otra palabra o un tema de la lista.`,
        `Vista previa de cualquier plantilla: ${appUrl()}/api/estudio-anuncios/plantillas/<id>/vista-previa.jpg?formato=vertical`,
      ].join("\n");
      return { ok: true, summary, data: { total: r.total, items: r.items.map((p) => p.id), propias: propias.map((p) => `personal:${p.id}`) } };
    },
  },
  {
    name: "estudio_generar",
    description: "Genera en segundo plano el PAQUETE de anuncios de un producto con sus fotos REALES: imágenes 1:1, 4:5 y 9:16 por cada plantilla pedida (por defecto 4 plantillas × 3 formatos = 12 piezas) y el vídeo vertical con voz. Acepta plantilla, estilo, tema (Navidad, Amor y Amistad…) y guion del vídeo. Tarda 1–4 min y avisa por WhatsApp/Telegram; el dueño puede retocar todo en el panel (/estudio-anuncios). Crea archivos → requiere confirmación.",
    args: '{ "productId": number (req), "plantillas"?: string[] (ids de estudio_plantillas, p. ej. ["oferta.pop.navidad", "destacado"]; máx 12), "estilo"?: string, "tema"?: string, "guion"?: "clasico"|"rapido"|"beneficios"|"fotos"|"pregunta", "formatos"?: ("cuadrado"|"vertical"|"historia")[], "conVideo"?: boolean (por defecto true), "conIA"?: boolean (ganchos extra con IA, por defecto false), "ganchos"?: string[] (frases del dueño para usar como gancho) }',
    run: async (args, ctx) => {
      const id = num(args?.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'." };
      const { pedirPaquete, estadoCompleto } = await import("./estudio");
      const { colaDelEstudio } = await import("./cola");
      try {
        const formatos = Array.isArray(args?.formatos) ? args.formatos.map(formato).filter(Boolean) as Formato[] : undefined;
        const trabajo = await pedirPaquete(ctx.tenantId, id, {
          plantillas: Array.isArray(args?.plantillas) ? args.plantillas.map(String).slice(0, 12) : undefined,
          formatos: formatos?.length ? formatos : undefined,
          estilo: str(args?.estilo), tema: str(args?.tema), guion: str(args?.guion),
          conVideo: args?.conVideo !== false, conIA: args?.conIA === true,
          ganchos: Array.isArray(args?.ganchos) ? args.ganchos.map(String).slice(0, 5) : undefined,
        });
        void colaDelEstudio().esperar(`paquete:${id}`)?.then(async (t) => {
          if (t.estado === "fallo") { await avisar(ctx.tenantId, `⚠️ No pude generar los anuncios del producto ${id}: ${t.error}`); return; }
          const e = await estadoCompleto(ctx.tenantId, id).catch(() => null);
          const n = e?.estudio?.imagenes?.length || 0;
          await avisar(ctx.tenantId, `🎨 *Anuncios listos* del producto ${id}: ${n} imágenes${args?.conVideo !== false ? " (el vídeo sigue armándose)" : ""}.\nRevísalos y edítalos en ${appUrl()}/estudio-anuncios?producto=${id}`);
        });
        return { ok: true, summary: trabajo.estado === "en_curso" || trabajo.estado === "pendiente" ? `🎨 Generando los anuncios del producto ${id}${str(args?.tema) ? ` con tema ${str(args?.tema)}` : ""}${str(args?.estilo) ? `, estilo ${str(args?.estilo)}` : ""}: imágenes en 1:1, 4:5 y 9:16${args?.conVideo !== false ? " y luego el vídeo vertical" : ""}. Tarda 1–4 min; aviso por WhatsApp/Telegram. Para consultarlo: estudio_estado. Editor: ${appUrl()}/estudio-anuncios?producto=${id}` : `Trabajo en estado ${trabajo.estado}.` };
      } catch (e: any) { return { ok: false, summary: `No se pudo encolar: ${e?.message || e}` }; }
    },
  },
  {
    name: "estudio_pieza",
    description: "Pinta UNA imagen de anuncio del producto con una plantilla concreta (catálogo o propia) y devuelve el enlace al instante (sin cola). Ideal para pedidos puntuales: \"una de Navidad en vertical para el producto 12\". Crea un archivo → requiere confirmación.",
    args: '{ "productId": number (req), "plantilla": string (req; id de estudio_plantillas, p. ej. "oferta.pop.navidad" o "personal:p-abc"), "formato"?: "cuadrado"|"vertical"|"historia" (por defecto vertical 4:5), "estilo"?: string, "tema"?: string, "gancho"?: string (frase del dueño o de la ficha para el titular; nada inventado) }',
    run: async (args, ctx) => {
      const id = num(args?.productId);
      const plantilla = str(args?.plantilla);
      if (!id || !plantilla) return { ok: false, summary: "Faltan 'productId' y/o 'plantilla'." };
      const { generarPieza, absoluta } = await import("./estudio");
      try {
        const img = await generarPieza(ctx.tenantId, id, { plantilla, formato: formato(args?.formato), estilo: str(args?.estilo), tema: str(args?.tema), gancho: str(args?.gancho) });
        const textos = img.diseno.capas.filter((k) => k.tipo === "texto").map((k: any) => `${k.nombre}: "${k.texto}"`).join(" | ");
        return { ok: true, summary: `🖼️ Pieza lista (${img.plantilla}, ${img.ancho}×${img.alto}): ${absoluta(img.url)}\nTextos: ${textos}. Para cambiar un texto: estudio_editar_texto con piezaId "${img.id}".`, data: { piezaId: img.id, url: absoluta(img.url) } };
      } catch (e: any) { return { ok: false, summary: `No se pudo pintar: ${e?.message || e}` }; }
    },
  },
  {
    name: "estudio_editar_texto",
    description: "Cambia textos de una pieza ya generada por su rol (Gancho, Precio, Texto del botón, Beneficio, Marca, Nombre del producto) y la vuelve a pintar. Solo con frases que el dueño dijo o que están en la ficha/condiciones del negocio: nunca inventes descuentos, cifras ni promesas. Modifica un archivo → requiere confirmación.",
    args: '{ "productId": number (req), "piezaId": string (req; el id que devolvió estudio_pieza o estudio_estado), "cambios": { "Gancho"?: string, "Precio"?: string, "Texto del botón"?: string, "Beneficio"?: string, "Marca"?: string } (req) }',
    run: async (args, ctx) => {
      const id = num(args?.productId);
      const piezaId = str(args?.piezaId);
      const cambios = args?.cambios && typeof args.cambios === "object" ? args.cambios : null;
      if (!id || !piezaId || !cambios) return { ok: false, summary: "Faltan 'productId', 'piezaId' y/o 'cambios'." };
      const { editarTextosDePieza, absoluta } = await import("./estudio");
      try {
        const img = await editarTextosDePieza(ctx.tenantId, id, piezaId, cambios);
        return { ok: true, summary: `✏️ Pieza ${piezaId} repintada: ${absoluta(img.url)}`, data: { url: absoluta(img.url) } };
      } catch (e: any) { return { ok: false, summary: `No se pudo editar: ${e?.message || e}` }; }
    },
  },
  {
    name: "estudio_video",
    description: "Arma (o rearma) el VÍDEO vertical 9:16 del Estudio para un producto con sus fotos reales: escenas con entradas animadas, transiciones, voz en off y música opcional. Elige guion (clasico, rapido, beneficios, fotos, pregunta), estilo y tema. Corre en segundo plano (2–5 min) y avisa por WhatsApp/Telegram. Crea un archivo → requiere confirmación.",
    args: '{ "productId": number (req), "guion"?: "clasico"|"rapido"|"beneficios"|"fotos"|"pregunta", "estilo"?: string, "tema"?: string, "conVoz"?: boolean (por defecto true), "conMusica"?: boolean (por defecto true) }',
    run: async (args, ctx) => {
      const id = num(args?.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'." };
      const { pedirVideo, absoluta } = await import("./estudio");
      const { colaDelEstudio } = await import("./cola");
      try {
        await pedirVideo(ctx.tenantId, id, { guion: str(args?.guion), estilo: str(args?.estilo), tema: str(args?.tema), conVoz: args?.conVoz !== false, conMusica: args?.conMusica !== false });
        void colaDelEstudio().esperar<any>(`video:${id}`)?.then(async (t) => {
          if (t.estado === "fallo") { await avisar(ctx.tenantId, `⚠️ No pude armar el vídeo del producto ${id}: ${t.error}`); return; }
          const v = t.resultado;
          await avisar(ctx.tenantId, `🎬 *Vídeo listo* del producto ${id}${v?.duracion ? ` (${v.duracion}s, ${v.escenas} escenas${v.conVoz ? ", con voz" : ""})` : ""}\n${v?.url ? absoluta(v.url) : `${appUrl()}/estudio-anuncios?producto=${id}`}`);
        });
        return { ok: true, summary: `🎬 Armando el vídeo del producto ${id}${str(args?.guion) ? ` con el guion "${str(args?.guion)}"` : ""}${str(args?.tema) ? `, tema ${str(args?.tema)}` : ""}. Tarda 2–5 min; aviso por WhatsApp/Telegram. Para consultarlo: estudio_estado.` };
      } catch (e: any) { return { ok: false, summary: `No se pudo encolar el vídeo: ${e?.message || e}` }; }
    },
  },
  {
    name: "estudio_estado",
    description: "Estado del Estudio de anuncios de un producto (solo lee): imágenes con enlaces e ids de pieza, vídeo y trabajos en cola.",
    args: '{ "productId": number (req) }',
    run: async (args, ctx) => {
      const id = num(args?.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'." };
      const { estadoCompleto } = await import("./estudio");
      const e = await estadoCompleto(ctx.tenantId, id);
      if (!e) return { ok: false, summary: `No existe el producto ${id}.` };
      const est = e.estudio;
      const tp = e.trabajos?.paquete, tv = e.trabajos?.video;
      const imagenes: any[] = est.imagenes || [];
      const lineas = [
        `🎨 Estudio del producto ${id} (${e.producto?.nombre || ""}).`,
        tp && tp.estado !== "listo" ? `Paquete: ${tp.estado} ${tp.progreso ?? 0}% ${tp.detalle || ""}${tp.error ? ` — ${tp.error}` : ""}` : `Paquete: ${est.paquete?.estado || "sin generar"}${est.paquete?.tema ? ` (tema ${est.paquete.tema})` : ""}.`,
        imagenes.length ? `Imágenes (${imagenes.length}):\n${imagenes.slice(0, 12).map((i) => `• ${i.id} (${i.plantilla}, ${i.formato}${i.editada ? ", editada" : ""}): ${i.urlAbsoluta || i.url}`).join("\n")}` : "Imágenes: ninguna todavía.",
        tv && tv.estado !== "listo" ? `Vídeo: ${tv.estado} ${tv.progreso ?? 0}% ${tv.detalle || ""}${tv.error ? ` — ${tv.error}` : ""}` : est.video?.url ? `Vídeo: ${est.video.urlAbsoluta || est.video.url} (${est.video.duracion}s, ${est.video.escenas} escenas${est.video.conVoz ? ", con voz" : ""})` : `Vídeo: ${est.video?.estado || "sin generar"}${est.video?.error ? ` — ${est.video.error}` : ""}.`,
        `Editor del panel: ${appUrl()}/estudio-anuncios?producto=${id}`,
      ];
      return { ok: true, summary: lineas.join("\n"), data: { imagenes: imagenes.map((i) => ({ id: i.id, url: i.urlAbsoluta || i.url })), video: est.video || null } };
    },
  },
];
