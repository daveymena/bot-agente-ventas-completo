/**
 * ── Rutas guiadas: Atlas lleva la conversación ──────────────────────────
 *
 * Pedido del dueño (14-09-2026): "siento que debo estar guiando a Atlas
 * cuando debería ser él quien guíe a un cliente que no sabe ni anunciar".
 *
 * Una ruta es una secuencia FIJA de pasos que el servidor conoce y hace
 * avanzar. En cada paso Atlas entrega una cosa y cierra con UNA pregunta de
 * sí/no. Cuando el admin dice que sí, el SERVIDOR ejecuta el paso siguiente
 * (investiga, crea la landing, escribe el anuncio) y el modelo solo lo
 * presenta. Así el cliente nunca tiene que saber qué pedir ni qué viene
 * después, y lo que pasa no depende de que el modelo se acuerde de hacerlo.
 *
 * El estado vive por sesión de chat en architect_memory (memoryType
 * "instruction", title "ruta_guiada"): sobrevive reinicios y no se mezcla
 * con el historial ("observation") ni con el plan pendiente ("decision").
 *
 * El modelo se comunica con el servidor con un marcador al final de su
 * texto, `[[ruta: productoId=168; angulo=…]]`, que nunca llega al admin.
 */
import { and, desc, eq } from "drizzle-orm";
import { db, architectMemory, products } from "@workspace/db";
import { logger } from "./logger";
import { isApproval, isRejection } from "./architect-store";
import { executeAction, investigacionRapida, type OperatorContext } from "./app-operator";
import { diagnosticoDelNegocio, GUIAS, SIGUIENTES, type SiguientePasoId } from "./diagnostico-de-inicio";

export type RutaId = "producto-nuevo" | "empezar" | "anuncio-guiado";

/**
 * Con quién habla Atlas. Pedido del dueño (14-09-2026) después de leer una
 * sesión entera: "el principiante quiere que le resuelvan; el experto quiere
 * que no lo estorben". Hoy se trataba igual a los dos: se le preguntaba todo
 * al principiante y se le explicaba todo al experto.
 */
export type Nivel = "principiante" | "experto";

export interface EstadoDeRuta {
  ruta: RutaId;
  /** 1..N. */
  paso: number;
  nivel?: Nivel;
  /** true cuando Atlas ya propuso el paso y espera el sí/no del admin. */
  esperando: boolean;
  productoId?: number;
  producto?: string;
  angulo?: string;
  landingId?: number;
  landingUrl?: string;
  /** "ventas" (a la landing) o "mensajes" (WhatsApp): se decide al escribir el anuncio y se respeta al subirlo. */
  objetivoDelAnuncio?: "ventas" | "mensajes";
  draftId?: number;
  campaignId?: string;
  /** Ruta "anuncio-guiado": plata acordada para la prueba. */
  presupuesto?: number;
  dias?: number;
  /** Ruta "empezar": lo que el diagnóstico propuso hacer primero. */
  siguiente?: SiguientePasoId;
  iniciadaEn: string;
}

interface Paso {
  nombre: string;
  /**
   * En este paso el modelo NO propone acciones: lo que había que hacer ya lo
   * hizo el servidor. Sin esto, en el paso del anuncio proponía "landing_publicar"
   * sobre una landing que ya estaba publicada (visto en la prueba del 14-09).
   */
  sinAcciones?: boolean;
  /** Palabras que hacen que el selector de herramientas cargue las de este paso. */
  pedido: string;
  /** La pregunta con la que Atlas cierra el paso si él no la escribió. */
  pregunta: (e: EstadoDeRuta) => string;
  /** Instrucción para el modelo en este turno. */
  instruccion: (e: EstadoDeRuta, entrada: string) => string;
  /**
   * Lo que el servidor hace al ENTRAR al paso (después del sí del admin).
   * Devuelve texto para el modelo con el resultado real, y puede completar
   * el estado (ids, urls).
   */
  alEntrar?: (e: EstadoDeRuta, ctx: OperatorContext, avisar: (m: string) => void) => Promise<string>;
}

const PRESUPUESTO_DIARIO_POR_DEFECTO = 20_000;

/**
 * Ruta "Vender un producto nuevo": elegir → competencia → página → anuncio → seguimiento.
 */
const PRODUCTO_NUEVO: Paso[] = [
  {
    nombre: "Elegir el producto",
    sinAcciones: true,
    pedido: "productos catálogo",
    pregunta: (e) => e.producto ? `¿Arrancamos con **${e.producto}**?` : "¿Con cuál arrancamos?",
    instruccion: (e) =>
      `Objetivo del paso: elegir UN producto para vender. Mirá el catálogo (list_products) y RECOMENDÁ uno vos: ` +
      `un físico con foto y precio, sin campaña activa; si el admin ya nombró uno, ese. Explicá en 2 líneas por qué ese ` +
      `(sin tecnicismos). No le des la lista entera ni le pidas que elija entre 16: proponé uno y, como mucho, una alternativa. ` +
      `Al final escribí el marcador con tu recomendación: [[ruta: productoId=ID; producto=NOMBRE]]. ` +
      `Cerrá con la pregunta "¿Arrancamos con ese?". Si el admin dice que él elige, pedile SOLO el nombre, en una línea, sin volver a proponer.` +
      (e.producto ? ` El admin ya tenía propuesto "${e.producto}" (id ${e.productoId}); si no lo quiere, proponé otro distinto.` : ""),
  },
  {
    nombre: "Ver qué hace la competencia",
    sinAcciones: true,
    pedido: "investigá la competencia biblioteca de anuncios web",
    pregunta: () => "¿Armo la página de venta con este ángulo?",
    instruccion: () =>
      `Objetivo del paso: contarle al admin, en lenguaje de dueño de negocio, qué está haciendo la competencia con este producto. ` +
      `Usá SOLO la investigación real que te pasa el sistema abajo (nada de datos de su cuenta). Entregá: quién lo anuncia, ` +
      `desde cuándo, el gancho que repiten, y UN ángulo recomendado para él (una frase). Máximo 8 líneas. ` +
      `Al final escribí el marcador: [[ruta: angulo=EL ÁNGULO EN UNA FRASE]]. Cerrá con la pregunta "¿Armo la página de venta con este ángulo?".`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.producto) return "[SISTEMA] No hay producto elegido: volvé a proponer uno.";
      avisar(`Investigando qué hace la competencia con ${e.producto}...`);
      const r = await investigacionRapida(ctx, `anuncios activos y competencia de "${e.producto}" en Colombia: quién lo vende, precio, gancho`, 25_000);
      return r.ok
        ? `[SISTEMA] Investigación REAL hecha por el servidor (fuentes incluidas). Usala tal cual, no prometas investigar:\n${r.texto.slice(0, 6000)}`
        : `[SISTEMA] La investigación externa no devolvió datos (${r.motivo.slice(0, 200)}). Decíselo con honestidad, proponé un ángulo con lo que se sabe del producto y seguí.`;
    },
  },
  {
    nombre: "La página de venta",
    sinAcciones: true,
    pedido: "landing página de venta",
    pregunta: () => "¿La publico y seguimos con el anuncio?",
    instruccion: (e) =>
      `Objetivo del paso: mostrarle la página de venta que el sistema YA creó (abajo está el resultado real). ` +
      `Contale en 3 líneas qué tiene (dolor → solución → pedido contraentrega o pago) y dale el enlace de vista previa si viene. ` +
      `No la vuelvas a crear ni propongas acciones (nada de propose_action): ya está creada. No escribas el encabezado "Paso N de N", lo pone el sistema. Cerrá con la pregunta "¿La publico y seguimos con el anuncio?".` +
      (e.landingId ? ` La landing es la [${e.landingId}].` : ""),
    alEntrar: async (e, ctx, avisar) => {
      if (!e.productoId) return "[SISTEMA] No hay producto elegido.";
      avisar("Armando la página de venta...");
      const r = await executeAction("landing_crear", { productId: e.productoId, objetivo: "ventas" }, ctx);
      if (!r.ok) return `[SISTEMA] La página de venta NO se pudo crear: ${r.summary}. Decíselo y ofrecé reintentar.`;
      e.landingId = Number((r as any).data?.id) || undefined;
      // landing_crear ahora genera EN SEGUNDO PLANO (ver app-operator). Acá se
      // espera un rato razonable dentro del request; si no alcanza, se dice
      // la verdad y el turno siguiente la muestra (landing_estado / la nota
      // automática del sistema).
      const listaEn = await esperarLanding(e.landingId, ctx, 90_000, avisar);
      if (listaEn.estado === "lista") {
        return `[SISTEMA] Página de venta creada por el servidor (borrador): ${listaEn.texto}`;
      }
      if (listaEn.estado === "fallo") {
        return `[SISTEMA] La página de venta NO se pudo crear: ${listaEn.texto}. Decíselo y ofrecé reintentar.`;
      }
      return `[SISTEMA] La página de venta [${e.landingId}] se está generando todavía (tarda 1 a 3 minutos). Decile al admin que ya la está armando el servidor y que en el próximo mensaje se la mostrás; NO describas su contenido ni muestres otra landing. No preguntes si la publica todavía.`;
    },
  },
  {
    nombre: "El anuncio",
    sinAcciones: true,
    pedido: "anuncio campaña facebook",
    pregunta: () => `¿Lo subo a tu cuenta de Facebook con $${PRESUPUESTO_DIARIO_POR_DEFECTO.toLocaleString("es-CO")} por día? Queda en pausa: no gasta hasta que vos lo actives.`,
    instruccion: () =>
      `Objetivo del paso: mostrarle el anuncio que el sistema YA escribió (abajo está el resultado real): el título, el texto y a dónde lleva. ` +
      `Si la página quedó publicada, dale el enlace público tal cual. ` +
      `NO propongas ni llames ninguna acción (ni landing_publicar ni propose_action): la página ya está publicada y el anuncio ya está escrito. ` +
      `Decile el presupuesto sugerido para probar (${PRESUPUESTO_DIARIO_POR_DEFECTO.toLocaleString("es-CO")} pesos por día, se puede cambiar) sin preguntarle cifras. ` +
      `No lo vuelvas a crear. Cerrá con la pregunta "¿Lo subo a tu cuenta de Facebook con ese presupuesto? Queda en pausa, no gasta hasta que lo actives".`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.producto) return "[SISTEMA] No hay producto elegido.";
      const partes: string[] = [];
      if (e.landingId) {
        // Si todavía se está generando, se espera lo que se pueda antes de
        // publicar: publicar una fila vacía sería una URL en blanco.
        const est = await esperarLanding(e.landingId, ctx, 60_000, avisar);
        if (est.estado !== "lista") {
          partes.push(`La página [${e.landingId}] ${est.estado === "fallo" ? `falló (${est.texto.slice(0, 160)})` : "sigue generándose"}; el anuncio lleva a WhatsApp por ahora y se puede publicar después con landing_publicar.`);
        }
        avisar("Publicando la página de venta...");
        const p: any = est.estado === "lista"
          ? await executeAction("landing_publicar", { id: e.landingId, publicada: true }, ctx)
          : { ok: false, summary: "landing en generación" };
        if (p.ok) {
          e.landingUrl = String((p as any).data?.url || "");
          partes.push(`Página publicada: ${e.landingUrl || p.summary}`);
        } else {
          partes.push(`La página no se pudo publicar (${p.summary}); el anuncio puede llevar a WhatsApp.`);
        }
      }
      avisar("Escribiendo el anuncio...");
      // Con la landing publicada, el anuncio lleva a la landing (campaña de
      // ventas a la web: el enlace lo resuelve destino-del-producto.ts). Sin
      // landing, abre WhatsApp, que es el camino que siempre funciona.
      e.objetivoDelAnuncio = e.landingUrl ? "ventas" : "mensajes";
      const a = await executeAction("crear_anuncio", { producto: e.producto, dailyBudget: PRESUPUESTO_DIARIO_POR_DEFECTO, objetivo: e.objetivoDelAnuncio }, ctx);
      if (!a.ok) return `[SISTEMA] ${partes.join(" ")}\nEl anuncio NO se pudo escribir: ${a.summary}. Decíselo y ofrecé reintentar.`;
      e.draftId = Number((a as any).data?.draftId) || Number((a as any).data?.id) || undefined;
      return `[SISTEMA] ${partes.join(" ")}\nAnuncio creado por el servidor (borrador${e.draftId ? ` ${e.draftId}` : ""}; ${e.landingUrl ? `lleva a la landing ${e.landingUrl}` : "abre WhatsApp"}):\n${a.summary.slice(0, 3000)}`;
    },
  },
  {
    nombre: "Activar y seguir",
    pedido: "publicar activar anuncio meta campaña",
    pregunta: (e) => e.campaignId ? "¿Lo activo ahora para que empiece a mostrarse?" : "¿Querés que lo intente de nuevo?",
    instruccion: (e) =>
      `Objetivo del paso: cerrar. ` +
      (e.campaignId
        ? `El anuncio YA está en su cuenta de Meta, en PAUSA (campaña ${e.campaignId}): no gasta nada todavía. Decíselo en una línea. ` +
          `Activarlo sí gasta plata: proponelo con propose_action → fb_resume_campaign { "campaignId": "${e.campaignId}" } (una sola acción). `
        : `El anuncio NO se pudo subir a Meta (abajo está el motivo real). Explicáselo en lenguaje simple y decile qué hacer (por ejemplo conectar Facebook en Configuración o poner un método de pago en Ads Manager); no propongas acciones. `) +
      `Después, en 3 líneas sin tecnicismos: qué va a ver en 3 días (cuánta gente escribió, cuánto costó cada mensaje) y cuándo conviene apagar o subir el presupuesto. ` +
      `Cerrá con UNA sola pregunta: ${e.campaignId ? '"¿Lo activo ahora?"' : '"¿Querés que lo intente de nuevo?"'}. Escribí el marcador [[ruta: fin]].`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.draftId) return "[SISTEMA] No hay borrador de anuncio guardado (el paso anterior no lo creó).";
      avisar("Subiendo el anuncio a tu cuenta de Facebook (en pausa)...");
      // En PAUSA no gasta: por eso lo hace el servidor con el sí del paso 4.
      // Activarlo es lo que gasta, y eso va por propose_action.
      const r = await executeAction("fb_upload_draft_to_meta", { draftId: e.draftId, objetivo: e.objetivoDelAnuncio || "mensajes" }, ctx);
      if (!r.ok) return `[SISTEMA] La subida a Meta falló: ${r.summary}`;
      e.campaignId = String(r.summary).match(/campaña\s+([\w-]+)/)?.[1] || undefined;
      return `[SISTEMA] Subido a Meta en pausa: ${r.summary}`;
    },
  },
];

/**
 * Ruta "Crear tu anuncio paso a paso": para quien NO sabe pautar.
 *
 * Pedido del dueño (29-09-2026): mucha gente no sabe hacer anuncios ni
 * publicar en Meta. Atlas tiene que ser su guía: proponer y crear el anuncio
 * completo, mostrar la foto que va a salir, enseñar cómo va a quedar, contar
 * cuánto va a valer cada cosa y pedir el sí antes de publicar.
 *
 * 7 pasos, una decisión por paso: producto → a dónde → plata → ángulo →
 * anuncio (vista previa real) → costos explicados → subir en pausa y activar.
 * Lo que se puede calcular lo calcula el SERVIDOR (presupuesto × días); lo
 * que no existe (CPM, alcance estimado) NO se inventa: se explica la mecánica
 * y cómo leer los primeros 3 días.
 */
const PRESUPUESTO_SUGERIDO = 20_000;
const DIAS_SUGERIDOS = 3;

const ANUNCIO_GUIADO: Paso[] = [
  {
    nombre: "Qué vendemos",
    sinAcciones: true,
    pedido: "productos catálogo",
    pregunta: (e) => e.producto ? `¿Hacemos el anuncio de **${e.producto}**?` : "¿De cuál producto hacemos el anuncio?",
    instruccion: (e) =>
      `Objetivo del paso: elegir UN producto con foto para anunciar. Mirá el catálogo (list_products) y RECOMENDÁ uno vos: ` +
      `un físico con foto y precio (es lo que mejor convierte para un primer anuncio); si el admin ya nombró uno, ese. ` +
      `Explicá en 2 líneas por qué ese. Mostrá su foto con ![foto](url) si tiene. ` +
      `Al final escribí el marcador: [[ruta: productoId=ID; producto=NOMBRE]]. Cerrá con "¿Hacemos el anuncio de ese?".` +
      (e.producto ? ` El admin ya tenía propuesto "${e.producto}" (id ${e.productoId}); si no lo quiere, proponé otro distinto.` : ""),
  },
  {
    nombre: "A dónde llega la gente",
    sinAcciones: true,
    pedido: "objetivos campaña whatsapp web",
    pregunta: () => "¿Lo llevamos a WhatsApp o a la página?",
    instruccion: (e) =>
      `Objetivo del paso: decidir A DÓNDE va quien toca el anuncio. Explicá las dos opciones en una línea cada una, sin tecnicismos: ` +
      `"WhatsApp" = te escriben directo a tu celular (ideal para asesorar y cerrar vos); "la página" = ven la ficha y compran solos (ideal si ya vende sola). ` +
      `Recomendá UNA según el producto${e.producto ? ` ("${e.producto}")` : ""}: si es físico con pago contra entrega, WhatsApp; si es digital con checkout, la página. ` +
      `Al final escribí el marcador con tu recomendación: [[ruta: objetivo=mensajes]] o [[ruta: objetivo=ventas]]. ` +
      `Cerrá con "¿Lo llevamos a WhatsApp o a la página?". Si dice "lo que digas", vale tu recomendación.`,
  },
  {
    nombre: "Cuánta plata",
    sinAcciones: true,
    pedido: "",
    pregunta: (e) => `¿Probamos con $${(e.presupuesto || PRESUPUESTO_SUGERIDO).toLocaleString("es-CO")} por día durante ${e.dias || DIAS_SUGERIDOS} días?`,
    instruccion: () =>
      `Objetivo del paso: acordar el presupuesto de PRUEBA. Proponé vos: $${PRESUPUESTO_SUGERIDO.toLocaleString("es-CO")} por día durante ${DIAS_SUGERIDOS} días ` +
      `(total $${(PRESUPUESTO_SUGERIDO * DIAS_SUGERIDOS).toLocaleString("es-CO")}). Explicá en 2 líneas: es plata para PROBAR, no una suscripción; ` +
      `si en 3 días nadie escribe, se apaga y no se sigue metiendo plata. Si el admin dice otra cifra o días, usá la suya. ` +
      `Al final escribí el marcador con números exactos: [[ruta: presupuesto=20000; dias=3]] (o los que diga él). ` +
      `Cerrá con "¿Probamos con esa plata?". Si dice "lo que digas" o "dale", valen los sugeridos.`,
  },
  {
    nombre: "El enfoque",
    sinAcciones: true,
    pedido: "brief anuncio ángulos",
    pregunta: () => "¿Con cuál de los 3 lo escribo? (o digo yo)",
    instruccion: () =>
      `Objetivo del paso: elegir el ENFOQUE del anuncio (el "ángulo": de qué lado se le habla al cliente). ` +
      `Usá LOS 3 ÁNGULOS REALES que te pasa el sistema abajo: presentalos numerados, uno por línea, con tu recomendado marcado. ` +
      `Explicá "ángulo" entre paréntesis la primera vez (el lado por el que se le entra al cliente: su problema, su deseo, su curiosidad). ` +
      `Al final escribí el marcador con el elegido: [[ruta: angulo=EL ÁNGULO EN UNA FRASE]]. ` +
      `Cerrá con "¿Con cuál lo escribo? Decime el número o decime 'elegí vos'". Si dice "elegí vos", vale tu recomendado.`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.productoId) return "[SISTEMA] No hay producto elegido: pedí que elija uno antes del ángulo.";
      avisar("Armando los enfoques posibles...");
      const r = await executeAction("ad_brief", { productId: e.productoId }, ctx);
      if (!r.ok) return `[SISTEMA] No se pudo armar el brief: ${r.summary}. Proponé 3 ángulos vos con lo que sabés del producto, sin inventar datos.`;
      return `[SISTEMA] Brief REAL del producto (hecho por el servidor). Usá SUS 3 ángulos tal cual, no inventes otros:\n${r.summary.slice(0, 4000)}`;
    },
  },
  {
    nombre: "Cómo va a quedar",
    sinAcciones: true,
    pedido: "crear anuncio borrador",
    pregunta: () => "¿Te gusta así o le cambio algo?",
    instruccion: () =>
      `Objetivo del paso: mostrarle el anuncio YA ESCRITO por el servidor (abajo está el resultado real) COMO SE VA A VER: ` +
      `primero la foto con ![vista previa](URL de la imagen del producto), después el TÍTULO en negrita y después el texto completo. ` +
      `Decí también a dónde lleva (WhatsApp o la página) y con cuánta plata por día quedó armado. ` +
      `NO propongas ni llames ninguna acción: ya está escrito y guardado como borrador. ` +
      `Cerrá con "¿Te gusta así o le cambio algo?". Si pide un cambio, decile que lo aplicás en el paso siguiente; ` +
      `si dice que sí, escribí el marcador [[ruta: draftid=ID]] con el id del borrador.`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.producto) return "[SISTEMA] No hay producto elegido.";
      const presupuesto = e.presupuesto && e.presupuesto > 0 ? e.presupuesto : PRESUPUESTO_SUGERIDO;
      e.presupuesto = presupuesto;
      if (!e.dias || e.dias <= 0) e.dias = DIAS_SUGERIDOS;
      const objetivo = e.objetivoDelAnuncio === "ventas" ? "ventas" : "mensajes";
      e.objetivoDelAnuncio = objetivo;
      avisar("Escribiendo tu anuncio...");
      const a = await executeAction("crear_anuncio", { producto: e.producto, dailyBudget: presupuesto, objetivo }, ctx);
      if (!a.ok) return `[SISTEMA] El anuncio NO se pudo escribir: ${a.summary}. Decíselo y ofrecé reintentar.`;
      e.draftId = Number((a as any).data?.draftId) || Number((a as any).data?.id) || undefined;
      return `[SISTEMA] Anuncio escrito por el servidor (borrador${e.draftId ? ` ${e.draftId}` : ""}, NO publicado, NO gasta):\n${a.summary.slice(0, 3000)}`;
    },
  },
  {
    nombre: "Cuánto va a valer",
    sinAcciones: true,
    pedido: "",
    pregunta: () => "¿Lo subo a tu cuenta en pausa?",
    instruccion: (e) => {
      const porDia = (e.presupuesto || PRESUPUESTO_SUGERIDO).toLocaleString("es-CO");
      const dias = e.dias || DIAS_SUGERIDOS;
      const total = ((e.presupuesto || PRESUPUESTO_SUGERIDO) * dias).toLocaleString("es-CO");
      const destino = e.objetivoDelAnuncio === "ventas" ? "tu página" : "tu WhatsApp";
      return (
        `Objetivo del paso: explicarle la plata con LOS NÚMEROS REALES ya acordados, sin inventar alcance ni costos por clic. ` +
        `Decí esto, con estas cifras: crear el anuncio salió GRATIS; subirlo en pausa es GRATIS y no gasta; ` +
        `cuando se active, Facebook muestra el anuncio a gente interesada y cobra $${porDia} por día ` +
        `(prueba de ${dias} días = $${total} en total), que se descuenta de la tarjeta de su cuenta publicitaria. ` +
        `El anuncio lleva a ${destino}. Nadie puede decirte cuántos van a escribir antes de probarlo: ` +
        `por eso son ${dias} días de prueba — si nadie escribe, se apaga y no se pierde más; si escriben, se sube. ` +
        `Cerrá con "¿Lo subo a tu cuenta en pausa?". Si pregunta por la tarjeta, decile que se pone en el Administrador de Anuncios de Meta.`
      );
    },
  },
  {
    nombre: "Publicarlo",
    pedido: "subir meta campaña pausa activar",
    pregunta: (e) => e.campaignId ? "¿Lo activo ahora para que empiece a mostrarse?" : "¿Querés que lo intente de nuevo?",
    instruccion: (e) =>
      `Objetivo del paso: cerrar. ` +
      (e.campaignId
        ? `El anuncio YA está en su cuenta de Meta, en PAUSA (campaña ${e.campaignId}): no gasta nada todavía. Decíselo en una línea. ` +
          `Activarlo sí gasta plata: proponelo con propose_action → fb_resume_campaign { "campaignId": "${e.campaignId}" } (una sola acción, el admin confirma). `
        : `El anuncio NO se pudo subir a Meta (abajo está el motivo real). Explicáselo en lenguaje simple y decile qué hacer ` +
          `(por ejemplo conectar Facebook en Configuración o poner un método de pago en Ads Manager); no propongas acciones. `) +
      `Después, en 3 líneas: qué va a ver en 3 días (cuánta gente escribió, cuánto costó cada mensaje) y cuándo conviene apagar o subir. ` +
      `Cerrá con UNA sola pregunta: ${e.campaignId ? '"¿Lo activo ahora?"' : '"¿Querés que lo intente de nuevo?"'}. Escribí el marcador [[ruta: fin]].`,
    alEntrar: async (e, ctx, avisar) => {
      if (!e.draftId) return "[SISTEMA] No hay borrador guardado (el paso anterior no lo creó).";
      avisar("Subiendo el anuncio a tu cuenta (en pausa, no gasta)...");
      const r = await executeAction("fb_upload_draft_to_meta", { draftId: e.draftId, objetivo: e.objetivoDelAnuncio || "mensajes" }, ctx);
      if (!r.ok) return `[SISTEMA] La subida a Meta falló: ${r.summary}`;
      e.campaignId = String(r.summary).match(/campaña\s+([\w-]+)/)?.[1] || undefined;
      return `[SISTEMA] Subido a Meta en pausa: ${r.summary}`;
    },
  },
];

/**
 * Ruta "No sé por dónde empezar": el servidor mira el negocio y propone UNA
 * cosa. Si es "vender un producto", se salta a esa ruta; si es algo que el
 * cliente tiene que hacer con sus manos (conectar WhatsApp, poner el pago de
 * Meta), se le explica en pasos numerados.
 */
const EMPEZAR: Paso[] = [
  {
    nombre: "Revisar tu negocio",
    sinAcciones: true,
    pedido: "productos whatsapp facebook campañas",
    pregunta: (e) => {
      const id = e.siguiente || "producto-nuevo";
      return id === "producto-nuevo" ? "¿Empezamos eligiendo qué producto vender?" : `¿Te explico cómo hacerlo? (${SIGUIENTES[id].texto.replace(/^\S+\s/, "")})`;
    },
    instruccion: (e) =>
      `Objetivo del paso: contarle cómo está su negocio HOY con los datos reales de abajo (3 líneas, sin tecnicismos, sin listar todo) ` +
      `y proponerle UNA sola cosa para empezar: la que dice el diagnóstico (${e.siguiente || "producto-nuevo"}). No le des un menú. ` +
      `Cerrá con la pregunta de sí/no correspondiente. Escribí el marcador [[ruta: siguiente=${e.siguiente || "producto-nuevo"}]].`,
    alEntrar: async (e, ctx, avisar) => {
      avisar("Revisando cómo está tu negocio...");
      const d = await diagnosticoDelNegocio(ctx);
      e.siguiente = d.siguiente.id;
      return `[SISTEMA] Diagnóstico REAL del negocio (hecho por el servidor):\n${d.texto}\nPropuesta: ${d.siguiente.texto} — ${d.siguiente.porque}`;
    },
  },
  {
    nombre: "Cómo hacerlo",
    sinAcciones: true,
    pedido: "configuración whatsapp facebook productos",
    pregunta: () => "¿Seguimos cuando lo tengas listo?",
    instruccion: (e) => {
      const id = e.siguiente && e.siguiente !== "producto-nuevo" ? e.siguiente : null;
      return id
        ? `Objetivo del paso: explicarle cómo hacer esto con sus manos. Usá EXACTAMENTE esta guía (podés acomodar el tono, no el contenido):\n${GUIAS[id]}\n` +
          `Sin tecnicismos. Terminá diciéndole que cuando lo tenga, toque "Vender un producto nuevo" o te escriba "listo", y escribí el marcador [[ruta: fin]].`
        : `Objetivo del paso: decirle que ya puede empezar a vender y que toque "Vender un producto nuevo". Escribí el marcador [[ruta: fin]].`;
    },
  },
];

const RUTAS: Record<RutaId, { nombre: string; pasos: Paso[] }> = {
  "producto-nuevo": { nombre: "Vender un producto nuevo", pasos: PRODUCTO_NUEVO },
  empezar: { nombre: "Empezar", pasos: EMPEZAR },
  "anuncio-guiado": { nombre: "Crear tu anuncio paso a paso", pasos: ANUNCIO_GUIADO },
};

// ── Estado por sesión ────────────────────────────────────────────────────

const TITULO = "ruta_guiada";

export async function cargarRuta(tenantId: number, sessionId: string): Promise<EstadoDeRuta | null> {
  try {
    const [row] = await db
      .select()
      .from(architectMemory)
      .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.sessionId, sessionId), eq(architectMemory.memoryType, "instruction"), eq(architectMemory.title, TITULO)))
      .orderBy(desc(architectMemory.createdAt))
      .limit(1);
    if (!row) return null;
    const e = JSON.parse(row.content) as EstadoDeRuta;
    return e && RUTAS[e.ruta] ? e : null;
  } catch (err) {
    logger.warn({ err, tenantId, sessionId }, "[Ruta] No se pudo leer el estado de la ruta");
    return null;
  }
}

export async function guardarRuta(tenantId: number, sessionId: string, e: EstadoDeRuta): Promise<void> {
  await cerrarRuta(tenantId, sessionId);
  await db.insert(architectMemory).values({
    tenantId,
    sessionId,
    memoryType: "instruction",
    title: TITULO,
    content: JSON.stringify(e),
    tags: ["ruta_guiada"],
    metadata: { ruta: e.ruta, paso: e.paso },
  });
}

export async function cerrarRuta(tenantId: number, sessionId: string): Promise<void> {
  await db
    .delete(architectMemory)
    .where(and(eq(architectMemory.tenantId, tenantId), eq(architectMemory.sessionId, sessionId), eq(architectMemory.memoryType, "instruction"), eq(architectMemory.title, TITULO)));
}

/**
 * Lo que la ruta ejecuta POR SU CUENTA al entrar a cada paso. Si el modelo lo
 * propone también, es un duplicado y se descarta. Cualquier OTRA acción es el
 * admin pidiendo otra cosa (borrar campañas, cambiar un precio): antes se
 * tiraba igual, en silencio, y Atlas contestaba "dejé preparado el borrado"
 * sin que hubiera nada que confirmar (sesión del 24-09-2026, cinco veces).
 */
export const LO_QUE_EJECUTA_LA_RUTA = new Set(["landing_crear", "landing_publicar", "crear_anuncio", "fb_upload_draft_to_meta"]);

export function separarAccionesDeLaRuta<T extends { tool: string }>(acciones: T[]): { duplicadas: T[]; otroPedido: T[] } {
  return {
    duplicadas: acciones.filter((a) => LO_QUE_EJECUTA_LA_RUTA.has(a.tool)),
    otroPedido: acciones.filter((a) => !LO_QUE_EJECUTA_LA_RUTA.has(a.tool)),
  };
}

/** El encabezado "Paso N de N" que pone `cerrarTurnoDeRuta`, para sacarlo si la ruta se cierra en ese mismo turno. */
export function sinEncabezadoDePaso(texto: string): string {
  return String(texto || "").replace(ENCABEZADO_DE_PASO, "");
}

// ── Detección ────────────────────────────────────────────────────────────

const INICIO_PRODUCTO_NUEVO = /\b(vender\s+(un\s+)?(producto\s+)?nuevo|producto\s+nuevo|nuevo\s+producto|quiero\s+(empezar\s+a\s+)?vender|empezar\s+a\s+vender|lanzar\s+(un\s+)?producto|ay[uú]dame\s+a\s+vender)\b/i;
const INICIO_EMPEZAR = /\b(no\s+s[eé]\s+por\s+d[oó]nde\s+empezar|por\s+d[oó]nde\s+empiezo|qu[eé]\s+hago\s+primero|c[oó]mo\s+empiezo|revis[aá]\s+(mi|el)\s+negocio)\b/i;
/**
 * Arranca la ruta "Crear tu anuncio paso a paso". Solo con señales de
 * PRINCIPIANTE o pedido explícito de guía: un "creá un anuncio para X" a
 * secas sigue por el flujo experto normal (proponer → confirmar → crear),
 * sin meterlo en 7 pasos que no pidió.
 */
const INICIO_ANUNCIO_GUIADO = /\b(no\s+s[eé]\s+(hacer|crear|nada\s+de)\s+(anuncios?|pauta|publicidad)|nunca\s+(he\s+)?(paut[eé]|anunciado|(hecho|hice)\s+(un\s+)?anuncio)|gu[ií]ame\s+(con\s+)?(el\s+|mi\s+|los\s+)?anuncios?|paso\s+a\s+paso.*anuncio|anuncio.*paso\s+a\s+paso|primer\s+anuncio|quiero\s+(publicitar|anunciar|pautar)(.*(no\s+s[eé]|c[oó]mo|ayuda|gu[ií]a))?|c[oó]mo\s+(hago|creo|publico|subo)\s+(un\s+)?anuncio|ens[eé][ñn]ame\s+a\s+(pautar|anunciar))\b/i;
/** Los botones del diagnóstico mandan estos mensajes: van directo a la guía. */
const GUIA_DIRECTA: Array<{ patron: RegExp; id: Exclude<SiguientePasoId, "producto-nuevo"> }> = [
  { patron: /conectar\s+whatsapp/i, id: "whatsapp" },
  { patron: /cargar\s+mi\s+primer\s+producto|primer\s+producto/i, id: "productos" },
  { patron: /arreglar\s+el\s+pago|pago\s+de\s+(la\s+cuenta\s+de\s+)?facebook|m[eé]todo\s+de\s+pago/i, id: "meta-pago" },
  { patron: /conectar\s+facebook/i, id: "meta-conectar" },
];
const SALIDA = /\b(sal[ií]\s+de\s+la\s+ruta|cancel[aá]\s+(la\s+)?ruta|dejemos\s+(esto|la\s+ruta)|olvid[aá]lo|par[aá]\s+la\s+ruta|no\s+sigamos)\b/i;

/**
 * Un texto largo PEGADO no es el admin pidiendo una ruta. Caso real del
 * 24-09-2026: pegó la pantalla de Marketing para preguntar por qué se veía
 * así, esa pantalla trae de ejemplo “quiero vender más el curso de piano”, y
 * la ruta arrancó sola -- a partir de ahí cada "si" avanzaba un paso en vez
 * de borrar las campañas que estaba pidiendo. Pedir una ruta es una frase
 * corta y propia: lo citado entre comillas es un ejemplo, no un pedido.
 */
const LARGO_MAXIMO_DE_UN_INICIO = 280;

export function detectarInicioDeRuta(prompt: string): RutaId | null {
  const bruto = String(prompt || "");
  if (bruto.length > LARGO_MAXIMO_DE_UN_INICIO) return null;
  const t = bruto.replace(/“[^”]*”|"[^"]*"|«[^»]*»/g, " ");
  if (INICIO_EMPEZAR.test(t) || GUIA_DIRECTA.some((g) => g.patron.test(t))) return "empezar";
  // El que habla como experto (CPM, ROAS, conjuntos, lookalike) no quiere 7
  // pasos: usa el flujo corto aunque diga "quiero pautar".
  if (INICIO_ANUNCIO_GUIADO.test(t) && !HABLA_COMO_EXPERTO.test(t)) return "anuncio-guiado";
  return INICIO_PRODUCTO_NUEVO.test(t) ? "producto-nuevo" : null;
}

export function guiaDirectaPedida(prompt: string): Exclude<SiguientePasoId, "producto-nuevo"> | null {
  const t = String(prompt || "");
  return GUIA_DIRECTA.find((g) => g.patron.test(t))?.id ?? null;
}

export function pideSalirDeRuta(prompt: string): boolean {
  return SALIDA.test(String(prompt || ""));
}

// ── Nivel: principiante o experto ────────────────────────────────────────
//
// Se deduce de cómo escribe (vocabulario de pauta) o de lo que dice de sí
// mismo. No se pregunta con un formulario: se lee, y queda guardado en la
// ruta. Si no hay señal, principiante: es más barato explicarle de más a un
// experto que dejar colgado a alguien que no sabe qué es un "ángulo".
const DICE_EXPERTO = /\b(ya\s+s[eé]\s+pautar|s[eé]\s+pautar|ya\s+(he\s+)?paut[eé]|soy\s+experto|solo\s+ejecut[aá]|sin\s+explicar|no\s+me\s+expliques)\b/i;
const DICE_PRINCIPIANTE = /\b(soy\s+nuevo|nunca\s+(he\s+)?paut[eé]|no\s+s[eé]\s+(nada\s+de\s+)?(esto|pautar|anunciar)|no\s+entiendo\s+(nada|de\s+esto)|expl[ií]came|desde\s+cero|primera\s+vez)\b/i;
const HABLA_COMO_EXPERTO = /\b(cpm|ctr|cpc|cpa|roas|ads\s*manager|conjuntos?\s+de\s+anuncios|p[ií]xel|lookalike|retargeting|creativos?|copy|segmentaci[oó]n|presupuesto\s+diario|abo|cbo)\b/i;

export function detectarNivel(prompt: string): Nivel | null {
  const t = String(prompt || "");
  if (DICE_PRINCIPIANTE.test(t)) return "principiante";
  if (DICE_EXPERTO.test(t)) return "experto";
  if (HABLA_COMO_EXPERTO.test(t)) return "experto";
  return null;
}

// ── El producto que el admin nombró ──────────────────────────────────────
//
// "FAJA HOT TRIMMER" escrito por el admin ES la elección. En la sesión del
// 14-09 Atlas contestó con la ficha del producto y volvió a preguntar
// "¿Arrancamos con ese?" -- cuarta vez en el mismo paso. Si lo nombró, el
// paso 1 terminó y el servidor sigue solo.
const N = (x: string) =>
  String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ\s]/g, " ");
const GENERICAS = new Set(["para", "unisex", "mujer", "hombre", "original", "nuevo", "nueva", "producto", "curso", "pack", "kit", "mega", "completo", "completa", "digital", "online", "desde", "cero", "nivel", "basico", "avanzado", "acero", "mango", "color", "negro", "blanco", "talla", "unidad", "unidades"]);

export function productoNombrado<T extends { id: number; name: string }>(prompt: string, catalogo: T[]): T | null {
  const enPrompt = new Set(N(prompt).match(/[a-z0-9ñ]{3,}/g) ?? []);
  if (enPrompt.size === 0) return null;
  let mejor: { p: T; puntos: number } | null = null;
  let empate = false;
  for (const p of catalogo) {
    const propias = (N(p.name).match(/[a-z0-9ñ]{3,}/g) ?? []).filter((w) => !GENERICAS.has(w));
    if (propias.length === 0) continue;
    const casan = propias.filter((w) => enPrompt.has(w)).length;
    // Un nombre de una sola palabra propia se acepta con ella; los demás
    // piden al menos dos, o la mitad, para que "faja" sola no elija entre
    // dos fajas.
    const minimo = propias.length === 1 ? 1 : Math.max(2, Math.ceil(propias.length / 2));
    if (casan < minimo) continue;
    if (!mejor || casan > mejor.puntos) { mejor = { p, puntos: casan }; empate = false; }
    else if (casan === mejor.puntos) empate = true;
  }
  return mejor && !empate ? mejor.p : null;
}

async function catalogoDelTenant(tenantId: number): Promise<Array<{ id: number; name: string }>> {
  try {
    const rows = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.tenantId, tenantId));
    return rows.map((r) => ({ id: Number(r.id), name: String(r.name || "") }));
  } catch (err) {
    logger.warn({ err, tenantId }, "[Ruta] No se pudo leer el catálogo para reconocer el producto nombrado");
    return [];
  }
}

// ── Marcador del modelo ──────────────────────────────────────────────────

const MARCADOR_RUTA = /\[\[\s*ruta\s*:\s*([^\]]*)\]\]/gi;

export function avanceQueDeclara(texto: string): { campos: Record<string, string>; fin: boolean; textoLimpio: string } {
  const campos: Record<string, string> = {};
  let fin = false;
  const limpio = String(texto || "").replace(MARCADOR_RUTA, (_m, lista: string) => {
    for (const par of lista.split(";")) {
      const [k, ...v] = par.split("=");
      const clave = String(k || "").trim().toLowerCase();
      const valor = v.join("=").trim();
      if (clave === "fin") fin = true;
      else if (clave && valor) campos[clave] = valor.slice(0, 300);
    }
    return "";
  }).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { campos, fin, textoLimpio: limpio };
}

// ── El turno ─────────────────────────────────────────────────────────────

export interface RutaEnTurno {
  estado: EstadoDeRuta;
  paso: Paso;
  total: number;
  /** Lo que se suma al pedido para que el selector cargue las herramientas del paso. */
  pedidoExtra: string;
  /** Instrucción [SISTEMA] para el modelo, con el resultado real del paso si el servidor lo ejecutó. */
  instruccion: string;
  /** El servidor investigó en este turno (para que el guardián de "investigué" no lo desmienta). */
  investigo: boolean;
}

function instruccionPorNivel(nivel: Nivel | undefined): string {
  if (nivel === "experto") {
    return (
      `El admin YA SABE pautar: dale los datos y el control. Máximo 4 líneas, sin explicar términos, sin justificar lo obvio, ` +
      `sin motivarlo. Mostrá la decisión tomada y qué se puede cambiar; puede saltar pasos o corregir cualquier cosa y vos lo aplicás. `
    );
  }
  return (
    `El admin es PRINCIPIANTE: decidí vos y resolvele; solo preguntale lo que no podés decidir por él (qué producto, cuánta plata, ` +
    `y el sí antes de gastar). Si usás una palabra del oficio ("ángulo", "conjunto de anuncios"), explicala en la misma línea, en cinco palabras. ` +
    `Una decisión por paso, con tu respuesta ya puesta: un "ok" avanza. `
  );
}

/**
 * Antes de hablarle al modelo: arranca, avanza o sigue la ruta según lo que
 * dijo el admin, y ejecuta lo que le toca al servidor en el paso nuevo.
 */
export async function prepararRuta(o: {
  tenantId: number;
  sessionId: string;
  prompt: string;
  ctx: OperatorContext;
  avisar: (m: string) => void;
}): Promise<RutaEnTurno | null> {
  const prompt = String(o.prompt || "");
  let estado = await cargarRuta(o.tenantId, o.sessionId);

  if (estado && pideSalirDeRuta(prompt)) {
    await cerrarRuta(o.tenantId, o.sessionId);
    return null;
  }

  const inicio = detectarInicioDeRuta(prompt);
  let entrada = "";
  let investigo = false;
  let recienIniciada = false;
  if (inicio && (!estado || estado.ruta !== inicio || guiaDirectaPedida(prompt))) {
    const guia = inicio === "empezar" ? guiaDirectaPedida(prompt) : null;
    estado = { ruta: inicio, paso: guia ? 2 : 1, esperando: false, iniciadaEn: new Date().toISOString(), ...(guia ? { siguiente: guia } : {}) };
    recienIniciada = true;
    logger.info({ tenantId: o.tenantId, sessionId: o.sessionId, ruta: inicio, guia }, "[Ruta] Ruta iniciada");
    // Lo que el servidor hace al entrar al PRIMER paso (ej. el diagnóstico).
    const primero = RUTAS[inicio].pasos[estado.paso - 1];
    if (primero.alEntrar) {
      try {
        entrada = await primero.alEntrar(estado, o.ctx, o.avisar);
      } catch (e: any) {
        logger.warn({ err: e?.message }, "[Ruta] Falló lo que el servidor hace al iniciar la ruta");
        entrada = `[SISTEMA] No se pudo revisar el negocio (${e?.message || e}). Decíselo con honestidad y proponé empezar eligiendo un producto.`;
      }
    }
    await guardarRuta(o.tenantId, o.sessionId, estado);
  }
  if (!estado) return null;

  let def = RUTAS[estado.ruta];

  const nivelLeido = detectarNivel(prompt);
  if (nivelLeido && nivelLeido !== estado.nivel) {
    estado.nivel = nivelLeido;
    await guardarRuta(o.tenantId, o.sessionId, estado);
  }

  // El servidor entra al paso siguiente: ejecuta lo suyo y guarda.
  const avanzar = async () => {
    const e = estado!;
    e.paso += 1;
    e.esperando = false;
    const paso = def.pasos[e.paso - 1];
    if (paso.alEntrar) {
      try {
        entrada = await paso.alEntrar(e, o.ctx, o.avisar);
        investigo = e.paso === 2 && /Investigación REAL/.test(entrada);
      } catch (err: any) {
        logger.warn({ err: err?.message, paso: e.paso }, "[Ruta] Falló lo que el servidor hace al entrar al paso");
        entrada = `[SISTEMA] Este paso no se pudo preparar (${err?.message || err}). Decíselo al admin con honestidad y ofrecé reintentar.`;
      }
    }
    await guardarRuta(o.tenantId, o.sessionId, e);
  };

  // En el paso 1, nombrar el producto ES elegirlo: no se vuelve a preguntar.
  // Vale para las dos rutas que empiezan eligiendo producto.
  const nombrado = (estado.ruta === "producto-nuevo" || estado.ruta === "anuncio-guiado") && estado.paso === 1 && !recienIniciada && !isApproval(prompt) && !isRejection(prompt)
    ? productoNombrado(prompt, await catalogoDelTenant(o.tenantId))
    : null;

  if (recienIniciada) {
    // La ruta arrancó en este mismo turno: no hay nada que aprobar todavía.
  } else if (estado.ruta === "empezar" && estado.paso === 1 && estado.esperando && isApproval(prompt) && (estado.siguiente || "producto-nuevo") === "producto-nuevo") {
    // "Empezar" → el sí a "¿empezamos eligiendo qué producto vender?" cambia
    // a la ruta de producto, sin pedirle que toque otro botón.
    estado = { ruta: "producto-nuevo", paso: 1, esperando: false, iniciadaEn: new Date().toISOString(), nivel: estado.nivel };
    def = RUTAS[estado.ruta];
    await guardarRuta(o.tenantId, o.sessionId, estado);
    logger.info({ tenantId: o.tenantId, sessionId: o.sessionId }, "[Ruta] De 'empezar' a 'producto-nuevo'");
  } else if (nombrado && estado.paso < def.pasos.length) {
    estado.productoId = nombrado.id;
    estado.producto = nombrado.name;
    logger.info({ tenantId: o.tenantId, productoId: nombrado.id }, "[Ruta] El admin nombró el producto: paso 1 listo");
    await avanzar();
  } else if (estado.esperando && isApproval(prompt) && estado.paso < def.pasos.length) {
    // El admin dijo que sí: el SERVIDOR hace el paso siguiente.
    await avanzar();
  } else if (estado.esperando && isRejection(prompt)) {
    entrada = "[SISTEMA] El admin NO quiere esa propuesta. Proponé otra distinta para este mismo paso, sin repetir la anterior.";
  }

  const paso = def.pasos[estado.paso - 1];
  const instruccion =
    `\n\n[SISTEMA] RUTA GUIADA "${def.nombre}" — paso ${estado.paso} de ${def.pasos.length}: ${paso.nombre}. ` +
    `Vos llevás la conversación: entregá este paso completo y cerrá SIEMPRE con UNA pregunta de sí/no ofreciendo el siguiente. ` +
    `No escribas el encabezado "Paso N de N" (lo pone el sistema). ` +
    `Nada de "decime qué querés": decidí vos y proponé. ` +
    instruccionPorNivel(estado.nivel) +
    `CÓMO ESCRIBIR: como una persona que sabe, no como un folleto. Que se lea de un vistazo en el celular: ` +
    `un título corto en **negrita** con su emoji de marcador por bloque (📦 producto, 🔎 competencia, 💰 plata, 📢 anuncio), ` +
    `línea en blanco entre bloques, párrafos de 2-3 líneas, lista con viñetas solo cuando enumerás, cifras y nombres en **negrita**. ` +
    `Un emoji por bloque, no en cada línea, y sin frases hechas ("compra por impulso", "se entiende en 3 segundos"). ` +
    `NUNCA hables de tu mecánica: ni herramientas, ni "me pidió iniciar sesión", ni "no me alcanzó el tiempo", ni "no te invento"; ` +
    `si algo no se pudo saber, no lo menciones salvo que cambie la decisión. Una sola respuesta: no repitas nada que ya dijiste en esta ruta. ` +
    (nombrado ? `El admin acaba de nombrar el producto (${nombrado.name}): ya está elegido, NO vuelvas a preguntar si arrancamos con ese. ` : "") +
    paso.instruccion(estado, entrada) +
    (entrada ? `\n\n${entrada}` : "");

  return { estado, paso, total: def.pasos.length, pedidoExtra: paso.pedido, instruccion, investigo };
}

const TERMINA_PREGUNTANDO = /\?\s*(\*+)?\s*$/;

/**
 * Párrafos que hablan de la cocina de Atlas y no del negocio. En la sesión
 * del 14-09 le contó al admin que "la búsqueda me pidió iniciar sesión", que
 * "no te las describo de memoria ni te las invento" y que "no me alcanzó el
 * tiempo del turno". Nada de eso le sirve para decidir; se quita entero.
 */
const MECANICA_INTERNA = /(me pidi[oó] iniciar sesi[oó]n|no me dej[oó] abrir|tiempo del turno|no te (?:las |los |lo |la )?(?:invento|describo de memoria)|no te invento|me devolvi[oó] (?:los textos|solo)|no pude leer|no me alcanz[oó]|con las im[aá]genes no te puedo|herramienta)/i;

export function sinMecanicaInterna(texto: string): string {
  const parrafos = String(texto || "").split(/\n{2,}/);
  const limpios = parrafos.filter((p) => !MECANICA_INTERNA.test(p));
  // Si se fuera todo, mejor el texto original que un mensaje vacío.
  return limpios.length ? limpios.join("\n\n").trim() : String(texto || "").trim();
}
/** El encabezado que pone el sistema; si el modelo lo copió del historial, se quita para no duplicarlo. */
const ENCABEZADO_DE_PASO = /^\s*\**\s*Paso\s+\d+\s+de\s+\d+\s*[·:\-–]\s*[^\n]*\**\s*\n+/i;

/**
 * Aplica al estado lo que el modelo declaró en su marcador
 * (`[[ruta: productoId=..; objetivo=..; presupuesto=..; dias=..; ...]]`).
 * Función pura para poder probarla sin base de datos.
 */
export function aplicarMarcadores(e: EstadoDeRuta, campos: Record<string, string>): EstadoDeRuta {
  if (campos.productoid && Number(campos.productoid) > 0) e.productoId = Number(campos.productoid);
  if (campos.producto) e.producto = campos.producto;
  if (campos.angulo) e.angulo = campos.angulo;
  if (campos.landingid && Number(campos.landingid) > 0) e.landingId = Number(campos.landingid);
  if (campos.siguiente && (campos.siguiente in SIGUIENTES)) e.siguiente = campos.siguiente as SiguientePasoId;
  const obj = String(campos.objetivo || "").toLowerCase();
  if (/mensaje|whatsapp/.test(obj)) e.objetivoDelAnuncio = "mensajes";
  else if (/venta/.test(obj)) e.objetivoDelAnuncio = "ventas";
  const pres = Number(String(campos.presupuesto || "").replace(/[^\d]/g, ""));
  if (Number.isFinite(pres) && pres > 0) e.presupuesto = pres;
  const dias = Number(String(campos.dias || "").replace(/[^\d]/g, ""));
  if (Number.isFinite(dias) && dias > 0 && dias <= 90) e.dias = dias;
  if (campos.draftid && Number(campos.draftid) > 0) e.draftId = Number(campos.draftid);
  return e;
}

/**
 * Después del modelo: guarda lo que declaró, quita el marcador, pone el
 * encabezado del paso y garantiza que termina proponiendo el siguiente.
 */
export async function cerrarTurnoDeRuta(o: {
  tenantId: number;
  sessionId: string;
  ruta: RutaEnTurno;
  texto: string;
}): Promise<string> {
  const { estado, paso, total } = o.ruta;
  const decl = avanceQueDeclara(o.texto);
  aplicarMarcadores(estado, decl.campos);

  let texto = sinMecanicaInterna(decl.textoLimpio.replace(ENCABEZADO_DE_PASO, "").replace(ENCABEZADO_DE_PASO, ""));
  // Basta con que el cierre (últimas líneas) tenga una pregunta: el modelo a
  // veces la escribe y remata con una frase ("…hasta que lo actives.").
  const cierre = texto.slice(-240);
  if (!TERMINA_PREGUNTANDO.test(texto) && !/\?/.test(cierre)) {
    texto = `${texto}\n\n${paso.pregunta(estado)}`;
  }
  texto = `**Paso ${estado.paso} de ${total} · ${paso.nombre}**\n\n${texto}`;

  if (decl.fin || (estado.paso >= total)) {
    await cerrarRuta(o.tenantId, o.sessionId);
    logger.info({ tenantId: o.tenantId, sessionId: o.sessionId }, "[Ruta] Ruta terminada");
  } else {
    estado.esperando = true;
    await guardarRuta(o.tenantId, o.sessionId, estado);
  }
  return texto;
}

/** Para la pantalla: el saludo con las metas que Atlas sabe guiar. */
export const METAS_DE_INICIO = [
  { id: "producto-nuevo", texto: "🚀 Vender un producto nuevo", mensaje: "Quiero vender un producto nuevo" },
  { id: "anuncio-guiado", texto: "📢 No sé hacer anuncios: guíame", mensaje: "No sé hacer anuncios, guíame paso a paso" },
  { id: "vender-mas", texto: "📈 Vender más de lo que ya tengo", mensaje: "Ayúdame a vender más de un producto que ya tengo" },
  { id: "empezar", texto: "🧭 No sé por dónde empezar", mensaje: "No sé por dónde empezar" },
  { id: "experto", texto: "⚡ Ya sé pautar: solo ejecutá", mensaje: "Ya sé pautar, quiero vender un producto nuevo: solo ejecutá" },
];


/**
 * Espera a que una landing generada en segundo plano termine, hasta `maxMs`.
 * Devuelve el estado tal como lo describe app-operator (generando/lista/fallo).
 */
async function esperarLanding(
  landingId: number | undefined,
  ctx: OperatorContext,
  maxMs: number,
  avisar: (t: string) => void,
): Promise<{ estado: "generando" | "lista" | "fallo"; texto: string }> {
  if (!landingId) return { estado: "fallo", texto: "sin id de landing" };
  const t0 = Date.now();
  let avisado = false;
  for (;;) {
    const r: any = await executeAction("landing_estado", { id: landingId }, ctx);
    const estado = String(r?.data?.estado || (r?.ok ? "lista" : "fallo")) as "generando" | "lista" | "fallo";
    if (estado !== "generando") return { estado, texto: String(r?.summary || "") };
    if (Date.now() - t0 > maxMs) return { estado: "generando", texto: String(r?.summary || "") };
    if (!avisado && Date.now() - t0 > 15_000) { avisar("La página se está generando, un momento..."); avisado = true; }
    await new Promise((res) => setTimeout(res, 3000));
  }
}
