/**
 * FASE A del plan aprobado "Reemplazar el cerebro de Atlas por OpenCode":
 * ruta nueva y separada, `POST /api/code-agent/operator-opencode`, mismo
 * contrato exacto que `/operator` (routes/code-agent.ts) pero SIEMPRE usa el
 * cerebro nuevo. No toca `/operator` en absoluto -- cero riesgo para
 * tenants reales mientras esto se prueba. Ver el plan para el resto de las
 * fases (B: flag por tenant, C: default).
 *
 * Lo que SÍ se reusa tal cual de /operator (mismo comportamiento, misma
 * seguridad): la máquina de estados de confirmación de architect-store.ts
 * (getPendingPlan/setPendingPlan/isApproval/isRejection), executeAction() y
 * verifyMutation() de app-operator.ts, describePlannedAction() de
 * opencode-mcp-tools.ts, y paraMarkdown()/toEmojiStyle() para el formato de
 * salida. La ÚNICA pieza nueva es cómo se genera la respuesta: en vez del
 * loop local callAI()+JSON.parse, se delega el turno a una sesión real de
 * OpenCode (contenedor `operato`) con las herramientas de lectura + la tool
 * `propose_action` vía MCP.
 *
 * Simplificaciones deliberadas de esta Fase A (no son huecos de seguridad,
 * son features que faltan pulir antes de la Fase C):
 * - Sin auto-reparación (attemptSelfRepair): si una acción confirmada
 *   falla, se reporta el error tal cual, sin reintentar solo.
 * - Sin relay de progreso fino vía GET /event de OpenCode: se manda un
 *   heartbeat genérico mientras se espera la respuesta.
 * - El modelo/proveedor de OpenCode es fijo por ahora (ver pickOpencodeModel) --
 *   la tarea de sincronizar las API keys guardadas del admin lo hace dinámico.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAdmin, type TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { esUnSiParaEstePlan } from "../lib/es-un-si";
import { correrTurnoDirecto, directoDisponible } from "../lib/atlas-directo";
import { promptDeAtlas, executeAction, verifyMutation, investigacionRapida, mensajeParaAdmin, isReadOnlyTool, type OperatorContext } from "../lib/app-operator";
import {
  loadArchitectHistory, saveArchitectTurn, getPendingPlan, setPendingPlan,
  clearPendingPlan, isApproval, isRejection, loadRecentLessons,
} from "../lib/architect-store";
import { toEmojiStyle } from "../lib/conversation-engine";
import { esResumenInterno, pareceIngles, avisoDeTurnoIncompleto, avisoDeCierreVacio } from "../lib/respuesta-al-admin";
import { paraMarkdown } from "./code-agent";
import { describePlannedAction, buildMcpToolRegistry, drainDraftPlan, lecturasDelTurno, catalogoDeCapacidades, herramientasQuePide, recordarHerramientasPedidas, herramientasPedidasAntes } from "../lib/opencode-mcp-tools";
import { MODULO_PUBLICIDAD, FORMATO_ANUNCIO } from "../lib/publicidad-persuasiva";
import { mintTurnToken } from "../lib/opencode-turn-token";
import { getAppUrl } from "../lib/app-url";
import { ENV_POR_PROVEEDOR } from "../lib/ai-keys";
import { claveDeTurno, empezarTurno, terminarTurno, pedirDetener, hayTurnoEnVuelo, fueDetenido } from "../lib/turnos-en-vuelo";
import { afirmaHaberloHecho } from "../lib/afirma-haberlo-hecho";
import { mensajeDeCierre } from "../lib/entrega-por-partes";
import { partirElPedido } from "../lib/partir-el-pedido";
import { arrancaPedidoNuevo } from "../lib/es-pedido-nuevo";
import { verloEsAutorizarlo } from "../lib/pedir-ver-el-resultado";
import { anotarTurno, ultimosTurnos, resumirTurnos } from "../lib/diagnostico-de-turnos";
import { db, products } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

// ── Configuración del contenedor OpenCode ───────────────────────────────────
//
// OJO con cuál contenedor es: acá decía "(operato)" y era MENTIRA. En
// producción `ATLAS_OPENCODE_HOST` apunta a
// `https://opencode1-opencode-clean.2xs2bu.easypanel.host`, o sea al
// contenedor **opencode-clean** del proyecto `opencode1`. `operato` es otro
// servicio del mismo proyecto (el dashboard de Operator Pro), y quien leyera
// este comentario para depurar un turno de Atlas iba a mirar los logs del
// contenedor equivocado.
//
// El circuito completo, para no tener que reconstruirlo cada vez:
//
//   admin en el panel
//     → POST /api/code-agent/operator-opencode      (esta ruta, en tecnoia)
//     → Basic auth contra opencode-clean            (ATLAS_OPENCODE_USER/PASS)
//        · POST /mcp                     registra el puente de vuelta
//        · POST /session                 abre la sesión
//        · POST /session/{id}/message    manda el mensaje del admin
//     → opencode-clean llama de vuelta a ventasproia.com/api/internal/mcp/atlas
//       con un token por turno, y ahí se ejecutan las herramientas de verdad.
//
// No confundir con `OPENCODE_API_URL` (https://opencode.ai/zen/v1): esa es la
// nube de OpenCode Zen y la usa el bot de WhatsApp para responderle a los
// CLIENTES. Son dos caminos independientes que comparten el nombre "opencode".
//
// Nunca hardcodear la credencial acá -- si faltan las env vars, esta ruta
// falla con un mensaje claro en vez de silenciosamente usar un valor
// insertado en el código fuente (que terminaría en git).
function opencodeConfig(): { host: string; authHeader: string } | null {
  const host = process.env.ATLAS_OPENCODE_HOST;
  const user = process.env.ATLAS_OPENCODE_USER;
  const pass = process.env.ATLAS_OPENCODE_PASS;
  if (!host || !user || !pass) return null;
  return { host: host.replace(/\/+$/, ""), authHeader: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") };
}

// ── Serialización de llamadas a operato ─────────────────────────────────────
// El registro MCP (`POST /mcp`) es GLOBAL en el contenedor -- si dos turnos
// de tenants distintos corrieran en paralelo, el segundo "registro" podría
// pisar el token del primero antes de que termine de usarlo, mezclando el
// contexto de un tenant con el de otro. Mientras el bridge sea un solo
// contenedor compartido, se serializa: registrar+enviar+esperar respuesta es
// una sección crítica. Simplifica la Fase A a costa de rendimiento bajo
// carga concurrente -- aceptable para dogfooding de un solo tenant; revisar
// antes de la Fase C si hay más de un tenant usándolo a la vez.
let opencodeQueue: Promise<any> = Promise.resolve();
function conCandado<T>(fn: () => Promise<T>): Promise<T> {
  const run = opencodeQueue.then(fn, fn);
  opencodeQueue = run.then(() => undefined, () => undefined);
  return run;
}

// Respaldo fijo confirmado funcionando en vivo (2026-08-12, contenedor
// opencode-clean) -- gratis y rápido (~1-2s por turno simple). SIEMPRE es el
// último candidato de la rotación: nunca falla por falta de crédito/quota.
const MODELO_RESPALDO = { providerID: "opencode", modelID: "big-pickle" };

// Diagnóstico completo (2026-08-12) de por qué el sync de keys no alcanzaba
// para usar un proveedor pago:
// 1. `PUT /auth/{id}` sí guarda la key en el auth.json del contenedor (server
//    lo confirma con `true`), pero el endpoint `/provider`'s `connected` --
//    lo único que refleja qué proveedores están realmente utilizables -- NO
//    se recalcula a partir de auth.json en caliente. Solo lista un proveedor
//    como "connected" si su variable de entorno estándar (`GROQ_API_KEY`,
//    `MISTRAL_API_KEY`, etc.) estaba seteada en el PROCESO al arrancar.
//    Confirmado agregando `MISTRAL_API_KEY` como env var real del servicio
//    `opencode-clean` en EasyPanel + reinicio: "mistral" pasó a aparecer en
//    `connected` y una llamada real funcionó (200, respuesta correcta, costo
//    real cobrado). Es decir: el sync dinámico de `opencode-provider-sync.ts`
//    (`PUT /auth/*`) deja la key lista para cuando el proceso reinicie con
//    esa env var seteada, pero no la activa en caliente por sí solo -- para
//    activar un proveedor pago nuevo hace falta agregar su env var real al
//    contenedor `opencode-clean` en EasyPanel + reiniciarlo una vez.
// 2. `groq` con `llama-3.3-70b-versatile`, aun ya "connected" del mismo modo,
//    falla con `ContextOverflowError` ("Session too large to compact...")
//    incluso en una sesión nueva vacía sin herramientas -- probablemente un
//    bug de esta versión de opencode-ai con ese modelo puntual, no algo
//    resoluble desde acá. Se lo excluye de la lista de candidatos.
//
// 3. `openrouter` activado el mismo día (env var real `OPENROUTER_API_KEY`
//    + reinicio): a diferencia de `mistral`/`groq`, poner solo un valor de
//    prueba en la env var SÍ marcó "connected" en `/provider`, pero la
//    llamada real falló con 401 "Missing Authentication header" -- el
//    campo `connected` y la autenticación real de cada request son cosas
//    separadas, hace falta el valor REAL de la key en la env var para que
//    la llamada funcione, no alcanza con que exista. Con la key real
//    confirmado en vivo. Se probaron los 16 modelos gratis del catálogo de
//    OpenRouter de este contenedor (turno simple, sin herramientas): 3
//    fallaron por timeout >40s (`google/gemma-4-26b-a4b-it:free`,
//    `google/gemma-4-31b-it:free`, `nvidia/nemotron-3-super-120b-a12b:free`),
//    1 no soporta tool-calling en absoluto (`nvidia/nemotron-3.5-content-
//    safety:free`, es un clasificador de moderación, no un chat), 1 ignoró
//    la instrucción de forma rara (`cohere/north-mini-code:free`). Los 3
//    elegidos abajo respondieron limpio en 1,3-4,4s y tienen
//    `capabilities.toolcall:true` confirmado en el catálogo.
//
// Rotación real: lista ORDENADA de candidatos (pagos o gratis-con-key-
// propia, lo que los distingue del respaldo de Zen es que dependen de una
// activación explícita). Para cada turno se consulta `/provider` una vez
// (qué está `connected` hoy, ya sea porque alguien activó su env var, o
// porque el usuario pidió que se dejen varios activos a la vez para no
// depender de uno solo) y se arma la sub-lista de los que están realmente
// conectados, en este orden de preferencia. Si el elegido falla EN LA
// LLAMADA REAL (rate limit, 500, lo que sea) se prueba el siguiente
// conectado antes de rendirse al respaldo gratis -- así un proveedor caído
// (o sin activar tras un reinicio del contenedor) nunca deja a Atlas sin
// responder, y agregar un proveedor nuevo a esta lista es lo único que hace
// falta en código una vez que su env var quede seteada con la key real.
// 4. `deepseek` (activado 2026-08-19, key propia de pago del admin). Va
//    PRIMERO por una razón medida, no por preferencia: el turno de anuncio se
//    cortaba a los 135s sin crear nada, y el desglose por tramos mostró que el
//    tiempo se iba en rotar entre candidatos que no resolvían
//    (`nemotron-3-nano` 48s, `laguna` 31s, `nemotron-3-ultra` 8s, `big-pickle`
//    17s). Con un pago rápido al frente la cadena casi nunca llega a rotar.
//
//    Cuál de los cuatro modelos de DeepSeek, y por qué los otros tres NO:
//    según el catálogo real (models.dev, el mismo que consume OpenCode) los
//    cuatro tienen `tool_call: true`, así que tool-calling no los separa. Lo
//    que los separa es `reasoning`:
//      - `deepseek-chat`     reasoning:NO  ← el único que sirve acá
//      - `deepseek-reasoner` reasoning:sí
//      - `deepseek-v4-flash` reasoning:sí
//      - `deepseek-v4-pro`   reasoning:sí  (y 3x el precio: $0.435/$0.87)
//    Un modelo de razonamiento en este turno es exactamente el bug que este
//    proyecto ya midió dos veces y documentó en agent.ts: "gasta TODO el
//    presupuesto de tokens en reasoning_content y devuelve content vacío"
//    (`deepseek-v4-flash-free`), y `nemotron-3-ultra-free` "se cortaba con
//    finish_reason length incluso para responder OK". Acá el presupuesto es de
//    135s compartidos con la investigación y varias herramientas encadenadas:
//    pensar en voz alta antes de llamar la primera herramienta es justo lo que
//    no entra. Por eso `deepseek-chat` y no los otros tres.
const CANDIDATOS_PAGOS: { providerID: string; modelID: string }[] = [
  // PRIMERO los que están MEDIDOS respondiendo, no los que deberían responder.
  //
  // El 2026-08-25 se probó la cadena entera contra el OpenCode real, modelo por
  // modelo. De todo lo que había configurado, esto es lo único que contesta:
  //
  //   openrouter/openai/gpt-4o-mini      1.8s  "OK"
  //   openrouter/openai/gpt-4.1-nano     1.7s  "OK"
  //   opencode/big-pickle (respaldo)     6.5s  "OK"
  //
  // Y esto NO contesta, aunque figure en los catálogos:
  //
  //   groq/llama-3.1-8b-instant     404 la cuenta no tiene acceso
  //   groq/gpt-oss-120b y -20b      "context exceeds model limit"
  //   github-copilot (36 modelos)   500, OpenCode no tiene credencial propia
  //   opencode-go (2 modelos)       500
  //   deepseek y mistral            sin crédito
  //   openrouter/openai/gpt-4o      "requires more credits" (los caros no entran)
  //
  // Lo dijo el admin y la medición lo confirmó: "solo sé que funciona gpt-4o".
  // La cuenta de OpenRouter TIENE saldo -- alcanza para los mini, no para los
  // grandes. Poner el que responde primero es la diferencia entre contestar en
  // 2 segundos y cortar a los 135 sin crear nada.
  // ── REORDENADO el 2026-08-28 ───────────────────────────────────────────
  //
  // Groq pasa de quinto a PRIMERO. Dos cosas cambiaron desde la medición del
  // 2026-08-25 que lo había mandado al fondo:
  //
  // 1. Se cayó todo lo demás. Probado uno por uno con /api/ai/test:
  //      openrouter  429, cuota agotada y la cuenta sin crédito
  //      deepseek    402 sin saldo     mistral  402 sin saldo
  //    Siete de los ocho candidatos de esta lista estaban muertos, y el único
  //    vivo era el quinto. Por eso el turno tardaba ~60s: la cadena gastaba
  //    los cuatro primeros en descubrir que nadie contesta, y despues caia en
  //    los `:free` de OpenRouter -- que es de donde salia el
  //    "poolside/laguna-xs-2.1:free rate-limited" que reporto el admin.
  //
  // 2. El motivo por el que Groq estaba descartado tenía causa, y se arregló.
  //    El desmentido de abajo dice que responde "context exceeds model limit"
  //    incluso en una sesión NUEVA de cuatro palabras. Eso no era el prompt:
  //    OpenCode RESERVA `OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX` tokens de la
  //    ventana de contexto para la respuesta, y `opencode-clean` no tenía esa
  //    variable puesta, así que usaba el default gigante -- los 16.384/32.000
  //    que se veían en su terminal. Con eso reservado, en la ventana de Groq
  //    no entraba nada, ni cuatro palabras. Se fijó en 4000 el 2026-08-28.
  //
  // ⚠️ El admin había pedido Groq último ("no me gusta porque se agota
  // rápido"), y esa objeción sigue siendo cierta: se agota. Se sube igual
  // porque hoy es lo único que responde, y un proveedor que se agota a veces
  // es mejor que cuatro que no contestan nunca. Cuando vuelva a haber una
  // cuenta con saldo, va arriba de Groq y esto se revierte.
  //
  // 🔻 REORDENADO el 2026-08-30, con la cuenta de DeepSeek de pago activa y
  // verificada en vivo contra el contenedor opencode-clean:
  //
  //   deepseek/deepseek-v4-pro   OK   1.9s   (modelo real de esta build:
  //                                          /provider default.deepseek
  //                                          = "deepseek-v4-pro")
  //   groq/openai/gpt-oss-120b   OK   ~1s   (free, se agota)
  //   opencode/big-pickle        respaldo   (gratis)
  //
  // OJO con el id: NO usar `deepseek-chat`. En esta versión de opencode-ai
  // (1.18.x) ese id NO existe y el servidor devuelve 500
  // "Unexpected server error" en el primer candidato, quemando el inicio del
  // turno; el id real del proveedor deepseek es `deepseek-v4-pro`. Medido:
  // deepseek-chat → 500 (1.5s), deepseek-v4-pro → OK (1.9s).
  // (En el bot de WhatsApp los ids directos de la API de DeepSeek siguen
  // siendo deepseek-chat/deepseek-reasoner: esto es solo del camino Atlas →
  // servidor OpenCode.)
  // 🔻 MEDIDO el 2026-08-30 con el desglose por tramos de un pedido de anuncio
  // real. `deepseek-v4-pro` se comió 55 SEGUNDOS y fallo con "se quedo sin
  // tiempo"; la respuesta la termino dando `big-pickle`, que es GRATIS. O sea:
  // el proveedor que el admin paga consumia medio turno y no contestaba.
  //
  // `pro` es el modelo grande. Para un pedido con herramientas y catalogo no
  // llega. La misma cuenta tiene `deepseek-v4-flash`, que es el rapido -- y la
  // API directa de DeepSeek responde el mismo pedido en 414 ms.
  //
  // Va flash primero y pro de respaldo. Si el servidor no acepta el id de
  // flash, el costo es el mismo que midio OpenCode para `deepseek-chat`: un 500
  // en ~1,5 s y sigue al siguiente. Barato comparado con los 55 s de pro.
  { providerID: "deepseek", modelID: "deepseek-v4-flash" },
  { providerID: "deepseek", modelID: "deepseek-v4-pro" },
  // 🔻 REMEDIDO el 2026-09-03 contra ESTE contenedor, candidato por candidato,
  // leyendo el texto devuelto (no solo el HTTP 200, que llega igual cuando el
  // cuerpo trae `info.error`):
  //
  //   deepseek/deepseek-v4-flash      1,68s  texto "ok"        ✅
  //   deepseek/deepseek-v4-pro        2,47s  texto "ok"        ✅
  //   mistral/mistral-small-latest    1,53s  texto "ok"        ✅  ← nuevo
  //   github-copilot/claude-haiku-4.5 1,63s  Unauthorized      (sin token)
  //   opencode-go/deepseek-v4-flash   1,32s  solo en China
  //   groq/openai/gpt-oss-120b        SE CUELGA: HTTP 000 a los 45s ❌
  //
  // groq SALE de la cadena. Es el fallo más caro que existe acá: no devuelve
  // error, se queda con la conexión hasta que la corta TECHO_POR_CANDIDATO_MS
  // (30s), y eso se paga en CADA tramo del turno, no una vez. Ya estaba
  // documentado el 2026-08-25 ("context exceeds model limit" incluso en sesión
  // nueva); la medición de hoy lo confirma y agrega que ahora ni siquiera
  // responde. Contra su API directa sí anda (0,56s), así que sigue estando
  // bien en la cadena del bot de WhatsApp -- lo que no sirve es por acá.
  //
  // mistral ENTRA: el 2026-08-24 daba 402 sin saldo y por eso se había sacado;
  // hoy responde en 1,53s con texto real. Va detrás de los dos de DeepSeek
  // porque es lo único vivo que queda si la cuenta paga se cae.
  { providerID: "mistral", modelID: "mistral-small-latest" },
  // ── Los que se sacaron, y por qué importa tanto ──────────────────────────
  //
  // El admin pegó el desglose de un turno real el 2026-08-29, pidiendo un
  // anuncio del producto 124:
  //
  //   gpt-oss-120b   falló: se quedó sin tiempo        55,0s
  //   gpt-4o-mini    descartado: sin crédito           37,6s   <-
  //   gpt-4.1-nano   descartado: sin crédito            0,8s   <-
  //   deepseek-chat  falló: error del proveedor         0,1s   <-
  //   3 gratis de OpenRouter                           38,6s   <-
  //   total                                           135,0s
  //
  // CINCO de los ocho candidatos estaban muertos, y medidos como muertos el
  // día anterior con /api/ai/test: openrouter 429 sin crédito, deepseek 402
  // sin saldo, mistral 402 sin saldo. Se comieron ~60 segundos de un turno de
  // 135 -- casi la mitad -- para no contestar nada.
  //
  // La memoria de fallos los aparta sola... pero vive en el PROCESO. Cada
  // deploy la resetea, y el primer turno después vuelve a pagar el
  // descubrimiento completo. Con varios deploys por día, ese "primer turno"
  // es el que le toca a un cliente real.
  //
  // Así que no alcanza con que la rotación aprenda: la lista no debe traer de
  // fábrica proveedores que ya sabemos muertos. Es lo mismo que se hizo con
  // PROVEEDORES_RAPIDOS (cadena-modelos.ts) el mismo día -- y dejar esta lista
  // sin tocar fue exactamente el patrón que este proyecto repite: arreglado en
  // una lista, vivo en la otra.
  //
  //   { providerID: "openrouter", modelID: "openai/gpt-4o-mini" },
  //   { providerID: "openrouter", modelID: "openai/gpt-4.1-nano" },
  //   { providerID: "deepseek",   modelID: "deepseek-chat" },
  //   { providerID: "mistral",    modelID: "mistral-large-latest" },
  //
  // ⚠️ Vuelven en cuanto la cuenta tenga saldo, y valen la pena: gpt-4o-mini
  // respondía en 1,8s cuando OpenRouter tenía crédito, y deepseek-chat en
  // ~800ms. El día que se cargue saldo, se descomentan y van ARRIBA de Groq.
  // Ver PENDIENTE_ADMIN.md §5.
  // Groq, MEDIDO en vivo el 2026-08-24 contra la instalación real, no elegido
  // por preferencia. El admin objetó "tenemos github, zen, nvidia, imposible
  // que ninguno sirva" y tenía razón: probando uno por uno con /api/ai/test,
  // TODO lo demás estaba caído y Groq era lo único que contestaba.
  //
  //   opencode/claude-haiku-4-5      401 sin método de pago     0.6s
  //   opencode/big-pickle (respaldo) 429 cuota agotada          1.2s
  //   opencode_go/deepseek-v4-flash  403 solo alojado en China  0.4s
  //   deepseek/deepseek-chat         402 sin saldo              0.9s
  //   groq/openai/gpt-oss-120b       OK                         0.8s
  //   groq/openai/gpt-oss-20b        OK                         0.3s
  //
  // Va acá, después de los dos de pago (que fallan en ~1s cada uno cuando no
  // hay saldo, costo despreciable) y ANTES de los gratis de OpenRouter, que
  // son los que se comen 55s cada uno.
  //
  // ⚠️ La medición fue contra el proveedor a través de ESTA app. Atlas habla
  // con el contenedor de OpenCode, que resuelve los modelos por su cuenta: si
  // allá el id no existiera, este candidato falla rápido y la rotación sigue
  // -- mucho más barato que los 55s de un gratis que sí existe pero no llega.
  //
  // 🔻 DESMENTIDO el 2026-08-25, midiendo contra OpenCode (que es por donde
  // pasa Atlas de verdad, no por esta app): `openai/gpt-oss-120b` responde
  // "Session too large to compact - context exceeds model limit" incluso en una
  // sesión NUEVA con un mensaje de cuatro palabras. O sea que el contexto base
  // que inyecta OpenCode no le entra a este modelo, y por acá nunca sirvió.
  // Ningún modelo de Groq de esta cuenta contesta: los llama dan 404 "does not
  // exist or you do not have access", los gpt-oss y qwen se pasan de contexto,
  // y compound-mini no soporta herramientas.
  //
  // (Ese desmentido quedó explicado y resuelto: ver la nota de REORDENADO
  //  arriba. Groq subió al primer lugar el 2026-08-28.)
  // Los tres gratis de OpenRouter salen por lo mismo que los de pago: la
  // cuenta NO TIENE CRÉDITO, y sin crédito tampoco sirven los `:free`. En el
  // desglose del 2026-08-29 se llevaron 38,6s de los 135 entre los tres, y
  // laguna es el que el admin vio reportado dos veces ("temporarily
  // rate-limited upstream") -- lo veía porque el turno LLEGABA hasta ahí.
  //
  //   { providerID: "openrouter", modelID: "nvidia/nemotron-3-nano-30b-a3b:free" },
  //   { providerID: "openrouter", modelID: "poolside/laguna-xs-2.1:free" },
  //   { providerID: "openrouter", modelID: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  //
  // Vuelven cuando OpenRouter tenga crédito. Queda `big-pickle` como respaldo
  // final (MODELO_RESPALDO), que es de otra cuenta y sí responde -- lento, pero
  // responde.
];

async function proveedoresConectados(host: string, authHeader: string): Promise<Set<string>> {
  try {
    const res = await fetch(`${host}/provider`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return new Set();
    const data = (await res.json()) as any;
    // El catálogo de modelos venía en la MISMA respuesta y se tiraba. Por eso
    // GitHub, Groq y compañía nunca entraban a la cadena aunque su clave
    // estuviera cargada: no había de dónde sacar un modelo suyo sin inventarle
    // el id. Se guarda acá y lo usa `pickOpencodeModelChain`.
    catalogoPorProveedor.clear();
    const provs = data?.providers ?? data?.all ?? [];
    if (Array.isArray(provs)) {
      for (const p of provs) {
        const id = String(p?.id ?? p?.providerID ?? "");
        if (id && p?.models) catalogoPorProveedor.set(id, p.models);
      }
    } else if (provs && typeof provs === "object") {
      for (const [id, p] of Object.entries(provs as Record<string, any>)) {
        if (p?.models) catalogoPorProveedor.set(id, p.models);
      }
    }
    return new Set<string>(data?.connected || []);
  } catch {
    return new Set();
  }
}

/**
 * Catálogo de modelos por proveedor, como lo devolvió OpenCode en la última
 * consulta a `/provider`. Vive fuera de la función porque se llena ahí y se
 * lee al armar la cadena, en el mismo turno.
 *
 * Si OpenCode cambia el shape de esa respuesta, esto queda vacío y la cadena
 * vuelve sola al comportamiento anterior (solo los curados + respaldo): se
 * pierde el descubrimiento, no el servicio.
 */
const catalogoPorProveedor = new Map<string, unknown>();

/**
 * Anota que un candidato fallo, con el enfriamiento que corresponda.
 *
 * Reutiliza `clasificarFallo` de optimized-rotation.ts, que ya distingue "sin
 * credito" (6h) de "cuota agotada" (1h) de "modelo caido" (30s) -- y que hasta
 * ahora solo usaba el bot de ventas: el operador de Atlas no lo llamaba nunca.
 */
async function anotarFalloDeCandidato(
  model: { providerID: string; modelID: string },
  error?: string,
): Promise<void> {
  try {
    const { anotarFallo } = await import("../lib/cadena-modelos");
    const { clasificarFallo } = await import("../lib/optimized-rotation");
    anotarFallo(model, String(error || ""), clasificarFallo);
  } catch {
    // Recordar el fallo es una mejora, no parte del camino de la respuesta.
  }
}

// Lista de candidatos a intentar EN ORDEN para este turno: los pagos que
// estén realmente conectados ahora mismo (en el orden de preferencia de
// CANDIDATOS_PAGOS), y siempre el respaldo gratis al final.
// El motivo de descarte va al desglose que ve el ADMIN, así que tiene que
// entrar en una línea y no arrastrar el stack ni el JSON crudo del proveedor.
// Los casos frecuentes se nombran en castellano llano -- "sin crédito" le dice
// al admin qué hacer, "429 {\"error\":{\"type\":...}}" no.
function resumirMotivo(error: string): string {
  const e = String(error || "").trim();
  if (/timeout|abort|timed? ?out/i.test(e)) return "se quedó sin tiempo";
  if (/429|rate.?limit|quota|cuota/i.test(e)) return "sin cupo (rate limit)";
  if (/401|403|unauthor|forbidden|api.?key|authentication/i.test(e)) return "clave rechazada";
  if (/credit|balance|payment|insufficient/i.test(e)) return "sin crédito";
  if (/context|too large|overflow|length/i.test(e)) return "pedido demasiado grande";
  if (/tool-call no ejecutado/i.test(e)) return "no ejecutó la herramienta";
  if (/5\d\d/.test(e)) return "error del proveedor";
  return e.replace(/\s+/g, " ").slice(0, 60);
}

// ¿Tiene ESTA app la clave de ese proveedor cargada ahora mismo? Guardar una
// clave en Configuración → "Modelos de pago" la vuelca a `process.env` en el
// acto (`cargarClavesEnEntorno()` en ai-catalog.ts) y además la sincroniza a
// OpenCode con `PUT /auth/{id}`. O sea: si esto es true, la clave existe y ya
// viajó al contenedor.
function hayClavePropia(providerID: string): boolean {
  // Copilot no está en ENV_POR_PROVEEDOR y no puede estarlo: su credencial no
  // es una API key de "Modelos de pago" sino el token de la CONEXIÓN (flujo de
  // dispositivo), que `cargarClavesEnEntorno` deja en COPILOT_TOKENS.
  //
  // Sin esto `tenemosClave("github-copilot")` era SIEMPRE false, así que
  // Copilot solo podía entrar a la cadena si OpenCode lo reportaba conectado
  // -- y el admin, que acaba de vincular su cuenta, seguía sin verlo aparecer
  // en ningún turno.
  if (/copilot/i.test(providerID)) {
    return !!(process.env.COPILOT_TOKENS || process.env.GITHUB_COPILOT_TOKEN);
  }
  const envKey = ENV_POR_PROVEEDOR[providerID];
  return !!(envKey && process.env[envKey]);
}

async function pickOpencodeModelChain(host: string, authHeader: string): Promise<{ providerID: string; modelID: string }[]> {
  const conectados = await proveedoresConectados(host, authHeader);
  // `connected` NO alcanza como único criterio, y esto costó un turno entero
  // de anuncio perdido (2026-08-19). Está documentado arriba que ese campo solo
  // se enciende si la env var estándar del proveedor estaba seteada en el
  // PROCESO de OpenCode al arrancar: una clave sincronizada en caliente con
  // `PUT /auth/{id}` queda guardada y usable, pero `connected` sigue en false
  // hasta el próximo reinicio del contenedor. Filtrando solo por `connected`,
  // un proveedor de pago recién configurado por el admin quedaba invisible
  // -- y Atlas seguía rotando entre gratis lentos con la clave paga ya puesta.
  //
  // También lo cubre al revés: si el contenedor de OpenCode se reinicia y
  // pierde sus env vars, `connected` se vacía y la cadena entera se caía al
  // respaldo gratis sin que nadie se enterara.
  //
  // Se intenta, entonces, todo candidato que esté conectado O cuya clave
  // tengamos nosotros. Si la llamada real falla igual, la rotación la absorbe:
  // ese es justamente su trabajo, y un intento fallido cuesta mucho menos que
  // no intentar el único modelo de pago disponible.
  //
  // Y además de los curados se DESCUBREN los proveedores rápidos que el admin
  // tenga configurados y que no estén en la lista (GitHub, Groq, Cerebras...).
  // Reportado el 2026-08-24: el turno se cortó a los 135s y el admin objetó
  // "tenemos github, tenemos opencode zen, tenemos nvidia, imposible que
  // ninguno sirva". Tenía razón: la lista era fija y GitHub no estaba, así que
  // con la clave cargada Atlas igual no lo intentaba nunca.
  //
  // El modelo sale del catálogo que OpenCode ya devuelve, no de un id
  // hardcodeado: un id inventado es un candidato más que quemar.
  const { armarCadena, filtrarEnfriados, diagnosticarRapidos } = await import("../lib/cadena-modelos");

  // Los rápidos que el admin configuró y que igual quedaron afuera se DICEN.
  // Antes desaparecían sin dejar rastro y no había forma de distinguir "no lo
  // tengo configurado" de "lo configuré y el sistema no lo ve".
  const rapidosFuera = diagnosticarRapidos({ conectados, tenemosClave: hayClavePropia, modelosPorProveedor: catalogoPorProveedor });
  if (rapidosFuera.length > 0) {
    logger.warn({ rapidosFuera }, "[AtlasOpenCode] Proveedores rápidos configurados que NO entraron a la cadena");
  }

  // Se saca lo que ya se sabe que no anda: sin esto Atlas reintentaba deepseek
  // sin saldo en CADA mensaje, para siempre. Si TODOS estan enfriandose se
  // intentan igual -- es una optimizacion, no un candado.
  return filtrarEnfriados(armarCadena({
    curados: CANDIDATOS_PAGOS,
    conectados,
    tenemosClave: hayClavePropia,
    modelosPorProveedor: catalogoPorProveedor,
    respaldo: MODELO_RESPALDO,
  }));
}

/**
 * Quita del plan las acciones repetidas.
 *
 * Dos acciones son la misma si llaman a la misma herramienta con los mismos
 * argumentos, comparados sin acentos ni mayúsculas. Se conserva la primera,
 * que es la que el modelo propuso con más contexto.
 */
export function sinAccionesRepetidas<T extends { tool: string; args?: any }>(acciones: T[]): T[] {
  const plano = (v: any): string =>
    String(v ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
  const clave = (a: T) => {
    const args = a.args && typeof a.args === "object" ? a.args : {};
    const partes = Object.keys(args)
      .sort()
      .map((k) => `${k}=${plano(typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])}`);
    return `${a.tool}|${partes.join("&")}`;
  };
  const vistas = new Set<string>();
  const salida: T[] = [];
  for (const a of acciones || []) {
    const k = clave(a);
    if (vistas.has(k)) continue;
    vistas.add(k);
    salida.push(a);
  }
  return salida;
}

async function registerMcpBridge(host: string, authHeader: string, mcpUrl: string): Promise<void> {
  const res = await fetch(`${host}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({ name: "atlas", config: { type: "remote", url: mcpUrl, enabled: true } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`No se pudo registrar el puente MCP en OpenCode (${res.status})`);
}

async function createOpencodeSession(host: string, authHeader: string): Promise<string> {
  const res = await fetch(`${host}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: "{}",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`No se pudo crear la sesión de OpenCode (${res.status})`);
  const data = (await res.json()) as any;
  if (!data?.id) throw new Error("OpenCode no devolvió un id de sesión");
  return data.id;
}

interface OpencodePart { type: string; text?: string; [k: string]: any }

async function sendOpencodeMessage(
  host: string,
  authHeader: string,
  sessionId: string,
  opts: {
    system: string;
    model: { providerID: string; modelID: string };
    tools: Record<string, boolean>;
    text: string;
    timeoutMs: number;
    /**
     * El admin apretó "Detener". Va junto al timeout, no en su lugar: sin
     * esto, parar en mitad de una llamada no hacía nada visible hasta que
     * venciera el reloj del candidato -- hasta 30s mirando un botón que ya
     * apretaste. `AbortSignal.any` corta con la primera de las dos.
     */
    cancelSignal?: AbortSignal;
  },
): Promise<{ text: string; error?: string }> {
  const porTiempo = AbortSignal.timeout(opts.timeoutMs);
  const res = await fetch(`${host}/session/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({
      agent: "general",
      model: opts.model,
      system: opts.system,
      tools: opts.tools,
      parts: [{ type: "text", text: opts.text }],
    }),
    signal: opts.cancelSignal ? AbortSignal.any([porTiempo, opts.cancelSignal]) : porTiempo,
  });
  if (!res.ok) throw new Error(`OpenCode respondió ${res.status}`);
  const data = (await res.json()) as any;
  if (data?.info?.error) {
    return { text: "", error: data.info.error.data?.message || data.info.error.name || "Error desconocido de OpenCode" };
  }
  const parts: OpencodePart[] = Array.isArray(data?.parts) ? data.parts : [];
  const text = parts.filter((p) => p.type === "text" && p.text).map((p) => p.text!.trim()).join("\n\n").trim();
  return { text };
}

// Atlas es de CADA negocio, no solo del dueño de la plataforma: sus
// herramientas ya trabajan por `ctx.tenantId`. El `requireAdmin()` que entró
// con 79225c2 ("blindar autonomía") dejaba a todo cliente del SaaS con un 403
// que la pantalla mostraba como "se cayó la conexión" (12-09-2026). El
// diagnóstico técnico (atlas-diagnostico) sí sigue siendo solo del admin.
router.post("/operator-opencode", async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });

    // ── Se puede mandar TEXTO o AUDIO ─────────────────────────────────────
    //
    // Propuesta del admin: "que el sistema reciba el audio automáticamente en
    // el servidor, lo transcriba internamente y luego responda, así no
    // hacemos doble proceso".
    //
    // Tiene razón. La versión anterior transcribía en una llamada, dejaba el
    // texto en la caja y esperaba que el admin apretara Enviar: dos viajes y
    // dos toques para una sola intención. Y el motivo por el que se había
    // hecho así --que Whisper se equivoca con cifras y nombres de producto--
    // resultó más débil de lo que parecía: Atlas **no ejecuta**, propone y
    // espera el "sí". Una transcripción mal entendida produce una propuesta
    // equivocada, que está a la vista y sin confirmar.
    //
    // Lo que sí hace falta es que se VEA lo que se entendió, y por eso el
    // texto sale por SSE (evento `transcripcion`) apenas está, antes de que el
    // turno arranque: si escuchó mal, se ve en el acto y está el botón de
    // Detener. Transcribir a ciegas y contestar sería el mal negocio; esto no.
    const { prompt: promptCrudo, audio, mimeAudio, history: historialCrudo = [] } = req.body;
    if (!promptCrudo && !audio) return res.status(400).json({ error: "prompt o audio requerido" });
    const sessionId: string = (req.body?.sessionId as string) || "default";
    const ctx: OperatorContext = { tenantId, sessionId };

    const streaming = req.body?.stream === true;
    if (streaming) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
    }
    // ── Que el admin se vaya NO cancela su pedido ──────────────────────────
    //
    // Lo describió así: "que la app siga en segundo plano si me salgo, porque a
    // veces para y cuando vuelvo a entrar me toca darle de nuevo".
    //
    // Pasaba esto: al cerrar la pestaña el socket muere, y el siguiente aviso
    // de progreso --hay uno cada 15 s-- escribía sobre una conexión destruida.
    // `writableEnded` no cubre ese caso (la respuesta no terminó, el socket se
    // rompió), así que la excepción se llevaba puesto el turno ENTERO: el
    // trabajo ya hecho se perdía y al volver había que pedirlo de nuevo.
    //
    // Ahora escribir es "si se puede": si el cliente ya no está se deja de
    // escribir y el turno SIGUE hasta el final. La respuesta se guarda igual
    // con `saveArchitectTurn`, así que al volver a entrar está en el historial.
    let clienteSeFue = false;
    req.on("close", () => {
      if (!res.writableEnded) {
        clienteSeFue = true;
        logger.info(
          { tenantId: req.tenant?.id },
          "[AtlasOpenCode] El admin cerró la pestaña -- el turno sigue y se guarda igual",
        );
      }
    });
    // ── Y el botón de "Detener", que es OTRA cosa que cerrar la pestaña ─────
    //
    // Cerrar la pestaña deja el turno corriendo a propósito (arriba). Apretar
    // "Detener" dice lo contrario, y hasta hoy no existía: el spinner no tenía
    // botón y recargar la página solo dejaba de mirar mientras el servidor
    // seguía gastando los 135s del turno.
    const claveTurno = claveDeTurno(tenantId, sessionId);
    const senalDeCorte = empezarTurno(claveTurno);

    const sse = (event: string, data: any) => {
      if (!streaming || clienteSeFue || res.writableEnded || res.destroyed) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // El socket se rompió entre el chequeo y la escritura. No es un error
        // del pedido: es que el admin cerró. Se deja de escribir y se sigue.
        clienteSeFue = true;
      }
    };
    const progreso = (texto: string) => sse("progress", { texto });
    const finish = (payload: any, status = 200) => {
      if (streaming) {
        sse(status === 200 ? "result" : "error", payload);
        res.end();
        return;
      }
      return res.status(status).json(payload);
    };

    const cfg = opencodeConfig();
    // Al admin NUNCA se le nombra la infraestructura interna (OpenCode,
    // proveedores, contenedores): para él esto es Atlas y punto. El detalle
    // técnico va al log, que es donde sirve para diagnosticar.
    if (!cfg) {
      logger.error("[AtlasOpenCode] Faltan ATLAS_OPENCODE_HOST/USER/PASS -- el motor no puede arrancar");
      return finish({ error: "Atlas no está disponible en este momento. Avisale al soporte técnico si sigue así." }, 500);
    }

    // ── Si vino audio, se transcribe ACÁ y el turno sigue igual ───────────
    //
    // Va después de abrir el stream para poder avisar por SSE, y antes de
    // guardar el turno del admin: lo que se guarda en la conversación es lo
    // que se entendió, no "[audio]". Así la memoria de Atlas queda legible y
    // el historial sirve para releerlo después.
    let prompt = promptCrudo;
    if (!prompt && audio) {
      progreso("Escuchando lo que dijiste...");
      const coma = String(audio).indexOf(",");
      const cabecera = coma >= 0 ? String(audio).slice(0, coma) : "";
      const base64 = coma >= 0 ? String(audio).slice(coma + 1) : String(audio);
      const tipo = /^data:([^;,]+)/.exec(cabecera)?.[1] || String(mimeAudio || "audio/webm");
      const buffer = Buffer.from(base64, "base64");

      // Menos de 1KB es el botón apretado sin querer. Gastar una llamada a
      // Whisper para que devuelva vacío es tiempo del admin, no del sistema.
      if (buffer.length < 1024) {
        return finish({ error: "No alcancé a escuchar nada. Probá de nuevo hablando un poco más." }, 400);
      }

      const { transcribirAudio } = await import("../lib/media-entrante");
      const texto = await transcribirAudio(buffer, tipo);
      if (!texto) {
        // `transcribirAudio` devuelve null a propósito cuando NO hay
        // información, en vez de inventar. Se respeta: nada de seguir con una
        // cadena vacía, que haría que Atlas conteste cualquier cosa a un
        // pedido que nunca se entendió.
        return finish({ error: "No pude entender el audio. ¿Lo repetís?" }, 422);
      }
      prompt = texto;
      // Que se VEA lo que se entendió, ya mismo y antes de trabajar. Si
      // escuchó mal, el admin lo ve en el acto y tiene el botón de Detener.
      sse("transcripcion", { texto });
      logger.info({ tenantId, largo: texto.length }, "[AtlasOpenCode] Pedido por voz transcrito");
    }

    const persisted = await loadArchitectHistory(tenantId, sessionId);
    const convo = persisted.length > 0 ? persisted : (Array.isArray(historialCrudo) ? historialCrudo : []);
    await saveArchitectTurn(tenantId, sessionId, "user", String(prompt));

    // ── ¿Hay un plan pendiente esperando confirmación? Mismo mecanismo que
    // /operator, sin cambios -- confirmar/rechazar nunca pasa por OpenCode. ──
    const pending = await getPendingPlan(tenantId, sessionId);
    // El plan que este turno descartó, por si el turno termina sin nada que
    // entregar y hay que devolvérselo al admin (ver el cierre vacío, abajo).
    // Un rechazo explícito NO se devuelve: ahí el admin dijo que no lo quiere.
    let planDescartado: any[] | null = null;
    if (pending && pending.actions.length > 0) {
      // ── Y si la lista no lo reconocio, que lo lea el modelo ──────────────
      //
      // `isApproval` es una lista de palabras que crecio una por vez, cada vez
      // que el admin uso una que no estaba. Hoy reconoce 21 de 24 formas
      // medidas. Pero hay respuestas que ninguna lista puede cubrir, porque el
      // sentido no esta en las palabras sino en la pregunta que contestan:
      //
      //   Atlas: "PUBLICAR en el muro de la pagina. Confirmas?"
      //   admin: "En el muro"
      //   Atlas: "No me quedo claro si queres que lo haga."
      //
      // "En el muro" solo significa que si EN RELACION con lo que se pregunto.
      //
      // Se consulta unicamente cuando la lista ya dijo que no y tampoco es un
      // rechazo, asi que lo barato se sigue resolviendo gratis. Y el modulo
      // esta escrito para equivocarse hacia el NO: ante duda, error o demora
      // devuelve false y Atlas vuelve a preguntar, que es lo que hace hoy.
      // Acá un falso positivo publica en la pagina o crea una campaña que
      // gasta: preguntar de nuevo cuesta un mensaje.
      const aprobadoPorElModelo =
        !isRejection(String(prompt)) &&
        (await esUnSiParaEstePlan(String(prompt), pending.actions.map((a: any) => describePlannedAction(a)).join(" · ")));
      if (aprobadoPorElModelo) {
        logger.info({ tenantId, prompt: String(prompt).slice(0, 60) }, "[Atlas] la lista no lo reconocio pero el modelo lo leyo como un si");
      }
      // ── Pedir VER el resultado, cuando verlo no cuesta nada, es un si ───
      //
      // El admin lo pidio cuatro veces el 2026-09-04 --"Demuestrale el copi",
      // "Dame el copi para saber que vas a publicar"-- y las cuatro recibio
      // "¿Confirmas para que lo genere?". Pero `crear_anuncio` DEVUELVE el copy
      // en su resultado, y esa accion guarda un borrador LOCAL en pausa: no
      // sube a Meta, no gasta, no le llega a nadie.
      //
      // El texto que pedia estaba siempre a un "si" de distancia. Ver el
      // resultado de algo sin consecuencia ES querer que se haga.
      //
      // Se acota con cuidado: si CUALQUIERA de las acciones toca el mundo real
      // --subir a Meta, activar, cambiar un precio-- se sigue preguntando, que
      // es lo que protege la plata del admin. Ver lib/pedir-ver-el-resultado.ts
      const verEsAutorizar = verloEsAutorizarlo(String(prompt), pending.actions as any);
      if (verEsAutorizar) {
        logger.info({ tenantId, prompt: String(prompt).slice(0, 60) }, "[Atlas] pidio ver el resultado de una accion sin consecuencia: se ejecuta y se le muestra");
      }
      if (isApproval(String(prompt)) || aprobadoPorElModelo || verEsAutorizar) {
        const executed: any[] = [];
        const lines: string[] = [];
        // ── Encadenado: el paso 2 usa el id que produjo el paso 1 ──────────
        // "Creá el anuncio y subilo a Meta" no entra en un turno del modelo
        // (medido: se pasa de los 135s y corta sin hacer nada). La salida es
        // que proponga los dos pasos juntos -- proponer es rápido -- y que la
        // ejecución, que pasa acá afuera del turno, encadene los ids.
        //
        // Cuando se propuso el plan, el borrador todavía no existía, así que
        // el draftId viaja como "auto" y se resuelve recién ahora.
        let ultimoDraftId: number | null = null;
        for (const a of pending.actions) {
          // Resolver el "auto" con el borrador que acaba de crearse.
          const argsReales: any = { ...(a.args || {}) };
          if (argsReales.draftId === "auto") {
            if (!ultimoDraftId) {
              executed.push({ tool: a.tool, args: a.args, ok: false, summary: "No se pudo subir a Meta: el paso anterior no dejó ningún borrador que subir.", verification: "" });
              lines.push("❌ No se pudo subir a Meta: el paso anterior no dejó ningún borrador que subir.");
              continue;
            }
            argsReales.draftId = ultimoDraftId;
          }
          const r = await executeAction(a.tool, argsReales, ctx);
          if (a.tool === "fb_ad_draft" && r.ok) {
            const nuevo = Number((r as any)?.data?.id);
            if (Number.isInteger(nuevo) && nuevo > 0) ultimoDraftId = nuevo;
          }
          const verification = r.ok ? await verifyMutation(a.tool, argsReales, ctx) : "";
          executed.push({ tool: a.tool, args: argsReales, ok: r.ok, summary: r.summary, verification });
          // En el fallo, el summary está escrito para el modelo -- se limpia
          // antes de mostrárselo al admin (ver mensajeParaAdmin).
          const paraElAdmin = r.ok ? r.summary : mensajeParaAdmin(r.summary);
          const linea = `${r.ok ? "✅" : "❌"} ${paraElAdmin}${verification ? `\n   ${verification}` : ""}`;
          lines.push(linea);

          // ── Cada accion se entrega APENAS TERMINA ─────────────────────────
          //
          // Pedido del admin: "Atlas no tiene que entregar todo al mismo
          // tiempo, puede ir entregando parte por parte para que no se
          // cuelgue".
          //
          // Este bucle ejecutaba las acciones una por una y guardaba los
          // resultados en `lines` para mandarlos TODOS al final. Con tres
          // acciones --crear el anuncio, subirlo, activarlo-- el admin no veia
          // nada hasta que terminaba la ultima, aunque la primera hubiera
          // terminado en cinco segundos. Y si el turno moria en la tercera, se
          // perdian las dos que ya estaban hechas.
          //
          // El resultado de cada accion EXISTE apenas termina: no hay ninguna
          // razon para retenerlo. Sale por el mismo canal que ya usan las
          // partes de un pedido grande, asi que la pantalla ya sabe mostrarlo.
          //
          // Solo cuando hay mas de una: con una sola, mandarla dos veces
          // --como avance y despues en el cierre-- seria repetirsela.
          if (pending.actions.length > 1) {
            sse("avance", { reply: paraMarkdown(toEmojiStyle(linea)) });
            await saveArchitectTurn(tenantId, sessionId, "assistant", paraMarkdown(toEmojiStyle(linea)));
          }
        }
        await clearPendingPlan(tenantId, sessionId);
        const allOk = executed.every((item) => item.ok);
        // Lo que ya se entrego accion por accion no se repite en el cierre: el
        // admin acaba de leerlo. Con una sola accion nada se entrego antes, asi
        // que el cierre la lleva completa, como siempre.
        const cuerpo = pending.actions.length > 1
          ? "" // ya salieron una por una
          : `\n\n${lines.join("\n\n")}`;
        const encabezado = allOk
          ? "✅ Plan ejecutado y verificado"
          : "⚠️ El plan terminó con errores; no voy a decir que quedó listo";
        const reply = paraMarkdown(toEmojiStyle(`${encabezado}${cuerpo || "."}`));
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, executed: executed.length }, "[AtlasOpenCode] Plan aprobado y ejecutado");
        return finish({ reply, executed, actionsCount: executed.length, status: allOk ? "executed" : "partial_failure" });
      }
      // ── Respuesta ambigua: PREGUNTAR, no descartar ──────────────────────
      // Antes, cualquier cosa que no fuera una aprobación exacta borraba el
      // plan en silencio y se volvía a planificar desde cero. Con la
      // conversación real en la mano (2026-08-12) se vio el resultado: el
      // admin respondía algo corto, el plan desaparecía, Atlas proponía otra
      // vez LO MISMO, y así en loop -- confirmó tres veces sin que se
      // ejecutara nada, sin ninguna pista de por qué.
      //
      // Ahora: si la respuesta es corta y no arranca un pedido nuevo, se
      // asume que INTENTÓ confirmar (un "oka", "sale", "hazlo pues", un dedo
      // que erró la tecla) y se le pregunta, MANTENIENDO el plan vivo. Si es
      // un rechazo claro o un pedido nuevo de verdad, ahí sí se descarta.
      const respuesta = String(prompt).trim();
      // La regla vive en lib/es-pedido-nuevo.ts, con los mensajes reales del
      // admin como prueba. Estaba en esta linea y exigia limite de palabra, asi
      // que "DEmuestrale el copi" no contaba como pedido: se leia como un "si"
      // mal escrito y Atlas volvia a preguntar. El admin lo resumio asi: "Atlas
      // solo entiende si".
      const esPedidoNuevo = arrancaPedidoNuevo(respuesta);

      // ── Y si la lista no lo resolvio, que lo LEA el modelo ──────────────
      //
      // Pedido del admin: "que entienda las preguntas, los terminos; que no
      // sea tan robotico, que razone".
      //
      // Hasta aca todo se decide con listas de palabras, y cuando fallan la
      // unica consulta al modelo pregunta SI o NO. Con dos opciones, un
      // mensaje que no es ninguna termina en "no me quedo claro" -- el bucle
      // que el admin sufrio cuatro veces.
      //
      // Las situaciones son cuatro, no dos: puede estar diciendo que si, que
      // no, pidiendo otra cosa, o preguntando algo sobre el plan. Las dos
      // ultimas no son ambiguedad, son conversacion, y merecen respuesta.
      //
      // Se consulta SOLO si las listas no resolvieron: lo obvio se sigue
      // decidiendo gratis. Y ante error o duda devuelve "duda", que produce
      // exactamente el comportamiento de antes.
      let intencion: string = esPedidoNuevo ? "pedido" : "";
      if (!intencion && !isApproval(respuesta) && !isRejection(respuesta) && !aprobadoPorElModelo && !verEsAutorizar) {
        const { queQuiereElAdmin } = await import("../lib/es-un-si");
        intencion = await queQuiereElAdmin(respuesta, pending.actions.map((a: any) => describePlannedAction(a)).join(" · "));
        logger.info({ tenantId, respuesta: respuesta.slice(0, 50), intencion }, "[Atlas] la lista no lo resolvio: lo leyo el modelo");
      }
      const loLeyoComoPedido = intencion === "pedido" || intencion === "pregunta";

      const pareceIntentoDeConfirmar =
        !loLeyoComoPedido && respuesta.length <= 30 && !esPedidoNuevo && !isRejection(respuesta);

      if (pareceIntentoDeConfirmar) {
        const planTexto = pending.actions.map((a, i) => `${i + 1}. ${describePlannedAction(a)}`).join("\n");
        const reply = paraMarkdown(toEmojiStyle(
          `🤔 No me quedó claro si querés que lo haga. Sigue pendiente esto:\n\n${planTexto}\n\n` +
          `Respondé *sí* para que lo ejecute, o decime qué cambio.`,
        ));
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, respuesta: respuesta.slice(0, 40) }, "[AtlasOpenCode] Respuesta ambigua con plan pendiente -- se pregunta en vez de descartar");
        return finish({ reply, plan: pending.actions, status: "awaiting_confirmation" });
      }

      // Rechazo explícito o pedido nuevo de verdad: recién ahí se descarta el
      // plan viejo y se planifica con el mensaje nuevo.
      //
      // Se guarda una copia antes de borrarlo. Descartarlo tiene sentido
      // mientras el turno nuevo vaya a reemplazarlo; si el turno nuevo no
      // entrega NADA, el admin se queda sin respuesta y sin el plan que
      // llevaba minutos esperando su confirmación --perdiendo las dos cosas de
      // una--, y ahí el cierre lo devuelve. Ver avisoDeCierreVacio().
      planDescartado = isRejection(respuesta) ? null : pending.actions;
      await clearPendingPlan(tenantId, sessionId);
    }

    progreso("Pensando...");
    // El primer hito sale al chat, no solo al indicador de carga. En pedidos
    // complejos evita que una espera legítima parezca un bloqueo.
    sse("avance", {
      reply: "🧭 Ya entendí el pedido. Lo voy a resolver por etapas y te iré entregando cada parte terminada.",
    });
    const heartbeat = setInterval(() => progreso("Sigo trabajando en tu pedido..."), 15_000);

    try {
      // Un ÚNICO reloj para todo el turno, arrancado acá y no más adelante:
      // antes el presupuesto de la rotación se medía recién al llegar al
      // bucle de candidatos, así que la preparación previa (registrar el
      // puente MCP hasta 15s + crear la sesión hasta 20s + consultar
      // proveedores hasta 10s) quedaba FUERA de la cuenta y el turno real
      // podía pasarse del corte del proxy (~150-160s) aunque el presupuesto
      // interno dijera 130s. Reproducido en vivo: 502 a los 154s.
      const TURNO_TOTAL_MS = 135_000;
      const turnDeadline = Date.now() + TURNO_TOTAL_MS;

      // ── Cronometro por tramos ────────────────────────────────────────────
      // Tres cortes por tiempo seguidos y tres diagnosticos distintos, todos
      // por deduccion: primero culpe a la subida a Meta, despues al encadenado
      // del plan, despues al presupuesto de investigacion. Cada arreglo servia
      // para otra cosa, pero ninguno se apoyaba en una medicion.
      //
      // Con esto el propio mensaje de corte dice donde se fue el tiempo, asi
      // el proximo diagnostico sale en un intento y no en tres. Y le sirve al
      // admin: "se fue en investigar" es accionable, "tardo mucho" no.
      const t0 = Date.now();
      const tramos: Array<{ etapa: string; ms: number }> = [];
      const marcar = (etapa: string, desde: number) => {
        tramos.push({ etapa, ms: Date.now() - desde });
      };
      const tramosTexto = () =>
        tramos.length
          ? tramos.map((t) => `${t.etapa} ${(t.ms / 1000).toFixed(1)}s`).join(" · ") + ` · total ${((Date.now() - t0) / 1000).toFixed(1)}s`
          : `total ${((Date.now() - t0) / 1000).toFixed(1)}s`;

      /**
       * Por qué se cayó el turno, dicho en una línea y arriba de todo.
       *
       * El desglose de tramos ya traía el motivo, pero enterrado: el admin veía
       * "⏱️ modelo:deepseek-chat(descartado: sin crédito) 1.2s · ..." y leía un
       * problema de lentitud. La causa real era que sus DOS modelos de pago
       * estaban sin saldo, y por eso la cadena caía a los gratis --que no
       * alcanzan a resolver un pedido de anuncio-- y se comía los 135s.
       *
       * Reportado el 2026-08-24 con ese trace exacto. Recargar el saldo es algo
       * que el admin puede hacer YA; "está tardando" no le dice qué hacer.
       *
       * Se distingue sin saldo de clave mala a propósito: son dos arreglos
       * distintos (pagar vs. volver a pegar la clave) y `resumirMotivo` ya los
       * separa.
       */
      const causaDeFondo = (): string | null => {
        const nombresDe = (ts: Array<{ etapa: string }>) =>
          ts.map((t) => (t.etapa.match(/^modelo:([^(]+)/) || [])[1]?.trim()).filter(Boolean).join(", ");

        const dePago = tramos.filter((t) => /sin crédito|clave rechazada/i.test(t.etapa));

        // La causa se decide por DÓNDE SE FUE EL TIEMPO, no por la mera
        // presencia de un fallo de saldo.
        //
        // Antes alcanzaba con que UN modelo de pago apareciera sin crédito para
        // afirmar "la causa es el saldo, recargá y anda en segundos". Trace real
        // del admin (2026-08-25): los dos de pago se descartaron en 2,3s
        // -- gratis, en la práctica -- y el turno se lo comieron dos modelos que
        // se colgaron (55s + 42s) y uno con rate limit (31,5s). O sea 128 de los
        // 135 segundos. Recargar saldo no arregla NADA de eso, y mandar al admin
        // a pagar por un problema que no es el suyo es peor que no decir nada:
        // gasta plata y el corte sigue igual.
        const colgados = tramos.filter((t) => /se quedó sin tiempo/i.test(t.etapa));
        const msColgados = colgados.reduce((a, t) => a + t.ms, 0);
        const msPago = dePago.reduce((a, t) => a + t.ms, 0);

        if (msColgados > msPago && msColgados > 30_000) {
          const cuales = nombresDe(colgados);
          return `\n\n⚠️ **La causa es que ${colgados.length === 1 ? "un modelo se colgó" : "unos modelos se colgaron"}, no el saldo.** `
            + `${cuales} se quedaron con ${(msColgados / 1000).toFixed(0)}s del turno sin contestar una letra`
            + (dePago.length > 0 ? ` (los de pago se descartaron en ${(msPago / 1000).toFixed(1)}s, así que ahí no se fue el tiempo)` : "")
            + `. Ya quedaron apartados: el próximo intento no los prueba. `
            + `Si vuelve a pasar, conectá un proveedor rápido (Copilot o Groq) en Configuración → Modelos de pago.`;
        }

        if (dePago.length === 0) return null;
        const nombres = nombresDe(dePago);
        const sinSaldo = dePago.some((t) => /sin crédito/i.test(t.etapa));
        return sinSaldo
          ? `\n\n⚠️ **La causa es el saldo, no la lentitud.** Tus modelos de pago (${nombres}) están sin crédito, `
            + `así que el pedido cayó a los modelos gratis, que no alcanzan a resolver algo de este tamaño a tiempo. `
            + `Recargá el saldo de ese proveedor y esto vuelve a andar en segundos.`
          : `\n\n⚠️ **La causa es la clave, no la lentitud.** El proveedor rechazó la clave de ${nombres}. `
            + `Volvé a cargarla en Configuración → Modelos de pago.`;
      };

      const turnId = randomUUID();
      // La TTL del token = lo que dura el turno. Además de acotar el token,
      // su `exp` es lo que el puente MCP usa como turnDeadline para que una
      // herramienta lenta (deep_research) sepa cuánto tiempo le queda real.
      // ── Las herramientas se eligen por lo que se está HABLANDO, no solo
      // por el último mensaje ──────────────────────────────────────────────
      //
      // Medido el 13-09-2026 (sesión s-1789094170354): Atlas preguntó
      // "¿querés que revise…?", el admin contestó "pe srevisa" / "dale" / "sí",
      // y el turno corrió con el paquete de "charla pura" (dashboard +
      // propose_action): sin ninguna herramienta para hacer lo que él mismo
      // había ofrecido. Un "sí" solo significa algo junto a la pregunta que
      // contesta, así que la elección mira también los últimos turnos.
      const esSeguimientoCorto = String(prompt).trim().length <= 40 || /^(s[ií]|dale|ok|okey|listo|claro|hacelo|hazlo|revisa|revis[aá]lo|ve|mira|adelante|perfecto|bueno|va|de una|por favor)\b/i.test(String(prompt).trim());
      const pedidoParaHerramientas = esSeguimientoCorto
        ? [...convo.slice(-4).map((m: any) => String(m.content || "")), String(prompt)].join("\n")
        : String(prompt);
      // Lo que Atlas pidió en el turno anterior y no alcanzó a usar (ver
      // herramientasQuePide) entra acá: nombrar una herramienta la habilita.
      const pedidasAntes = herramientasPedidasAntes(tenantId, sessionId);
      let toolRegistry = buildMcpToolRegistry(pedidasAntes.length ? `${pedidoParaHerramientas}\n${pedidasAntes.join(" ")}` : pedidoParaHerramientas);
      // El subconjunto viaja en la URL del puente: es lo que hace que el
      // modelo reciba solo los esquemas que puede llegar a usar en ESTE
      // pedido, en vez de los 34 completos. Ver el comentario en
      // opencode-mcp-tools.ts sobre por qué esto importa tanto (69s → objetivo
      // de segundos para un pedido simple).
      const nombresPermitidos = toolRegistry.map((t) => t.name).join(",");
      const token = mintTurnToken({
        tenantId,
        sessionId,
        turnId,
        allowedTools: toolRegistry.map((t) => t.name),
      }, TURNO_TOTAL_MS);
      // El tipo de campaña se resuelve ACÁ, del mensaje del admin, y viaja al
      // puente. No se le pregunta al modelo: "WhatsApp" está escrito en el
      // pedido, en castellano, y leerlo con una regex es determinista.
      //
      // Medido el 2026-08-28, tres corridas del MISMO pedido a WhatsApp: una
      // pasó `objetivo` bien, otra se inventó `whatsappContact` (que no
      // existe) y otra eligió `fb_ad_draft`, que ni acepta el parámetro. Dos
      // de tres habrían publicado a la web. El dato existe en el texto: no
      // tiene por qué depender de que el modelo lo recuerde.
      const { interpretarObjetivo } = await import("../lib/objetivos-campana");
      const objetivoDelAdmin = interpretarObjetivo(String(prompt || ""));
      const mcpUrl = `${getAppUrl()}/api/internal/mcp/atlas?token=${token}&tools=${encodeURIComponent(nombresPermitidos)}`
        + (objetivoDelAdmin ? `&objetivo=${encodeURIComponent(objetivoDelAdmin)}` : "");
      const tools: Record<string, boolean> = {};
      for (const t of toolRegistry) tools[t.name] = true;

      // Apagar las herramientas NATIVAS de OpenCode. Diagnosticado en vivo
      // (2026-08-12) consultando la BD: ante un pedido de investigación, el
      // modelo gastaba los 135s del turno y NO quedaba ni una fila --
      // ninguna de nuestras herramientas se había llamado. La razón: OpenCode
      // trae su propio `websearch`/`webfetch` y el modelo los prefería,
      // quedándose colgado en ellos en vez de usar la investigación en
      // segundo plano. Mientras estas existan, ninguna instrucción del prompt
      // alcanza. Además `bash`/`write`/`edit` le darían acceso al sistema de
      // archivos del contenedor, que un turno de Atlas no necesita para nada.
      for (const nativa of ["bash", "edit", "write", "read", "glob", "grep", "webfetch", "websearch", "task", "todowrite", "skill", "question", "patch", "list"]) {
        tools[nativa] = false;
      }

      // Detecta respuestas donde el modelo ESCRIBIÓ la llamada a la
      // herramienta como texto en vez de invocarla por el canal real de
      // tool-calling. Visto en vivo dos veces, en formatos distintos:
      // "<function=webfetch>{...}</function>" y "atlas_research_startegraphics{"}".
      // En ambos casos ninguna herramienta se ejecutó y esa basura le llega
      // al admin como si fuera la respuesta. Se apoya en los nombres reales
      // del registro (no en una lista fija) y en que el prompt ya prohíbe
      // mostrarle nombres técnicos de herramientas al admin: si aparece uno
      // en la respuesta, algo salió mal sí o sí.
      const nombresHerramientas = toolRegistry.map((t) => t.name).filter(Boolean);
      const pareceHerramientaFiltrada = (txt: string): boolean => {
        if (!txt) return false;
        if (/<function\s*=|<\|python_tag\|>|\[TOOL_CALLS\]|<tool_call>/i.test(txt)) return true;
        // OpenCode expone las herramientas MCP con prefijo (ej. atlas_list_products).
        if (/\batlas_[a-z_]+/i.test(txt) && /[{}"]/.test(txt)) return true;
        return nombresHerramientas.some((n) => new RegExp(`\\b${n}\\s*[{(]`, "i").test(txt));
      };

      const lessons = await loadRecentLessons(tenantId);
      const lessonsBlock = lessons.length
        ? `\n\nLECCIONES DE ERRORES PASADOS EN ESTE NEGOCIO (evita repetirlos):\n${lessons.map((l) => `- ${l}`).join("\n")}`
        : "";
      const historyText = convo
        .map((m: any) => `${m.role === "user" ? "Admin" : "Atlas"}: ${m.content}`)
        .join("\n\n");
      let text = historyText ? `${historyText}\n\nAdmin: ${prompt}` : `Admin: ${prompt}`;
      // ── Un "sí" contesta la pregunta anterior: se lo decimos con todas las
      // letras ────────────────────────────────────────────────────────────
      //
      // El dueño (13-09-2026): "no está entendiendo un sí cuando anteriormente
      // dejó un interrogante que apunta a sí o a no, y está reenviando la
      // información más formateada y desorganizada". El modelo veía el
      // historial, pero ante un "sí" volvía a explicar en vez de hacer.
      const ultimoDeAtlas = [...convo].reverse().find((m: any) => m.role !== "user");
      const preguntaAnterior = String(ultimoDeAtlas?.content || "").split(/\n+/).map((l: string) => l.trim()).filter((l: string) => /[?¿]/.test(l)).pop() || "";
      const esUnSi = /^(s[ií]+|sí\s+(por\s+favor|dale|claro)|dale|ok(ey)?|claro( que s[ií])?|hacelo|hazlo|adelante|de una|listo|va|perfecto|bueno)[\s!.]*$/i.test(String(prompt).trim());
      if (esUnSi && preguntaAnterior) {
        text += `\n\n[NOTA DEL SISTEMA] El admin acaba de contestar que SÍ a tu pregunta anterior: «${preguntaAnterior.slice(0, 300)}». Hacé exactamente eso ahora. No repitas lo que ya le dijiste ni vuelvas a explicar el contexto: entregá el resultado o ejecutá la acción. Si tu pregunta ofrecía varias opciones, tomá la primera que propusiste.`;
        logger.info({ tenantId, pregunta: preguntaAnterior.slice(0, 80) }, "[AtlasOpenCode] 'sí' a la pregunta anterior: se le indica al modelo");
      }

      // ── El módulo de publicidad, SOLO cuando se está hablando de anuncios ─
      //
      // Estaba escrito desde el 18-08-2026 y no lo leía nadie: se usaba únicamente
      // como validador (revisarCopy), nunca como instrucción. Atlas escribía los
      // anuncios con la doctrina VIEJA del prompt -- que hasta hace un rato le
      // pedía literalmente "beneficio + prueba social + CTA" -- y después el
      // validador le rechazaba la prueba social que el propio prompt le había
      // mandado poner. De ahí salió el "+800 dueños ya lo lograron" del PACK
      // EDUCA A TU PERRO: el modelo estaba obedeciendo.
      //
      // Va condicionado y no fijo porque el prompt del operador ya roza el tope
      // de caracteres, y pasarse no degrada la respuesta: la anula. Se mira toda
      // la conversación, no solo el último mensaje: cuando el admin contesta "sí"
      // o el nombre del producto, el pedido de anuncio quedó tres mensajes atrás.
      const contextoDelTurno = `${historyText}\n${prompt}`;
      const HABLA_DE_ANUNCIOS = /anuncio|publicidad|campa[nñ]a|copy|pauta|creativ|publicit|\bads?\b/i;
      const moduloBlock = HABLA_DE_ANUNCIOS.test(contextoDelTurno)
        ? `\n\n${MODULO_PUBLICIDAD}\n\n${FORMATO_ANUNCIO}`
        : "";
      // ── Que sepa TODO lo que puede consultar, no solo lo de este turno ──
      //
      // Pedido del admin: "hasta que no le pregunto no se da cuenta -- no tiene
      // contexto de todo lo que puede y sabe hacer".
      //
      // El recorte de herramientas de arriba está bien y se queda (mandar las
      // 53 completas es lo que llevaba un pedido simple a 69s). Lo que faltaba
      // es que al recortar no quedaba NINGÚN rastro de las demás: Atlas no veía
      // una lista más corta, veía un mundo más chico, y contestaba "no tengo
      // acceso" sobre cosas implementadas y funcionando.
      //
      // Con las acciones de CAMBIO esto ya estaba resuelto desde el 2026-08-16
      // por el mismo fallo; las de lectura quedaron sin ese tratamiento.
      // El prompt se arma SEGUN el pedido: el nucleo siempre, y los bloques
      // de marketing / anuncios / analisis solo cuando hacen falta. Medido:
      // este prompt entero cuesta ~30s de lectura antes de que el modelo
      // empiece a responder. Ver promptDeAtlas() en app-operator.
      const system = promptDeAtlas(text)
        + catalogoDeCapacidades(new Set(toolRegistry.map((t) => t.name)))
        + lessonsBlock + moduloBlock;

      // Un pedido de anuncio/campaña/publicación. Se declara acá arriba
      // porque lo usan dos bloques: el que pregunta por el producto faltante
      // (abajo) y el que dispara la investigación previa.
      // "anunciá" faltaba, y es el verbo MÁS natural para pedir un anuncio.
      // Detectado por el dueño preguntando si la búsqueda se hacía: su mensaje
      // era "Anunciá en Facebook mi curso..." y no matcheaba ningún verbo de
      // la lista, así que el turno corrió SIN investigar -- y el aviso
      // automático se lo dijo ("en este mensaje NO se hizo ninguna búsqueda
      // web real").
      //
      // Tercera vez que una lista cerrada de palabras deja afuera un caso
      // obvio. Por eso ahora "anunciá"/"publicitá" valen SOLOS, sin exigir un
      // sustantivo detrás: quien dice "anunciá mi curso" está pidiendo un
      // anuncio, no hace falta que además diga la palabra "anuncio".
      const PEDIDO_DE_ANUNCIO = /\b(anunci[aá]|publicit[aá])\w*|\b(cre[aá]|prepar[aá]|arm[aá]|gener[aá]|hac[eé]|dise[ñn]|lanz[aá])\w*\s+(un\s+|el\s+|la\s+|una\s+)?(anuncio|campa|publicaci|post|ad\b)/i;

      // ── Anuncio sin producto: preguntar ANTES de gastar un turno ─────────
      // Pedido del admin: "antes de ponerse a inventar debería pedir la
      // información si no se la dan". La regla del prompt no alcanzó --
      // probado en vivo con "crea un anuncio": el modelo NO preguntó, eligió
      // productos por su cuenta ("elegidos por relevancia y demanda actual")
      // y tardó 125s en hacerlo.
      //
      // Acá no hace falta un modelo para saber que falta el dato: si el
      // pedido es de anuncio y no nombra ningún producto ni id, se pregunta
      // DIRECTO, sin llamar al modelo. Sale en ~2s, es imposible que invente
      // y el admin elige él.
      if (PEDIDO_DE_ANUNCIO.test(String(prompt))) {
        const contexto = `${historyText}\n${prompt}`.toLowerCase();
        const suyos = await db
          .select({ id: products.id, name: products.name })
          .from(products)
          .where(eq(products.tenantId, tenantId))
          .orderBy(desc(products.id))
          .limit(200);
        const mencionaProducto = suyos.some((p: { id: number; name: string }) => {
          if (new RegExp(`\\b${p.id}\\b`).test(contexto)) return true;
          const palabras = String(p.name).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5);
          return palabras.length > 0 && palabras.some((w) => contexto.includes(w));
        });

        if (!mencionaProducto && suyos.length > 0) {
          const muestra = suyos.slice(0, 8).map((p: { id: number; name: string }) => `• ${p.name} (id ${p.id})`).join("\n");
          const reply = paraMarkdown(toEmojiStyle(
            `¿Para cuál producto querés el anuncio? Decime el nombre o el número y lo preparo.\n\n${muestra}` +
            (suyos.length > 8 ? `\n\n…y ${suyos.length - 8} más. Si querés, decime el nombre y lo busco.` : ""),
          ));
          await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
          logger.info({ tenantId }, "[AtlasOpenCode] Pidieron un anuncio sin decir de qué producto -- se pregunta sin gastar un turno de modelo");
          return finish({ reply, status: "info", needsContinuation: false });
        }
      }

      // ── Pedidos de varias partes: se atiende UNA por vez ─────────────────
      // Idea del admin, y es la solución correcta al problema de fondo en vez
      // de un parche de tiempos: "¿por qué no dividimos el pedido para que no
      // haga todo de golpe?". Reproducido en vivo, "mostrame el copy, la
      // estrategia, la segmentación, el seguimiento y el presupuesto" tardaba
      // 130-135s -- contra el techo del proxy (~150s) -- porque el modelo
      // intentaba resolver las cinco cosas en un solo turno.
      //
      // Ahora el servidor detecta que son varias y le pide SOLO la primera,
      // avisándole al admin qué queda pendiente. Cada parte entra holgada en
      // el tiempo disponible y el admin ve avance real en vez de una
      // disculpa. No depende de que el modelo se autolimite.
      let partesPendientes: string[] = [];
      /**
       * Las partes que ya se le mandaron al admin por separado, tal como las
       * vio. Se restan del mensaje de cierre para no repetirle en pantalla lo
       * que acaba de leer.
       */
      const partesEntregadas: string[] = [];
      // ── Partir el pedido: la regla vive en lib/partir-el-pedido.ts ──────
      //
      // Estaba escrita acá adentro, y por eso nadie pudo comprobar nunca que
      // NO FUNCIONABA. Medido el 2026-09-04 contra las formas en que el admin
      // pide de verdad: cuatro de cuatro pedidos reales NO se partían.
      //
      //   "mostrame el copy, la estrategia, la segmentacion y el presupuesto"
      //   "dame el copy, el publico y las metricas"
      //   "necesito el copy, la segmentacion y el plan de seguimiento"
      //
      // La regla exigía un verbo de acción en CADA parte, y así no habla
      // nadie: en una enumeración el verbo se dice UNA vez y gobierna a todas.
      // O sea que el mecanismo de partes --y la entrega parte por parte que se
      // conectó esta misma sesión-- no se disparaba nunca.
      //
      // Las dos regresiones caras que la regla estricta protegía siguen
      // cubiertas y con prueba: los parámetros de una sola tarea ("con ángulo
      // de fe, destino WhatsApp, presupuesto 10000") no son tres tareas, y un
      // fragmento con paréntesis sin cerrar frena todo el partido.
      const partido = partirElPedido(String(prompt));
      if (partido) {
        partesPendientes = partido.pendientes;
        text +=
          `\n\n[SISTEMA] El admin pidió VARIAS cosas en un solo mensaje. Resolvé SOLO esta primera: "${partido.primera}". ` +
          `NO abordes las demás todavía (${partesPendientes.join(", ")}) -- el sistema se las va a ofrecer después. ` +
          `Hacer todo junto no entra en una sola respuesta y termina fallando. Concentrate en esa primera parte y hacela bien.`;
        progreso(`Resolviendo lo primero: ${partido.primera.slice(0, 40)}...`);
      }

      // ── Investigación garantizada por el SERVIDOR, no por el modelo ──────
      // Verificado en vivo (2026-08-12), y es el problema más grave que
      // apareció: ante "investigá X", el modelo contesta "estoy investigando,
      // te aviso en un minuto" y NO llama ninguna herramienta -- confirmado
      // pidiendo research_check un segundo después ("no hay investigación
      // activa") y con cero filas en `architect_memory`. O sea: le decía al
      // admin que estaba trabajando cuando no había arrancado nada. Eso es
      // exactamente la fabricación que este producto no puede permitirse.
      // Ni el prompt ni exponer mejor la herramienta lo resolvieron.
      // Solución: si el pedido es de investigación, el servidor la arranca
      // ÉL MISMO antes de hablarle al modelo, y se lo informa. Así la
      // promesa que Atlas le hace al admin siempre es cierta.
      // ¿Se consiguió información REAL de internet en este turno? Es la
      // única fuente de verdad para desmentir al modelo más abajo si dice
      // que investigó cuando no lo hizo.
      let huboInvestigacionReal = false;
      const PEDIDO_DE_INVESTIGACION = /\b(investig|averigu|indag|research|analiz[aá] el mercado|qu[eé] funciona|tendencia|competencia|benchmark)/i;
      // Crear un anuncio TAMBIÉN dispara la investigación, aunque el admin no
      // use la palabra "investigá". Motivo real (reportado en vivo por el
      // admin, 2026-08-12): `fb_ad_draft` exige investigación reciente -- un
      // candado correcto, evita copy inventado -- pero si el servidor solo
      // investigaba ante palabras como "investigá", un pedido normal como
      // "creá el anuncio del curso" quedaba bloqueado con
      // "Todavía no investigaste nada en esta sesión". El candado hacía bien
      // su trabajo y aun así el admin quedaba trabado. Si el anuncio necesita
      // investigación, se investiga y punto.
      if (PEDIDO_DE_INVESTIGACION.test(String(prompt)) || PEDIDO_DE_ANUNCIO.test(String(prompt))) {
        progreso("Investigando en internet...");
        // Sincrónica y corta a propósito (ver investigacionRapida): el
        // resultado real llega en ESTA respuesta, sin trabajos en segundo
        // plano que se puedan perder ni promesas que cumplir después. Se le
        // reserva algo menos de la mitad del turno; lo que sobra le queda al
        // modelo para redactar, que tarda 10-20s.
        // El presupuesto de investigación se ADAPTA a cuánto trabajo le queda
        // al modelo después.
        //
        // 70s fijos era más de la mitad del turno, y el comentario de arriba
        // asume que "redactar tarda 10-20s". Eso vale cuando el pedido es solo
        // escribir. Pero cuando además hay que buscar el producto, pedir el
        // brief y proponer dos acciones encadenadas, cada paso es una vuelta
        // más contra el modelo y los ~65s restantes no alcanzan: medido dos
        // veces seguidas con "anunciá mi curso de IA: escribí, guardá y
        // subilo", el turno cortó sin crear nada.
        //
        // Si el pedido incluye EJECUTAR (guardar/subir/publicar), la
        // investigación se recorta a la mitad. Sigue siendo tiempo real de
        // búsqueda -- suficiente para traer ángulos de la competencia -- pero
        // le deja al modelo el margen que necesita para llegar a proponer.
        // Vale más un anuncio creado con investigación más corta que una
        // investigación completa que muere sin anuncio.
        // Un pedido de anuncio SIEMPRE ejecuta: `crear_anuncio` termina
        // guardando un borrador, lo pida el admin con esa palabra o no. Esta
        // condición era una lista de verbos y volvía a fallar por el mismo
        // motivo de siempre -- medido el 2026-08-19 con "Creá un anuncio ...
        // no lo subas todavía": ni "creá" (el patrón exige "creá ... y") ni
        // "subas" (el patrón exige "sub" + i/í) enganchaban, así que el turno
        // se tomaba los 70s largos de investigación para un pedido que sí iba
        // a ejecutar. Es la cuarta vez que enumerar palabras deja afuera un
        // caso obvio; acá directamente no hace falta adivinar el verbo.
        const PIDE_EJECUTAR =
          PEDIDO_DE_ANUNCIO.test(String(prompt))
          || /\b(guard[aá]|sub[ií]|public[aá]|cre[aá]\w*\s+(y|,)|deja\w*\s+list)/i.test(String(prompt));
        // ── En un pedido de ANUNCIO no se investiga: no lo usa nadie ─────────
        //
        // Medido con el desglose por tramos (2026-08-30), turno real de
        // anuncio: investigación 22,6 s de 33 s totales. El 68% del turno.
        //
        // Y ese trabajo no llega al anuncio. `crear_anuncio` hace TODO del lado
        // del servidor -- busca el producto, arma el brief con sus datos
        // reales, escribe el copy y lo valida -- y ni siquiera recibe el texto
        // de la investigación: se le pasa el NOMBRE del producto y el
        // presupuesto, nada más. O sea que esos 22 s alimentaban únicamente la
        // frase de conversación, no el anuncio que se publica.
        //
        // El admin lo puso en estos términos: "Atlas se está colgando mucho y
        // tardando mucho, y eso a una empresa no le gusta". Tiene razón, y
        // ésta es la parte cara que no compra nada.
        //
        // Se sigue investigando cuando el pedido NO es de anuncio (una
        // consulta de competencia, de mercado, de tendencias): ahí el hallazgo
        // ES la respuesta, y sin él no hay nada que contestar.
        const investigar = !PIDE_EJECUTAR;
        // ── El tope de la investigación, medido ────────────────────────────
        //
        // Eran 70.000 ms. Medido el 2026-09-05 contra la red real, la búsqueda
        // web tarda 2.703 ms y devuelve 8 resultados. El tope era 25 VECES lo
        // que el trabajo cuesta.
        //
        // Un tope no cuesta tiempo mientras todo ande: solo se paga cuando algo
        // se cuelga. Pero ahí es donde importa -- si la Biblioteca de Anuncios
        // de Facebook deja de responder, Atlas esperaba 70 segundos antes de
        // rendirse, y el admin veía un turno muerto sin saber por qué.
        //
        // 25s deja 9 veces el margen de lo medido: alcanza de sobra para un día
        // lento y corta rápido cuando de verdad no hay respuesta.
        const PRESUPUESTO_INVESTIGACION_MS = 25_000;
        if (!investigar) {
          // Se le dice al modelo, para que no prometa una investigación que no
          // va a llegar ni afirme haberla hecho -- el guardián de más abajo lo
          // corregiría, pero es mejor no darle el pie.
          text += `\n\n[SISTEMA] Para este pedido NO hace falta investigar: el copy lo escribe el servidor con los datos REALES del producto (nombre, características y precio del catálogo) y lo valida antes de guardar. Proponé la acción directamente; no digas que vas a investigar ni que investigaste.`;
        }
        if (investigar) try {
          const tInv = Date.now();
          const r = await investigacionRapida(ctx, String(prompt), Math.min(PRESUPUESTO_INVESTIGACION_MS, Math.max(turnDeadline - Date.now() - 45_000, 20_000)));
          marcar("investigacion", tInv);
          // Se avisa el CAMBIO de etapa. Hasta acá el único aviso concreto era
          // "Investigando en internet..." y después solo latidos genéricos cada
          // 15 s, así que una espera de 60 s se leía como una investigación de
          // 60 s -- tanto para el admin como para quien intenta diagnosticarla.
          // Sin saber cuándo termina una etapa no se puede decir cuál es la cara.
          progreso(`Ya investigué (${((Date.now() - tInv) / 1000).toFixed(0)}s). Ahora escribo la propuesta...`);
          if (r.ok) {
            huboInvestigacionReal = true;
            sse("avance", {
              reply: "✅ Primera parte lista: terminé la investigación y ya tengo los datos reales. Ahora los convierto en una propuesta accionable.",
            });
            text += `\n\n[SISTEMA] Investigación REAL ya hecha para este pedido (hallazgos con sus fuentes). Respondé al admin USANDO ESTO, no prometas investigar después ni digas que vas a averiguar -- ya está hecho:\n${r.texto.slice(0, 6000)}`;
          } else {
            // Que el modelo sepa que NO hay datos, para que lo diga en vez de
            // inventar o de prometer una investigación que no va a llegar.
            text += `\n\n[SISTEMA] La investigación NO se pudo completar (${r.motivo.slice(0, 300)}). Decíselo al admin con honestidad y ofrecele reintentar; NO inventes hallazgos ni cites fuentes que no tenés.`;
          }
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] La investigación sincrónica falló");
          text += `\n\n[SISTEMA] La investigación falló por un error técnico. Decíselo al admin con honestidad; NO inventes hallazgos.`;
        }
      }

      // Se guardan afuera para poder mandarle un segundo pedido dirigido al
      // modelo si hizo falta (ver "insistencia" más abajo), sin volver a
      // crear sesión ni perder el contexto de lo que ya escribió.
      let sesionOpencode = "";
      let modeloUsado: { providerID: string; modelID: string } | null = null;

      const { text: finalReply, error: opencodeError } = await conCandado(async () => {
        // ── El camino DIRECTO, sin intermediarios ──────────────────────────
        //
        // Hasta acá el turno hacía: Atlas → OpenCode → puente MCP → DE VUELTA
        // a este mismo servidor. Una vuelta por un contenedor ajeno para
        // terminar llamando funciones que ya viven acá.
        //
        // Medido el 2026-09-05 --mismo prompt, mismas herramientas, mismo
        // modelo deepseek-v4-flash--:
        //
        //     directo      7.725 tokens   1,7s · 2,0s · 2,6s
        //     por OpenCode 20.674 tokens  13s … +175s
        //
        // OpenCode agrega ~13.000 tokens suyos y su propio bucle de agente.
        //
        // Se enciende con ATLAS_DIRECTO=true y queda OpenCode detrás como
        // respaldo: si el directo falla por algo que no sea el admin
        // deteniéndolo, el turno sigue por el camino viejo en vez de dejarlo
        // sin respuesta. Cambiar de camino es una variable de entorno.
        if (directoDisponible()) {
          progreso("Pensando...");
          const r = await correrTurnoDirecto({
            system,
            herramientas: toolRegistry,
            mensaje: text,
            // EL MISMO contexto que arma el puente MCP para sus llamadas.
            // `?? undefined` porque el puente MCP lo recibe por query string y ahi un
            // valor ausente es undefined, no null: igualar los dos caminos hasta en
            // esto es lo que evita que una herramienta se comporte distinto segun
            // por donde vino la llamada.
            ctx: { tenantId, sessionId, turnId, turnDeadline, objetivoDelAdmin: objetivoDelAdmin ?? undefined },
            apiKey: String(process.env.DEEPSEEK_API_KEY || ""),
            modelo: process.env.ATLAS_DIRECTO_MODELO || "deepseek-v4-flash",
            presupuestoMs: Math.max(turnDeadline - Date.now(), 10_000),
            cancelSignal: senalDeCorte,
            onProgreso: progreso,
          });
          marcar(`directo:${r.vueltas}v`, Date.now() - r.ms);
          logger.info(
            { tenantId, vueltas: r.vueltas, ms: r.ms, herramientas: r.herramientasUsadas, error: r.error },
            "[AtlasDirecto] turno terminado",
          );
          if (r.texto || r.error === "detenido") return { text: r.texto, error: r.error };
          logger.warn({ tenantId, err: r.error }, "[AtlasDirecto] sin respuesta: se cae a OpenCode");
        }

        await registerMcpBridge(cfg.host, cfg.authHeader, mcpUrl);
        const opencodeSessionId = await createOpencodeSession(cfg.host, cfg.authHeader);
        sesionOpencode = opencodeSessionId;
        const cadena = await pickOpencodeModelChain(cfg.host, cfg.authHeader);

        // Bug real encontrado probando en vivo (2026-08-12): con 145s FIJOS
        // por candidato, una tarea con varias herramientas encadenadas (ej.
        // armar un borrador de anuncio) se colgó sin respuesta -- si el
        // primer candidato tarda cerca de 145s, para cuando se prueba el
        // segundo la conexión con el cliente YA fue cortada por el proxy
        // delante de la app (~150-160s, mismo límite documentado para
        // /operator). El servidor seguía trabajando de fondo, pero nadie
        // veía la respuesta. Fix: presupuesto de tiempo TOTAL para todo el
        // turno (no por candidato) -- cada intento se queda con el tiempo
        // que sobra, nunca con 145s fijos de nuevo. El último candidato
        // (siempre el respaldo gratis de Zen, confirmado ~1-5s en vivo) se
        // queda con lo que quede, para que llegue a intentarse igual aunque
        // los anteriores hayan consumido casi todo el presupuesto.
        // Se reserva una cola fija para el respaldo gratis de Zen (~1-5s
        // confirmado en vivo, pero se le deja margen): así, por lento que
        // haya sido un candidato anterior, SIEMPRE queda tiempo real para
        // que el último de la cadena conteste algo en vez de morir en el
        // corte del proxy sin respuesta.
        const RESERVA_RESPALDO_MS = 25_000;
        // Menos que esto no alcanza ni para el intento más rápido: seguir
        // intentando desde acá solo garantiza pasarse del corte del proxy.
        const PISO_UTIL_MS = 8_000;
        // TECHO por candidato no-último. Reproducido en vivo (2026-08-12) con
        // un pedido grande ("mostrame el copy, la estrategia, la
        // segmentación, el seguimiento y el presupuesto"): el primer
        // candidato se comía ~100s, fallaba, y a los tres siguientes les
        // quedaban 8s cada uno -- ninguno alcanzaba a responder y el admin
        // terminaba viendo "esto está tardando". Acotando el primero a 55s,
        // la cadena entera tiene margen real: si el preferido no puede, el
        // respaldo gratis (rápido) SÍ llega a contestar algo útil.
        // Bajado de 55s a 30s el 2026-08-30, con la medicion en la mano: el
        // primer candidato uso los 55s COMPLETOS y fallo por tiempo, dejando
        // solo 17s para los otros tres. Un candidato que no contesto en 30s con
        // este prompt no va a contestar en 55: lo unico que agrega es que el
        // admin espere 25 s mas antes de recibir la respuesta del respaldo.
        //
        // El turno completo medido fue de 97s; con este tope el mismo turno
        // deberia cerrar cerca de 70s aun en el peor caso, y mucho antes si
        // flash contesta.
        const TECHO_POR_CANDIDATO_MS = 30_000;
        let ultimo: { text: string; error?: string } = { text: "", error: "sin candidatos" };
        for (let i = 0; i < cadena.length; i++) {
          const model = cadena[i];
          const esUltimo = i === cadena.length - 1;
          const restante = turnDeadline - Date.now();
          // Bug real encontrado probando en vivo (2026-08-12): antes acá había
          // pisos fijos (Math.max(..., 15_000) / Math.max(restante, 20_000))
          // que IGNORABAN el reloj -- con 4 candidatos, un primer intento
          // largo que fallaba dejaba a los 3 siguientes corriendo 15+15+20s
          // por encima del deadline. La suma daba ~161s, exactamente el 502
          // del proxy que se estaba reproduciendo. Ningún intento puede durar
          // más de lo que realmente queda.
          if (restante <= PISO_UTIL_MS) {
            logger.warn({ tenantId, model: model.modelID, restante }, "[AtlasOpenCode] Sin tiempo útil restante, se corta la rotación y se responde con lo que haya");
            break;
          }
          // Detenido: no se empieza un candidato más. Sin este corte, apretar
          // el botón esperaba a que la cadena entera se agotara -- cuatro
          // candidatos por hasta 30s cada uno.
          if (fueDetenido(senalDeCorte)) {
            logger.info({ tenantId, model: model.modelID }, "[AtlasOpenCode] Detenido por el admin -- no se prueba otro candidato");
            break;
          }
          // Un candidato NO-último puede quedarse con casi todo el turno (menos
          // la reserva): un pedido con investigación real necesita ~60-90s de
          // corrido, y trocearlo en ventanas cortas hacía que el primer
          // candidato -- el preferido -- fallara SIEMPRE en esos casos.
          // ── Un TIMEOUT no significa lo mismo que un error ─────────────────
          //
          // Medido el 2026-09-04 con el diagnóstico, sobre el pedido real
          // "Dame el copi para saber que vas a publicar":
          //
          //   deepseek-v4-flash      falló: se quedó sin tiempo   30.0s
          //   deepseek-v4-pro        falló: se quedó sin tiempo   30.0s
          //   mistral-small-latest   falló: se quedó sin tiempo   30.0s
          //   claude-opus-4.8-fast   descartado: clave rechazada  11.2s
          //   big-pickle             falló: se quedó sin tiempo   30.5s
          //   -> turno cortado a los 135s, sin entregar NADA
          //
          // Los cinco se cortaron en el techo, no por fallar. Y el mismo día,
          // un pedido que solo consultaba una herramienta tardó 5,7s. La
          // diferencia no es el proveedor: es que ESCRIBIR un anuncio entero
          // lleva más de 30 segundos, y ninguno llegaba nunca.
          //
          // La estrategia de "cortar rápido y probar otro" sirve cuando el
          // siguiente candidato PUEDE contestar rápido -- o sea cuando el
          // anterior falló por algo suyo (sin saldo, clave mala, 500). Ahí
          // rotar es gratis y correcto.
          //
          // Pero si el anterior se cayó POR TIEMPO, el problema es la tarea,
          // no el proveedor: darle al siguiente los mismos 30s es repetir el
          // experimento esperando otro resultado. Cinco veces treinta son 150
          // segundos y cero respuestas; uno solo con ochenta habría terminado.
          //
          // Así que un timeout ASCIENDE al siguiente: se le da todo lo que
          // queda menos la reserva del respaldo. Se prueban menos candidatos y
          // se termina el trabajo.
          const anteriorSeQuedoSinTiempo = /timeout|timed out|abort|sin tiempo/i.test(String(ultimo.error || ""));
          const techo = anteriorSeQuedoSinTiempo
            ? Math.max(restante - RESERVA_RESPALDO_MS, PISO_UTIL_MS)
            : TECHO_POR_CANDIDATO_MS;
          if (anteriorSeQuedoSinTiempo) {
            logger.info(
              { tenantId, model: model.modelID, techo },
              "[AtlasOpenCode] El candidato anterior se quedó sin tiempo: la tarea es larga, no el proveedor. Se le da más margen a este.",
            );
          }
          const timeoutCandidato = Math.min(
            restante,
            esUltimo
              ? restante
              : Math.min(Math.max(restante - RESERVA_RESPALDO_MS, PISO_UTIL_MS), techo),
          );
          const tModelo = Date.now();
          try {
            modeloUsado = model;
            ultimo = await sendOpencodeMessage(cfg.host, cfg.authHeader, opencodeSessionId, {
              system,
              model,
              tools,
              text,
              timeoutMs: timeoutCandidato,
              cancelSignal: senalDeCorte,
            });
            // Cada intento se mide por separado: con varios candidatos en
            // cadena, saber CUÁL se comió el tiempo es la diferencia entre
            // arreglar el modelo lento y seguir tocando presupuestos al azar.
            // Bug real encontrado probando en vivo (2026-08-12): un candidato
            // respondio 200 "sin error" pero el texto traia sintaxis de
            // tool-call sin ejecutar de verdad (literal "<function=nombre>...
            // </function>" en el texto final) -- el modelo "alucino" que
            // llamaba una herramienta en vez de invocarla por el canal real
            // de tool-calling de OpenCode. Eso casi le llega directo al
            // admin como si fuera la respuesta. Tratarlo como fallo (no como
            // exito) para que rote al siguiente candidato en vez de
            // aceptarlo.
            if (pareceHerramientaFiltrada(ultimo.text)) {
              logger.warn({ tenantId, model }, "[AtlasOpenCode] Candidato filtro sintaxis de tool-call sin ejecutar, rotando al siguiente");
              ultimo = { text: "", error: "tool-call no ejecutado (sintaxis filtrada en el texto)" };
            }
            // El tramo se mide DESPUÉS de saber si el candidato sirvió, y se
            // anota con el motivo del descarte. Antes se marcaba apenas volvía
            // la llamada, así que un candidato que devolvía 200 con un error
            // adentro aparecía en el desglose idéntico a uno exitoso: en el
            // corte del 2026-08-19 se leía "modelo:mistral-large-latest 4.0s"
            // como si hubiera respondido bien, cuando en realidad se descartó
            // y por eso la cadena siguió rotando hasta comerse los 135s. El
            // motivo solo estaba en el log del servidor, que es justo lo que no
            // se puede mirar desde el chat. "Falló porque X" es accionable;
            // un número de segundos a secas manda a diagnosticar de nuevo.
            marcar(`modelo:${model.modelID}${ultimo.error ? `(descartado: ${resumirMotivo(ultimo.error)})` : ""}`, tModelo);
            if (!ultimo.error) break; // Respuesta real -- no seguir rotando.
            logger.warn({ tenantId, model, error: ultimo.error }, "[AtlasOpenCode] Candidato falló, rotando al siguiente");
            void anotarFalloDeCandidato(model, ultimo.error);
          } catch (err: any) {
            // El intento que FALLA es el que más importa medir: es el que se
            // comió el tiempo sin devolver nada.
            marcar(`modelo:${model.modelID}(falló: ${resumirMotivo(err?.message || "error desconocido")})`, tModelo);
            ultimo = { text: "", error: err?.message || "error desconocido" };
            logger.warn({ tenantId, model, error: ultimo.error }, "[AtlasOpenCode] Candidato falló (excepción), rotando al siguiente");
            void anotarFalloDeCandidato(model, ultimo.error);
          }
        }
        return ultimo;
      });

      // ── Lo detuvo el admin: eso no es un error y no se cuenta como uno ────
      //
      // Va ANTES de la rama de error porque abortar la llamada en vuelo hace
      // que el candidato falle con un "abort", y esa palabra cae justo en el
      // patrón de `seAcaboElTiempo`. Sin este corte, apretar Detener contestaba
      // "me quedé sin tiempo... pedime que continúe" -- y encima con
      // `needsContinuation: true`, o sea que la página volvía a arrancar sola
      // lo que el admin acababa de parar.
      //
      // Lo que sí se dice, porque es verdad y hace falta: lo que ya se ejecutó
      // quedó hecho. Parar es dejar de avanzar, no deshacer.
      if (fueDetenido(senalDeCorte)) {
        const parcial = String(finalReply || "").trim();
        const reply = paraMarkdown(toEmojiStyle(
          parcial.length > 80
            ? `${parcial}\n\n⏹️ Lo detuve acá, como pediste. Lo que ya había hecho quedó guardado.`
            : `⏹️ Listo, lo detuve. No seguí con el resto del pedido. Lo que ya se había hecho antes de parar queda como estaba.`,
        ));
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, tramos, totalMs: Date.now() - t0 }, "[AtlasOpenCode] Turno DETENIDO por el admin");
        anotarTurno(tenantId, sessionId, { estado: "detenido", totalMs: Date.now() - t0, tramos, pedido: String(prompt) });
        return finish({ reply, status: "stopped", needsContinuation: false, tramos, totalMs: Date.now() - t0 });
      }

      if (opencodeError) {
        logger.error({ tenantId, opencodeError }, "[AtlasOpenCode] Error del motor OpenCode");
        // Quedarse sin tiempo NO es lo mismo que romperse: el pedido puede
        // haber avanzado de verdad (una investigación real llega a quedar
        // registrada aunque la respuesta no alcance a volver). Devolver un
        // 502 genérico ahí le miente al admin -- suena a que no pasó nada.
        // Se responde 200 con un mensaje honesto y accionable, mismo criterio
        // que la salida "esto está tardando" de /operator.
        const seAcaboElTiempo = /timeout|abort|sin tiempo|sin candidatos/i.test(String(opencodeError));
        logger.warn({ tenantId, tramos, totalMs: Date.now() - t0, opencodeError }, "[AtlasOpenCode] Turno cortado -- reparto real del tiempo");

        // Si igual alcanzó a redactar algo útil, se muestra ESO.
        //
        // El modelo puede devolver texto Y error a la vez (se quedó sin tiempo
        // en el último tramo, pero ya tenía la respuesta armada). Acá se
        // descartaba el texto y se ponía el aviso en su lugar, así que al
        // admin le llegaba "corté acá, no hice nada" pegado a un trabajo que
        // SÍ estaba hecho -- visto en vivo pidiendo activar el anuncio del
        // piano: primero el aviso de que cortó, y debajo el diagnóstico
        // completo de la campaña. Dos mensajes que se contradicen.
        const parcial = String(finalReply || "").trim();
        if (seAcaboElTiempo && parcial.length > 80) {
          const reply = paraMarkdown(toEmojiStyle(
            `${parcial}\n\n⏳ (Me quedé sin tiempo para seguir: lo de arriba es lo que alcancé. Si falta algo, pedime que continúe.)`,
          ));
          await saveArchitectTurn(tenantId, sessionId, "assistant", reply, { parcial: true });
          return finish({ reply, status: "partial", needsContinuation: true });
        }

        if (seAcaboElTiempo) {
          const reply = paraMarkdown(toEmojiStyle(
            // Antes decía "Lo que alcancé a averiguar quedó guardado", y se
            // leía como que el trabajo pedido había quedado guardado. No hay
            // nada guardado: se cortó el turno. Con lo sensible que resultó
            // este punto -- Atlas diciendo "guardado" sin guardar --, este
            // mensaje tiene que ser inequívoco.
            // ── Al admin NO se le cuentan las tripas ─────────────────────
            //
            // Acá salían el reparto por tramos y la lista de modelos que se
            // colgaron, con nombres de proveedores y segundos. El admin lo
            // dijo así: "los errores internos no deberían mostrarse, solo
            // decir que estamos tardando un poco".
            //
            // Tiene razón: que un modelo tarde o falle es problema NUESTRO.
            // El que lee esto quiere su anuncio, no un diagnóstico de
            // infraestructura que además no puede arreglar.
            //
            // El detalle NO se pierde: va completo al log y al campo `tramos`
            // de la respuesta, que es donde sirve. Cambia quién lo lee, no si
            // se registra.
            // ⚠️ Acá decía "decime *continuá* y sigo desde donde iba" -- y la
            // página YA continúa sola, hasta 4 veces. O sea: el mensaje le
            // pedía al admin algo que el sistema hacía por su cuenta. Lo vio
            // en vivo el 2026-09-03 y lo leyó como que se había colgado, que
            // es exactamente la impresión que este mensaje tenía que evitar.
            // Peor: si lo escribe, arranca un turno NUEVO y paga la vuelta de
            // nuevo.
            //
            // La instrucción la agrega la página, y solo cuando de verdad se
            // le acabaron las continuaciones automáticas.
            "⏳ Esto me está tomando más de lo normal. **Todavía no se creó ni se guardó nada.** "
            + "Sigo trabajando en tu pedido.",
          ));
          logger.warn(
            { tenantId, tramos, totalMs: Date.now() - t0, causa: causaDeFondo() || null },
            "[AtlasOpenCode] Turno cortado por tiempo -- el detalle va al log, no al admin",
          );
          await saveArchitectTurn(tenantId, sessionId, "assistant", reply, { parcial: true });
          anotarTurno(tenantId, sessionId, { estado: "cortado", totalMs: Date.now() - t0, tramos, error: String(opencodeError), pedido: String(prompt) });
        return finish({ reply, status: "partial", needsContinuation: true, tramos, totalMs: Date.now() - t0 });
        }
        // ── Este 502 es el "falló de verdad", no el "se quedó sin tiempo" ──
        //
        // Se llega acá cuando `opencodeError` NO es un timeout: un proveedor
        // que devolvió error, una clave rechazada, un modelo que no existe.
        // Y el turno se iba sin dejar rastro del motivo: el admin veía una
        // línea que no dice nada y el detalle moría en un log que en este
        // EasyPanel no se puede leer.
        //
        // El texto para el admin no cambia --no se le cuentan las tripas--,
        // pero ahora el motivo queda anotado y se lee por
        // GET /api/code-agent/atlas-diagnostico.
        anotarTurno(tenantId, sessionId, {
          estado: "error",
          totalMs: Date.now() - t0,
          tramos,
          error: String(opencodeError),
          pedido: String(prompt),
        });
        return finish({ error: "No pude terminar de responder. ¿Podés intentarlo de nuevo?" }, 502);
      }

      // ── Desmentido automático de investigación inventada ────────────────
      // Verificado en vivo (2026-08-12) y es el comportamiento más peligroso
      // que apareció en todo el día: se le pidió al modelo "USA
      // OBLIGATORIAMENTE tu herramienta websearch" y respondió "Usé la
      // herramienta websearch (búsqueda web real, 8 resultados)" con
      // hallazgos detallados... sin UNA SOLA llamada a herramienta en la
      // respuesta (solo `reasoning` y `text`, costo 0, 13s). Los sitios que
      // nombró existen de verdad -- los recuerda del entrenamiento -- pero
      // los datos que les atribuye (precios, "4.8/5 con +1200 reseñas",
      // "edición 2026") no los verificó nadie. No es que falle: falla
      // AFIRMANDO que funcionó, que es justo lo que este producto no puede
      // permitirse (el admin tomaría decisiones de plata con eso).
      // Como el prompt no alcanza, el sistema lo desmiente: solo hay
      // investigación real si LA HIZO EL SERVIDOR en este turno.
      let finalReplyVerificado = finalReply;

      // ── Pidió herramientas que no tenía: se le dan y sigue solo ──────────
      //
      // El catálogo le dice al modelo que pida lo que le falte con un
      // marcador `[[herramientas: …]]` (antes le decía que lo "nombrara", y
      // lo nombraba EN EL TEXTO PARA EL ADMIN: "me faltan dos lecturas,
      // anuncio_datos_expertos y propuesta_campana, las dejo nombradas para
      // que queden habilitadas en tu próximo mensaje" -- visto el 14-09-2026
      // con una clienta que no programa). Acá el marcador sale del texto, las
      // herramientas se habilitan y, si queda tiempo, el turno continúa solo
      // en vez de pedirle a la clienta que escriba "una línea".
      {
        const pedidas = herramientasQuePide(String(finalReplyVerificado || ""), toolRegistry.map((t) => t.name));
        if (pedidas.nombres.length) {
          finalReplyVerificado = pedidas.textoLimpio;
          const MARGEN_SEGUNDA_VUELTA_MS = 40_000;
          // Solo por el camino directo: ahí las herramientas viajan en la
          // llamada. Por OpenCode el puente ya quedó registrado con la lista
          // cerrada del token, y volver a montarlo no cabe en el turno.
          const puedeSeguir = directoDisponible() && !opencodeError && !fueDetenido(senalDeCorte) && turnDeadline - Date.now() > MARGEN_SEGUNDA_VUELTA_MS;
          logger.info({ tenantId, pedidas: pedidas.nombres, puedeSeguir }, "[AtlasOpenCode] Atlas pidió herramientas que no tenía");
          let resuelto = false;
          if (puedeSeguir) {
            toolRegistry = buildMcpToolRegistry(`${pedidoParaHerramientas}\n${pedidas.nombres.join(" ")}`);
            progreso("Revisando los datos de tu cuenta...");
            try {
              const r = await correrTurnoDirecto({
                system,
                herramientas: toolRegistry,
                mensaje:
                  `${text}\n\n[SISTEMA] Ya tenés habilitadas las herramientas que pediste (${pedidas.nombres.join(", ")}). ` +
                  `Usalas AHORA y entregá la respuesta completa y definitiva al mismo pedido. ` +
                  `No menciones herramientas, "lecturas", "turnos" ni nada interno: el admin no es técnico. ` +
                  `No le pidas que escriba nada para continuar.` +
                  (pedidas.textoLimpio ? `\n\nLo que alcanzaste a responder antes (no lo repitas, completalo):\n${pedidas.textoLimpio.slice(-4_000)}` : ""),
                ctx: { tenantId, sessionId, turnId, turnDeadline, objetivoDelAdmin: objetivoDelAdmin ?? undefined },
                apiKey: String(process.env.DEEPSEEK_API_KEY || ""),
                modelo: process.env.ATLAS_DIRECTO_MODELO || "deepseek-v4-flash",
                presupuestoMs: Math.max(turnDeadline - Date.now() - 10_000, 10_000),
                cancelSignal: senalDeCorte,
                onProgreso: progreso,
              });
              if (!r.error && r.texto && r.texto.trim()) {
                // Por si volvió a pedir algo: el marcador nunca llega al admin.
                finalReplyVerificado = herramientasQuePide(r.texto.trim(), toolRegistry.map((t) => t.name)).textoLimpio;
                resuelto = true;
              } else {
                logger.warn({ tenantId, err: r.error }, "[AtlasOpenCode] La segunda vuelta con herramientas falló");
              }
            } catch (e: any) {
              logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] Excepción en la segunda vuelta con herramientas");
            }
          }
          if (!resuelto) {
            // Quedan listas para el próximo turno, y al admin se le dice en
            // lenguaje normal qué hacer -- sin nombres técnicos.
            recordarHerramientasPedidas(tenantId, sessionId, pedidas.nombres);
            finalReplyVerificado =
              `${finalReplyVerificado ? finalReplyVerificado + "\n\n" : ""}` +
              `Necesito revisar un par de datos más de tu cuenta para terminar esto. Respondé *dale* y te lo entrego completo.`;
          }
        }
      }


      // ── Seguir solo con las partes que falten, mientras quede tiempo ─────
      // Antes, un pedido de varias partes resolvía la primera y le pedía al
      // admin que escribiera "seguí" por cada una. Pedido explícito del admin
      // (2026-08-15): "necesito que todo lo haga Atlas, no yo". Y tenía
      // razón: encargarle el ciclo completo de un producto y que devuelva
      // solo la investigación, pidiendo permiso para continuar, no es un
      // asistente autónomo.
      //
      // El corte original no era un capricho: el turno vive dentro de una
      // petición HTTP y el proxy corta cerca de los 150s. Por eso acá se
      // sigue SOLO mientras el reloj del turno lo permita -- mismo criterio
      // que la "insistencia dirigida" de más abajo. Si el tiempo se acaba con
      // partes sin hacer, ahí sí se le dice al admin cuáles quedaron, en vez
      // de fingir que se hizo todo.
      const MARGEN_POR_PARTE_MS = 45_000;
      while (
        partesPendientes.length > 0 &&
        (directoDisponible() || (sesionOpencode && modeloUsado)) &&
        !opencodeError &&
        // Detenido: no se arranca otra parte. Es el tramo que más se nota,
        // porque cada parte pendiente se lleva sus propios ~45s.
        !fueDetenido(senalDeCorte) &&
        turnDeadline - Date.now() > MARGEN_POR_PARTE_MS
      ) {
        const siguiente = partesPendientes.shift()!;
        logger.info({ tenantId, parte: siguiente.slice(0, 60) }, "[AtlasOpenCode] Sigo solo con la parte siguiente");
        progreso(`Sigo con: ${siguiente.slice(0, 40)}...`);
        try {
          const instruccionParte =
            `[SISTEMA] Seguí vos solo con la parte siguiente del mismo pedido: "${siguiente}". ` +
            `Usá lo que ya averiguaste recién, no vuelvas a investigar lo mismo. ` +
            `No le pidas permiso al admin para continuar: resolvela y, si hay que crear o cambiar algo, ` +
            `proponelo con propose_action.`;
          const r = directoDisponible()
            ? await correrTurnoDirecto({
                system,
                herramientas: toolRegistry,
                mensaje: `${text}\n\n${instruccionParte}\n\nTrabajo ya completado en este turno:\n${finalReplyVerificado.slice(-6_000)}`,
                ctx: { tenantId, sessionId, turnId, turnDeadline, objetivoDelAdmin: objetivoDelAdmin ?? undefined },
                apiKey: String(process.env.DEEPSEEK_API_KEY || ""),
                modelo: process.env.ATLAS_DIRECTO_MODELO || "deepseek-v4-flash",
                presupuestoMs: Math.max(turnDeadline - Date.now() - 10_000, 10_000),
                cancelSignal: senalDeCorte,
                onProgreso: progreso,
              }).then((resultado) => ({ text: resultado.texto, error: resultado.error }))
            : await sendOpencodeMessage(cfg.host, cfg.authHeader, sesionOpencode, {
                system,
                model: modeloUsado!,
                tools,
                text: instruccionParte,
                timeoutMs: Math.max(turnDeadline - Date.now() - 10_000, 20_000),
                cancelSignal: senalDeCorte,
              });
          if (r.error) {
            logger.warn({ tenantId, err: r.error }, "[AtlasOpenCode] La parte siguiente falló, corto acá");
            partesPendientes.unshift(siguiente);
            break;
          }
          if (r.text) {
            // ── Se entrega AHORA, no al final del turno ───────────────────
            //
            // Con ~45s por parte y 135s de presupuesto, un turno que se cortaba
            // en la parte 3 entregaba CERO: las dos que YA estaban hechas se
            // perdían con él. Ahora cada una sale apenas está lista, y lo
            // entregado queda entregado aunque el turno se muera después.
            //
            // Se sigue acumulando en `finalReplyVerificado` igual que antes,
            // porque los candados del final (el de "ya lo hice" sin haberlo
            // hecho, el de las promesas, el supervisor) tienen que juzgar TODO
            // lo que se dijo en el turno y no solo el último pedazo. Al cerrar
            // se resta lo ya entregado para no repetirlo en pantalla.
            // Ver lib/entrega-por-partes.ts.
            const textoParte = r.text.trim();
            finalReplyVerificado = `${finalReplyVerificado}\n\n${textoParte}`.trim();
            const paraMostrar = paraMarkdown(toEmojiStyle(textoParte));
            // El texto completo acumula la versión cruda. Guardar la versión
            // formateada hacía que el cierre no pudiera encontrarla y la
            // repitiera completa al final (también volvía a leerla por voz).
            partesEntregadas.push(textoParte);
            sse("avance", { reply: paraMostrar });
            await saveArchitectTurn(tenantId, sessionId, "assistant", paraMostrar);
            logger.info({ tenantId, largo: paraMostrar.length }, "[AtlasOpenCode] Parte entregada en el momento");
          }
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] Excepción en la parte siguiente, corto acá");
          partesPendientes.unshift(siguiente);
          break;
        }
      }

      // Lo que NO alcanzó a entrar en el turno se dice tal cual. Sin esto
      // parecería que Atlas ignoró la mitad de lo que pidió.
      if (partesPendientes.length && finalReplyVerificado) {
        finalReplyVerificado +=
          `\n\n📋 No me alcanzó el tiempo del turno para todo. Falta:\n` +
          partesPendientes.map((p, i) => `${i + 1}. ${p}`).join("\n") +
          `\n\nDecime "seguí" y lo termino.`;
      }
      const AFIRMA_HABER_INVESTIGADO = /\b(busqu[ée]|investigu[ée]|seg[uú]n (?:mi|la) (?:b[uú]squeda|investigaci[oó]n)|us[ée] (?:la herramienta )?(?:websearch|web_search)|resultados reales|encontr[ée] en internet|fuentes? (?:reales?|encontradas?))/i;
      if (!huboInvestigacionReal && AFIRMA_HABER_INVESTIGADO.test(finalReplyVerificado || "")) {
        logger.warn({ tenantId, sessionId }, "[AtlasOpenCode] El modelo afirmó haber investigado sin que hubiera búsqueda real -- se corrige la respuesta");
        // ── La corrección va ARRIBA, no al final ──────────────────────────
        //
        // ⚠️ Esto se agregaba DESPUÉS del texto, y con eso el mensaje se
        // contradecía solo: arriba decía "busqué en la Biblioteca de Anuncios
        // hoy mismo" y treinta líneas después "NO se hizo ninguna búsqueda
        // web real". El admin lo describió así: *"nunca debe afirmar que
        // ejecutó una consulta y luego desmentirse dentro del mismo mensaje"*.
        //
        // Y el repo YA había aprendido esto: el aviso de "todavía no se guardó
        // nada" se mueve arriba por este mismo motivo, con un comentario que
        // dice "el admin lee de arriba hacia abajo y se queda con lo primero".
        // Se arregló ese camino y este quedó igual -- el mismo patrón de
        // arreglar un gemelo y dejar el otro.
        //
        // Puesto ARRIBA, lo primero que se lee es qué NO pasó, y todo lo de
        // abajo se lee ya sabiendo que es propuesta y no observación.
        finalReplyVerificado =
          `⚠️ **Antes de leer lo de abajo:** en este turno NO consulté la Biblioteca de Anuncios ni busqué en la web. ` +
          `Lo que sigue sale del conocimiento general del modelo y de los datos de tu producto, NO de anuncios que estén al aire hoy. ` +
          `Tomalo como propuesta, no como observación verificada.\n\n` +
          `Si querés que compare con lo que de verdad está corriendo en Meta, pedímelo y lo consulto antes de que decidas nada.\n\n---\n\n` +
          `${finalReplyVerificado}`;
      }

      // ── Números del negocio que NO se leyeron ────────────────────────────
      // Se lo vio informarle al admin "1 lead · 4 conversaciones activas"
      // cuando el panel mostraba 5 y 23. No es que Atlas lea de otra fuente:
      // dashboard_summary y el endpoint del panel corren la MISMA consulta,
      // con el mismo filtro de tenant y el mismo conteo. O sea que esos
      // números no salieron de ninguna consulta: los recordó de un turno
      // viejo o los inventó. Y el admin toma decisiones con eso.
      const AFIRMA_NUMEROS = /\b\d+\s*(leads?|prospectos?|conversaciones?|ventas?\s+cerradas?|tratos?)\b|\bconversi[oó]n\b[^.\n]{0,20}?\d+\s*%|\bingresos?\s+(?:de|del mes)?\s*\$?\s*[\d.,]+/i;
      const lecturas = await lecturasDelTurno(tenantId, turnId);
      // ── La lista nombraba DOS herramientas que no existen ────────────────
      //
      // Preguntado por el admin el 2026-09-03: "Atlas dice que esto no fue
      // consultado cuando sí; ¿cómo saber si consultó algo o no?".
      //
      // Acá decía `["dashboard_summary", "list_recent_conversations",
      // "list_leads", "sales_report"]`. Las dos últimas NO EXISTEN: buscadas
      // en todo el repo, aparecen únicamente en esta línea. Son nombres que
      // alguien supuso, no herramientas registradas.
      //
      // O sea que el aviso se disparaba en un caso perfectamente legítimo: si
      // Atlas leía los datos con cualquier otra herramienta real, la lista no
      // la reconocía y el mensaje quedaba marcado como "no consultado" aunque
      // sí lo estuviera. Un aviso que se dispara sobre trabajo bien hecho es
      // peor que ninguno: enseña a ignorarlo.
      //
      // Segunda vuelta (2026-09-11): la lista corregida seguía siendo una
      // lista a mano de 7 nombres, y volvió a disparar sobre trabajo bien
      // hecho -- `marketing_diagnostico` trajo "7 leads, 330 mensajes, 0
      // pagos" de la base y el aviso dijo que no se habían consultado. Ya no
      // se enumera: cualquier herramienta de LECTURA registrada cuenta como
      // consulta (READ_ONLY_TOOLS es la fuente de verdad de cuáles leen).
      const leyoMetricas = lecturas.some((t) => isReadOnlyTool(t));
      if (!leyoMetricas && AFIRMA_NUMEROS.test(finalReplyVerificado || "")) {
        logger.warn({ tenantId, sessionId, lecturas }, "[AtlasOpenCode] Dio números del negocio sin consultarlos -- se corrige la respuesta");
        finalReplyVerificado =
          `${finalReplyVerificado}\n\n⚠️ Aviso automático: los números de arriba NO se consultaron en este mensaje, ` +
          `así que pueden estar viejos o equivocados. Miralos en el panel, o pedime que los consulte y te los traigo del dato real.`;
      }

      // ── Afirmar que revisó Facebook sin haberlo consultado ───────────────
      // Caso real (16-08-2026): el admin preguntó si su campaña de piano
      // seguía pausada y Atlas contestó "revisión en ambas cuentas de Facebook
      // Ads: la campaña no existe en ninguna de las dos". Hay UNA sola cuenta
      // publicitaria configurada, y no llamó ninguna herramienta de Facebook.
      // Inventó el alcance de una revisión que no hizo, sobre una campaña que
      // el admin había pausado con su propia mano.
      const AFIRMA_REVISO_META =
        /\b(revis|verifi|consult|busqu|chequ)\w*[^.\n]{0,60}\b(facebook|meta|ads?\b|campa[ñn]a)/i;
      const NIEGA_EXISTENCIA = /\bno (existe|hay|tiene|aparece|encontr)\w*/i;
      const TOOLS_META = ["fb_list_campaigns", "fb_campaign_metrics", "fb_status", "fb_list_adsets", "fb_list_drafts"];
      const consultoMeta = lecturas.some((t) => TOOLS_META.includes(t));
      const textoFinal = String(finalReplyVerificado || "");
      if (!consultoMeta && AFIRMA_REVISO_META.test(textoFinal) && NIEGA_EXISTENCIA.test(textoFinal)) {
        logger.warn({ tenantId, sessionId, lecturas }, "[AtlasOpenCode] Afirmó haber revisado Meta sin consultarlo -- se corrige");
        finalReplyVerificado =
          `⚠️ **No consulté Meta en este mensaje**, así que no puedo afirmar que algo no exista allá. `
          + `Pedime que lo revise y consulto la cuenta publicitaria de verdad.\n\n---\n\n${textoFinal}`;
      }

      let plannedActions = await drainDraftPlan(tenantId, turnId);

      // ¿El modelo dio por hecho un trabajo que no ejecutó? Se decide acá
      // abajo, pero la aclaración se REDACTA al final del turno: depende de si
      // al cierre quedó o no un plan esperando confirmación, y eso todavía
      // puede cambiar (la insistencia corre después).
      let avisarQueNoEjecuto = false;

      // ── "Ya lo hice" cuando NO hizo nada ─────────────────────────────────
      // El problema más grave de todos, reportado por el admin con la
      // conversación entera en la mano (2026-08-12): Atlas escribía
      // "✅ 3 anuncios creados en pausa" con presupuesto y segmentación
      // detallados... y justo debajo aparecía el plan pidiendo confirmación
      // para crearlos. O sea: NO había creado nada y lo daba por hecho. Lo
      // mismo con "✅ Listos los 3 borradores, guardados localmente".
      //
      // En este punto del código sabemos la verdad: si estamos acá, NO se
      // ejecutó ninguna acción (la ejecución real ocurre en la rama de
      // aprobación, que retorna mucho antes). Así que cualquier "ya está
      // hecho" es falso por definición y se corrige antes de mostrarlo.
      // El candado NO puede depender de que haya un plan propuesto.
      //
      // Antes exigía `plannedActions.length > 0`, y el peor caso es justo el
      // contrario: auditoría del 16-08-2026, 2 de 2 intentos de crear un
      // anuncio. Atlas contestó "✅ Campos guardados y valores: … Presupuesto
      // diario: $10.000 … Estado: PAUSED" SIN proponer ningún plan y sin
      // llamar ninguna herramienta -- no hubo un solo POST a la API en toda la
      // traza de red. En la base de datos no quedó nada. Como no había plan,
      // el candado no se activaba y el admin se quedaba creyendo que su
      // anuncio existía.
      //
      // Acá sabemos la verdad sin preguntarle al texto: si la ejecución llegó
      // a este punto, NO se ejecutó ninguna acción de escritura -- la
      // ejecución real ocurre en la rama de aprobación, que retorna mucho
      // antes. Así que cualquier "ya está hecho" es falso POR CONSTRUCCIÓN,
      // haya plan o no.
      // La lista CERRADA de verbos era el agujero. Medido en vivo
      // (2026-08-19): Atlas contestó "✅ Borrador 89 subido a Meta en pausa.
      // 📂 La campaña quedó pausada" y Meta devolvía {"campaigns":[]} -- no
      // existía nada. "subido" y "pausada" no estaban en la lista, así que el
      // candado no se activó y el admin quedó creyendo que tenía un anuncio
      // en su cuenta.
      //
      // Perseguir verbos uno por uno es perder siempre: cada palabra que no
      // anticipamos es una mentira que pasa. En castellano los participios
      // terminan en -ado/-ido (con sus femeninos y plurales), así que se
      // reconoce la FORMA en vez de enumerar significados: subido, pausada,
      // creado, guardada, publicados, cargado, lo que venga.
      //
      // 🔻 CORREGIDO el 2026-09-03. Acá decía "un falso positivo no hace daño:
      // la aclaración es cierta SIEMPRE que llegue hasta acá". Lo primero es
      // verdad y lo segundo también, pero juntos llevaron a la conclusión
      // equivocada: el aviso no solo aclara, además le ORDENA al admin
      // "pedímelo de nuevo para que lo registre de verdad". Sobre un mensaje
      // que sí tenía plan esperando el sí, hacerle caso termina en el anuncio
      // duplicado -- lo mismo contra lo que advierte `sinAccionesRepetidas`
      // treinta líneas más abajo. Y un aviso que sale siempre deja de leerse.
      //
      // La regla vive en `lib/afirma-haberlo-hecho.ts`, con pruebas contra el
      // chat real. Estaba escrita acá adentro y no distinguía el participio
      // del SUSTANTIVO: "copy + estado", "✅ Problema identificado" y hasta
      // "Sigo trabajando en tu pedido" --que lo escribe el propio latido del
      // servidor-- disparaban el aviso. Se vio dos veces en una sola pantalla
      // el 2026-09-03, una de ellas encabezando un mensaje que SÍ tenía plan y
      // terminaba en "¿Confirmás?".
      const AFIRMA_HABERLO_HECHO = afirmaHaberloHecho(String(finalReplyVerificado || ""));

      if (AFIRMA_HABERLO_HECHO) {
        logger.warn(
          { tenantId, sessionId, teniaPlan: plannedActions.length > 0 },
          "[AtlasOpenCode] El modelo dijo que ya había hecho el trabajo sin ejecutar NADA -- se corrige",
        );
        // Solo se ANOTA que hay que aclararlo; el texto se arma al final.
        //
        // Acá se redactaba la aclaración en el acto, y eso producía un mensaje
        // que se contradecía con su propio `status` (visto en vivo el
        // 2026-08-19): el admin leía "no quedó ninguna acción pendiente de
        // confirmar, pedímelo de nuevo" en un turno que respondía
        // `status: "awaiting_confirmation"` y que SÍ tenía plan esperando su
        // sí. El motivo es de orden: en este punto `plannedActions` todavía
        // puede estar vacío porque la insistencia -- que es la que consigue
        // que el modelo llame a la herramienta -- corre MÁS ABAJO. La frase
        // se escribía sobre un dato que aún no estaba decidido.
        //
        // Y no es cosmético: si el admin hace lo que le dice ese texto y lo
        // pide de nuevo, termina con el anuncio duplicado.
        avisarQueNoEjecuto = true;
      }

      // ── Preguntar y proponer a la vez es contradictorio ──────────────────
      // Visto en vivo (2026-08-12): Atlas preguntó "¿para cuál curso querés
      // el copy?" y en el MISMO mensaje propuso un plan para el producto 123.
      // El admin no sabe si le están preguntando o pidiéndole confirmar, y si
      // confirma sin querer se ejecuta sobre un producto que él nunca eligió.
      // Pedido explícito del admin: "antes de ponerse a inventar debería
      // pedir la información si no se la dan".
      //
      // Si la respuesta termina preguntando por un dato que falta, se
      // descarta el plan: primero se responde la pregunta, después se
      // propone. La pregunta queda; lo que se cae es la acción a medias.
      // Se mira solo el CIERRE de la respuesta (últimos 250 caracteres): una
      // pregunta por un dato faltante va al final. Así no se confunde con una
      // pregunta retórica en el medio del texto. "¿Confirmas?" no entra
      // porque no pide un dato, pide una decisión sobre algo ya armado.
      const PIDE_UN_DATO = /¿\s*(para |de |con |a )?(cu[aá]l|qu[eé]|cu[aá]nto|qui[eé]n|d[oó]nde)\b[^?]{0,140}\?/i;
      const cierre = String(finalReply || "").trim().slice(-250);
      const terminaPreguntando = PIDE_UN_DATO.test(cierre);
      if (terminaPreguntando && plannedActions.length > 0) {
        logger.info(
          { tenantId, acciones: plannedActions.length },
          "[AtlasOpenCode] El modelo preguntó y propuso a la vez -- se descarta el plan y queda la pregunta",
        );
        await clearPendingPlan(tenantId, sessionId).catch(() => undefined);
        plannedActions = [];
      }

      // ── Insistencia dirigida cuando pidió una acción y no la ejecutó ─────
      // Verificado en vivo (2026-08-12): ante "creá el anuncio", el modelo
      // redacta un copy excelente, pregunta "¿te gusta?" y NO llama
      // fb_ad_draft. El admin se queda creyendo que tiene un anuncio guardado
      // cuando no existe nada. Las "5 reglas" del prompt arreglaron inventar
      // ofertas y dejar huecos, pero NO esto -- que es exactamente lo que ya
      // sabíamos: lo que hay que EJECUTAR no se garantiza por prompt.
      //
      // En vez de adivinar el copy desde el texto (frágil) o de rendirse, se
      // le manda un segundo pedido corto EN LA MISMA SESIÓN: ya tiene el
      // copy que escribió, solo le falta guardarlo. Si igual no lo hace, se
      // le avisa al admin con honestidad en vez de dejarlo creyendo que sí.
      // "subí" faltaba, y era justo el verbo del paso que más importa.
      // Medido en vivo (2026-08-19): a "Subí el borrador 89 a Meta EN PAUSA"
      // Atlas contestó "✅ subido" sin llamar nada, y como el pedido no
      // matcheaba ningún verbo de acción, la insistencia ni se intentó.
      const PEDIDO_DE_ACCION = /\b(cre[aá]|prepar[aá]|arm[aá]|gener[aá]|hac[eé]|publi[cq]|guard[aá]|sub[ií]|carg[aá]|activ[aá]|paus[aá]|segu[ií]|contin[uú])/i;
      const MENCIONA_ANUNCIO = /\b(anuncio|campa|ad\b|publicaci[oó]n|post)\b/i;

      // Que el modelo YA HAYA REDACTADO el anuncio vale como pedido, aunque el
      // último mensaje del admin no lo diga.
      //
      // Medido en vivo (2026-08-18): el admin pidió el anuncio, Atlas preguntó
      // cuál producto, el admin contestó "El correcto es PACK EDUCA A TU PERRO,
      // seguí vos con todo" y Atlas redactó el anuncio ENTERO sin guardarlo.
      // Mirando solo ese mensaje, el pedido de crear quedaba dos turnos atrás.
      // Peor todavía con un "si, confirmo" a secas.
      //
      // Mirar lo que el modelo ESCRIBIÓ es más confiable que adivinar la
      // intención del admin: si en la respuesta hay un anuncio redactado y no
      // se guardó nada, hay que insistir, sin importar cómo se pidió.
      const REDACTO_UN_ANUNCIO =
        /(🔥\s*GANCHO|TEXTO PRINCIPAL|📝\s*Borrador de anuncio|borrador de anuncio (listo|preparado)|📌\s*TITULAR)/i
          .test(String(finalReplyVerificado || ""));
      const pidioCrearAlgo =
        (PEDIDO_DE_ACCION.test(String(prompt)) && MENCIONA_ANUNCIO.test(String(prompt)))
        || REDACTO_UN_ANUNCIO;
      const quedaTiempo = turnDeadline - Date.now() > 25_000;

      // Si Atlas está PREGUNTANDO algo, no guardar es lo correcto.
      //
      // Antes esto se disparaba con cualquier pedido que mencionara crear un
      // anuncio, sin mirar qué había contestado. Resultado (re-auditoría del
      // 16-08-2026): a un mensaje donde Atlas solo preguntaba "¿Continúo?
      // Decime sí o el nombre del producto" se le pegaba "⚠️ esto quedó solo
      // como texto en el chat, NO se guardó como borrador". No había nada que
      // guardar: estaba pidiendo el dato que le faltaba, que es justo lo que
      // le pedimos que haga antes de inventar.
      //
      // PERO tiene que ser una pregunta por un DATO QUE FALTA, no un "¿te
      // gusta?" sobre algo que ya escribió. El patrón viejo se activaba con
      // cualquier "?" o cualquier "decime", y el modelo cierra CASI SIEMPRE
      // pidiendo confirmación -- así que la insistencia no se disparaba nunca.
      //
      // Medido en vivo (2026-08-18): Atlas redactó el anuncio completo y
      // cerró con "¿Confirmás este borrador? ... Si preferís otra foto,
      // decime y la buscamos". Eso hacía `estaPreguntando = true`, se saltaba
      // la insistencia, y el turno terminaba con CERO borradores guardados
      // pese a que el admin ya había confirmado dos veces. En toda esa
      // conversación no se guardó ni un anuncio.
      //
      // Terminar preguntando es, en los hechos, una salida de emergencia
      // infinita: mientras cierre con una pregunta, nunca tiene que ejecutar.
      // Ahora solo cuenta como pregunta legítima la que pide un dato que el
      // modelo NO puede sacar solo (cuál producto, qué nombre, cuánto
      // presupuesto). Pedir aprobación no lo exime de guardar: para eso está
      // el plan propuesto, que ya le pide confirmación al admin igual.
      const PIDE_DATO_FALTANTE =
        /¿\s*(para |de |con |a |en )?(cu[aá]l|qu[eé]|cu[aá]nto|qui[eé]n|d[oó]nde|c[oó]mo se llama)\b[^?]{0,140}\?/i;
      // "Confirmame cuál es el correcto" es una pregunta legítima aunque no
      // lleve signo de interrogación -- le falta un dato que solo el admin
      // tiene. Se reconoce por el "cuál", que es lo que separa "elegí entre
      // estos" de "¿te gusta lo que escribí?".
      const PIDE_QUE_ELIJA =
        /\b(decime (el|la|cu[aá]l|qu[eé]|c[oó]mo)|(confirmame|decidme|indicame|pasame) cu[aá]l|cu[aá]l (es el|de (los|las|ellos))|necesito que me (digas|pases)|me falta saber|para cu[aá]l|respond[eé] con el n[uú]mero)\b/i;
      const cierreRespuesta = String(finalReplyVerificado || "").slice(-400);
      const estaPreguntando =
        PIDE_DATO_FALTANTE.test(cierreRespuesta) || PIDE_QUE_ELIJA.test(cierreRespuesta);

      if (pidioCrearAlgo && !estaPreguntando && plannedActions.length === 0 && sesionOpencode && modeloUsado && quedaTiempo && !opencodeError) {
        logger.info({ tenantId, sessionId }, "[AtlasOpenCode] Pidió crear algo y no llamó ninguna herramienta -- se insiste una vez");
        progreso("Guardando lo que preparé...");
        try {
          await sendOpencodeMessage(cfg.host, cfg.authHeader, sesionOpencode, {
            system,
            model: modeloUsado,
            tools,
            // El texto viejo le decía "llamá fb_ad_draft" a secas, y por acá
            // eso NO existe: fb_ad_draft es de mutación, así que la única vía
            // es propose_action con tool="fb_ad_draft". Verificado en vivo el
            // 18-08-2026: el modelo terminó proponiendo fb_upload_draft_to_meta
            // con draftId null -- intentando subir a Meta un borrador que
            // nunca había creado, porque nadie le dijo cuál era el paso 1.
            // El camino correcto ahora es `crear_anuncio`, no la cadena vieja.
            //
            // Este texto seguía dictando fb_ad_draft, que obliga al modelo a
            // haber leído el productId y a copiar el copy entero en los
            // argumentos: justo las idas y vueltas que `crear_anuncio` viene a
            // eliminar haciendo el trabajo en el backend. Visto en vivo el
            // 19-08-2026: el turno YA no se corta por tiempo, pero el modelo
            // seguía escribiendo en el chat sin llamar nada porque la
            // insistencia lo mandaba por la ruta larga.
            text:
              "[SISTEMA] Escribiste el anuncio pero NO lo guardaste: no llamaste ninguna herramienta, " +
              "así que del lado del admin no existe nada.\n\n" +
              "Llamá AHORA `propose_action` con:\n" +
              '  tool: "crear_anuncio"\n' +
              '  args: { "producto": "<el nombre del producto tal como lo dijo el admin>", ' +
              '"dailyBudget": <el presupuesto diario que dijo el admin>, ' +
              '"subirAMeta": <true solo si pidió subirlo o publicarlo, si no false> }\n\n' +
              "Reglas de este paso:\n" +
              "- NO necesitás el id del producto ni copiar el copy: `crear_anuncio` busca el producto, arma el brief, " +
              "escribe el texto con los datos reales, lo valida y guarda el borrador. Todo eso lo hace el servidor.\n" +
              "- Si el admin NO dijo un presupuesto, no lo inventes: preguntáselo, es su plata.\n" +
              "- No vuelvas a escribir el copy en el chat ni pidas confirmación otra vez: el sistema ya le muestra " +
              "la propuesta al admin y le pide el sí. Solo hacé la llamada.",
            timeoutMs: Math.max(turnDeadline - Date.now() - 5_000, 15_000),
            cancelSignal: senalDeCorte,
          });
          plannedActions = await drainDraftPlan(tenantId, turnId);
        } catch (e: any) {
          logger.warn({ tenantId, err: e?.message }, "[AtlasOpenCode] La insistencia falló");
        }

        // Si el candado de arriba ya se activó, la aclaración del cierre dice
        // exactamente esto y con más precisión -- repetirlo son dos avisos
        // seguidos diciendo lo mismo.
        if (plannedActions.length === 0 && !avisarQueNoEjecuto) {
          // Que el admin NO se quede pensando que tiene algo guardado.
          finalReplyVerificado =
            `${finalReplyVerificado}\n\n⚠️ Aviso automático: esto quedó solo como texto en el chat, ` +
            `NO se guardó como borrador en el sistema. Pedímelo de nuevo (por ejemplo "guardá ese anuncio") ` +
            `y lo registro de verdad.`;
        }
      }

      // ── La misma acción, una sola vez ──────────────────────────────────
      //
      // Al admin le salió un plan con TRES acciones para el mismo anuncio
      // (2026-08-30), dos de ellas idénticas salvo por un acento:
      //
      //   Crear el anuncio de "...AGENTES AUTONOM" con $15.000/día
      //   Crear el anuncio de "...AGENTES AUTONOM" con $15.000/día
      //   Crear el anuncio de "...AGENTES AUTÓNOM" con $15.000/día
      //
      // Confirmar eso crea tres campañas cuando pidió una. El plan se arma
      // sumando lo que el modelo propone en varias vueltas del turno, y nadie
      // miraba si ya estaba propuesto.
      //
      // Se compara sin acentos ni mayúsculas a propósito: el modelo escribe el
      // mismo nombre de producto de las dos formas y son la MISMA acción.
      plannedActions = sinAccionesRepetidas(plannedActions);

      // ── Recién ahora se sabe si quedó algo pendiente ─────────────────────
      // `plannedActions` ya es definitivo: pasó el drenaje inicial, el reseteo
      // por "termina preguntando" y la insistencia. La corrección va ARRIBA y
      // no al final porque puesta abajo el mensaje se contradecía solo -- decía
      // "Borrador guardado:" y dos líneas después "NO se guardó", y el admin
      // lee de arriba hacia abajo y se queda con lo primero.
      if (avisarQueNoEjecuto) {
        finalReplyVerificado = (plannedActions.length > 0
          // Una línea cada uno: el aviso salía en TRES renglones arriba de
          // cada respuesta y el admin lo leía diez veces por sesión (11-09-2026).
          ? `⚠️ **Todavía no se guardó nada.** Es una propuesta: se ejecuta cuando confirmés.`
          : `⚠️ **Todavía no se guardó nada.** Esto es solo texto; si querés que lo haga, pedímelo.`)
          + `\n\n---\n\n${finalReplyVerificado}`;
      }

      // ── LO QUE SALE TIENE QUE SER UNA RESPUESTA ─────────────────────────
      //
      // Visto en vivo el 2026-09-02: el admin pidió un análisis de mercado, el
      // motor se quedó sin contexto a mitad del turno, se compactó, y le
      // publicó el RESUMEN DE TRASPASO -- "Goal / Discoveries / Remaining
      // Tasks / Relevant files / Prompt for next agent", en inglés y con notas
      // de sistema adentro. El propio texto decía "Market analysis summary was
      // NOT yet delivered to the admin".
      //
      // La REGLA CERO del prompt ("contestás siempre en español") no puede
      // atajar esto: ese resumen no lo escribe Atlas siguiendo su prompt, lo
      // escribe el motor con SU plantilla interna, que nunca vio la regla. Por
      // eso el chequeo va acá, sobre el texto ya terminado, y no como otra
      // instrucción al modelo.
      if (esResumenInterno(finalReplyVerificado) || pareceIngles(finalReplyVerificado)) {
        logger.warn(
          { tenantId, sessionId, largo: finalReplyVerificado.length, resumen: esResumenInterno(finalReplyVerificado) },
          "[AtlasOpenCode] La respuesta era un resumen interno o quedó en inglés: no se publica",
        );
        finalReplyVerificado = avisoDeTurnoIncompleto();
      }

      if (plannedActions.length > 0) {
        const planText = plannedActions.map((a, i) => `${i + 1}. ${describePlannedAction(a)}`).join("\n");
        const reply = paraMarkdown(toEmojiStyle(
          `${finalReplyVerificado ? finalReplyVerificado + "\n\n" : ""}📋 Plan propuesto (requiere tu confirmación):\n${planText}\n\n❓ ¿Confirmas? Responde sí para ejecutar, o dime qué ajusto.`,
        ));
        await setPendingPlan(tenantId, sessionId, plannedActions, reply);
        await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
        logger.info({ tenantId, planned: plannedActions.length }, "[AtlasOpenCode] Plan propuesto, esperando confirmación");
        logger.info(
          { tenantId, tramos, totalMs: Date.now() - t0, acciones: plannedActions.length },
          "[AtlasOpenCode] Turno COMPLETO -- reparto real del tiempo",
        );
        return finish({ reply, plan: plannedActions, status: "awaiting_confirmation", tramos, totalMs: Date.now() - t0 });
      }

      // Lo que ya se entregó parte por parte no se repite en el cierre: el
      // admin acaba de leerlo. Los avisos que los candados agregaron arriba o
      // abajo SÍ van, porque son nuevos -- por eso se resta el texto exacto de
      // cada parte y no se corta por longitud. Ver lib/entrega-por-partes.ts.
      const textoDeCierre = mensajeDeCierre(String(finalReplyVerificado || ""), partesEntregadas);

      // ── El turno terminó sin una sola palabra que entregar ───────────────
      //
      // Acá salía "No tengo una respuesta para eso todavía." -- un callejón
      // sin salida que no dice qué pasó ni qué hacer, y que encima suena a que
      // el pedido era raro cuando el pedido estaba perfecto. Visto en vivo el
      // 2026-09-04: el admin pidió que el copy usara los emoji del catálogo en
      // vez de cuatro ✅ iguales, y recibió eso.
      //
      // Y lo peor no se veía en el chat: su mensaje descartó el plan que
      // esperaba confirmación, así que se quedó sin respuesta Y sin el
      // borrador. Se le devuelve el plan, porque quedarse con el viejo es
      // mejor que quedarse sin nada.
      let cierreParaElAdmin = textoDeCierre;
      if (!cierreParaElAdmin) {
        const devuelto = Array.isArray(planDescartado) ? planDescartado : [];
        if (devuelto.length > 0) {
          await setPendingPlan(tenantId, sessionId, devuelto, "").catch(() => undefined);
        }
        cierreParaElAdmin = avisoDeCierreVacio(devuelto.map((a: any) => describePlannedAction(a)), tramosTexto());
        logger.warn(
          { tenantId, sessionId, planDevuelto: devuelto.length, tramos },
          "[AtlasOpenCode] El turno no produjo texto: se avisa con el motivo y se devuelve el plan pendiente",
        );
      }
      const reply = paraMarkdown(toEmojiStyle(cierreParaElAdmin));
      // Las partes ya se guardaron una por una al entregarlas; guardar el
      // cierre otra vez con el texto completo dejaría la conversación con todo
      // duplicado, y esa conversación es la memoria que Atlas relee después.
      await saveArchitectTurn(tenantId, sessionId, "assistant", reply);
      // ── Cuánto tardó y en qué ───────────────────────────────────────────
      //
      // El desglose de tramos existía desde el 2026-08-19 pero SOLO se
      // registraba cuando el turno se cortaba. Un turno que termina bien pero
      // tarda 98 segundos --medido hoy con un pedido de anuncio-- no dejaba
      // ninguna medición: para el sistema fue un éxito y punto.
      //
      // Y es el caso que más importa, porque es el que ve el admin: la
      // respuesta llega, pero llega tan tarde que la pantalla parece muerta.
      // Sin este log, diagnosticar la lentitud vuelve a ser adivinar -- que es
      // exactamente lo que el comentario de arriba dice que hay que evitar.
      logger.info(
        { tenantId, tramos, totalMs: Date.now() - t0 },
        "[AtlasOpenCode] Turno COMPLETO -- reparto real del tiempo",
      );
      anotarTurno(tenantId, sessionId, {
        estado: "completo",
        totalMs: Date.now() - t0,
        tramos,
        modelo: modeloUsado?.modelID ?? null,
        pedido: String(prompt),
        // Qué consultó de verdad este turno. Es la respuesta a "¿cómo sé si
        // consultó algo o no?": se mira, no se discute.
        lecturas,
      });
      return finish({
        reply,
        status: partesPendientes.length > 0 ? "partial" : "info",
        needsContinuation: partesPendientes.length > 0,
        tramos,
        totalMs: Date.now() - t0,
      });
    } finally {
      clearInterval(heartbeat);
      // El turno dejó de estar en vuelo pase lo que pase: si esto no corre, el
      // botón de Detener queda ofrecido para un turno que ya no existe.
      terminarTurno(claveTurno);
    }
  } catch (e) {
    logger.error(e, "[AtlasOpenCode] Error inesperado");
    // Mismo motivo que /operator: con streaming las cabeceras ya salieron,
    // así que el manejador de errores por defecto de Express no puede mandar
    // su propio JSON con otro código de estado -- se cierra con un evento
    // de error SSE en vez de dejar la conexión colgada.
    if (!res.headersSent) return next(e);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "turno interrumpido" })}\n\n`);
    } catch { /* la conexión ya estaba cerrada */ }
    if (!res.writableEnded) res.end();
    return;
  }
});

/**
 * GET /api/code-agent/atlas-diagnostico
 *
 * Dónde se le va el tiempo a Atlas, en un lugar que se pueda leer.
 *
 * Existe porque el desglose por tramos se escribía SOLO en el log del
 * contenedor, y en este EasyPanel el log no se alcanza por la API: diez
 * endpoints probados en dos sesiones, todos 404. Con la medición inalcanzable,
 * la lentitud se diagnosticó tres veces por deducción y las tres se arregló
 * otra cosa.
 *
 * El caso que lo detonó: "¿tenés el curso de inteligencia artificial?" -- una
 * pregunta de una línea -- terminó cinco minutos después en "No pude terminar
 * de responder", sin ningún rastro de por qué.
 */
router.get("/atlas-diagnostico", requireAdmin(), async (req: TenantRequest, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
    const turnos = await ultimosTurnos(tenantId);
    return res.json({ resumen: resumirTurnos(turnos), turnos });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/code-agent/operator-opencode/detener
 *
 * Lo que faltaba para que el botón sea un botón. Sin esto, "parar" era cerrar
 * la pestaña: la pantalla dejaba de mirar y el servidor seguía gastando el
 * turno entero igual.
 *
 * Contesta `detenido: false` cuando no había nada corriendo, en vez de un
 * "listo" a ciegas: si el turno ya había terminado justo antes, la pantalla
 * tiene que poder decir eso y no fingir que cortó algo.
 */
router.post("/operator-opencode/detener", async (req: TenantRequest, res) => {
  const tenantId = req.tenant?.id;
  if (!tenantId) return res.status(401).json({ message: "Tenant not resolved" });
  const sessionId: string = (req.body?.sessionId as string) || "default";
  const clave = claveDeTurno(tenantId, sessionId);
  const habia = hayTurnoEnVuelo(clave);
  const detenido = pedirDetener(clave);
  logger.info({ tenantId, sessionId, habia }, "[AtlasOpenCode] El admin pidió detener el turno");
  return res.json({ detenido });
});

export default router;
