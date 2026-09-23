/**
 * LA VOZ DE ATLAS.
 *
 * Pedido del admin: que Atlas conteste hablado, con voz humana, y gratis
 * ("buscá, que voces gratis humanas hay muchas ya").
 *
 * Usa el servicio de lectura en voz alta de Microsoft Edge, el mismo que hay
 * detrás de `edge-tts`. Verificado en vivo el 2026-09-03 contra la lista de
 * voces: 322 voces, 45 en castellano, y **es-CO** tiene dos --
 * `es-CO-SalomeNeural` y `es-CO-GonzaloNeural`. Colombianas, sin clave, sin
 * costo.
 *
 * ── Por qué esto NO usa un paquete de npm ─────────────────────────────────
 *
 * Hay varios (`edge-tts`, `msedge-tts`, `node-edge-tts`) y habría sido más
 * corto. Pero este workspace tiene una política de cadena de suministro
 * explícita --`minimumReleaseAge: 1440`, `blockExoticSubdeps: true`, y un
 * comentario en pnpm-workspace.yaml que dice "NO DESACTIVAR"-- y meter un
 * paquete chico y poco conocido, que además habla con un endpoint no
 * documentado, es exactamente el perfil contra el que esa política existe.
 *
 * El protocolo son dos mensajes por WebSocket y un encabezado binario: entra
 * en un archivo y se puede leer entero de una sentada.
 *
 * Lo único que se sumó es `ws@8.21.1`, que YA estaba instalado porque lo usa
 * Baileys -- así que no agrega superficie nueva, solo declara de verdad algo
 * que si no se usaría de prestado. Hizo falta porque el servicio exige
 * cabeceras de navegador y el `WebSocket` nativo de Node, por seguir la norma
 * del navegador, no deja ponerlas (ver CABECERAS más abajo).
 *
 * ── Lo que hay que saber antes de apoyarse en esto ───────────────────────
 *
 * ⚠️ Es un endpoint de consumo, no una API publicada con contrato. Microsoft
 * puede cambiarlo o cortarlo sin aviso. Por eso `hablar()` devuelve **null**
 * en vez de tirar: la pantalla se queda sin voz, no sin respuesta. Atlas
 * escribe igual, siempre.
 *
 * ⚠️ El texto que se habla SALE del servidor hacia Microsoft. Son las
 * respuestas de Atlas, que hablan del negocio del admin. Si eso llegara a
 * molestar, la alternativa 100% local es Kokoro (`kokoro-js`, Apache 2.0, con
 * voces `ef_dora`/`em_alex`): no sale nada de la máquina, a cambio de ~300MB
 * de modelo y CPU del contenedor, que hoy ya corre WhatsApp y Atlas.
 */
import { randomUUID, createHash } from "node:crypto";
import WebSocket from "ws";
import { logger } from "./logger";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WSS = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TOKEN}`;

/**
 * El servicio EXIGE cabeceras de navegador, y eso decidió qué cliente usar.
 *
 * Medido el 2026-09-03 contra el endpoint real: con un `User-Agent` de Edge
 * 130 el handshake devuelve **403**; con uno de Edge 143, **101 Switching
 * Protocols**. O sea que Microsoft mira la versión y va corriendo el corte.
 *
 * El `WebSocket` nativo de Node 22 sigue la norma del navegador y NO deja
 * poner cabeceras, así que por ahí no se puede pasar. Se usa `ws`, que ya
 * estaba instalado en el árbol porque lo usa Baileys -- pero se declaró como
 * dependencia DIRECTA de este paquete en vez de aprovecharla de prestado:
 * usar algo que solo está por ser subdependencia de otro es justo lo que
 * `blockExoticSubdeps` prohíbe en este workspace, y el día que Baileys lo
 * cambie se rompe sin que nadie entienda por qué.
 */
const CABECERAS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
  Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "es-CO,es;q=0.9",
  Pragma: "no-cache",
  "Cache-Control": "no-cache",
};

/**
 * El token anti-abuso que Microsoft agregó al endpoint.
 *
 * Es el reloj de Windows --intervalos de 100 ns desde 1601-- redondeado a
 * bloques de cinco minutos, pegado al token de cliente y pasado por SHA-256.
 * Sin esto el handshake se cae, y el error que devuelve no explica nada: un
 * 403 con el cuerpo vacío.
 *
 * Se calcula en CADA llamada y no se guarda: el bloque de cinco minutos vence,
 * y un token cacheado dejaría a Atlas mudo hasta el siguiente reinicio.
 */
function tokenDeReloj(): string {
  const EPOCA_WINDOWS = 11_644_473_600; // segundos entre 1601 y 1970
  let ticks = Math.floor(Date.now() / 1000) + EPOCA_WINDOWS;
  ticks -= ticks % 300;
  ticks *= 1e7;
  return createHash("sha256").update(`${ticks}${TOKEN}`).digest("hex").toUpperCase();
}

/** La versión que el servicio espera. Si un día vuelve el 403, se sube acá. */
const VERSION_GEC = "1-143.0.3650.20";

/** Colombiana, femenina. La otra de es-CO es `es-CO-GonzaloNeural`. */
export const VOZ_POR_DEFECTO = "es-CO-SalomeNeural";

/**
 * Deja el texto listo para ser LEÍDO EN VOZ ALTA.
 *
 * Las respuestas de Atlas son markdown pensado para la pantalla: negritas,
 * viñetas, emojis, enlaces, tablas. Leído tal cual, un `**` se pronuncia
 * "asterisco asterisco" y un enlace se convierte en la lectura de una URL
 * entera, que es insoportable.
 *
 * Se saca la decoración y se conserva el contenido. Un enlace se lee por su
 * TEXTO, no por su dirección: en "[la ficha](https://...)" lo que importa es
 * "la ficha".
 */
export function paraLeerEnVoz(markdown: string): string {
  let t = String(markdown || "");

  // Bloques de código enteros: no se leen, se anuncian.
  t = t.replace(/```[\s\S]*?```/g, " (te dejé un bloque de código en pantalla) ");
  t = t.replace(/`([^`]+)`/g, "$1");

  // Enlaces e imágenes: queda el texto visible, se va la dirección.
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Énfasis y encabezados.
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/^#{1,6}\s*/gm, "");
  t = t.replace(/^\s*[-*•]\s+/gm, "");
  t = t.replace(/^\s*>\s?/gm, "");
  // ── Tablas ────────────────────────────────────────────────────────────
  //
  // Reportado por el admin al escucharlo: "lee las barras". Y era cierto: la
  // línea separadora se limpiaba, pero cada fila quedaba como
  // ", Producto , Precio ," -- con la barra del principio y la del final
  // convertidas en comas sueltas, que la voz lee como pausas absurdas.
  //
  // Ahora la fila se parte en campos y se une con comas: las barras de los
  // extremos no existen, no sobran comas, y se escucha como una enumeración.
  t = t.replace(/^\s*\|?[\s:|-]{4,}\|?\s*$/gm, " ");
  t = t.replace(/^[^\n]*\|[^\n]*$/gm, (fila) =>
    fila.split("|").map((c) => c.trim()).filter(Boolean).join(", "),
  );
  // Y por si quedó alguna barra suelta fuera de una tabla.
  t = t.replace(/\s*\|\s*/g, ", ");

  // Una URL suelta, sin texto que la envuelva, tampoco se lee.
  //
  // Va ANTES de tocar las diagonales, y el orden no es casual: una URL está
  // llena de `/`, así que si primero se convierten en comas el enlace queda
  // hecho pedazos ("https:, , ventasproia.com, p, 41") y ya no hay nada que
  // reconocer como dirección. Es la misma lección que este proyecto aprendió
  // con el supervisor de Atlas: lo que corrige la salida tiene que correr
  // después de todo lo que puede cambiarla, y lo que la destruye, antes.
  t = t.replace(/https?:\/\/\S+/g, " el enlace que te dejé ");

  // ── Diagonales ────────────────────────────────────────────────────────
  //
  // El otro reporte: "y los diagonales". Una `/` entre palabras la voz la
  // pronuncia "barra", así que "lunes/viernes" se escucha "lunes barra
  // viernes".
  //
  // `24/7` va aparte porque es de las pocas que significa algo distinto de una
  // enumeración: leerla "veinticuatro, siete" no se entiende, y es una forma
  // que aparece todo el tiempo en textos de venta.
  t = t.replace(/\b24\s*\/\s*7\b/g, "24 horas, los 7 días");
  t = t.replace(/(\w)\s*\/\s*(\w)/g, "$1, $2");

  // Emojis y símbolos sueltos. Se van del habla, se quedan en la pantalla:
  // "⚠️" leído es un silencio raro, y el aviso ya está en las palabras.
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, " ");

  // ── PLATA: el error que más caro sale ─────────────────────────────────
  //
  // Reportado: "los valores los lee en dólares". La voz pronuncia el símbolo
  // `$` como "dólares", y en este negocio los precios son PESOS colombianos.
  // Escuchar "sesenta mil dólares" por un curso de $60.000 no es un detalle de
  // pronunciación: es un precio equivocado dicho con total naturalidad, y el
  // admin puede repetírselo a un cliente.
  //
  // Se pone la moneda en PALABRAS y se saca el símbolo. Primero el dólar de
  // verdad (US$, USD), que sí existe y hay que respetarlo; recién después el
  // `$` pelado, que acá siempre es peso.
  //
  // El número se escribe `\d+(?:[.,]\d+)*` y NO `[\d.,]+`: con la versión
  // floja, "US$12." se llevaba puesto el punto de la FRASE y salía "doce punto
  // dólares", con la pausa en el lugar equivocado. Acá el separador solo
  // cuenta si tiene dígitos detrás, así que el punto final queda afuera.
  t = t.replace(/\b(?:US\s*\$|USD\s*\$?)\s*(\d+(?:[.,]\d+)*)/gi, "$1 dólares");
  t = t.replace(/\$\s*(\d+(?:[.,]\d+)*)\s*(?:USD|d[oó]lares)\b/gi, "$1 dólares");
  // El `$` pelado acá es siempre PESO colombiano.
  t = t.replace(/\$\s*(\d+(?:[.,]\d+)*)/g, "$1 pesos");
  // Si el texto ya traía "pesos" o "COP" pegado, la conversión del `$` dejó un
  // doble ("$45.000 pesos" -> "45.000 pesos pesos"). Se quita la repetición.
  t = t.replace(/(\bpesos)\s+(?:pesos|COP)\b/gi, "$1");
  // "COP" sin `$` previo también es peso.
  t = t.replace(/(\d+(?:[.,]\d+)*)\s*COP\b/gi, "$1 pesos");
  // Un `$` que quedó sin número al lado no se lee: decir "dólares" suelto en
  // medio de una frase es peor que no decir nada.
  t = t.replace(/\$/g, " ");


  return t.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, ". ").replace(/\s*\n\s*/g, ". ").trim();
}

/**
 * Escapa lo que rompería el XML del SSML.
 *
 * No es cosmético: un `&` o un `<` en el texto --y las respuestas de Atlas
 * traen precios, comparaciones y a veces HTML-- hacen que el servicio rechace
 * el mensaje entero y no se escuche nada.
 */
function escaparXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** El SSML del pedido. Separado para poder probarlo sin abrir un socket. */
export function armarSsml(texto: string, voz = VOZ_POR_DEFECTO, rate = "+8%"): string {
  const idioma = voz.split("-").slice(0, 2).join("-") || "es-CO";
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${idioma}'>` +
    `<voice name='${voz}'><prosody rate='${rate}' pitch='+0Hz'>${escaparXml(texto)}</prosody></voice>` +
    `</speak>`
  );
}

/**
 * Cuánto texto se manda a hablar de una vez.
 *
 * Una respuesta larga de Atlas puede tener miles de caracteres: hablarla
 * entera son minutos de audio que nadie escucha hasta el final, y el archivo
 * tarda en generarse. Se corta en un límite y se avisa que sigue en pantalla.
 */
const TOPE_HABLADO = 1200;

export function recortarParaHablar(texto: string): string {
  if (texto.length <= TOPE_HABLADO) return texto;
  // Se corta en el último punto antes del tope, no a mitad de una palabra:
  // una frase cortada por la mitad suena a que se colgó.
  const recorte = texto.slice(0, TOPE_HABLADO);
  const punto = Math.max(recorte.lastIndexOf(". "), recorte.lastIndexOf("? "), recorte.lastIndexOf("! "));
  const base = punto > TOPE_HABLADO / 2 ? recorte.slice(0, punto + 1) : recorte;
  return `${base.trim()} El resto te lo dejé escrito en pantalla.`;
}

/**
 * Convierte texto en audio MP3. Devuelve null si no se pudo.
 *
 * NUNCA tira: quedarse sin voz es un problema menor, y hacerlo caer se
 * llevaría puesta la respuesta escrita, que es lo que de verdad importa.
 */
export async function hablar(texto: string, voz = VOZ_POR_DEFECTO, rate = "+8%"): Promise<Buffer | null> {
  const limpio = recortarParaHablar(paraLeerEnVoz(texto));
  if (!limpio) return null;

  return new Promise<Buffer | null>((resolve) => {
    let terminado = false;
    const pedazos: Buffer[] = [];
    // El id de conexión va SIN guiones: con guiones el servicio rechaza el
    // handshake y el socket se cierra sin decir por qué.
    const url =
      `${WSS}&Sec-MS-GEC=${tokenDeReloj()}&Sec-MS-GEC-Version=${VERSION_GEC}` +
      `&ConnectionId=${randomUUID().replace(/-/g, "")}`;
    const ws = new WebSocket(url, { headers: CABECERAS });

    const cerrar = (r: Buffer | null) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      try { ws.close(); } catch { /* ya estaba cerrado */ }
      resolve(r);
    };

    // Tope duro: si el servicio no contesta, la pantalla no puede quedarse
    // esperando una voz que no va a llegar.
    const reloj = setTimeout(() => {
      logger.warn("[VozDeAtlas] El servicio de voz no contestó a tiempo");
      cerrar(null);
    }, 20_000);

    ws.on("open", () => {
      const fecha = new Date().toString();
      ws.send(
        `X-Timestamp:${fecha}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},` +
        `"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`,
      );
      ws.send(
        `X-RequestId:${randomUUID().replace(/-/g, "")}\r\nContent-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${fecha}Z\r\nPath:ssml\r\n\r\n${armarSsml(limpio, voz, rate)}`,
      );
    });

    ws.on("message", (dato: Buffer, esBinario: boolean) => {
      // Los mensajes de TEXTO son de control; el único que importa es el que
      // avisa que terminó de hablar.
      if (!esBinario) {
        if (dato.toString("utf8").includes("Path:turn.end")) {
          cerrar(pedazos.length ? Buffer.concat(pedazos) : null);
        }
        return;
      }
      // Los BINARIOS traen el audio detrás de un encabezado: los dos primeros
      // bytes son el largo del encabezado, en big-endian. Sin saltearlo, el
      // mp3 sale con basura adelante y no suena.
      if (dato.length < 2) return;
      const largoEncabezado = dato.readUInt16BE(0);
      if (dato.length > 2 + largoEncabezado) pedazos.push(dato.subarray(2 + largoEncabezado));
    });

    ws.on("error", (e: any) => {
      // Vale la pena el mensaje: si un día vuelve el 403, esto es lo único que
      // va a decir que hay que subir VERSION_GEC.
      logger.warn({ err: e?.message }, "[VozDeAtlas] Falló la conexión con el servicio de voz");
      cerrar(null);
    });
    // Si el socket se cierra antes del turn.end, se devuelve lo que haya:
    // medio audio se escucha; nada, no.
    ws.on("close", () => cerrar(pedazos.length ? Buffer.concat(pedazos) : null));
  });
}
