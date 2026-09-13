/**
 * MOTOR DEL AGENTE
 * ================
 *
 * Reemplaza a runAgentReply() de agent.ts (5.030 líneas) y a toda la cadena
 * response-brain / sales-playbook / whatsapp-brain / supervisor / objeciones /
 * next-best-action / emojis-con-medida / precio-verificado.
 *
 * El bucle es el estándar de tool calling y cabe en una pantalla:
 *
 *   1. Se arma el contexto: quién sos, qué hay en el catálogo, QUÉ PASÓ YA
 *      (estado explícito) y el historial de la charla.
 *   2. Se le pregunta al modelo. Puede contestar texto, o pedir herramientas.
 *   3. Si pidió herramientas, se ejecutan (ellas aplican las reglas y arman
 *      las partes a enviar) y se le devuelve el resultado para que siga.
 *   4. Cuando el modelo da su texto final, se envía junto con lo que las
 *      herramientas agregaron, y se guarda el estado.
 *
 * Lo que NO hay acá, a propósito: ninguna expresión regular que intente
 * entender lo que quiso decir el cliente.
 */

import {
  definicionesDeHerramientas,
  ejecutores,
  type ContextoHerramientas,
  type Parte,
  type Producto,
} from "./herramientas";
import {
  describirEstado,
  horasDesdeUltimoMensaje,
  type EstadoConversacion,
  type RepositorioEstado,
} from "./estado-conversacion";

export interface Mensaje {
  role: "customer" | "agent";
  content: string;
  createdAt: Date | string;
}

export interface VozDelNegocio {
  nombreAgente: string;
  rolAgente: string;
  nombreNegocio: string;
  /** Ajustes de tono que el dueño escribe desde el panel. Opcional y corto. */
  instruccionesExtra?: string;
}

export interface ClienteLLM {
  /** Debe soportar tool calling estilo OpenAI. */
  crear(params: {
    messages: any[];
    tools: any[];
    temperature: number;
  }): Promise<{
    content: string | null;
    toolCalls: { id: string; name: string; arguments: string }[];
  }>;
}

/** Cuántos mensajes del historial se mandan. Uno solo, en un solo lugar. */
const MENSAJES_DE_HISTORIAL = 40;

/** Tope de vueltas del bucle, para que nunca se cuelgue llamando herramientas. */
const MAX_VUELTAS = 6;

export function construirPromptDeSistema(
  voz: VozDelNegocio,
  estado: EstadoConversacion,
  catalogo: Producto[],
  nombrePorProducto: (id: number) => string,
): string {
  const horas = horasDesdeUltimoMensaje(estado);
  const volvioDespuesDeUnRato = horas != null && horas > 8;

  // El catálogo va completo pero compacto. Con catálogos grandes (>60), el
  // modelo usa buscar_en_catalogo en vez de recibirlo entero.
  const catalogoCompacto =
    catalogo.length <= 60
      ? catalogo
          .filter((p) => p.disponible)
          .map((p) => `#${p.id} · ${p.name}${p.price ? ` · ${p.currency || "COP"} ${p.price}` : ""}`)
          .join("\n")
      : `${catalogo.filter((p) => p.disponible).length} productos. Usá buscar_en_catalogo para ubicarlos.`;

  return `Sos ${voz.nombreAgente}, ${voz.rolAgente} de ${voz.nombreNegocio}. Atendés por WhatsApp.

CÓMO HABLÁS
Como una persona real que sabe de lo que vende. Mensajes cortos, de 2 a 4 frases,
en el español de Colombia, cálido y directo. Nada de listas con viñetas ni de
mensajes largos con títulos: esto es un chat, no un folleto. Un emoji suelto está
bien; cinco no. No repitas lo que el cliente acaba de decir antes de contestarle.

CÓMO PENSÁS
Escuchá lo que el cliente realmente quiere, no la palabra suelta que usó. Si
pregunta algo puntual, contestá eso y nada más. Si duda, entendé de qué duda
antes de empujar. Si lo que pide no existe en el catálogo, decilo con
naturalidad y mostrale lo que sí hay — nunca inventes un producto, un precio,
una promoción ni una fecha de entrega.

LAS HERRAMIENTAS HACEN LOS HECHOS
El precio, la ficha, el video y los datos de pago NO los escribís vos: los manda
la herramienta correspondiente y se agregan solos al mensaje. Vos ponés la parte
conversacional alrededor. Si una herramienta te dice que algo ya se envió, no lo
repitas: retomá desde donde quedaron.

Nunca digas que un pago está confirmado, verificado o recibido. Eso solo lo
determina una persona del equipo, y el sistema te avisa cuándo pasó.

CATÁLOGO
${catalogoCompacto}

LO QUE YA PASÓ EN ESTA CONVERSACIÓN
${describirEstado(estado, nombrePorProducto)}${
    volvioDespuesDeUnRato
      ? `\n\nEl cliente había dejado de escribir hace ${Math.round(horas!)} horas y volvió recién. Retomá donde quedaron en una línea; no arranques de cero ni te presentes de nuevo.`
      : ""
  }${voz.instruccionesExtra ? `\n\nINDICACIONES DEL DUEÑO\n${voz.instruccionesExtra}` : ""}`;
}

export interface ResultadoRespuesta {
  partes: Parte[];
  estado: EstadoConversacion;
  /** Para observabilidad: qué herramientas se usaron y qué contestaron. */
  traza: { herramienta: string; args: any; resultado: string }[];
}

export async function responder(params: {
  llm: ClienteLLM;
  estado: EstadoConversacion;
  historial: Mensaje[];
  catalogo: Producto[];
  voz: VozDelNegocio;
}): Promise<ResultadoRespuesta> {
  const { llm, estado, historial, catalogo, voz } = params;

  const nombrePorProducto = (id: number) =>
    catalogo.find((p) => p.id === id)?.name ?? `producto #${id}`;

  const ctx: ContextoHerramientas = { estado, catalogo, partes: [] };
  const traza: ResultadoRespuesta["traza"] = [];

  const messages: any[] = [
    { role: "system", content: construirPromptDeSistema(voz, estado, catalogo, nombrePorProducto) },
    ...historial.slice(-MENSAJES_DE_HISTORIAL).map((m) => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.content,
    })),
  ];

  let textoFinal = "";

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const respuesta = await llm.crear({
      messages,
      tools: definicionesDeHerramientas,
      temperature: 0.6,
    });

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
        resultado = { ok: false, mensaje: `No existe la herramienta ${llamada.name}.` };
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
          // Una herramienta que falla no puede tumbar la respuesta al cliente.
          resultado = { ok: false, mensaje: `Falló: ${err?.message || "error interno"}.` };
        }
        traza.push({ herramienta: llamada.name, args, resultado: resultado.mensaje });
      }

      messages.push({
        role: "tool",
        tool_call_id: llamada.id,
        content: resultado.mensaje,
      });
    }
  }

  // El texto del modelo va PRIMERO y las partes que agregaron las herramientas
  // después, que es el orden natural en un chat ("te cuento... [ficha]").
  const partes: Parte[] = [];
  if (textoFinal) partes.push({ kind: "text", content: textoFinal });
  partes.push(...ctx.partes);

  // Si el modelo no dijo nada y ninguna herramienta produjo algo, no se manda
  // un mensaje vacío: se escala en silencio para que lo vea una persona.
  if (!partes.length) {
    partes.push({
      kind: "text",
      content: "Dame un segundo que te confirmo eso 👍",
    });
  }

  estado.ultimoMensajeCliente = new Date().toISOString();

  return { partes, estado, traza };
}

/* ────────────────────────────────────────────────────────────────────────────
 * PUNTO DE ENTRADA
 *
 * Misma firma que el runAgentReply() actual, para que whatsapp.ts casi no
 * cambie. ADAPTAR: las tres funciones de carga según el esquema real.
 * ──────────────────────────────────────────────────────────────────────────── */

export async function runAgentReply(
  conversationId: number,
  deps: {
    llm: ClienteLLM;
    repositorio: RepositorioEstado;
    cargarHistorial: (conversationId: number) => Promise<Mensaje[]>;
    cargarCatalogo: (conversationId: number) => Promise<Producto[]>;
    cargarVoz: (conversationId: number) => Promise<VozDelNegocio>;
  },
): Promise<Parte[]> {
  const [estado, historial, catalogo, voz] = await Promise.all([
    deps.repositorio.cargar(conversationId),
    deps.cargarHistorial(conversationId),
    deps.cargarCatalogo(conversationId),
    deps.cargarVoz(conversationId),
  ]);

  const resultado = await responder({ llm: deps.llm, estado, historial, catalogo, voz });

  await deps.repositorio.guardar(resultado.estado);

  return resultado.partes;
}
