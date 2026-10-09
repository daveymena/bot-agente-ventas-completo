import { and, eq } from "drizzle-orm";
import { db, products, settings } from "@workspace/db";
import { planDeLaSemana, textoDeLaPieza, type PiezaDeContenido } from "./calendario-de-contenido";
import { POSTS_POR_SEMANA_MIN } from "./reglas-de-pauta";
import { publishToPage, checkPostingPermission } from "./facebook-page-posts";
import { programar, registrarManejador } from "./programador";
import { instanteEnZona, horaLocal, zonaValida } from "./zona-horaria";
import { tenantManager } from "./tenantManager";
import { logger } from "./logger";

/**
 * ============================================================
 * EL AGENTE ORGÁNICO — PUBLICA COMO UNA AGENCIA
 * ============================================================
 *
 * Lo que hace una agencia con el contenido orgánico no es escribir mejor: es
 * publicar SIEMPRE. Cuatro veces por semana, todas las semanas, a la misma
 * hora, sin depender de que alguien se acuerde. Está en `reglas-de-pauta.ts`:
 * "la CONSISTENCIA gana a la frecuencia -- una página que publica cuatro veces
 * todas las semanas rinde más que una que publica siete una semana y
 * desaparece dos".
 *
 * Las tres piezas ya existían por separado y ninguna se hablaba con la otra:
 *
 *   `calendario-de-contenido.ts`  sabe QUÉ publicar cada día
 *   `facebook-page-posts.ts`      sabe CÓMO publicarlo
 *   `programador.ts`              sabe CUÁNDO (recién ahora)
 *
 * Este archivo es el que las junta.
 *
 * ── Qué hace solo y qué no ───────────────────────────────────────────────
 *
 * Publicar en la propia página no gasta un peso, así que corre solo: la regla
 * de "lo que gasta plata espera el sí" no aplica acá. Lo que SÍ se respeta es
 * la otra regla de la casa: no se publica nada inventado. Si una pieza necesita
 * datos del producto y el negocio no los cargó, `textoDeLaPieza` devuelve null
 * y esa pieza NO se agenda. Un calendario con un hueco es honesto; una
 * publicación que promete lo que no hay, no.
 */

/**
 * A qué hora sale cada publicación, en hora local del negocio.
 *
 * Dos franjas y no una: el mediodía y la tarde-noche son los dos momentos en
 * que la gente mira el teléfono sin estar trabajando. Se alternan para que la
 * página no aparezca siempre en el mismo horario --si un seguidor solo entra
 * de noche, nunca vería lo que se publica a las 12.
 *
 * ⚠️ Estos números son un punto de partida razonable, no una medición de ESTE
 * negocio. Cuando la página tenga historial propio, la hora tiene que salir de
 * ahí y no de acá: es exactamente lo que hace `franjas-horarias.ts` con los
 * anuncios. Mientras tanto se dice lo que es, en vez de presentarlo como un
 * dato optimizado.
 */
const FRANJAS = [12, 19];

/** Nunca dos publicaciones el mismo día, aunque el plan las pida. */
const HORA_POR_INDICE = (i: number) => FRANJAS[i % FRANJAS.length];

export const TIPO_PUBLICAR = "organico:publicar";
export const TIPO_PROGRAMAR_SEMANA = "organico:programar-semana";

/** El número de semana ISO. Es lo que hace estable la clave del trabajo. */
export function semanaISO(d: Date): { anio: number; semana: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Al jueves de esa semana: la semana ISO es la que contiene su jueves.
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const anio = t.getUTCFullYear();
  const enero1 = new Date(Date.UTC(anio, 0, 1));
  const semana = Math.ceil(((t.getTime() - enero1.getTime()) / 86_400_000 + 1) / 7);
  return { anio, semana };
}

async function zonaDelNegocio(tenantId: number): Promise<string> {
  try {
    const [s] = await db.select().from(settings).limit(1);
    return zonaValida((s as any)?.timezone);
  } catch {
    return zonaValida(null);
  }
}

export interface ResultadoDeProgramacion {
  agendadas: number;
  omitidas: Array<{ dia: string; porQue: string }>;
  /** Null si se pudo programar; el motivo si el negocio no está listo. */
  bloqueo: string | null;
}

/**
 * Deja agendada la semana de publicaciones de un negocio.
 *
 * Es idempotente por diseño: las claves son estables (`organico:<tenant>:<año>-W<semana>:<día>`),
 * así que correrlo dos veces no duplica nada, y correrlo después de que ya
 * salió el post del martes no lo vuelve a publicar. Eso está probado en
 * `programador.test.ts`.
 */
export async function programarLaSemana(
  tenantId: number,
  cuando = new Date(),
): Promise<ResultadoDeProgramacion> {
  const tenant = (await tenantManager.getTenantById(tenantId)) || tenantManager.getDefaultTenant();

  // Se comprueba el permiso ANTES de agendar. Agendar cinco publicaciones que
  // van a fallar una por una durante la semana llena el registro de errores y
  // le hace creer al admin que su página está publicando.
  const faltaPermiso = await checkPostingPermission(tenant);
  if (faltaPermiso) {
    return { agendadas: 0, omitidas: [], bloqueo: faltaPermiso };
  }

  const catalogo = await db
    .select({ id: products.id, name: products.name, price: products.price, currency: products.currency, features: products.features, description: products.description, imageUrl: products.imageUrl })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

  const zona = await zonaDelNegocio(tenantId);
  const { anio, semana } = semanaISO(cuando);
  const plan = planDeLaSemana(semana, catalogo.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })), POSTS_POR_SEMANA_MIN);

  const hoy = horaLocal(zona, cuando);
  const omitidas: ResultadoDeProgramacion["omitidas"] = [];
  let agendadas = 0;

  for (let i = 0; i < plan.piezas.length; i++) {
    const pieza = plan.piezas[i];
    const producto = pieza.producto ? catalogo.find((p: { id: number }) => p.id === pieza.producto!.id) : undefined;

    const texto = textoDeLaPieza(pieza, producto as any);
    if (!texto) {
      omitidas.push({ dia: pieza.diaNombre, porQue: "el producto no tiene los datos que esa pieza necesita" });
      continue;
    }

    const hora = HORA_POR_INDICE(i);
    const correAt = fechaDeLaPieza(zona, hoy, pieza, hora);

    // Lo que ya pasó esta semana no se agenda: publicar el viernes lo del
    // lunes descoloca todo el calendario y se nota.
    if (correAt.getTime() <= cuando.getTime()) {
      omitidas.push({ dia: pieza.diaNombre, porQue: "ese día ya pasó en esta semana" });
      continue;
    }

    const r = await programar({
      tenantId,
      tipo: TIPO_PUBLICAR,
      clave: `organico:${tenantId}:${anio}-W${semana}:${pieza.dia}`,
      correAt,
      datos: {
        texto,
        productId: producto?.id ?? null,
        productName: producto?.name ?? null,
        imageUrl: (producto as any)?.imageUrl ?? null,
        etapa: pieza.etapa,
        formato: pieza.formato,
        diaNombre: pieza.diaNombre,
      },
    });
    if (r.creado) agendadas++;
  }

  logger.info({ tenantId, anio, semana, agendadas, omitidas: omitidas.length }, "[Orgánico] Semana agendada");
  return { agendadas, omitidas, bloqueo: null };
}

/** El instante de esta semana en que le toca a la pieza. */
function fechaDeLaPieza(
  zona: string,
  hoy: { anio: number; mes: number; dia: number; diaSemana: number },
  pieza: PiezaDeContenido,
  hora: number,
): Date {
  // Se cuenta desde el LUNES de la semana en curso para que el día de la pieza
  // caiga siempre en la semana que se está programando, sin importar qué día
  // se corra. Avanzar sobre el calendario y no sumando milisegundos, por el
  // cambio de horario (ver zona-horaria.ts).
  const lunes = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia - (hoy.diaSemana - 1)));
  const dia = new Date(Date.UTC(lunes.getUTCFullYear(), lunes.getUTCMonth(), lunes.getUTCDate() + (pieza.dia - 1)));
  return instanteEnZona(zona, dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate(), hora);
}

/**
 * Publica una pieza. Es el manejador que corre cuando llega su hora.
 *
 * Lanza en caso de fallo a propósito: el programador lo reintenta con espera
 * creciente. Que Meta esté caída diez minutos no debería costar una
 * publicación de la semana.
 */
async function publicarPieza(ctx: { tenantId: number; datos: Record<string, any> }) {
  // Sin respaldo al negocio por defecto: si el negocio no se encuentra, caer
  // al de relleno publicaba con la página (y el .env) del dueño de la
  // plataforma. Se lanza para que el programador lo reintente.
  const tenant = await tenantManager.getTenantById(ctx.tenantId);
  if (!tenant) throw new Error(`negocio ${ctx.tenantId} no encontrado`);
  const r = await publishToPage(
    {
      productId: ctx.datos.productId ?? 0,
      productName: ctx.datos.productName ?? "",
      message: String(ctx.datos.texto || ""),
      imageUrl: ctx.datos.imageUrl ?? null,
      link: null,
    },
    tenant,
  );

  if (!r.ok) throw new Error(r.error || "Facebook rechazó la publicación");
  return { postId: r.postId, permalink: r.permalink, etapa: ctx.datos.etapa };
}

/**
 * Vuelve a agendar la semana. Corre a diario y es inofensivo repetirlo.
 *
 * Es diario y no semanal por un motivo concreto: si el servidor estuvo caído
 * el lunes --un despliegue, una caída del VPS-- un trabajo semanal perdería la
 * semana entera. Uno diario recupera lo que quede de ella.
 */
async function revisarLaSemana(ctx: { tenantId: number }) {
  const r = await programarLaSemana(ctx.tenantId);
  if (r.bloqueo) {
    // No se lanza: que la página no esté conectada no es un fallo del trabajo,
    // y reintentarlo tres veces no la va a conectar. Queda registrado y el
    // trabajo vuelve mañana.
    logger.warn({ tenantId: ctx.tenantId, bloqueo: r.bloqueo }, "[Orgánico] No se pudo agendar");
  }
  return r as any;
}

/**
 * Deja registrado quién atiende cada tipo de trabajo.
 *
 * ⚠️ Se llama en el ARRANQUE, no al activar el agente, y la diferencia importa:
 * las publicaciones de esta semana ya están agendadas en la base. Si el
 * registro dependiera de que alguien active el agente, un reinicio del servidor
 * dejaría todos esos trabajos sin nadie que los atienda -- el programador los
 * vería vencer una y otra vez sin poder ejecutarlos. Registrar es barato y no
 * agenda nada; activar es lo que agenda.
 */
export function registrarOrganico(): void {
  registrarManejador(TIPO_PUBLICAR, publicarPieza as any);
  registrarManejador(TIPO_PROGRAMAR_SEMANA, revisarLaSemana as any);
  // Sin bandera de "ya registré": `registrarManejador` guarda en un Map, así
  // que llamarlo dos veces es inofensivo. La bandera SÍ hacía daño -- quedaba
  // en true aunque el registro se hubiera vaciado, y entonces esta función
  // volvía sin registrar nada y los trabajos agendados se quedaban sin quién
  // los atienda. Lo encontró `automatizacion-enganchada.test.ts`.
}


/**
 * Enciende el agente para un negocio.
 *
 * El trabajo diario se agenda a las 6 de la mañana hora local: temprano, antes
 * de la primera franja de publicación, para que si algo hay que corregir haya
 * margen.
 */
export async function activarAgenteOrganico(tenantId: number): Promise<void> {
  registrarOrganico();

  const zona = await zonaDelNegocio(tenantId);
  const hoy = horaLocal(zona);
  const manana = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + (hoy.hora >= 6 ? 1 : 0)));

  await programar({
    tenantId,
    tipo: TIPO_PROGRAMAR_SEMANA,
    clave: `organico:revision-diaria:${tenantId}`,
    correAt: instanteEnZona(zona, manana.getUTCFullYear(), manana.getUTCMonth() + 1, manana.getUTCDate(), 6),
    repiteCadaMin: 24 * 60,
  });

  // Y una pasada ahora, para no esperar a mañana en el primer encendido.
  await programarLaSemana(tenantId);
}

