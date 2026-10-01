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

import { razonar } from "../cerebro/razonador";
import type { ContextoRazonamiento } from "../cerebro/tipos-razonamiento";
import { obtenerContextoMemoria } from "../cerebro/memoria-multi-capa";
import {
  definicionesDeHerramientas,
  ejecutores,
  puntuarCoincidencias,
  diceQueCompra,
  esConfirmacionBreve,
  esDudaONegativa,
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
  registrarEnvio,
  yaSeEnvio,
  actualizarResumenDesdeEstado,
  apilarContexto,
  ordinalDeMensaje,
  precioDado,
  type EstadoConversacion,
  type RepositorioEstado,
} from "./estado-conversacion";
import { buscarContextoRelevante } from "./buscar-contexto";
import { bloqueDeLaFichaEnFoco, puntosDeLaFicha } from "./lo-que-dice-la-ficha";
import { sinCondicionesSinRespaldo, condicionesSinRespaldo } from "./condiciones-sin-respaldo";
import { renderGuion, type GuionDelNegocio } from "./nicho";
import { hablarColombiano } from "../hablar-colombiano";
import type { ClienteLLM } from "./cliente-llm";
import {
  getActiveABTestConfig,
  asignarGrupoABTest,
  logABTestAssignment,
  getVersionCandidata,
} from "./ab-test-routing";

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
  /** País del negocio (`condiciones.pais`): decide la variante del español. */
  pais?: string | null;
}

/**
 * Cómo habla el vendedor según el país del negocio. Pedido del dueño
 * (25-09-2026): "que hable en español colombiano normal, sin voseo". El prompt
 * estaba escrito en voseo y el modelo lo imitaba ("querés", "tenés"); ahora el
 * prompt tutea y esta línea lo dice explícito. Solo un negocio rioplatense vosea.
 */
export function comoHablaElPais(pais: string | null | undefined): string {
  const p = String(pais || "CO").trim().toUpperCase();
  if (["AR", "UY", "ARGENTINA", "URUGUAY"].includes(p)) {
    return "en español rioplatense (con voseo), cálido y directo.";
  }
  if (["CO", "COLOMBIA", ""].includes(p)) {
    return (
      "en español colombiano normal, cálido y directo: tutea (tú, quieres, tienes, puedes, mira). " +
      "Nunca uses voseo (nada de \"querés\", \"tenés\", \"mirá\", \"confirmás\"). Si el cliente te trata de usted, respóndele de usted."
    );
  }
  return "en el español de ese país, cálido y directo, tuteando. Nunca uses voseo. Si el cliente te trata de usted, respóndele de usted.";
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
  /** Las respuestas que cargó el dueño (`product_knowledge`). */
  conocimiento?: { productId: number | null; pregunta: string; respuesta: string | null }[];
};

/**
 * Lo que el dueño SÍ dejó respondido para lo que se está hablando: generales y
 * del producto en foco. Es el hecho simétrico de "NO TIENES ESTOS DATOS":
 * medido el 25-09-2026 en el chat de prueba, con producto en foco el modelo
 * leía solo la lista de lo que falta y contestaba "déjame confirmarlo" sin
 * llamar a consultar_conocimiento (0 de 3), aunque la respuesta estaba cargada.
 * Sin foco sí la buscaba (3 de 3). Solo van los temas; el texto exacto lo sigue
 * dando la herramienta.
 */
export function temasRespondidosPorElDueno(
  conocimiento: ParamsDelPrompt["conocimiento"],
  productoEnFoco: number | null,
): string[] {
  const temas = (conocimiento || [])
    // Sin foco todavía, se anuncia todo: la respuesta puede ser del producto
    // por el que el cliente está preguntando en este mismo mensaje.
    .filter((k) => k.respuesta && (productoEnFoco == null || k.productId == null || k.productId === productoEnFoco))
    .map((k) => k.pregunta.replace(/\s+/g, " ").trim().slice(0, 80))
    .filter(Boolean);
  return [...new Set(temas)].slice(0, 12);
}

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
      : `${disponibles.length} productos. Usa buscar_en_catalogo para ubicarlos.`;

  const quien = `${voz.nombreAgente}, ${voz.rolAgente} de ${voz.nombreNegocio}`;

  const fijo = `Eres ${quien}. Atiendes por WhatsApp.

CÓMO HABLAS
Como una persona que sabe de lo que vende. Mensajes de 2 a 4 frases, ${comoHablaElPais(voz.pais)}
Nada de listas con viñetas,
nada de títulos ni de fichas armadas a mano: esto es un chat, no un folleto.
Un emoji suelto está bien; cinco no. No empieces todas las respuestas con
"Perfecto", "Claro", "Excelente" ni con el nombre del cliente. No repitas lo
que el cliente acaba de decir antes de contestarle.

CÓMO PIENSAS
Escucha lo que el cliente realmente quiere, no la palabra suelta que usó.
Contesta PRIMERO lo que preguntó. Una sola pregunta estratégica por mensaje,
y solo cuando la respuesta cambie lo que le vas a recomendar. Si duda, antes de
empujar entiende de qué duda. Si lo que pide no existe, dilo con naturalidad y
muéstrale lo que sí hay.
Si el cliente muestra intención de compra ("lo quiero", "cómo pago", "mándame el link", "me sirve", "listo", "dale", "de una"), CIERRA. Deja de dar explicaciones y no hagas más preguntas de descubrimiento. Si no tienes claro de qué producto habla, ubícalo antes con buscar_en_catalogo y enfocar_producto. Si todavía no le mostraste el precio de ese producto, manda primero mostrar(seccion="precio"). Después, según qué es: un producto FÍSICO con envío se cierra con tomar_pedido (el sistema le manda la lista de datos de envío), NO con los medios de pago; lo demás se cierra con mostrar(seccion="pago"). NUNCA pidas compromiso ("¿te lo llevas?", nombre, cédula, dirección) antes de haberle mostrado el precio: primero precio, después datos.
La ficha de "info" termina ofreciendo "¿te cuento cuánto vale?". Si el cliente contesta "sí" (o "sí, cuánto vale", "qué vale", "dame el precio", "cuánto está"), eso es un pedido de precio: manda mostrar(seccion="precio") en el acto.

CÓMO RESUELVES REFERENCIAS (sin releer texto viejo)
"sí / no / ese / esa / el primero / el segundo / ese curso / lo quiero / dale / ok / mándame ese / cuánto vale? / qué vale? / cuánto cuesta? / precio / a cómo está? / y ese?" se resuelve con el bloque LO QUE YA PASÓ: mensaje actual primero, después tu última pregunta, producto en foco, producto anterior y última herramienta. Cualquier forma de preguntar el valor ("cuánto vale", "qué vale", "cuánto cuesta", "precio", "a cómo", "el valor") es pedido de precio del producto en foco: muestra mostrar(seccion="precio"). "Ese" después de ofrecer es lo último ofrecido. Si igual no está claro, pregunta cuál antes de mostrar nada.
Si el mensaje empieza con [Responde citando este mensaje: "..."], el cliente te respondió señalando ESE mensaje: si es una ficha, su primera línea es el producto que eligió; enfócalo y sigue con ese, sin preguntar "¿cuál?".
Cuando quede clara la intención o le hagas una pregunta, llama a anotar_contexto (no envía nada al cliente) para que el próximo turno no tenga que adivinar.

LAS HERRAMIENTAS PONEN LAS MAQUETAS (DATOS DUROS)
El precio, los medios de pago, la ficha, el video y la entrega son MAQUETAS que
el sistema pega abajo de tu texto cuando usas las herramientas. Tú redactas la
charla natural que las acompaña, pero NUNCA repitas el contenido de la maqueta
en tu texto. Ejemplo: si usas mostrar(seccion="precio"), tu texto solo debe
decir "Acá te dejo el valor:" y la herramienta hace el resto. Si una herramienta
te dice que algo ya se envió, no lo repitas: retoma desde donde quedaron.
Para mostrar un producto necesitas su id: si no lo tienes, busca primero con
buscar_en_catalogo usando lo que pidió el cliente y usa el id que devuelva.
Nunca llames a mostrar con un id vacío o inventado.
Si el cliente pide algo ambiguo que coincide con VARIOS productos (varios
modelos con el mismo nombre, ej. "corrector de postura" ×5), busca con
buscar_en_catalogo y muestra la ficha de cada uno con mostrar_opciones para que
elija, en vez de listar solo texto o preguntar "para qué lo vas a usar". Incluso
con errores de tipeo ("corector", "lanpostura") busca igual: el buscador tolera 1 letra.
Busca SIEMPRE aunque el historial ya mencione productos: los nombres y precios del
historial pueden estar viejos (el catálogo se renombra), y solo buscar_en_catalogo +
mostrar_opciones muestra los datos reales con foto. Nunca copies listas de productos
de mensajes anteriores.

Nunca digas que un pago está confirmado, verificado ni recibido. Eso lo
determina una persona del equipo, y el sistema te avisa cuando pasó.

CÓMO VENDÉS SEGÚN QUÉ ES (multimodelo, no todo es "producto-precio-pago")
- Físico/dropshipping: producto → variante (consultar_disponibilidad, nunca inventes stock) → precio → cuando quiere comprarlo, tomar_pedido con los datos de envío que te dé (el sistema te dice qué falta y le manda el resumen) → cuando confirma el resumen, confirmar_pedido. El pedido existe SOLO cuando confirmar_pedido dice que se creó: antes de eso nunca digas "quedó anotado" ni "quedó registrado". La contraentrega solo si está configurada; si no, explica lo que sí hay. No sueltes "tenemos contraentrega" al saludar. Si pregunta qué empresa lleva el envío o quiere elegirla: consultar_transportadoras (nombres reales para su ciudad, nunca inventes una ni muestres el flete); cuando elija, tomar_pedido(transportadora=…).
- Servicio: necesidad → diagnóstico/alcance (registrar_caso tipo servicio) → disponibilidad → precio real o cotización (solicitar_cotizacion) → agenda (cuándo). No des precio cerrado si depende del modelo/visita.
- Consultoría: problema → objetivo → contexto del negocio → alcance (registrar_caso tipo consultoria) → propuesta/cotización (solicitar_cotizacion). El valor depende del alcance: dilo y registra el caso, no inventes precio fijo.
- Si cambia de servicio a producto (o al revés), cambia el foco con enfocar_producto/registrar_caso y sigue: el contexto anterior queda apilado para "¿y la reparación?".
- Garantía/devolución/tiempos/stock: solo lo cargado por el dueño (consultar_conocimiento/guion). Si no está, di que lo confirmas. Nunca inventes testimonios, cifras de clientes, plazos ni precios.
- Preguntas del PRODUCTO (para qué sirve, cómo se usa, si le sirve para su caso, dudas puntuales): responde RAZONANDO con la ficha del producto + consultar_conocimiento + tu criterio. No lances la maqueta completa si preguntó algo puntual: contesta eso y sigue. La maqueta es para mostrar precio/fotos/pago, no para responder preguntas.
- Si pide más fotos ("otra foto", "fotos reales", "más imágenes"): mostrar(seccion="fotos"). El sistema manda las que todavía no vio, sin repetir; no describas lo que se ve en cada foto ni prometas fotos que no hay.

${renderGuion(guion)}

CATÁLOGO
${catalogoCompacto}${voz.instruccionesExtra ? `\n\nINDICACIONES DEL DUEÑO\n${voz.instruccionesExtra}` : ""}`;

  const temas = temasRespondidosPorElDueno(params.conocimiento, estado.productoEnFoco);
  // La ficha del producto EN FOCO, con los datos que el servidor le muestra al
  // cliente. Sin esto el modelo no ve la descripción de nada (el catálogo del
  // prefijo es `#id · nombre · precio`) y termina desmintiendo su propia ficha:
  // "el detalle exacto de los módulos te lo confirmo" dos mensajes después de
  // haberlos listado (chat del dueño, 27-09-2026). Ver lo-que-dice-la-ficha.ts.
  const fichaEnFoco =
    estado.productoEnFoco != null
      ? bloqueDeLaFichaEnFoco(catalogo.find((p) => p.id === estado.productoEnFoco))
      : "";
  const delTurno = `LO QUE YA PASÓ EN ESTA CONVERSACIÓN
${describirEstado(estado, params.nombrePorProducto)}${fichaEnFoco ? `\n\n${fichaEnFoco}` : ""}${
    temas.length
      ? `\n\nRESPUESTAS QUE CARGÓ EL DUEÑO (valen aunque el tema figure en "NO TIENES ESTOS DATOS"; ` +
        `el texto exacto te lo da consultar_conocimiento): ${temas.join(" · ")}`
      : ""
  }${
    volvio
      ? `\n\nVISITA NUEVA: el cliente no escribía hace ${Math.round(horas!)} horas. Lo de antes es memoria, no una venta pendiente. ` +
        `Contesta a lo que escribe AHORA. Si solo saluda, salúdalo con calidez y pregúntale en qué lo puedes ayudar hoy; ` +
        `no le nombres el producto de antes ni le preguntes si ya se decidió o si ya pagó. ` +
        `Si él retoma lo de antes, ahí sí sigues desde donde quedaron sin repetirle lo que ya tiene. No te presentes de nuevo.`
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
  /**
   * Producto del ANUNCIO por el que llegó el cliente (este turno). Pedido del
   * dueño: se le manda la ficha completa de una, sin "¿te refieres a…?".
   */
  fichaDelAnuncio?: number | null;
  /** Pedidos de producto físico (ver adaptador.servicioDePedidos). */
  pedidos?: import("./herramientas").ServicioDePedidos;
  /** Contexto del tenant para A/B testing */
  tenantId?: number;
  agentId?: number;
  conversationId?: number | string;
}): Promise<ResultadoRespuesta> {
  const { llm, estado, historial, catalogo, guion, voz, tenantId, agentId, conversationId } = params;

  const nombrePorProducto = (id: number) => catalogo.find((p) => p.id === id)?.name ?? `producto #${id}`;
  const mensajeDelCliente = [...historial].reverse().find((m) => m.role === "customer")?.content ?? "";
  // FASE 1/14: el texto del cliente queda en estado (para referencias y diagnóstico).
  estado.ultimoMensajeClienteTexto = String(mensajeDelCliente || "").slice(0, 500) || null;

  // A/B TEST ROUTING: segmenta tráfico entre versión control y tratamiento
  let promptOverride: string | null = null;
  if (tenantId && agentId && conversationId) {
    try {
      const abTestConfig = await getActiveABTestConfig({ tenantId, agentId });
      if (abTestConfig) {
        const grupo = asignarGrupoABTest(conversationId, abTestConfig.trafficPercent);

        if (grupo === "treatment") {
          const candidataPrompt = await getVersionCandidata(abTestConfig.versionId);
          if (candidataPrompt) {
            promptOverride = candidataPrompt;
          }
        }

        // Registra la asignación para auditoría
        const convId = typeof conversationId === "string" ? parseInt(conversationId) : conversationId;
        await logABTestAssignment({
          conversationId: convId,
          versionId: grupo === "treatment" ? abTestConfig.versionId : null,
          grupo,
        });
      }
    } catch (e) {
      // No fallar la conversación por A/B routing
      console.error(`[motor] Error en A/B test routing: ${(e as any).message}`);
    }
  }

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
  let focoFijo: number | null = null;
  if (idx != null && estado.opcionesMostradas.length > idx) {
    const id = estado.opcionesMostradas[idx];
    focoFijo = id;
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

  let { fijo, delTurno } = partesDelPrompt({ voz, estado, catalogo, guion, nombrePorProducto, conocimiento: params.conocimiento });

  // A/B TEST: reemplaza prompt si hay versión candidata
  if (promptOverride) {
    fijo = promptOverride;
  }

  const ctx: ContextoHerramientas = {
    estado,
    catalogo,
    catalogoCompleto: params.catalogoCompleto,
    focoFijo,
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

  // Buscar contexto relevante: si el cliente menciona algo del pasado, trae ese contexto
  // ⚠️ Copia antes de invertir: `historial.reverse()` invertía EN SITIO la
  // charla que después se le manda al modelo, que la leía al revés (y rompía
  // el caché del prefijo y el corte de "visita nueva").
  const mensajeDelClienteActual = [...historial]
    .reverse()
    .find(m => m.role === "customer")?.content || "";
  const relevantes = await buscarContextoRelevante(historial, mensajeDelClienteActual, undefined, 2);
  const relevantesIds = new Set(relevantes.map(m => m.content)); // Evitar duplicados

  // Armar charla: relevantes + últimos N mensajes
  const ultimosMensajes = historial.slice(-MENSAJES_DE_HISTORIAL);
  const todosUnicos = [
    ...relevantes.filter(m => !ultimosMensajes.some(u => u.content === m.content)), // Contexto antiguo relevante
    ...ultimosMensajes, // Contexto reciente
  ];

  const charla = todosUnicos.map((m) => ({
    role: m.role === "customer" ? "user" : "assistant",
    content: m.content,
  }));

  // Para el razonador: historial sin conversión de rol
  const historialParaRazonador = todosUnicos;
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

  // CEREBRO: razonar antes de responder
  const ctxRazonamiento: ContextoRazonamiento = {
    mensajeActual: mensajeDelClienteActual,
    intentDelCliente: estado.intent || "desconocido",
    estadoConversacion: estado,
    historial: historialParaRazonador.slice(-10), // Últimos 10 para contexto
    productoEnFoco: estado.productoEnFoco
      ? {
          id: estado.productoEnFoco,
          nombre: nombrePorProducto(estado.productoEnFoco),
          precio: catalogo.find((p) => p.id === estado.productoEnFoco)?.price || 0,
        }
      : null,
    catalogo,
    conocimientoCargado: params.conocimiento || [],
  };

  let razonamientoDelCerebro;
  let contextoMemoria;
  // ⚠️ APAGADO por defecto (26-09-2026). En producción, con el cerebro
  // encendido, "Lo quiero, ¿cómo pago?" tumbaba al vendedor (500): al
  // "escalar" devolvía `{ textoFinal }` sin `partes` y el envío reventaba
  // ("reading 'filter'"); 50 tests del motor fallaban. Además sumaba una capa
  // de prompt ("CONTEXTO DE MEMORIA"), que CLAUDE.md prohíbe en el camino del
  // vendedor. Se prende solo a propósito con CEREBRO_EN_VIVO=true, y aun así
  // ya no corta la respuesta: solo deja su lectura en la traza.
  if (String(process.env.CEREBRO_EN_VIVO || "").toLowerCase() === "true") try {
    razonamientoDelCerebro = await razonar(ctxRazonamiento);
    traza.push({
      herramienta: "[CEREBRO:razonador]",
      args: { intent: estado.intent },
      resultado: `Confianza: ${razonamientoDelCerebro.confianza.toFixed(0)}% | Escalada: ${razonamientoDelCerebro.escalada}`,
    });

    // Antes: si "escalaba", devolvía una respuesta sin `partes` y el vendedor
    // se caía. La escalada a una persona ya existe (herramienta
    // escalar_a_humano); acá solo queda anotado.

    // MEMORIA: buscar contexto relevante (episódios + patrones + reglas)
    try {
      contextoMemoria = await obtenerContextoMemoria(mensajeDelClienteActual, params.tenantId, null);
      if (contextoMemoria.patrones.length > 0) {
        const patronesEncontrados = contextoMemoria.patrones.map((p) => `${p.nombre} (${p.confianza}%)`).join(", ");
        traza.push({
          herramienta: "[CEREBRO:memoria]",
          args: { tags: contextoMemoria.patrones.flatMap((p) => p.dispara) },
          resultado: `Patrones: ${patronesEncontrados}. Recomendaciones: ${contextoMemoria.patrones
            .flatMap((p) => p.recomendaciones)
            .join(", ")}`,
        });

        // Agregar contexto de memoria al prompt (si hay patrones relevantes)
        if (contextoMemoria.patrones.length > 0) {
          const contextMemoriaTexto = `
CONTEXTO DE MEMORIA: Se detectaron estos patrones en conversaciones previas del negocio:
${contextoMemoria.patrones.map((p) => `- ${p.descripcion} (confianza ${p.confianza}%)`).join("\n")}

Aplica estas recomendaciones si es relevante:
${contextoMemoria.patrones.flatMap((p) => p.recomendaciones.map((r) => `- ${r}`)).join("\n")}`;

          // Insertar contexto en messages justo antes del turno actual
          messages.splice(messages.length - 1, 0, {
            role: "system",
            content: contextMemoriaTexto,
          });
        }
      }
    } catch (errMem) {
      console.warn("[motor] Error en memoria, continuando sin contexto:", errMem);
    }
  } catch (err) {
    console.warn("[motor] Error en razonador, continuando sin reasoning:", err);
  }

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
        resultado = { ok: false, mensaje: `No existe la herramienta ${llamada.name}. Usa alguna de las que te di.` };
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
          resultado = { ok: false, mensaje: `Falló: ${err?.message || "error interno"}. Dile que lo confirmas en un momento, sin inventar el dato.` };
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

  // ── Llegó del anuncio: la ficha completa la manda el servidor ────────────
  // Simulación del 25-09-2026: con el producto del anuncio ya en foco, el
  // modelo preguntaba "¿Te refieres al Corrector de Hombros y Clavícula?".
  // La ficha trae foto, precio, envío, pago y "¿Te lo enviamos?".
  if (params.fichaDelAnuncio != null && !ctx.partes.some((p) => p.kind === "card")) {
    try {
      await ejecutores.mostrar(ctx, { productoId: params.fichaDelAnuncio, seccion: "completa" });
      if (ctx.partes.some((p) => p.kind === "card")) textoFinal = /\?/.test(textoFinal) ? "" : textoFinal;
    } catch { /* sin ficha sigue la respuesta del modelo */ }
  }

  // ── El cliente mandó sus datos y no se registraron ───────────────────────
  // Simulación: "Juan Pérez, 3001234567, Calle 10 # 20-30…" → "¿Están
  // correctos tus datos?" sin llamar tomar_pedido; el resumen salía un turno
  // tarde y el pedido no se cerraba. Con pedido abierto y un mensaje que trae
  // celular o dirección, se le exige registrarlos.
  const trajoDatos = /\b3\d{9}\b|\b(calle|carrera|cra|cr|cl|kr|diagonal|transversal|avenida|av|mz|manzana)\b\.?\s*\d|#\s*\d/i.test(mensajeDelCliente);
  const pedidoAbierto = estado.accionPendiente === "pedir_datos_envio" || estado.compraConfirmada != null;
  if (trajoDatos && pedidoAbierto && !traza.some((t) => t.herramienta === "tomar_pedido") && ctx.pedidos) {
    messages.push({ role: "assistant", content: textoFinal || "…" });
    messages.push({
      role: "system",
      content:
        "El cliente acaba de mandar datos de envío. Llama tomar_pedido YA con lo que dio (nombre, telefono, direccion, barrio, ciudad, departamento). " +
        "Un número de 10 dígitos que empieza por 3 es el CELULAR, no la cédula. No preguntes si están correctos: el sistema le manda el resumen. No le hables de este aviso.",
    });
    const antes = textoFinal;
    textoFinal = "";
    try { await bucle(2); } catch { /* se queda lo anterior */ }
    if (!textoFinal && !ctx.partes.length) textoFinal = antes;
  }

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
        "el cliente no recibiría nada. Si te lo pidió, usa mostrar (con reenviar=true si ya se lo habías mandado). " +
        "Si no hace falta mandar nada, reescribe sin decir que se lo mandas. No le hables de este aviso al cliente.",
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

  // ── Ficha automática desde anuncio ──────────────────────────────────────
  //
  // 25-09-2026: al llegar del anuncio el modelo preguntaba "¿te refieres al...?"
  // en lugar de mandar la ficha. Si el foco viene del anuncio en este turno
  // y no hay ninguna ficha en las partes, el servidor manda la completa.
  const mensajeCliente = params.historial.slice(-1)[0]?.content || "";
  const tieneAnuncio = (mensajeCliente as any)?.metadata?.adTitle;
  if (tieneAnuncio && !hayTarjetas()) {
    try {
      await ejecutores.mostrar(ctx, { productoId: estado.productoEnFoco, seccion: "completa" });
    } catch { /* sin producto en foco no hay ficha */ }
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
        'Primero manda mostrar(seccion="precio") y responde lo que preguntó; los datos se piden después, cuando sepa cuánto cuesta. ' +
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

  // ── Compra confirmada y el modelo pide los datos a su manera ─────────────
  // Simulación 25-09-2026: "dime tu nombre completo y tu número de cédula".
  // La lista la manda el SISTEMA (sin cédula, todos los datos juntos).
  if (textoFinal && foco != null && estado.compraConfirmada === foco && pideDatosDeCompra(textoFinal) && !traza.some((t) => t.herramienta === "tomar_pedido")) {
    try { await ejecutores.tomar_pedido(ctx, {}); } catch { /* sigue el texto */ }
    textoFinal = textoFinal.split(/(?<=[.!?¿¡\n])\s+/).filter((f) => !pideDatosDeCompra(f) && !/c[eé]dula/i.test(f)).join(" ").trim();
  }

  // ── Datos de envío sin que el cliente haya dicho que compra ──────────────
  //
  // Conv 218 (25-09-2026): "Me interesa este" → "Excelente elección. Para
  // coordinar el envío, ¿me podrías dar tu nombre completo y número de
  // cédula?". Interesarse no es comprar (pedido del dueño). Si el texto pide
  // datos y la compra no quedó confirmada por tomar_pedido, se le pide que
  // pregunte primero; si insiste, se sacan las frases que piden datos.
  const focoFisico = foco != null && String(catalogo.find((p) => p.id === foco)?.kind || "") === "physical";
  if (textoFinal && focoFisico && estado.compraConfirmada !== foco && pideDatosDeCompra(textoFinal)) {
    messages.push({ role: "assistant", content: textoFinal });
    messages.push({
      role: "system",
      content:
        "El cliente todavía NO dijo que compra: interesarse no es comprar. No le pidas nombre, dirección ni ningún dato de envío. " +
        "Responde lo que preguntó y cierra con UNA pregunta corta de si quiere hacer el pedido. No le hables de este aviso al cliente.",
    });
    const original = textoFinal;
    textoFinal = "";
    try {
      await bucle(2);
    } catch {
      /* se resuelve abajo */
    }
    if (!textoFinal && !hayTarjetas()) textoFinal = original;
    if (pideDatosDeCompra(textoFinal) && estado.compraConfirmada !== foco) {
      const frases = textoFinal.split(/(?<=[.!?¿¡\n])\s+/).filter((f) => !pideDatosDeCompra(f));
      textoFinal = frases.join(" ").trim();
    }
  }

  // ── Dijo que lo quiere y no salió la lista de datos ──────────────────────
  // Simulación 25-09-2026: "Quiero uno" / "sí, lo quiero" → "¡Genial!" y
  // nada más. Un cliente real se queda esperando. Si el cliente confirmó la
  // compra de un físico y nadie llamó tomar_pedido, lo llama el servidor
  // (confirma la compra y pega la lista de datos de envío).
  {
    const focoAhora = estado.productoEnFoco;
    const esFisicoAhora = focoAhora != null && String(catalogo.find((p) => p.id === focoAhora)?.kind || "") === "physical";
    const confirmaCompra = diceQueCompra(mensajeDelCliente) ||
      (/env[ií]|pedido|llev|compr|lo quieres/i.test(estado.ultimaPreguntaAgente || "") && esConfirmacionBreve(mensajeDelCliente));
    if (esFisicoAhora && confirmaCompra && ctx.pedidos && !traza.some((t) => t.herramienta === "tomar_pedido") && estado.accionPendiente !== "confirmar_pedido") {
      try { await ejecutores.tomar_pedido(ctx, {}); } catch { /* sigue el texto */ }
    }
  }

  // ── Preguntó el precio (o aceptó que se lo dijeran) y el texto no lo dice ─
  // Simulación: "Precio?" → "¿Te gustaría pedirlo?". Ya lo tenía en la ficha,
  // pero si lo pregunta de nuevo, se le dice (el dato lo pone el catálogo).
  //
  // Y el "ok" del cliente pasivo (chat de prueba, 30-09-2026): la ficha de
  // información no trae el precio a propósito y queda ofreciéndolo; "ok" /
  // "sí" / "dale" es aceptar esa oferta, y el modelo contestaba "¿Te gustaría
  // que te cuente cuánto vale?" otra vez. Se decide por el ESTADO (salió la
  // ficha de info y el precio todavía no), no leyendo el texto de la ficha.
  {
    const focoAhora = estado.productoEnFoco;
    const prod = focoAhora != null ? catalogo.find((p) => p.id === focoAhora) : null;
    const preguntaPrecio = /\b(cu[aá]nto (vale|cuesta|es|sale|queda)|precio|valor|a c[oó]mo)\b/i.test(mensajeDelCliente);
    const aceptaPrecioOfrecido = !!prod && esConfirmacionBreve(mensajeDelCliente) &&
      yaSeEnvio(estado, prod.id, "info") && !yaSeEnvio(estado, prod.id, "precio") && !yaSeEnvio(estado, prod.id, "completa");
    const yaLoDice = /\$\s?\d/.test(textoFinal) || ctx.partes.some((p: any) => p.kind === "card" && /precio|completa/.test(String(p.seccion)));
    const OFRECE_PRECIO = /¿[^?¿]*(cu[aá]nto (vale|est[aá]|cuesta|sale)|el precio|el valor)[^?¿]*\?\s*(\p{Extended_Pictographic}️?)?/giu;
    // Y la segunda oferta (curso de Excel, 30-09-2026): tras la ficha de info
    // que ya ofreció el precio, el modelo cerraba otra vez con "¿Te cuento
    // cuánto vale?". Una oferta ya hecha no se repite: se cumple.
    // Si la ficha de info sale en ESTE turno, ella misma cierra ofreciendo el
    // precio: el texto no la repite, y tampoco suelta la cifra (contradiría
    // la pregunta de la ficha que viene justo debajo).
    const infoEnEsteTurno = !!prod && ctx.partes.some((p: any) => p.kind === "card" && p.seccion === "info" && Number(p.productId) === prod.id);
    if (infoEnEsteTurno && !preguntaPrecio) {
      textoFinal = textoFinal.replace(OFRECE_PRECIO, "").trim();
    }
    const ofreceOtraVez = !!prod && !infoEnEsteTurno && !aceptaPrecioOfrecido && !preguntaPrecio &&
      yaSeEnvio(estado, prod.id, "info") && !yaSeEnvio(estado, prod.id, "precio") && !yaSeEnvio(estado, prod.id, "completa") &&
      new RegExp(OFRECE_PRECIO.source, "iu").test(textoFinal);
    if (prod && (preguntaPrecio || aceptaPrecioOfrecido || ofreceOtraVez) && !yaLoDice && Number(prod.price) > 0) {
      const monto = `$${Number(prod.price).toLocaleString("es-CO")}`;
      const extra = String(prod.kind || "") === "physical" ? ", con envío incluido y pagas al recibir" : "";
      if (ofreceOtraVez) {
        // La respuesta a su duda va primero; el precio, donde estaba la oferta.
        textoFinal = `${textoFinal.replace(OFRECE_PRECIO, "").trim()}\n\nEstá en ${monto}${extra}.`.trim();
      } else {
        // La pregunta que ofrecía el precio sobra: ya se está dando.
        if (aceptaPrecioOfrecido) textoFinal = textoFinal.replace(OFRECE_PRECIO, "").trim();
        textoFinal = `Está en ${monto}${extra}.${textoFinal ? `\n\n${textoFinal}` : ""}`;
      }
      registrarEnvio(estado, prod.id, "precio");
    }
  }

  // ── Lista de productos escrita a mano ────────────────────────────────────
  //
  // 25-09-2026, conv 218: "tienes corrector de postura" → el modelo listó
  // "Corrector de postura trenza = $50.000", "ortopédico Back"… productos que
  // YA NO EXISTEN: los copió de un mensaje suyo viejo del historial. Los
  // nombres y precios los pone el catálogo, no el modelo: la lista se saca
  // del texto y salen las fichas reales de lo que se encontró.
  if (textoFinal && !hayTarjetas() && esListaDeProductosAMano(textoFinal)) {
    // Primero por NOMBRE: "¿tienes corrector de postura?" pide la categoría
    // entera, y en el puntaje "corrector" pesa cero justo por estar en todos.
    const plano = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const palabras = plano(mensajeDelCliente).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 5);
    const porNombre = catalogo
      .filter((p) => p.disponible !== false && palabras.some((w) => plano(p.name).includes(w)))
      .slice(0, 4)
      .map((p) => p.id);
    const encontrados = porNombre.length ? porNombre : puntuarCoincidencias(mensajeDelCliente, catalogo, 4).map((x) => x.p.id);
    try {
      if (encontrados.length >= 2) await ejecutores.mostrar_opciones(ctx, { productoIds: encontrados });
      else if (encontrados.length === 1) await ejecutores.mostrar(ctx, { productoId: encontrados[0], seccion: "completa" });
    } catch { /* sin fichas, al menos no sale la lista inventada */ }
    textoFinal = textoFinal
      .split("\n")
      .filter((l) => !/\$\s?\d|=\s*\$?\s?\d/.test(l) && !/^\s*([-•*]|\d+[.)])\s/.test(l))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ── Red de seguridad: una cifra de plata que no existe en el catálogo ────
  let corregido = false;
  let invento = montosInventados(textoFinal, catalogo);
  if (invento.length) {
    const aviso = {
      role: "system" as const,
      content:
        `Escribiste ${invento.map((n) => n.toLocaleString("es-CO")).join(", ")} y ese monto NO está en el catálogo. ` +
        `Reescribe tu respuesta de forma natural sin incluir ese número. ` +
        `IMPORTANTE: No pidas disculpas ni le hables de este error interno al usuario. NO puedes usar herramientas en este turno, responde solo con texto.`,
    };
    try {
      // Reintento con razonamiento al máximo: si ya inventó una cifra una
      // vez, reescribir bien es más importante que contestar rápido. El
      // `effort` solo lo usa DeepSeek (el cliente lo filtra por proveedor).
      const reintento = await llm.crear({
        messages: [...messages, { role: "assistant", content: textoFinal }, aviso],
        temperature: 0.5,
        effort: "high",
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

  // ── Notas internas del modelo ────────────────────────────────────────────
  // Prueba en producción (25-09-2026): al cliente le llegó "(El mensaje
  // anterior ya incluía la pregunta de cierre, espero la respuesta del
  // cliente)." Es el modelo hablándose a sí mismo.
  textoFinal = quitarNotasInternas(textoFinal);

  // ── La letra chica tampoco se inventa ────────────────────────────────────
  //
  // Chat del dueño (27-09-2026), "precio" del curso de piano: la maqueta puso
  // el número correcto ($60.000, pago único) y ENCIMA el modelo escribió "el
  // acceso te queda de por vida, con garantía de 7 días". Ninguna de las dos
  // cosas está cargada en ese negocio.
  //
  // `montosInventados` cuida las cifras; esto cuida lo otro que un cliente
  // puede reclamar después. Va acá, sobre el texto ya limpio y antes de
  // armar las partes, para que no haya forma de esquivarlo: ni el reintento
  // ni el modo plan pueden dejar la promesa afuera del filtro.
  if (textoFinal) {
    const enFoco = estado.productoEnFoco != null ? catalogo.find((p) => p.id === estado.productoEnFoco) : null;
    const respaldo = {
      producto: enFoco ?? null,
      guion,
      conocimiento: (params.conocimiento || [])
        .filter((c) => c.productId == null || c.productId === estado.productoEnFoco)
        .map((c) => c.respuesta),
    };
    const promesas = condicionesSinRespaldo(textoFinal, respaldo);
    if (promesas.length) {
      console.log(
        `🛡️ [MOTOR] Prometía condiciones que nadie cargó (${promesas.map((p) => p.promesa).join(", ")}): se quita la frase`,
      );
      textoFinal = sinCondicionesSinRespaldo(textoFinal, respaldo);
      // Si la promesa ERA todo el mensaje ("Sí, tienes 7 días de garantía")
      // y no hay maqueta que lo acompañe, el cliente no puede quedarse sin
      // respuesta: se le dice lo único honesto que hay para decir.
      if (!textoFinal && !hayTarjetas()) {
        // Antes: "te lo confirmo con el equipo y te escribo". Nadie recibe
        // esa pregunta, así que la promesa no se cumplía (30-09-2026). Se dice
        // la verdad y se sigue con lo que SÍ está en la ficha.
        const puntos = enFoco ? puntosDeLaFicha(enFoco).slice(0, 2) : [];
        textoFinal = puntos.length
          ? `Eso puntual no lo tengo confirmado para prometértelo. Lo que sí te puedo asegurar: ${puntos.join("; ")}.`
          : "Eso puntual no lo tengo confirmado para prometértelo, así que prefiero no decírtelo a medias. ¿Qué más te gustaría saber del producto?";
      }
    }
  }

  // ── La ficha ya trae el precio: no ofrecerlo en el texto ─────────────────
  // Producción 26-09: "Te adjunto la información… ¿Te cuento cuánto vale?"
  // encima de una ficha que ya decía el precio. Dos preguntas, una absurda.
  if (ctx.partes.some((p: any) => p.kind === "card" && (p.seccion === "completa" || p.seccion === "precio"))) {
    textoFinal = textoFinal
      .replace(/¿[^?¿]*(cu[aá]nto (vale|est[aá]|cuesta|sale)|el precio|el valor)[^?¿]*\?\s*(\p{Extended_Pictographic}️?)?/giu, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

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

  // ── Tuteo también en lo que arma el servidor ─────────────────────────────
  // El prompt y varios textos del sistema están en voseo ("¿Confirmás el
  // pedido?"); salvo en Argentina/Uruguay, todo lo que sale se pasa a tú.
  const tutea = !/argentin|uruguay/i.test(String(voz.pais || ""));
  if (tutea) {
    textoFinal = hablarColombiano(textoFinal);
    for (const parte of ctx.partes) if ((parte.kind === "text" || parte.kind === "voz") && (parte as any).content) (parte as any).content = hablarColombiano((parte as any).content);
  }

  // ── Armado de la respuesta ───────────────────────────────────────────────
  const partes: Parte[] = [];
  // La nota de voz va PRIMERO: el cliente escucha la explicación y después lee
  // la frase corta de cierre ("¿así te queda más claro?"). Sin esta línea la
  // herramienta la emitía y el armado la descartaba (solo copiaba texto y fichas).
  for (const parte of ctx.partes) if (parte.kind === "voz" && parte.content) partes.push(parte);
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
  // La ficha completa (o de precio) de algo que se despacha sale DESPUÉS del
  // texto y cierra con "¿Te lo enviamos?" / "¿Te tomo el pedido?" (whatsapp.ts):
  // es lo último que el cliente ve. Chat de prueba desplegado (30-09-2026):
  // "ok" a esa pregunta → "¿Te gustaría llevarla?", porque acá solo se guardaba
  // la pregunta del texto del modelo.
  const ultimaParte = partes[partes.length - 1];
  const cierraConFichaDeEnvio = ultimaParte?.kind === "card" &&
    /^(completa|precio)$/.test(String((ultimaParte as any).seccion || "")) &&
    String(catalogo.find((p) => p.id === Number((ultimaParte as any).productId))?.kind || "") === "physical";
  if (cierraConFichaDeEnvio) {
    estado.ultimaPreguntaAgente = "¿Te lo enviamos? (así cierra la ficha que acaba de ver: un sí es tomar el pedido)";
    estado.preguntaPendiente = estado.ultimaPreguntaAgente;
  } else
  // FASE 2: la última pregunta del agente resuelve el próximo "sí/ese/dale".
  if (textoFinal && /\?\s*$/.test(textoFinal)) {
    estado.ultimaPreguntaAgente = textoFinal.slice(-300);
    if (!estado.preguntaPendiente) estado.preguntaPendiente = textoFinal.slice(-300);
  } else if (textoFinal) {
    estado.preguntaPendiente = null;
    // Si este mensaje no terminó en pregunta, un "sí" del cliente ya no
    // contesta la pregunta de hace varios mensajes.
    estado.ultimaPreguntaAgente = null;
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
    /\b(ah[ií]|ac[aá]|aqu[ií])\s+(te\s+)?(van|va|dejo|mando|paso|env[ií]o|comparto|tienes|ten[eé]s)\b/i.test(texto) ||
    /\bte\s+(los|las|lo|la)\s+(dejo|mando|paso|env[ií]o|comparto)\s+(de nuevo|otra vez|nuevamente|ac[aá]|aqu[ií]|abajo)\b/i.test(texto)
  );
}

/**
 * Saca lo que el modelo escribe para sí mismo y no para el cliente: un
 * paréntesis que habla "del cliente", "del mensaje anterior", de
 * herramientas o del sistema, o una línea que empieza con "Nota:".
 */
export function quitarNotasInternas(texto: string): string {
  const META = /\b(el cliente|la clienta|del cliente|mensaje anterior|herramienta|sistema|instrucci[oó]n|pregunta de cierre|espero (la|su) respuesta|este turno|no escribo|no respondo)\b/i;
  const limpio = String(texto || "")
    .replace(/\(([^()]{0,300})\)/g, (m, dentro) => (META.test(dentro) ? "" : m))
    .split("\n")
    .filter((l) => !/^\s*(nota|note|nota interna)\s*:/i.test(l) && !(META.test(l) && /\b(el cliente|la clienta)\b/i.test(l)))
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Si solo quedó puntuación, no hay nada que decirle al cliente.
  return /[\p{L}\p{N}]/u.test(limpio) ? limpio : "";
}

/** ¿El modelo escribió una lista de productos con precio? (2+ líneas "Nombre = $N" o "- Nombre $N"). */
export function esListaDeProductosAMano(texto: string): boolean {
  const lineas = String(texto || "").split("\n");
  return lineas.filter((l) => /\$\s?\d{1,3}([.,]\d{3})+|\$\s?\d{4,}/.test(l) && /[a-záéíóúñ]{3,}/i.test(l)).length >= 2;
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
  // El dato de compra nombrado + cualquier forma de pedirlo. La primera
  // versión listaba verbos ("pásame", "dame") y se le escapó "¿me podrías
  // dar tu nombre completo y número de cédula?" (conv 218, 25-09-2026): el
  // español tiene demasiadas formas de pedir. Una pregunta que nombra el dato
  // ya es pedirlo.
  const dato = /\b(c[eé]dula|nombre completo|nombre y apellido|direcci[oó]n|barrio|datos de env[ií]o|datos para (el )?env[ií]o)\b/i;
  // Voseo Y tuteo: desde que el bot tutea (25-09-2026) "dime tu nombre
  // completo" se escapaba porque la lista solo tenía "decime".
  const pide = /\?|\b(p[aá]same|dame|dar(me)?|pod[eé]s|puedes|podr[ií]as|necesito|env[ií]a(me)?|mand[aá](me)?|compart[ií](me)?|comp[aá]rteme|dec[ií]me|dime|d[ií]game|regal[aá]me|ind[ií]came|indic[aá]me|confirm[aá]me|conf[ií]rmame|escrib[ií]me|escr[ií]beme|facil[ií]tame)\b/i;
  return dato.test(t) && pide.test(t);
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
