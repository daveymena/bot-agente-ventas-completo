/**
 * ============================================================
 * CALENDARIO DE CONTENIDO ORGÁNICO
 * ============================================================
 *
 * Lo que una agencia entrega el primer día: qué se publica, qué día, en qué
 * formato y con qué intención. No "ideas de contenido" sueltas -- un plan que
 * se puede ejecutar sin volver a pensarlo.
 *
 * El admin lo pidió así: "debería darme un plan completo de publicaciones
 * orgánicas, el tiempo, todo lo que haría una agencia, ya que esto es
 * prácticamente el trabajo de una agencia".
 *
 * ── De dónde salen las reglas ────────────────────────────────────────────
 *
 * NINGUNA se inventa acá. Las cantidades y la mezcla de formatos vienen de
 * `reglas-de-pauta.ts`, que ya tenía investigado cómo trabajan las agencias:
 * 4-5 publicaciones por semana, mínimo 1 video, y la consistencia por encima
 * de la frecuencia.
 *
 * Lo que agrega este archivo es la parte que faltaba: repartir esas
 * publicaciones en la semana con una INTENCIÓN por cada una, en vez de
 * "publicá 4 cosas".
 *
 * ── La regla 80/20 ───────────────────────────────────────────────────────
 *
 * Es la que sostiene todo lo demás y la que más se incumple: 4 de cada 5
 * publicaciones dan algo sin pedir nada, y 1 vende. Una página que vende en
 * todas las publicaciones deja de tener alcance -- la gente deja de mirarla, y
 * ahí ya no importa cuántas veces publiques.
 *
 * Por eso el plan reparte por ETAPA y no por producto: el producto es lo que
 * se dice, la etapa es para qué se dice.
 */

import {
  POSTS_POR_SEMANA_MIN,
  POSTS_POR_SEMANA_MAX,
  VIDEOS_POR_SEMANA_MIN,
  type FormatoOrganico,
} from "./reglas-de-pauta";

/**
 * Para qué sirve una publicación.
 *
 * Un calendario sin esto es una lista de temas. Con esto, cada pieza sabe qué
 * tiene que lograr y se puede juzgar después si lo logró.
 */
export type EtapaDelEmbudo =
  /** Atrae a quien todavía no sabe que tiene el problema. No menciona el producto. */
  | "atraer"
  /** Le enseña algo útil a quien ya sabe que tiene el problema. Genera confianza. */
  | "educar"
  /** Muestra que la solución funciona: resultados, proceso, detrás de escena. */
  | "demostrar"
  /** La única que pide la venta. Una de cada cinco, no más. */
  | "vender";

export interface PiezaDeContenido {
  /** 1 = lunes … 7 = domingo. */
  dia: number;
  diaNombre: string;
  formato: FormatoOrganico;
  etapa: EtapaDelEmbudo;
  /** Qué tiene que lograr esta pieza, en una línea. */
  objetivo: string;
  /** El producto real del catálogo sobre el que se habla, si aplica. */
  producto?: { id: number; nombre: string };
  /** Instrucción concreta de qué grabar o escribir. */
  queHacer: string;
}

export interface PlanSemanal {
  semana: number;
  piezas: PiezaDeContenido[];
  /** Qué se está buscando esta semana, para que el admin lo pueda juzgar. */
  foco: string;
}

const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/**
 * Los días que de verdad se usan.
 *
 * Lunes, miércoles y viernes son el esqueleto de casi cualquier calendario de
 * agencia: dejan un día de por medio, que es lo que evita que el propio
 * contenido compita entre sí por el alcance. El martes y el jueves entran
 * cuando la cadencia sube a 5.
 *
 * No se publica sábado ni domingo por defecto: el alcance orgánico de fin de
 * semana es más bajo y, sobre todo, es cuando el admin no está para responder
 * los comentarios que la publicación genera. Una publicación que genera
 * preguntas sin nadie que las conteste resta.
 */
const DIAS_DE_PUBLICACION = [1, 3, 5, 2, 4];

/**
 * El orden en que se reparten las etapas.
 *
 * Arranca atrayendo y cierra vendiendo: para cuando llega la publicación de
 * venta, quien la ve ya recibió tres cosas útiles de la misma página. Vender el
 * lunes a alguien que nunca te vio es lo que hace que el alcance se caiga.
 */
const CICLO: EtapaDelEmbudo[] = ["atraer", "educar", "demostrar", "vender", "educar"];

/** El formato que mejor sirve a cada intención, dentro de los que dan alcance. */
const FORMATO_POR_ETAPA: Record<EtapaDelEmbudo, FormatoOrganico> = {
  // El reel es lo que más alcance orgánico tiene: se usa donde hace falta
  // llegar a gente que todavía no sigue la página.
  atraer: "reel",
  // Un carrusel se guarda y se vuelve a mirar, que es exactamente lo que se
  // quiere de algo que enseña.
  educar: "carrusel",
  // Mostrar que funciona pide movimiento: el resultado en video convence de
  // una forma que una foto con texto no.
  demostrar: "video",
  // La de venta es la única que puede ser imagen: quien llega acá ya está
  // convencido, y lo que necesita es el precio y a dónde escribir.
  vender: "imagen",
};

const OBJETIVO_POR_ETAPA: Record<EtapaDelEmbudo, string> = {
  atraer: "Que lo vea gente que todavía no sigue la página. No se menciona el producto.",
  educar: "Enseñar algo que sirva aunque no compre. Es lo que construye la confianza.",
  demostrar: "Mostrar que la solución funciona de verdad: proceso, resultado o detrás de escena.",
  vender: "Pedir la venta. Precio, qué incluye y a dónde escribir.",
};

/**
 * Arma la semana de publicaciones.
 *
 * `productos` son los REALES del catálogo. Si no hay ninguno, el plan igual se
 * arma pero sin nombrar productos: es preferible un calendario genérico a uno
 * que inventa un catálogo -- el error que este proyecto más ha pagado.
 */
export function planDeLaSemana(
  semana: number,
  productos: Array<{ id: number; name: string }>,
  postsPorSemana = POSTS_POR_SEMANA_MIN,
): PlanSemanal {
  const cuantas = Math.min(Math.max(postsPorSemana, POSTS_POR_SEMANA_MIN), POSTS_POR_SEMANA_MAX);
  const piezas: PiezaDeContenido[] = [];

  for (let i = 0; i < cuantas; i++) {
    const etapa = CICLO[i % CICLO.length]!;
    const dia = DIAS_DE_PUBLICACION[i % DIAS_DE_PUBLICACION.length]!;
    // Los productos rotan entre semanas para que no se hable siempre del
    // mismo: con 84 en el catálogo, repetir uno cada semana desperdicia el
    // resto. El desfase por semana es lo que hace la rotación.
    const prod = productos.length ? productos[(i + semana) % productos.length] : undefined;

    piezas.push({
      dia,
      diaNombre: DIAS[dia]!,
      formato: FORMATO_POR_ETAPA[etapa],
      etapa,
      objetivo: OBJETIVO_POR_ETAPA[etapa],
      // La etapa "atraer" NO lleva producto a propósito: es la que tiene que
      // funcionar para alguien que no sabe que existís.
      producto: etapa === "atraer" || !prod ? undefined : { id: prod.id, nombre: prod.name },
      queHacer: queHacer(etapa, prod?.name),
    });
  }

  return {
    semana,
    piezas,
    foco:
      semana === 1
        ? "Semana 1: que la página empiece a aparecer. El objetivo es alcance, no ventas."
        : `Semana ${semana}: sostener la cadencia y repetir lo que más guardó o comentó la gente.`,
  };
}

function queHacer(etapa: EtapaDelEmbudo, producto?: string): string {
  switch (etapa) {
    case "atraer":
      return "Un error común del tema, contado en 20-30 segundos. Que sirva sin comprar nada y sin nombrar el producto: es lo que hace que lo comparta alguien que todavía no te conoce.";
    case "educar":
      return producto
        ? `Tres cosas concretas que alguien aprende con "${producto}", una por lámina. Sin precio: esta pieza enseña, no vende.`
        : "Tres cosas concretas del tema, una por lámina. Sin precio: esta pieza enseña, no vende.";
    case "demostrar":
      return producto
        ? `Mostrar por dentro "${producto}": un pedazo real de lo que recibe quien compra. Ver convence más que prometer.`
        : "Mostrar el proceso o un resultado real. Ver convence más que prometer.";
    case "vender":
      return producto
        ? `La oferta de "${producto}": qué incluye, cuánto vale y a dónde escribir. Es LA publicación de venta de la semana -- las otras no venden.`
        : "La oferta: qué incluye, cuánto vale y a dónde escribir. Es la única publicación de venta de la semana.";
  }
}

/**
 * El plan completo del mes.
 *
 * Cuatro semanas es lo que una agencia entrega y lo que el algoritmo necesita
 * para mostrar algo: menos que eso no alcanza ni para saber si funcionó.
 */
export function planDelMes(
  productos: Array<{ id: number; name: string }>,
  postsPorSemana = POSTS_POR_SEMANA_MIN,
): PlanSemanal[] {
  return [1, 2, 3, 4].map((s) => planDeLaSemana(s, productos, postsPorSemana));
}

/**
 * ¿El plan cumple las reglas que dice cumplir?
 *
 * Se verifica el plan GENERADO, no la intención. Un calendario que promete
 * 80/20 y entrega 50/50 es peor que no tener calendario: el admin lo publica
 * confiando, y el alcance se le cae sin que sepa por qué.
 */
export function revisarPlan(plan: PlanSemanal): { ok: boolean; problemas: string[] } {
  const problemas: string[] = [];
  const ventas = plan.piezas.filter((p) => p.etapa === "vender").length;
  const videos = plan.piezas.filter((p) => p.formato === "reel" || p.formato === "video").length;

  if (plan.piezas.length < POSTS_POR_SEMANA_MIN) {
    problemas.push(`Solo ${plan.piezas.length} publicaciones: la cadencia mínima que sostiene el alcance es ${POSTS_POR_SEMANA_MIN}.`);
  }
  if (videos < VIDEOS_POR_SEMANA_MIN) {
    problemas.push(`${videos} videos: hacen falta al menos ${VIDEOS_POR_SEMANA_MIN} por semana, que es lo que más alcance orgánico tiene.`);
  }
  if (ventas > Math.ceil(plan.piezas.length / 5)) {
    problemas.push(`${ventas} publicaciones de venta sobre ${plan.piezas.length}: la regla es 1 de cada 5. Vender en todas hace caer el alcance.`);
  }
  if (ventas === 0) {
    problemas.push("Ninguna publicación pide la venta. Dar sin pedir nunca tampoco vende.");
  }
  // Dos publicaciones el mismo día compiten entre sí por el mismo alcance.
  const dias = plan.piezas.map((p) => p.dia);
  if (new Set(dias).size !== dias.length) {
    problemas.push("Hay dos publicaciones el mismo día: compiten entre sí por el mismo alcance.");
  }
  return { ok: problemas.length === 0, problemas };
}
