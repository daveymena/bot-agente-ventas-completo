/**
 * MOTOR DEL AGENTE
 * ================
 *
 * Reemplaza a `runAgentReply()` de agent.ts (5.300 líneas) y a la cadena
 * response-brain / sales-playbook / whatsapp-brain / supervisor / objeciones /
 * next-best-action / emojis-con-medida / precio-verificado.
 *
 * El bucle es el estándar de tool calling y cabe en una pantalla:
 *
 *   1. Se arma el contexto quién sos, cómo vende este negocio, qué hay en el
 *      catálogo, QUÉ PASÓ YA (estado explícito) y el historial.
 *   2. Se le pregunta al modelo. Puede contestar texto, o pedir herramientas.
 *   3. Si pidió herramientas, se ejecutan (ellas aplican las reglas y arman
 *      las partes) y se le devuelve el resultado para que siga.
 *   4. Cuando da su texto final, se envía junto con lo que las herramientas
 *      agregaron, y se guarda el estado.
 *
 * Lo que NO hay acá, a propósito: ninguna expresión regular que intente
 * entender lo que quiso decir el cliente. Entenderlo es trabajo del modelo.
 *
 * Lo que SÍ hay, y es la única red de seguridad que queda: si el modelo escribe
 * una cifra de dinero que no existe en el catálogo, se le pide UNA vez que lo
 * reescriba. No se le reescribe el texto por atrás: eso era lo que convertía
 * una buena respuesta en un mensaje cortado a la mitad ("empezar h...").
 */

import {
  definicionesDeHerramientas,
  ejecutores,
  type ContextoHerramientas,
  type Efecto,
  type Parte,
  type Producto,
} from "./herramientas";
import {
  describirEstado,
  horasDesdeUltimoMensaje,
  volvioDespuesDe,
  registrarHerramienta,
  actualizarResumenDesdeEstado,
  type EstadoConversacion,
  type RepositorioEstado,
} from "./estado-conversacion";
import { renderGuion, type GuionDelNegocio } from "./nicho";
import type { ClienteLLM } from "./cliente-llm";

export interface Mensaje {
  role: "customer" | "agent";
  content: string;
  createdAt?: Date | string;
}

export interface VozDelNegocio {
  nombreAgente: string;
  rolAgente: string;
  nombreNegocio: string;
  /** Ajustes de tono que el dueño escribió. Corto y opcional. */
  instruccionesExtra?: string | null;
}

/** Cuántos mensajes del historial se mandan. Uno solo, en un solo lugar. */
export const MENSAJES_DE_HISTORIAL = 40;

/** Tope de vueltas del bucle, para que nunca se cuelgue llamando herramientas. */
export const MAX_VUELTAS = 6;

/** Máximo de fichas por respuesta: dos fotos seguidas en el celular es spam. */
const MAX_TARJETAS = 2;

/* ═══════════════════════════════════════════════════════════════════════════
 * EL PROMPT
 * ═══════════════════════════════════════════════════════════════════════════ */

export function construirPromptDeSistema(params: {
  voz: VozDelNegocio;
  estado: EstadoConversacion;
  catalogo: Producto[];
  guion: GuionDelNegocio;
  nombrePorProducto: (id: number) => string;
}): string {
  const { voz, estado, catalogo, guion } = params;
  const horas = horasDesdeUltimoMensaje(estado);
  const volvio = volvioDespuesDe(estado);

  // Catálogo completo pero compacto. Con catálogos grandes, el modelo usa
  // buscar_en_catalogo en vez de recibirlo entero: 200 fichas no entran en
  // ningún contexto sin empujar la conversación afuera.
  const disponibles = catalogo.filter((p) => p.disponible !== false);
  const catalogoCompacto =
    disponibles.length <= 60
      ? disponibles
          .map((p) => {
            const precio = p.price ? ` · ${p.currency || "COP"} ${p.price.toLocaleString("es-CO")}` : "";
            const opts = p.opciones?.length ? ` · Variantes: ${p.opciones.join(", ")}` : "";
            return `#${p.id} · ${p.name}${precio}${opts}`;
          })
          .join("\n")
      : `${disponibles.length} productos. Usá buscar_en_catalogo para ubicarlos.`;

  const quien = `${voz.nombreAgente}, ${voz.rolAgente} de ${voz.nombreNegocio}`;

  return `Sos ${quien}. Atendés por WhatsApp.

CÓMO HABLÁS
Como una persona que sabe de lo que vende. Mensajes de 2 a 4 frases, en el
español del país del negocio, cálido y directo. Nada de listas con viñetas,
nada de títulos ni de fichas armadas a mano: esto es un chat, no un folleto.
Un emoji suelto está bien; cinco no. No empieces todas las respuestas con
"Perfecto", "Claro", "Excelente" ni con el nombre del cliente. No repitas lo
que el cliente acaba de decir antes de contestarle.

CÓMO PENSÁS
Escuchá lo que el cliente realmente quiere, no la palabra suelta que usó.
Contestá PRIMERO lo que preguntó. Una sola pregunta estratégica por mensaje,
y solo cuando la respuesta cambie lo que le vas a recomendar. Si duda, antes de
empujar entendé de qué duda. Si lo que pide no existe, decilo con naturalidad y
mostrale lo que sí hay.
Si el cliente muestra intención de compra ("lo quiero", "cómo pago", "mándame el link", "me sirve", "listo", "dale", "de una"), CERRÁ. Dejá de dar explicaciones y no hagas más preguntas de descubrimiento. Si no tenés claro de qué producto habla, ubicalo antes con buscar_en_catalogo y enfocar_producto. Si todavía no le mostraste el precio de ese producto, mandá primero mostrar(seccion="precio") y después, en el mismo turno, mostrar(seccion="pago"); si ya se lo mostraste, mandá mostrar(seccion="pago") directamente.

CÓMO RESOLVÉS REFERENCIAS (sin releer texto viejo)
"sí / no / ese / esa / el primero / el segundo / ese curso / lo quiero / dale / ok / mándame ese / cuánto? / y ese?" se resuelve con el bloque LO QUE YA PASÓ: mensaje actual primero, después tu última pregunta, producto en foco, producto anterior y última herramienta. "Cuánto?" es del producto en foco. "Ese" después de ofrecer es lo último ofrecido. Si igual no está claro, preguntá cuál antes de mostrar nada.
Cuando quede clara la intención o le hagas una pregunta, llamá a anotar_contexto (no envía nada al cliente) para que el próximo turno no tenga que adivinar.

LAS HERRAMIENTAS PONEN LAS MAQUETAS (DATOS DUROS)
El precio, los medios de pago, la ficha, el video y la entrega son MAQUETAS que
el sistema pega abajo de tu texto cuando usás las herramientas. Vos redactás la
charla natural que las acompaña, pero NUNCA repitas el contenido de la maqueta
en tu texto. Ejemplo: si usás mostrar(seccion="precio"), tu texto solo debe
decir "Acá te dejo el valor:" y la herramienta hace el resto. Si una herramienta
te dice que algo ya se envió, no lo repitas: retomá desde donde quedaron.
Para mostrar un producto necesitás su id: si no lo tenés, buscá primero con
buscar_en_catalogo usando lo que pidió el cliente y usá el id que devuelva.
Nunca llames a mostrar con un id vacío o inventado.

Nunca digas que un pago está confirmado, verificado ni recibido. Eso lo
determina una persona del equipo, y el sistema te avisa cuando pasó.

CÓMO VENDÉS SEGÚN QUÉ ES (multimodelo, no todo es "producto-precio-pago")
- Físico/dropshipping: producto → variante (consultar_disponibilidad, nunca inventes stock) → ciudad → entrega/logística → pago → datos → pedido. La contraentrega solo si está configurada; si no, explicá lo que sí hay. No sueltes "tenemos contraentrega" al saludar.
- Servicio: necesidad → diagnóstico/alcance (registrar_caso tipo servicio) → disponibilidad → precio real o cotización (solicitar_cotizacion) → agenda (cuándo). No des precio cerrado si depende del modelo/visita.
- Consultoría: problema → objetivo → contexto del negocio → alcance (registrar_caso tipo consultoria) → propuesta/cotización (solicitar_cotizacion). El valor depende del alcance: decilo y registrá el caso, no inventes precio fijo.
- Si cambia de servicio a producto (o al revés), cambiá el foco con enfocar_producto/registrar_caso y seguí: el contexto anterior queda apilado para "y la reparación?".
- Garantía/devolución/tiempos: solo lo cargado por el dueño (consultar_conocimiento/guion). Si no está, decí que lo confirmás. Nunca inventes testimonios, cifras de clientes ni plazos.

${renderGuion(guion)}

CATÁLOGO
${catalogoCompacto}

LO QUE YA PASÓ EN ESTA CONVERSACIÓN
${describirEstado(estado, params.nombrePorProducto)}${
    volvio
      ? `\n\nEl cliente dejó de escribir hace ${Math.round(horas!)} horas y volvió recién. Retomá donde quedaron en una línea; no te presentes de nuevo ni arranques de cero.`
      : ""
  }${voz.instruccionesExtra ? `\n\nINDICACIONES DEL DUEÑO\n${voz.instruccionesExtra}` : ""}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LA ÚNICA RED DE SEGURIDAD: CIFRAS QUE NO EXISTEN
 *
 * No es el supervisor de antes, que reescribía todo con cuarenta regex. Es una
 * comprobación de UNA cosa: que ningún número con pinta de plata que escriba el
 * modelo sea un precio que no está en el catálogo. Si lo es, se le pide que lo
 * reescriba. Nada más.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Montos con pinta de plata: "$60.000", "60.000", "60 mil", "45.000 pesos". */
const MONTO = /(\$ ?\d[\d.,]{2,}|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d[\d.,]*\s?(?:mil|pesos|cop|usd|d[oó]lares|eur))/gi;

const aNumero = (s: string): number => {
  // El punto final de la frase se come el número: "$60.000." terminaba en NaN
  // y por eso una cifra inventada pasaba la red sin ser detectada.
  const limpio = s.replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  // 60.000 → 60000 (separador de miles) y 60,50 → 60.5 (decimal)
  const conPunto = limpio.includes(".") && limpio.lastIndexOf(".") - limpio.length < -2;
  const normalizado = conPunto ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, ".");
  let n = Number(normalizado);
  // "60 mil" es 60.000, no 60: sin esto quedaba por debajo del umbral de
  // 1.000 y una cifra inventada pasaba la red sin ser vista.
  if (/\bmil\b/i.test(s) && n < 1000) n *= 1000;
  return Number.isFinite(n) ? n : 0;
};

/** Todos los montos que aparecen escritos en un texto (ya normalizados). */
function montosEn(texto: string): number[] {
  return (String(texto || "").match(MONTO) || []).map(aNumero).filter((n) => n >= 1000);
}

/**
 * Los montos que el modelo SÍ puede escribir: los precios del catálogo y sus
 * sumas (un cliente que lleva dos productos pregunta por el total), más
 * cualquier cifra que el sistema le haya dado por escrito (`textosDeContexto`:
 * el guion con el costo de envío, una respuesta del conocimiento, el resultado
 * de una herramienta). Si el modelo repite un número que le dimos nosotros, no
 * lo inventó.
 *
 * Los precios individuales entran TODOS: antes se tomaban los primeros 12 y
 * con un catálogo más grande un precio real se marcaba como inventado y se le
 * borraba la frase al cliente. El tope de 12 queda solo para las sumas, que
 * son combinatorias.
 */
export function montosPermitidos(catalogo: Producto[], textosDeContexto: string[] = []): Set<number> {
  const todos = catalogo.map((p) => Number(p.price) || 0).filter((n) => n > 0);
  const permitidos = new Set<number>([0]);
  for (const p of todos) {
    permitidos.add(Math.round(p));
    permitidos.add(Math.round(p * 100) / 100);
  }
  for (const t of textosDeContexto) for (const n of montosEn(t)) permitidos.add(Math.round(n));

  // Sumas de hasta 4 productos: "los dos cursos salen 120.000".
  const precios = todos.slice(0, 12);
  for (let mask = 1; mask < 1 << precios.length && mask < 1 << 12; mask++) {
    let suma = 0;
    let cuenta = 0;
    for (let j = 0; j < precios.length; j++) {
      if (mask & (1 << j)) {
        suma += precios[j];
        if (++cuenta > 4) break;
      }
    }
    if (cuenta >= 2 && cuenta <= 4) permitidos.add(Math.round(suma));
  }
  return permitidos;
}

/** ¿El texto tiene una cifra de plata que no existe en el catálogo ni en lo que se le dio? */
export function montosInventados(texto: string, catalogo: Producto[], textosDeContexto: string[] = []): number[] {
  const permitidos = montosPermitidos(catalogo, textosDeContexto);
  const inventados: number[] = [];
  // Menos de 1.000 no es un precio de nada y evita perseguir "2 años",
  // "3 días" o los cuatro dígitos de un año (`montosEn` ya los descarta).
  for (const n of montosEn(texto)) {
    if (!permitidos.has(Math.round(n))) inventados.push(n);
  }
  return inventados;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * EL BUCLE
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface ResultadoRespuesta {
  partes: Parte[];
  estado: EstadoConversacion;
  /** Para observabilidad: qué herramientas se usaron y qué contestaron. */
  traza: { herramienta: string; args: any; resultado: string }[];
  proveedor: string;
  modoPlan: boolean;
  /** Si hubo que pedirle que reescribiera una cifra inventada. */
  corregido: boolean;
  /**
   * Lo que hay que aplicar en la base DESPUÉS de responder (pago reportado,
   * escalado, datos del cliente). Las herramientas son puras; esto lo ejecuta
   * el adaptador, que es quien tiene la base.
   */
  efectos: Efecto[];
}

export async function responder(params: {
  llm: ClienteLLM;
  estado: EstadoConversacion;
  historial: Mensaje[];
  catalogo: Producto[];
  conocimiento: { productId: number | null; pregunta: string; disparadores: string[]; respuesta: string | null }[];
  guion: GuionDelNegocio;
  voz: VozDelNegocio;
  /**
   * Recarga el guion para el nuevo foco cuando el modelo cambia de producto
   * en mitad del turno. Lo provee el adaptador (tiene tenant/catálogo).
   */
  recargarGuion?: (productoEnFocoId: number) => Promise<GuionDelNegocio>;
}): Promise<ResultadoRespuesta> {
  const { llm, estado, historial, catalogo, guion, voz } = params;

  const nombrePorProducto = (id: number) => catalogo.find((p) => p.id === id)?.name ?? `producto #${id}`;
  const mensajeDelCliente = [...historial].reverse().find((m) => m.role === "customer")?.content ?? "";
  // FASE 1/14: el texto del cliente queda en estado (para referencias y diagnóstico).
  estado.ultimoMensajeClienteTexto = String(mensajeDelCliente || "").slice(0, 500) || null;

  // FASE 5: con charla larga el historial se corta en 40; el resumen de HECHOS
  // (no transcripción) preserva lo viejo sin reenviar todo al modelo.
  if (historial.length > 30 && (!estado.resumenPrevio || estado.turnos % 10 === 0)) {
    actualizarResumenDesdeEstado(estado, nombrePorProducto);
  }
  // FASE 4: la forma de venta inicializa el proceso esperado sin borrar nada.
  if ((guion.forma === "fisico" || guion.forma === "servicio" || guion.forma === "mixto") && estado.entregaEstado === "no_aplica") {
    estado.entregaEstado = "pendiente_datos";
  }
  if (estado.compra === "ninguno" && estado.productoEnFoco != null) estado.compra = "producto_definido";
  else if (estado.compra === "ninguno") estado.compra = "interes";

  const system = construirPromptDeSistema({ voz, estado, catalogo, guion, nombrePorProducto });

  const ctx: ContextoHerramientas = {
    estado,
    catalogo,
    partes: [],
    conocimiento: params.conocimiento || [],
    guion,
    mensajeDelCliente,
    efectos: [],
    alCambiarFoco: params.recargarGuion
      ? async (nuevoId: number) => {
          const nuevo = await params.recargarGuion!(nuevoId);
          // Mutar en el sitio: `que_falta_para_cerrar` lee `ctx.guion`
          // en el mismo turno, después del cambio de foco.
          Object.assign(ctx.guion, nuevo);
        }
      : undefined,
  };

  const messages: any[] = [
    { role: "system", content: system },
    ...historial.slice(-MENSAJES_DE_HISTORIAL).map((m) => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.content,
    })),
  ];

  const traza: ResultadoRespuesta["traza"] = [];
  let proveedor = "desconocido";
  let modoPlan = false;
  let textoFinal = "";

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const respuesta = await llm.crear({
      messages,
      tools: definicionesDeHerramientas,
      temperature: 0.6,
    });
    proveedor = respuesta.proveedor;
    modoPlan = modoPlan || respuesta.modoPlan;

    if (!respuesta.toolCalls?.length) {
      textoFinal = (respuesta.content || "").trim();
      break;
    }

    messages.push({
      role: "assistant",
      content: respuesta.content,
      tool_calls: respuesta.toolCalls.map((t) => ({
        id: t.id,
        type: "function",
        function: { name: t.name, arguments: t.arguments },
      })),
    });

    for (const llamada of respuesta.toolCalls) {
      const ejecutor = ejecutores[llamada.name];
      let resultado: { ok: boolean; mensaje: string };

      if (!ejecutor) {
        resultado = { ok: false, mensaje: `No existe la herramienta ${llamada.name}. Usá alguna de las que te di.` };
      } else {
        let args: any = {};
        try {
          args = JSON.parse(llamada.arguments || "{}");
        } catch {
          /* argumentos malformados: se ejecuta con vacío y la herramienta se queja */
        }
        try {
          resultado = await ejecutor(ctx, args);
        } catch (err: any) {
          // FASE 7: una herramienta que falla NO tumba la respuesta ni se
          // reporta como éxito. Queda en traza + ultimaHerramienta.
          resultado = { ok: false, mensaje: `Falló: ${err?.message || "error interno"}. Decile que lo confirmás en un momento, sin inventar el dato.` };
        }
        // FASE 1/6: tool → result → state update. La última herramienta queda
        // en estado para resolver "ese/el segundo" y para observabilidad.
        registrarHerramienta(estado, llamada.name, args, resultado.ok);
        traza.push({ herramienta: llamada.name, args, resultado: resultado.mensaje });
      }

      messages.push({ role: "tool", tool_call_id: llamada.id, content: resultado.mensaje });
    }
  }

  // ── Red de seguridad: una cifra de plata que no existe en el catálogo ────
  let corregido = false;
  let invento = montosInventados(textoFinal, catalogo);
  if (invento.length) {
    const aviso = {
      role: "system" as const,
      content:
        `Escribiste ${invento.map((n) => n.toLocaleString("es-CO")).join(", ")} y ese monto NO está en el catálogo. ` +
        `Reescribí tu respuesta de forma natural sin incluir ese número. ` +
        `IMPORTANTE: No pidas disculpas ni le hables de este error interno al usuario. NO podés usar herramientas en este turno, respondé solo con texto.`,
    };
    try {
      const reintento = await llm.crear({
        messages: [...messages, { role: "assistant", content: textoFinal }, aviso],
        temperature: 0.5,
      });
      const nuevo = (reintento.content || "")
        .replace(/<｜｜DSML[\s\S]*/g, "")
        .replace(/<\|\|DSML[\s\S]*/g, "")
        .trim();
      if (nuevo && montosInventados(nuevo, catalogo).length === 0) {
        textoFinal = nuevo;
        corregido = true;
      }
    } catch {
      /* si el reintento falla, se corta abajo */
    }
    // Si volvió a escribir un monto inventado, se le saca la frase: dejar una
    // cifra falsa en un chat de ventas es peor que una respuesta más corta.
    invento = montosInventados(textoFinal, catalogo);
    if (invento.length) textoFinal = quitarFrasesConMontos(textoFinal, invento);
  }

  // Limpiar basura interna de herramientas que algunos LLMs filtran en primera respuesta
  textoFinal = textoFinal
    .replace(/<｜｜DSML[\s\S]*/g, "")
    .replace(/<\|\|DSML[\s\S]*/g, "")
    .trim();

  // ── Armado de la respuesta ───────────────────────────────────────────────
  const partes: Parte[] = [];
  if (textoFinal) partes.push({ kind: "text", content: textoFinal });

  // Tarjetas sin repetir y con tope: dos fotos seguidas tapan la pantalla.
  const vistas = new Set<string>();
  for (const parte of ctx.partes) {
    if (parte.kind !== "card") continue;
    const clave = `${parte.productId}:${parte.seccion}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    if (partes.filter((p) => p.kind === "card").length >= MAX_TARJETAS) break;
    partes.push(parte);
  }

  // Si el modelo no dijo nada y ninguna herramienta produjo algo, no se manda
  // un mensaje vacío ni se deja al cliente sin respuesta.
  if (!partes.length) {
    partes.push({ kind: "text", content: "Dame un segundito que te confirmo eso 👍" });
  }

  estado.turnos += 1;
  // FASE 2: la última pregunta del agente resuelve el próximo "sí/ese/dale".
  if (textoFinal && /\?\s*$/.test(textoFinal)) {
    estado.ultimaPreguntaAgente = textoFinal.slice(-300);
    if (!estado.preguntaPendiente) estado.preguntaPendiente = textoFinal.slice(-300);
  } else if (textoFinal) {
    estado.preguntaPendiente = null;
  }
  // FASE 8/14: si el modelo no dejó siguiente acción, se deriva de lo pendiente.
  if (!estado.siguienteAccion) {
    estado.siguienteAccion =
      estado.accionPendiente ||
      (estado.ultimaOferta && estado.ultimaOferta.tipo !== "ninguna" ? "esperar_respuesta_a_oferta" : "seguir_explorando");
  }
  // `ultimoMensajeCliente` debe medir el silencio REAL del cliente para que
  // `volvioDespuesDe(8h)` salude distinto al día siguiente. Antes se
  // sobrescribía con `now()` del agente en cada turno y la retomada nunca se
  // detectaba. Solo se toca si el historial trae marca temporal del cliente.
  const ultimoCliente = [...historial].reverse().find((m) => m.role === "customer");
  const marcaCliente =
    ultimoCliente?.createdAt != null ? new Date(ultimoCliente.createdAt as any).toISOString() : null;
  if (marcaCliente && !Number.isNaN(Date.parse(marcaCliente))) {
    estado.ultimoMensajeCliente = marcaCliente;
  }
  estado.ultimoMensajeAgente = new Date().toISOString();

  return { partes, estado, traza, proveedor, modoPlan, corregido, efectos: ctx.efectos };
}

/** Saca las frases que contienen un monto inventado. Último recurso, medido. */
function quitarFrasesConMontos(texto: string, montos: number[]): string {
  const frases = String(texto)
    .split(/(?<=[.!?¿¡\n])\s+/)
    .filter((f) => {
      const n = montosInventados(f, []);
      return !(n.length && n.some((x) => montos.includes(x)));
    });
  return frases.join(" ").replace(/\n{3,}/g, "\n\n").trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * PUNTO DE ENTRADA
 * ═══════════════════════════════════════════════════════════════════════════ */

export async function runAgentReply(
  conversationId: number,
  deps: {
    llm: ClienteLLM;
    repositorio: RepositorioEstado;
    cargarHistorial: (conversationId: number) => Promise<Mensaje[]>;
    cargarCatalogo: (conversationId: number) => Promise<Producto[]>;
    cargarVoz: (conversationId: number) => Promise<VozDelNegocio>;
    cargarGuion: (conversationId: number, catalogo: Producto[], productoEnFocoId?: number | null) => Promise<GuionDelNegocio>;
    cargarConocimiento: (conversationId: number) => Promise<ContextoHerramientas["conocimiento"]>;
  },
): Promise<Parte[]> {
  const [estado, historial, catalogo, voz] = await Promise.all([
    deps.repositorio.cargar(conversationId),
    deps.cargarHistorial(conversationId),
    deps.cargarCatalogo(conversationId),
    deps.cargarVoz(conversationId),
  ]);

  const [guion, conocimiento] = await Promise.all([
    deps.cargarGuion(conversationId, catalogo, estado.productoEnFoco),
    deps.cargarConocimiento(conversationId),
  ]);

  const resultado = await responder({
    llm: deps.llm,
    estado,
    historial,
    catalogo,
    conocimiento,
    guion,
    voz,
    recargarGuion: (nuevoFocoId: number) => deps.cargarGuion(conversationId, catalogo, nuevoFocoId),
  });

  await deps.repositorio.guardar(resultado.estado);

  return resultado.partes;
}
