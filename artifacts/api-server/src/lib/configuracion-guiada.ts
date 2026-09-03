/**
 * ============================================================
 * DEJAR EL AGENTE CONFIGURADO, SIN SABER DE ESTO
 * ============================================================
 *
 * El dueño lo pidió así el 2026-09-02: *"si yo he pasado trabajo creando mi
 * propio agente, cómo será alguien que no sabe nada de esto. Necesito que
 * Atlas ayude a los clientes a dejar todo bien configurado, darle opciones de
 * elegir, cuál es la mejor opción, y ser guiado — pero todo muy profesional"*.
 *
 * Y tiene razón en el diagnóstico: hoy todo vive en el código, así que cada
 * negocio nuevo depende de que alguien lo toque a mano. Eso no se puede vender.
 *
 * ── Por qué OPCIONES y no preguntas abiertas ─────────────────────────────
 *
 * "¿Qué tono querés para tu agente?" deja mudo a cualquiera que no venda por
 * WhatsApp hace años. Es la misma trampa que un formulario vacío: parece
 * flexible y en realidad es abandono. A un dueño que recién empieza hay que
 * mostrarle tres caminos concretos, decirle qué cambia en la práctica con cada
 * uno, y cuál conviene en SU caso.
 *
 * ── Y por qué hay una recomendación, no una lista neutra ─────────────────
 *
 * Una lista de opciones sin recomendación traslada el problema: el dueño
 * sigue sin saber cuál elegir, y elige al azar o no elige. Cada decisión de
 * acá viene con una marcada y con el MOTIVO -- que además se puede discutir,
 * porque está escrito.
 *
 * Donde se puede, la recomendación sale de SUS datos: si el catálogo es 100%
 * digital, la entrega recomendada es el acceso inmediato, no un envío. Eso es
 * lo que separa un asistente de un formulario con estilo.
 */

import { PERFILES } from "./estilo-de-venta";

export interface Opcion {
  /** Lo que el dueño ve y elige. */
  id: string;
  etiqueta: string;
  /** Qué cambia de verdad para su cliente. En castellano llano. */
  queCambia: string;
  /** Marcada para este negocio en particular. */
  recomendada?: boolean;
  /** Por qué se recomienda ACÁ. Sale de sus datos cuando se puede. */
  porQue?: string;
}

export interface Decision {
  /** El campo que se va a guardar. */
  campo: string;
  /** La pregunta, tal como conviene hacérsela. */
  pregunta: string;
  /** Qué se pierde si queda sin configurar. Es lo que justifica preguntarla. */
  siNoSeConfigura: string;
  opciones: Opcion[];
}

export interface EstadoDelNegocio {
  /** Lo que ya está guardado en el perfil del negocio. */
  perfil: Record<string, any>;
  /** Cuántos productos digitales y físicos tiene cargados. */
  catalogo: { digitales: number; fisicos: number; servicios: number };
  /** El nombre del negocio, para que las preguntas no suenen genéricas. */
  nombreDelNegocio?: string | null;
}

/**
 * Las decisiones que faltan, EN ORDEN DE LO QUE MÁS DUELE.
 *
 * No es el orden en que están escritas: es el orden en que se pierden ventas.
 * Un negocio sin garantía configurada pierde al cliente que desconfía, que es
 * la objeción más común; uno sin tono configurado suena genérico, que molesta
 * pero no frena una compra.
 */
export function loQueFalta(e: EstadoDelNegocio): Decision[] {
  const p = e.perfil || {};
  const { digitales, fisicos, servicios } = e.catalogo;
  const mayormenteDigital = digitales > fisicos && digitales > servicios;
  const mayormenteFisico = fisicos > digitales;
  const hayServicios = servicios > 0;

  const pendientes: Decision[] = [];

  // ── 1. Cómo se entrega ────────────────────────────────────────────────
  //
  // Primero porque es LA pregunta que hace todo el mundo antes de pagar, y la
  // que hoy deja al bot diciendo "eso te lo confirmo".
  if (!p.entrega) {
    pendientes.push({
      campo: "entrega",
      pregunta: "¿Cómo le llega el producto a tu cliente después de pagar?",
      siNoSeConfigura:
        "Ante “¿cómo me llega?” el bot contesta que lo confirma. Es la pregunta más común justo antes de pagar, " +
        "y quedarse sin respuesta ahí es donde más ventas se caen.",
      opciones: [
        {
          id: "acceso_inmediato",
          etiqueta: "Acceso inmediato, apenas se confirma el pago",
          queCambia: "El cliente recibe el enlace por WhatsApp en cuanto vos aprobás el pago.",
          recomendada: mayormenteDigital,
          porQue: mayormenteDigital
            ? `De tus ${digitales + fisicos + servicios} productos, ${digitales} son digitales: no hay nada que despachar.`
            : undefined,
        },
        {
          id: "envio_domicilio",
          etiqueta: "Envío a domicilio",
          queCambia: "El bot le pide la dirección y coordina la entrega con vos.",
          recomendada: mayormenteFisico,
          porQue: mayormenteFisico ? `Tenés ${fisicos} productos físicos, que hay que despachar.` : undefined,
        },
        {
          id: "agenda_cita",
          etiqueta: "Se agenda una cita",
          queCambia: "El bot acuerda día y hora en vez de hablar de envíos.",
          recomendada: hayServicios && !mayormenteDigital && !mayormenteFisico,
          porQue: hayServicios ? "Tenés servicios cargados, y un servicio no se envía: se agenda." : undefined,
        },
      ],
    });
  }

  // ── 2. La garantía ────────────────────────────────────────────────────
  if (!p.garantia) {
    pendientes.push({
      campo: "garantia",
      pregunta: "¿Ofrecés garantía o devolución? ¿De cuántos días?",
      siNoSeConfigura:
        "El bot no puede contestarle al cliente que desconfía, que es la objeción que más ventas frena. " +
        "Y no se la inventa a propósito: prometer una garantía que no existe es peor que no tenerla.",
      opciones: [
        {
          id: "7",
          etiqueta: "7 días",
          queCambia: "El bot puede decir “tenés 7 días para pedir la devolución” ante cualquier duda.",
          recomendada: true,
          porQue: "Es lo más usado y alcanza para que el cliente se anime; más días aumentan las devoluciones sin vender mucho más.",
        },
        { id: "15", etiqueta: "15 días", queCambia: "Más margen para el cliente; también más ventana de devolución." },
        { id: "30", etiqueta: "30 días", queCambia: "Da mucha confianza, pero conviene solo si tu producto se usa rápido." },
        {
          id: "0",
          etiqueta: "Sin garantía",
          queCambia: "El bot lo dice de frente en vez de esquivarlo. Es honesto, y se puede sostener si el producto se entrega al instante.",
        },
      ],
    });
  }

  // ── 3. Cuánto dura el acceso ──────────────────────────────────────────
  if (!p.acceso && digitales > 0) {
    pendientes.push({
      campo: "acceso",
      pregunta: "El material que vendés, ¿por cuánto tiempo lo puede usar tu cliente?",
      siNoSeConfigura: "Ante “¿es de por vida?” el bot no puede responder, y prometerlo sin saberlo sería mentir.",
      opciones: [
        {
          id: "de_por_vida",
          etiqueta: "De por vida",
          queCambia: "Lo descarga una vez y es suyo para siempre.",
          recomendada: true,
          porQue: "Es lo normal en material descargable, y es el argumento que más ayuda a justificar un pago único.",
        },
        { id: "un_anio", etiqueta: "Un año", queCambia: "Tenés que avisarle cuando se vence, y el bot lo va a decir desde el principio." },
        { id: "mientras_activo", etiqueta: "Mientras la plataforma esté activa", queCambia: "Honesto para material alojado en un servicio de terceros." },
      ],
    });
  }

  // ── 4. El tono ────────────────────────────────────────────────────────
  if (!p.tono) {
    const quien = e.nombreDelNegocio ? `de ${e.nombreDelNegocio}` : "tuyo";
    pendientes.push({
      campo: "tono",
      pregunta: `¿Cómo querés que hable el asesor ${quien}?`,
      siNoSeConfigura: "El bot usa el tono por defecto, que puede no parecerse en nada a cómo hablás vos con tus clientes.",
      opciones: [
        {
          id: "cercano",
          etiqueta: "Cercano y directo",
          queCambia: "Tutea, va al grano, usa emojis con medida. Suena a persona atendiendo.",
          recomendada: true,
          porQue: "Es el que mejor funciona por WhatsApp: la gente escribe informal y espera que le contesten igual.",
        },
        { id: "formal", etiqueta: "Formal y profesional", queCambia: "Trata de usted, sin emojis. Sirve para servicios profesionales o ticket alto." },
        { id: "entusiasta", etiqueta: "Entusiasta", queCambia: "Más energía y emojis. Funciona en productos de impulso; cansa en compras pensadas." },
        { id: "tecnico", etiqueta: "Técnico y preciso", queCambia: "Dato antes que adjetivo. Para clientes que comparan especificaciones." },
      ],
    });
  }

  // ── 5. Si el precio se negocia ────────────────────────────────────────
  if (p.negociaPrecio === undefined || p.negociaPrecio === null) {
    pendientes.push({
      campo: "negociaPrecio",
      pregunta: "Si un cliente pide rebaja, ¿el bot puede ceder?",
      siNoSeConfigura: "Ante un “¿me lo dejás más barato?” el bot no sabe si puede, y termina contestando algo ambiguo que el cliente lee como un sí.",
      opciones: [
        {
          id: "no",
          etiqueta: "No, el precio es el mismo para todos",
          queCambia: "El bot sostiene el precio y explica por qué vale, en vez de regatear.",
          recomendada: true,
          porQue: "Si rebajás, le quitás valor al precio y al producto. Además el que consigue rebaja lo cuenta, y el siguiente la pide.",
        },
        { id: "si", etiqueta: "Sí, puede ofrecer un descuento", queCambia: "Vas a tener que decirle hasta cuánto, y el bot lo va a usar." },
      ],
    });
  }

  // ── 6. Qué NO hace el negocio ─────────────────────────────────────────
  if (!Array.isArray(p.noPuede) || p.noPuede.length === 0) {
    pendientes.push({
      campo: "noPuede",
      pregunta: "¿Hay algo que tu negocio NO hace y que conviene aclarar?",
      siNoSeConfigura: "Sin esto el bot puede prometer algo que no ofrecés, y eso termina en un reclamo después de cobrar.",
      opciones: [
        { id: "no_factura", etiqueta: "No emitimos factura electrónica", queCambia: "El bot lo aclara si se lo preguntan, en vez de decir que sí." },
        { id: "no_envio_internacional", etiqueta: "No enviamos fuera del país", queCambia: "Evita cerrar una venta que después hay que devolver." },
        { id: "no_clases_vivo", etiqueta: "No hay clases en vivo ni tutor", queCambia: "El cliente lo sabe antes de pagar, no después." },
        { id: "ninguna", etiqueta: "Por ahora ninguna", queCambia: "Se puede agregar cuando aparezca." },
      ],
    });
  }

  // ── 7. Cómo vende ────────────────────────────────────────────────────
  //
  // Va última a propósito. Las seis de arriba son DATOS que el bot no puede
  // inventar --sin ellos improvisa o miente--; ésta es una preferencia, y el
  // defecto ya vende bien. Preguntarla primero sería cambiar el estilo de un
  // agente que todavía no sabe cuánto dura su propio acceso.
  if (!p.estiloDeVenta) {
    const total = e.catalogo.digitales + e.catalogo.fisicos + e.catalogo.servicios;
    // La recomendación sale de SUS datos, igual que en las decisiones de
    // arriba. Con un solo producto no hay nada que averiguar antes de
    // presentarlo: preguntar ahí es una traba, no una consulta.
    const recomendado = total === 1 ? "directo" : "equilibrado";
    const porQue =
      total === 1
        ? "Tenés un solo producto cargado: no hay riesgo de que el cliente elija mal, así que preguntarle antes de mostrárselo solo lo demora."
        : total > 0
          ? `Tenés ${total} productos: averiguar UNA cosa antes de presentar es lo que evita mostrarle el que no era. Y si te piden el precio, lo da sin rodeos.`
          : "Es lo que mejor funciona por WhatsApp: averigua una cosa antes de presentar, pero no interroga a quien ya pidió el precio.";

    pendientes.push({
      campo: "estiloDeVenta",
      pregunta: "¿Cómo querés que venda tu asesor?",
      siNoSeConfigura:
        "Vende con el estilo por defecto: averigua una cosa antes de presentar, ofrece el video como gancho, y ante un “lo voy a pensar” deja algo concreto. Se puede cambiar cuando quieras.",
      opciones: PERFILES.map((perfil) => ({
        id: perfil.id,
        etiqueta: perfil.etiqueta,
        queCambia: `${perfil.comoSeSiente} ${perfil.cuandoConviene}`,
        recomendada: perfil.id === recomendado,
        porQue: perfil.id === recomendado ? porQue : undefined,
      })),
    });
  }

  return pendientes;
}

/**
 * El texto de la decisión, listo para que Atlas lo lea en voz alta.
 *
 * Se arma acá y no en el prompt para que las opciones lleguen SIEMPRE
 * completas: si se le pidiera al modelo que las redacte, en algún turno se le
 * van a olvidar dos, y el dueño va a elegir entre lo que quedó.
 */
export function comoPreguntarla(d: Decision): string {
  const l: string[] = [];
  l.push(d.pregunta);
  l.push("");
  for (const o of d.opciones) {
    const marca = o.recomendada ? " ⭐ (la que te recomiendo)" : "";
    l.push(`• ${o.etiqueta}${marca}`);
    l.push(`  ${o.queCambia}`);
    if (o.recomendada && o.porQue) l.push(`  Por qué: ${o.porQue}`);
  }
  l.push("");
  l.push(`Si no lo configurás: ${d.siNoSeConfigura}`);
  return l.join("\n");
}

/** Cuánto falta para que el negocio esté listo para vender solo. */
export function cuantoFalta(e: EstadoDelNegocio): { listas: number; total: number; porcentaje: number } {
  const faltan = loQueFalta(e).length;
  // Siete decisiones en total; el acceso solo aplica si vende digital.
  const total = e.catalogo.digitales > 0 ? 7 : 6;
  const listas = Math.max(0, total - faltan);
  return { listas, total, porcentaje: Math.round((listas / total) * 100) };
}
