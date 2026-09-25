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
  abrirVisitaNueva,
  registrarHerramienta,
  actualizarResumenDesdeEstado,
  apilarContexto,
  ordinalDeMensaje,
  precioDado,
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

/** Máximo de fichas por respuesta. 4 alcanza para un "elegí entre estas" sin
 *  convertirse en un folleto: más de 4 fotos seguidas tapa el celular. */
const MAX_TARJETAS = 4;

/* ═══════════════════════════════════════════════════════════════════════════
 * EL PROMPT
 * ═══════════════════════════════════════════════════════════════════════════ */

type ParamsDelPrompt = {
  voz: VozDelNegocio;
  estado: EstadoConversacion;
  catalogo: Producto[];
  guion: GuionDelNegocio;
  nombrePorProducto: (id: number) => string;
};

/** El prompt entero en un solo texto (para leerlo, diagnosticarlo y probarlo). */
export function construirPromptDeSistema(params: ParamsDelPrompt): string {
  const { fijo, delTurno } = partesDelPrompt(params);
  return `${fijo}\n\n${delTurno}`;
}

/**
 * El prompt partido en lo que NO cambia entre turnos y lo que sí.
 *
 * Es por plata, medido (23-09-2026, simulación de venta con DeepSeek): con el
 * estado ("LO QUE YA PASÓ") adentro del prompt del sistema -- o sea ANTES del
 * historial -- cada turno cambiaba ese bloque y el proveedor no podía servir
 * desde su caché nada de lo que venía después: el historial entero se cobraba
 * a precio completo en cada mensaje. `fijo` va primero; `delTurno` va como
 * mensaje del sistema DESPUÉS del historial, así el prefijo (reglas +
 * catálogo + historial) es idéntico de un turno al siguiente.
 */
export function partesDelPrompt(params: ParamsDelPrompt): { fijo: string; delTurno: string } {
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

  const fijo = `Sos ${quien}. Atendés por WhatsApp.

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
Si el cliente muestra intención de compra ("lo quiero", "cómo pago", "mándame el link", "me sirve", "listo", "dale", "de una"), CERRÁ. Dejá de dar explicaciones y no hagas más preguntas de descubrimiento. Si no tenés claro de qué producto habla, ubicalo antes con buscar_en_catalogo y enfocar_producto. Si todavía no le mostraste el precio de ese producto, mandá primero mostrar(seccion="precio"). Después, según qué es: un producto FÍSICO con envío se cierra con tomar_pedido (pedile los datos de envío), NO con los medios de pago; lo demás se cierra con mostrar(seccion="pago"). NUNCA pidas compromiso ("¿te lo llevás?", nombre, cédula, dirección) antes de haberle mostrado el precio: primero precio, después datos.
La ficha de "info" termina ofreciendo "¿te cuento cuánto vale?". Si el cliente contesta "sí" (o "sí, cuánto vale", "qué vale", "dame el precio", "cuánto está"), eso es un pedido de precio: mandá mostrar(seccion="precio") en el acto.

CÓMO RESOLVÉS REFERENCIAS (sin releer texto viejo)
"sí / no / ese / esa / el primero / el segundo / ese curso / lo quiero / dale / ok / mándame ese / cuánto vale? / qué vale? / cuánto cuesta? / precio / a cómo está? / y ese?" se resuelve con el bloque LO QUE YA PASÓ: mensaje actual primero, después tu última pregunta, producto en foco, producto anterior y última herramienta. Cualquier forma de preguntar el valor ("cuánto vale", "qué vale", "cuánto cuesta", "precio", "a cómo", "el valor") es pedido de precio del producto en foco: mostrá mostrar(seccion="precio"). "Ese" después de ofrecer es lo último ofrecido. Si igual no está claro, preguntá cuál antes de mostrar nada.
Si el mensaje empieza con [Responde citando este mensaje: "..."], el cliente te respondió señalando ESE mensaje: si es una ficha, su primera línea es el producto que eligió; enfocalo y seguí con ese, sin preguntar "¿cuál?".
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
Si el cliente pide algo ambiguo que coincide con VARIOS productos (varios
modelos con el mismo nombre, ej. "corrector de postura" ×5), buscá con
buscar_en_catalogo y mostrá la ficha de cada uno con mostrar_opciones para que
elija, en vez de listar solo texto o preguntar "para qué lo vas a usar". Incluso
con errores de tipeo ("corector", "lanpostura") buscá igual: el buscador tolera 1 letra.
Buscá SIEMPRE aunque el historial ya mencione productos: los nombres y precios del
historial pueden estar viejos (el catálogo se renombra), y solo buscar_en_catalogo +
mostrar_opciones muestra los datos reales con foto. Nunca copies listas de productos
de mensajes anteriores.

Nunca digas que un pago está confirmado, verificado ni recibido. Eso lo
determina una persona del equipo, y el sistema te avisa cuando pasó.

CÓMO VENDÉS SEGÚN QUÉ ES (multimodelo, no todo es "producto-precio-pago")
- Físico/dropshipping: producto → variante (consultar_disponibilidad, nunca inventes stock) → precio → cuando quiere comprarlo, tomar_pedido con los datos de envío que te dé (el sistema te dice qué falta y le manda el resumen) → cuando confirma el resumen, confirmar_pedido. El pedido existe SOLO cuando confirmar_pedido dice que se creó: antes de eso nunca digas "quedó anotado" ni "quedó registrado". La contraentrega solo si está configurada; si no, explicá lo que sí hay. No sueltes "tenemos contraentrega" al saludar.
- Servicio: necesidad → diagnóstico/alcance (registrar_caso tipo servicio) → disponibilidad → precio real o cotización (solicitar_cotizacion) → agenda (cuándo). No des precio cerrado si depende del modelo/visita.
- Consultoría: problema → objetivo → contexto del negocio → alcance (registrar_caso tipo consultoria) → propuesta/cotización (solicitar_cotizacion). El valor depende del alcance: decilo y registrá el caso, no inventes precio fijo.
- Si cambia de servicio a producto (o al revés), cambiá el foco con enfocar_producto/registrar_caso y seguí: el contexto anterior queda apilado para "y la reparación?".
- Garantía/devolución/tiempos: solo lo cargado por el dueño (consultar_conocimiento/guion). Si no está, decí que lo confirmás. Nunca inventes testimonios, cifras de clientes ni plazos.

${renderGuion(guion)}

CATÁLOGO
${catalogoCompacto}${voz.instruccionesExtra ? `\n\nINDICACIONES DEL DUEÑO\n${voz.instruccionesExtra}` : ""}`;

  const delTurno = `LO QUE YA PASÓ EN ESTA CONVERSACIÓN
${describirEstado(estado, params.nombrePorProducto)}${
    volvio
      ? `\n\nVISITA NUEVA: el cliente no escribía hace ${Math.round(horas!)} horas. Lo de antes es memoria, no una venta pendiente. ` +
        `Contestá a lo que escribe AHORA. Si solo saluda, saludalo con calidez y preguntale en qué lo podés ayudar hoy; ` +
        `no le nombres el producto de antes ni le preguntes si ya se decidió o si ya pagó. ` +
        `Si él retoma lo de antes, ahí sí seguís desde donde quedaron sin repetirle lo que ya tiene. No te presentes de nuevo.`
      : ""
  }`;

  return { fijo, delTurno };
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
  /** Tokens de TODAS las llamadas del turno (bucle + reintentos). */
  uso: { llamadas: number; entrada: number; salida: number; cacheados: number };
}

export async function responder(params: {
  llm: ClienteLLM;
  estado: EstadoConversacion;
  historial: Mensaje[];
  catalogo: Producto[];
  /** Todo el negocio, sin filtro por especialidad (ver ContextoHerramientas). */
  catalogoCompleto?: Producto[];
  conocimiento: { productId: number | null; pregunta: string; disparadores: string[]; respuesta: string | null }[];
  guion: GuionDelNegocio;
  voz: VozDelNegocio;
  /**
   * Recarga el guion para el nuevo foco cuando el modelo cambia de producto
   * en mitad del turno. Lo provee el adaptador (tiene tenant/catálogo).
   */
  recargarGuion?: (productoEnFocoId: number) => Promise<GuionDelNegocio>;
  /** Pedidos de producto físico (ver adaptador.servicioDePedidos). */
  pedidos?: import("./herramientas").ServicioDePedidos;
}): Promise<ResultadoRespuesta> {
  const { llm, estado, historial, catalogo, guion, voz } = params;

  const nombrePorProducto = (id: number) => catalogo.find((p) => p.id === id)?.name ?? `producto #${id}`;
  const mensajeDelCliente = [...historial].reverse().find((m) => m.role === "customer")?.content ?? "";
  // FASE 1/14: el texto del cliente queda en estado (para referencias y diagnóstico).
  estado.ultimoMensajeClienteTexto = String(mensajeDelCliente || "").slice(0, 500) || null;

  // Volvió después de horas: visita nueva. Va antes de derivar `compra` del
  // foco (abajo), porque es justamente el foco viejo lo que se archiva.
  const volvio = volvioDespuesDe(estado);
  if (volvio) abrirVisitaNueva(estado);

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

  // ── Referencia posicional DETERMINÍSTICA ────────────────────────────────
  // "el primero / la segunda / el 2" se resuelve contra `opcionesMostradas`
  // (la lista ORDENADA que el bot acaba de mostrar) sin gastar un turno del
  // modelo. No es "entender" al cliente: es un índice contra una lista propia.
  const idx = ordinalDeMensaje(mensajeDelCliente);
  if (idx != null && estado.opcionesMostradas.length > idx) {
    const id = estado.opcionesMostradas[idx];
    const anterior = estado.productoEnFoco;
    if (anterior !== id) {
      apilarContexto(estado, anterior ? `hablaban de ${nombrePorProducto(anterior)}` : "explorando");
      estado.productoAnterior = anterior;
      estado.productoEnFoco = id;
      estado.opcionesMostradas = [];
      if (estado.etapa === "saludo" || estado.etapa === "explorando") estado.etapa = "producto_en_foco";
      if (estado.compra === "interes") estado.compra = "producto_definido";
      if (estado.ultimaOferta?.productoId != null && estado.ultimaOferta.productoId !== id) estado.ultimaOferta = null;
      if (params.recargarGuion) {
        try {
          const nuevo = await params.recargarGuion(id);
          Object.assign(guion, nuevo);
        } catch { /* el cambio de foco no se cae por el guion */ }
      }
    }
  }

  const { fijo, delTurno } = partesDelPrompt({ voz, estado, catalogo, guion, nombrePorProducto });

  const ctx: ContextoHerramientas = {
    estado,
    catalogo,
    catalogoCompleto: params.catalogoCompleto,
    partes: [],
    conocimiento: params.conocimiento || [],
    guion,
    mensajeDelCliente,
    efectos: [],
    pedidos: params.pedidos,
    alCambiarFoco: params.recargarGuion
      ? async (nuevoId: number) => {
          const nuevo = await params.recargarGuion!(nuevoId);
          // Mutar en el sitio: `que_falta_para_cerrar` lee `ctx.guion`
          // en el mismo turno, después del cambio de foco.
          Object.assign(ctx.guion, nuevo);
        }
      : undefined,
  };

  const charla = historial.slice(-MENSAJES_DE_HISTORIAL).map((m) => ({
    role: m.role === "customer" ? "user" : "assistant",
    content: m.content,
  }));
  // En una visita nueva, el corte se marca DENTRO del historial: sin esto el
  // último mensaje del bot ("¿te lo llevás?") queda pegado al "hola" de hoy y
  // el modelo lo lee como la respuesta a esa pregunta.
  if (volvio) {
    let inicio = charla.length;
    while (inicio > 0 && charla[inicio - 1].role === "user") inicio--;
    if (inicio > 0) {
      charla.splice(inicio, 0, {
        role: "system",
        content: "— Fin de la visita anterior. Pasaron horas. Lo que sigue es lo que el cliente escribe hoy. —",
      });
    }
  }
  // Orden pensado para el caché del proveedor (ver partesDelPrompt): lo fijo,
  // el historial (que solo crece al final) y recién ahí el estado del turno.
  const messages: any[] = [{ role: "system", content: fijo }, ...charla, { role: "system", content: delTurno }];

  const traza: ResultadoRespuesta["traza"] = [];
  let proveedor = "desconocido";
  let modoPlan = false;
  let textoFinal = "";
  /** Lo que el modelo escribió en la misma vuelta en que llamó herramientas. */
  let textoJuntoAHerramientas = "";
  const uso = { llamadas: 0, entrada: 0, salida: 0, cacheados: 0 };
  const contar = (u?: { entrada: number; salida: number; cacheados: number }) => {
    uso.llamadas++;
    if (!u) return;
    uso.entrada += u.entrada;
    uso.salida += u.salida;
    uso.cacheados += u.cacheados;
  };

  const bucle = async (vueltas: number) => {
  for (let vuelta = 0; vuelta < vueltas; vuelta++) {
    const respuesta = await llm.crear({
      messages,
      tools: definicionesDeHerramientas,
      temperature: 0.6,
    });
    contar(respuesta.uso);
    proveedor = respuesta.proveedor;
    modoPlan = modoPlan || respuesta.modoPlan;

    if (!respuesta.toolCalls?.length) {
      textoFinal = (respuesta.content || "").trim();
      break;
    }
    if ((respuesta.content || "").trim()) textoJuntoAHerramientas = (respuesta.content || "").trim();

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
  };
  await bucle(MAX_VUELTAS);

  // ── Red de seguridad: dice que manda algo que no mandó ───────────────────
  //
  // Simulación y chat real del 23-09-2026: "¿cómo pago?" → "Ahí te van los
  // medios de nuevo, Ana" con CERO herramientas: el cliente no recibió nada.
  // Los hechos los emiten las herramientas; si el texto anuncia un envío que
  // ninguna hizo, se le avisa UNA vez y se le deja usar la herramienta.
  // Cualquier cosa que emitió una herramienta cuenta como enviada: una ficha
  // o el resumen del pedido.
  const hayTarjetas = () => ctx.partes.length > 0;
  if (textoFinal && !hayTarjetas() && anunciaUnEnvio(textoFinal)) {
    messages.push({ role: "assistant", content: textoFinal });
    messages.push({
      role: "system",
      content:
        "Tu texto dice que le estás enviando algo ahora, pero en este turno no usaste ninguna herramienta que lo envíe: " +
        "el cliente no recibiría nada. Si te lo pidió, usá mostrar (con reenviar=true si ya se lo habías mandado). " +
        "Si no hace falta mandar nada, reescribí sin decir que se lo mandás. No le hables de este aviso al cliente.",
    });
    const original = textoFinal;
    textoFinal = "";
    try {
      await bucle(2);
    } catch {
      /* si el reintento falla, se queda la respuesta original */
    }
    // Si no dijo nada ni mandó nada, mejor la respuesta original que un
    // "dame un segundito".
    if (!textoFinal && !hayTarjetas()) textoFinal = original;
  }

  // ── Saludo en mitad de la conversación ───────────────────────────────────
  //
  // Prueba en producción del 25-09-2026: "bueno dale, cómo pago?" → la
  // tarjeta de pago salió bien, pero el texto fue "Hola, ¿en qué te puedo
  // ayudar hoy? 😊". Después de la herramienta, el modelo arrancó de cero.
  // Si la charla ya venía (hay mensajes del agente en esta visita), un saludo
  // genérico se cambia por lo que escribió junto a la herramienta, o se
  // deja la tarjeta sola.
  if (textoFinal && !volvio && params.historial.some((m) => m.role === "agent") && esSaludoGenerico(textoFinal)) {
    textoFinal = esSaludoGenerico(textoJuntoAHerramientas) ? "" : textoJuntoAHerramientas;
  }

  // ── Datos de compra antes del precio ─────────────────────────────────────
  //
  // Conv 219 (23-09-2026): "Sí que vale" (= ¿qué vale?) se leyó como un sí y
  // el modelo ESCRIBIÓ "pasame tu nombre completo y cédula" sin haber dado
  // nunca el precio. El candado de tomar_pedido no saltó porque no se llamó
  // ninguna herramienta: el pedido de datos iba en el texto. La clienta se fue.
  const foco = estado.productoEnFoco;
  if (textoFinal && foco != null && !precioDado(estado, foco) && pideDatosDeCompra(textoFinal)) {
    messages.push({ role: "assistant", content: textoFinal });
    messages.push({
      role: "system",
      content:
        "Le pediste datos para comprar (nombre, cédula, dirección) y todavía NO le mostraste el precio. " +
        'Primero mandá mostrar(seccion="precio") y respondé lo que preguntó; los datos se piden después, cuando sepa cuánto cuesta. ' +
        "No le hables de este aviso al cliente.",
    });
    const original = textoFinal;
    textoFinal = "";
    try {
      await bucle(2);
    } catch {
      /* se resuelve abajo */
    }
    if (!textoFinal && !hayTarjetas()) textoFinal = original;
    // Si ni así lo dio, el precio lo pone el servidor: es un hecho de la base.
    if (!precioDado(estado, foco)) {
      try {
        await ejecutores.mostrar(ctx, { productoId: foco, seccion: "precio" });
      } catch {
        /* sin precio en la base no hay nada que mostrar */
      }
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
      contar(reintento.uso);
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

  // ── El mismo emoji al final de cada mensaje ──────────────────────────────
  // Prueba en producción (25-09-2026): cinco respuestas seguidas terminadas
  // en "🎹", otras cuatro en "😊". Leído de corrido parece un bot. Si el
  // mensaje anterior del agente cerró con el mismo, este va sin él.
  {
    const previo = [...params.historial].reverse().find((m) => m.role === "agent")?.content || "";
    const final = emojiDelFinal(textoFinal);
    if (final && final === emojiDelFinal(previo)) {
      textoFinal = textoFinal.replace(/\s*(\p{Extended_Pictographic}️?)\s*$/u, "").trim();
    }
  }

  // ── Armado de la respuesta ───────────────────────────────────────────────
  const partes: Parte[] = [];
  if (textoFinal) partes.push({ kind: "text", content: textoFinal });
  // Textos que emitió una HERRAMIENTA (el resumen del pedido): van tal cual,
  // después de lo que escribió el modelo. Son hechos de la base, no redacción.
  for (const parte of ctx.partes) {
    if (parte.kind === "text" && parte.content && !partes.some((p) => p.kind === "text" && p.content === parte.content)) {
      partes.push(parte);
    }
  }

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

  return { partes, estado, traza, proveedor, modoPlan, corregido, efectos: ctx.efectos, uso };
}

/**
 * ¿El texto anuncia que AHORA se le manda algo al cliente? ("ahí te van",
 * "acá te dejo", "te los paso de nuevo"). No mira lo que escribió el cliente:
 * es la misma clase de chequeo que `montosInventados`, sobre lo que afirma
 * el modelo. "Ya te los dejé arriba" (pasado, algo que sí salió antes) no
 * cuenta.
 */
export function anunciaUnEnvio(texto: string): boolean {
  return (
    /\b(ah[ií]|ac[aá]|aqu[ií])\s+(te\s+)?(van|va|dejo|mando|paso|env[ií]o|comparto)\b/i.test(texto) ||
    /\bte\s+(los|las|lo|la)\s+(dejo|mando|paso|env[ií]o|comparto)\s+(de nuevo|otra vez|nuevamente|ac[aá]|aqu[ií]|abajo)\b/i.test(texto)
  );
}

/** El emoji con que termina un texto, o "" si no termina en uno. */
export function emojiDelFinal(texto: string): string {
  return String(texto || "").trim().match(/(\p{Extended_Pictographic})️?$/u)?.[1] || "";
}

/**
 * ¿Es un saludo de arranque y nada más? ("Hola, ¿en qué te puedo ayudar
 * hoy? 😊"). Un texto que además dice algo del producto no cuenta.
 */
export function esSaludoGenerico(texto: string): boolean {
  const t = String(texto || "").trim();
  if (!t || t.length > 140) return false;
  return /^(¡\s*)?(hola|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches)\b[^?]{0,40}¿?\s*(en qu[eé] (te|le) (puedo )?ayud|c[oó]mo (te|le) (puedo )?ayud|qu[eé] (est[aá]s|and[aá]s) buscando|qu[eé] necesit)/i.test(t);
}

/**
 * ¿El texto le PIDE al cliente datos para comprar? Mismo tipo de chequeo que
 * `anunciaUnEnvio`: sobre lo que afirma el modelo, no sobre el cliente.
 * "Pasame tu nombre completo y cédula", "¿me das tu dirección?".
 */
export function pideDatosDeCompra(texto: string): boolean {
  const t = String(texto || "");
  const pide = /\b(p[aá]same|pasame|p[aá]sa(me)?|dame|env[ií]ame|mand[aá]me|compart[ií]|necesito|me\s+(das|pas[aá]s|confirm[aá]s|dec[ií]s)|dec[ií]me|regal[aá]me)\b/i;
  const dato = /\b(c[eé]dula|nombre completo|direcci[oó]n|barrio|datos de env[ií]o|datos para (el )?env[ií]o)\b/i;
  return pide.test(t) && dato.test(t);
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
