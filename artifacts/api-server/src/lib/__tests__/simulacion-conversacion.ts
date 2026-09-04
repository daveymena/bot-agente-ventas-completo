/**
 * Simulador de conversación de WhatsApp, turno por turno.
 *
 * Los tests que había medían UN mensaje suelto contra el motor. Pero el bot no
 * pierde clientes en un mensaje: los pierde en el cuarto, cuando arrastra el
 * producto anterior, repite una ficha que ya mandó o vuelve a preguntar algo
 * que el cliente ya contestó. Eso solo se ve dejando correr la conversación.
 *
 * Qué es fiel a producción y qué no
 * ─────────────────────────────────
 * FIEL: la memoria se rehace entre turnos con las MISMAS reglas que
 * `loadConversationMemory` (leídas de ahí, no inventadas):
 *
 *   · `currentProductId` se mueve SOLO cuando se envió una ficha (cardSent).
 *     Que la búsqueda identifique un producto no basta -- así funciona el de
 *     verdad, y es justo la diferencia que causaba los cruces de producto.
 *   · `sentProductIds` acumula las fichas de ESTA sesión (ventana de 4 h), que
 *     es lo que decide si una ficha se descarta por repetida.
 *   · `hasGreeted` es "ya hubo algún mensaje del agente".
 *   · `currentStage` es la etapa que devolvió el turno anterior, que es lo que
 *     `persistStage` guarda en la conversación.
 *
 * NO FIEL, y hay que tenerlo presente al leer los resultados: acá NO se llama a
 * la IA. Se simula el MOTOR, que es la parte determinista: qué producto queda
 * en foco, qué etapa, si corresponde mandar ficha y qué instrucciones recibe el
 * modelo. El texto que le llega al cliente lo redacta la IA con ese contexto y
 * no se puede fijar en un test sin volverlo inestable y caro.
 *
 * La regla de cuándo se manda la ficha
 * ────────────────────────────────────
 * `shouldSendCard` la decide el motor. Pero cuando el motor identifica el
 * producto del mensaje (`productoDelMensaje`) deja la ficha a criterio de la
 * IA, invitándola con "[CARD: id]". En producción la IA la manda cuando el
 * producto es nuevo en la conversación. El simulador asume ESO -- es el único
 * supuesto de comportamiento del modelo que hace, y está acá para que se vea:
 *
 *   ficha = shouldSendCard  ||  (producto identificado && ficha no enviada aún)
 *
 * Cada turno puede sobreescribirlo con `fichaIgual` / `sinFicha` para simular a
 * propósito el caso contrario.
 */
import { readFileSync } from "fs";
import { computeDecision, type ConversationMemory, type EngineDecision } from "../conversation-engine";

export const CATALOGO_REAL = JSON.parse(
  readFileSync(new URL("../../../../../products-full.json", import.meta.url), "utf8")
).map((p: any) => ({
  id: p.id,
  name: p.name,
  description: p.description ?? null,
  category: p.category ?? null,
  categoryId: null,
  price: String(p.price),
  currency: p.currency || "COP",
  features: p.features || [],
  isActive: true,
}));

export interface Turno {
  /** Lo que escribe el cliente. */
  cliente: string;
  /** Forzar que la IA NO mande ficha en este turno (para probar el caso). */
  sinFicha?: boolean;
}

export interface ResultadoTurno {
  cliente: string;
  decision: EngineDecision;
  /** Producto del que habla el bot en este turno, salga por donde salga. */
  producto: string | null;
  /** ¿Se envió una ficha en este turno? */
  fichaEnviada: boolean;
  /** Foco al TERMINAR el turno (lo que arrastra al siguiente). */
  focoAlCerrar: string | null;
}

function memoriaInicial(): ConversationMemory {
  return {
    history: [],
    hasGreeted: false,
    currentStage: "greeting",
    currentProductId: null,
    currentProductName: null,
    sentProductIds: new Set<number>(),
    lastCustomerMessage: "",
    lastAgentMessage: "",
    messageCount: 0,
    isNewSession: false,
    sessionStartedAt: null,
    paymentStatus: null,
    paymentMethod: null,
    paymentAmount: null,
    paidAt: null,
  };
}

/**
 * Corre una conversación completa y devuelve qué decidió el motor en cada turno.
 *
 * `memoriaPrevia` permite arrancar con una conversación ya empezada (por
 * ejemplo, un cliente que vuelve con un producto ya en foco).
 */
export async function simular(
  turnos: Turno[],
  memoriaPrevia?: Partial<ConversationMemory>
): Promise<ResultadoTurno[]> {
  const memoria: ConversationMemory = { ...memoriaInicial(), ...memoriaPrevia };
  const resultados: ResultadoTurno[] = [];

  for (const turno of turnos) {
    memoria.messageCount += 1;
    memoria.lastCustomerMessage = turno.cliente;

    const decision = await computeDecision(
      memoria,
      turno.cliente,
      CATALOGO_REAL,
      new Map<number, string>(),
      null
    );

    // De qué producto habla el bot en este turno.
    const producto = decision.productToShow ?? decision.productoDelMensaje ?? null;
    const productoId = producto?.id ?? null;
    const productoNombre = producto?.name ?? null;

    // ¿Manda ficha? (ver la nota de arriba sobre el único supuesto del modelo)
    //
    // El descarte por repetida sale de `agent.ts`: si la ficha de ese producto
    // ya se mandó en esta sesión NO se repite... salvo en flujo de pago, donde
    // la ficha lleva los enlaces vigentes y repetirla es deliberado.
    const esFlujoDePago =
      decision.intent === "payment_intent" || decision.intent === "confirmation";
    const yaLaTiene = productoId !== null && memoria.sentProductIds.has(productoId);
    const fichaEnviada =
      !turno.sinFicha &&
      productoId !== null &&
      (esFlujoDePago || !yaLaTiene);

    // ── Rehacer la memoria como lo hace loadConversationMemory ──────────────
    if (fichaEnviada && productoId !== null) {
      memoria.sentProductIds.add(productoId);
      memoria.currentProductId = productoId;      // el foco lo mueve la FICHA
      memoria.currentProductName = productoNombre;
    }
    memoria.currentStage = decision.stage;
    memoria.hasGreeted = true;
    memoria.lastAgentMessage = `[turno ${resultados.length + 1}]`;

    resultados.push({
      cliente: turno.cliente,
      decision,
      producto: productoNombre,
      fichaEnviada,
      focoAlCerrar: memoria.currentProductName,
    });
  }

  return resultados;
}

/** Imprime la conversación de forma legible, para leerla como un chat. */
export function imprimir(titulo: string, pasos: ResultadoTurno[]): string {
  const l: string[] = [`\n━━━ ${titulo} ${"━".repeat(Math.max(0, 56 - titulo.length))}`];
  pasos.forEach((p, i) => {
    l.push(`\n${i + 1}. 👤 ${p.cliente}`);
    const d = p.decision;
    const marcas: string[] = [];
    if (d.mensajeSinProducto) marcas.push("no nombra producto");
    if (d.productSearchFailed) marcas.push("⚠️ pidió algo que NO está");
    if (p.fichaEnviada) marcas.push("📇 manda ficha");
    l.push(
      `   🤖 etapa=${d.stage}  intención=${d.intent}  producto=${p.producto ?? "—"}` +
        (marcas.length ? `\n      ${marcas.join(" · ")}` : "")
    );
    l.push(`      foco al cerrar el turno: ${p.focoAlCerrar ?? "—"}`);
  });
  return l.join("\n");
}
