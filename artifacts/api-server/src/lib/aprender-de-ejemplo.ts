/**
 * APRENDER DE UN EJEMPLO — el dueño sube una conversación ejemplar (un README
 * que armó con ChatGPT u otra IA) y el sistema toma de ahí lo que le sirve.
 *
 * No se copia al pie de la letra. Se hace esto:
 *
 *   1. Leer el ejemplo (`leerConversacion`): quién es cliente y quién vendedor.
 *   2. Pasar los mensajes del CLIENTE del ejemplo por el vendedor REAL
 *      (`correrEnSombra`, en memoria): así se ve qué contesta hoy.
 *   3. Comparar turno por turno y proponer cambios sobre las MISMAS fuentes que
 *      el vendedor ya lee (ver correcciones-del-dueno.ts):
 *        forma      → indicaciones del agente (cómo vende, no qué datos dice)
 *        dato       → respuestas del negocio (product_knowledge)
 *        configurar → algo que el dueño tiene que cargar en el producto/negocio
 *        no_aplica  → lo que el ejemplo hace y acá no se debe hacer
 *   4. El dueño marca cuáles aplicar (ruta `aprender-de-ejemplo`).
 *
 * ⚠️ Un ejemplo generado por IA trae datos INVENTADOS (precios, garantías,
 * plazos, descuentos). Por eso:
 *   - un precio NUNCA sale del ejemplo: toda propuesta con un monto que no esté
 *     en el catálogo se descarta (`montosInventados`, la misma red del motor);
 *   - un dato del ejemplo se propone DESMARCADO y con aviso de verificar;
 *   - la forma no puede traer precios ni plazos (lo valida `configurarAgente`).
 */

import { extraerJson } from "./entender-al-cliente";
import { logger } from "./logger";

export type Rol = "customer" | "agent";
export type Turno = { role: Rol; content: string };

/** Tope de mensajes del cliente que se prueban: cada uno es una llamada al modelo. */
export const MAX_TURNOS_DE_CLIENTE = 10;

/* ── 1. Leer el ejemplo ──────────────────────────────────────────────────── */

const ROL_CLIENTE = /^(cliente|clienta|client|customer|usuario|usuaria|user|comprador|compradora|prospecto|lead|visitante|persona)$/i;
const ROL_VENDEDOR = /^(vendedor|vendedora|asesor|asesora|agente|bot|ia|ai|assistant|asistente|seller|tienda|negocio|empresa|marca|soporte|atenci[oó]n)$/i;

/**
 * El rol de una línea "Etiqueta: texto", tolerando el markdown que suele traer
 * un ejemplo de ChatGPT: "**Cliente:**", "👤 Cliente:", "> Vendedor —", "- Bot:".
 * `nombreAgente` cuenta como vendedor ("Sofía: ¡Hola!").
 */
export function rolDeLinea(linea: string, nombreAgente = ""): { rol: Rol; resto: string } | null {
  const limpia = linea
    .replace(/^\s*(?:[>#*\-–•]+\s*)*/, "")
    .replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "")
    .replace(/\*\*/g, "")
    .trim();
  const m = limpia.match(/^([\p{L} .()]{1,30}?)\s*(?:\([^)]*\))?\s*[:：—–-]\s*(.*)$/u);
  if (!m) return null;
  const etiqueta = m[1].trim().replace(/\s*\(.*\)$/, "");
  const primera = etiqueta.split(/\s+/)[0];
  const resto = m[2].trim();
  if (ROL_CLIENTE.test(etiqueta) || ROL_CLIENTE.test(primera)) return { rol: "customer", resto };
  if (ROL_VENDEDOR.test(etiqueta) || ROL_VENDEDOR.test(primera)) return { rol: "agent", resto };
  if (nombreAgente && etiqueta.toLowerCase() === nombreAgente.toLowerCase()) return { rol: "agent", resto };
  return null;
}

/**
 * La conversación del README, en turnos. Lo que va antes del primer rol
 * (título, explicación) se ignora; un título markdown en el medio corta el
 * turno (suele ser "## Por qué funciona" después de la charla).
 */
export function leerConversacion(texto: string, nombreAgente = ""): Turno[] {
  const turnos: Turno[] = [];
  let actual: Turno | null = null;
  let cortado = false;
  for (const bruta of String(texto || "").replace(/\r/g, "").split("\n")) {
    const linea = bruta.trimEnd();
    const rol = rolDeLinea(linea, nombreAgente);
    if (rol) {
      if (actual?.content.trim()) turnos.push(actual);
      actual = { role: rol.rol, content: rol.resto };
      cortado = false;
      continue;
    }
    if (/^\s*#{1,6}\s/.test(linea) || /^\s*(---|\*\*\*)\s*$/.test(linea)) {
      if (actual?.content.trim()) turnos.push(actual);
      actual = null;
      cortado = true;
      continue;
    }
    if (actual && !cortado) actual.content += `\n${linea.replace(/^\s*>\s?/, "")}`;
  }
  if (actual?.content.trim()) turnos.push(actual);

  // Dos mensajes seguidos del mismo lado son uno solo (así lo lee el motor).
  const unidos: Turno[] = [];
  for (const t of turnos) {
    const limpio = { role: t.role, content: t.content.replace(/\n{3,}/g, "\n\n").trim() };
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && ultimo.role === limpio.role) ultimo.content += `\n\n${limpio.content}`;
    else unidos.push(limpio);
  }
  return unidos;
}

/* ── 3. Proponer cambios ─────────────────────────────────────────────────── */

export type Propuesta = {
  id: string;
  tipo: "forma" | "dato" | "configurar" | "no_aplica";
  /** forma: la indicación. dato: la respuesta. configurar/no_aplica: qué. */
  texto: string;
  /** Solo dato: el tema ("Tiene garantía"). */
  pregunta?: string;
  productoId?: number | null;
  porque: string;
  /** Si viene marcada para aplicar. Los datos del ejemplo, nunca. */
  sugerida: boolean;
  /** Se puede aplicar desde acá (forma y dato); lo demás es informativo. */
  aplicable: boolean;
  aviso?: string;
};

/**
 * Lo que devolvió el modelo, convertido en propuestas SEGURAS. Es la parte que
 * decide qué se puede aplicar, así que es pura y tiene test.
 */
export function depurarPropuestas(
  crudo: any,
  catalogo: { id: number; name: string; price: number | null }[],
  montosInventados: (texto: string) => number[],
): Propuesta[] {
  const lista: any[] = Array.isArray(crudo?.propuestas) ? crudo.propuestas : [];
  const ids = new Set(catalogo.map((p) => p.id));
  const salida: Propuesta[] = [];
  const vistos = new Set<string>();

  for (const [i, p] of lista.entries()) {
    const tipo = ["forma", "dato", "configurar", "no_aplica"].includes(p?.tipo) ? p.tipo : null;
    const texto = String(p?.texto || "").trim().slice(0, 500);
    const porque = String(p?.porque || "").trim().slice(0, 400);
    if (!tipo || !texto) continue;
    const clave = `${tipo}|${texto.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);

    const base = { id: `p${i}`, tipo, texto, porque } as Propuesta;
    const inventado = montosInventados(`${texto} ${p?.pregunta || ""}`);

    if (tipo === "forma") {
      if (inventado.length) {
        salida.push({ ...base, tipo: "no_aplica", sugerida: false, aplicable: false, aviso: "Traía un precio que no está en tu catálogo: la forma de vender no lleva precios." });
        continue;
      }
      salida.push({ ...base, sugerida: true, aplicable: true });
      continue;
    }

    if (tipo === "dato") {
      const pregunta = String(p?.pregunta || "").trim().slice(0, 200);
      if (!pregunta) continue;
      if (inventado.length) {
        salida.push({
          ...base, tipo: "no_aplica", pregunta, sugerida: false, aplicable: false,
          aviso: `El ejemplo dice un monto (${inventado.map((n) => n.toLocaleString("es-CO")).join(", ")}) que no está en tu catálogo. Los precios salen solo de tus productos.`,
        });
        continue;
      }
      const productoId = ids.has(Number(p?.productoId)) ? Number(p.productoId) : null;
      salida.push({
        ...base, pregunta, productoId,
        // Un dato del ejemplo NUNCA viene marcado: lo escribió una IA.
        sugerida: false, aplicable: true,
        aviso: "Este dato sale del ejemplo. Márcalo solo si es verdad en tu negocio (puedes editarlo).",
      });
      continue;
    }

    salida.push({ ...base, sugerida: false, aplicable: false });
  }
  return salida;
}

/** Lo que se le pide al modelo que analiza. */
export function promptDeAnalisis(p: {
  ejemplo: Turno[];
  hoy: Turno[];
  catalogo: { id: number; name: string; price: number | null; currency?: string | null }[];
  indicaciones: string[];
  datos: { pregunta: string; respuesta: string | null }[];
}): string {
  const charla = (t: Turno[]) => t.map((m) => `${m.role === "customer" ? "CLIENTE" : "VENDEDOR"}: ${m.content}`).join("\n\n");
  return `Eres un jefe de ventas por WhatsApp. El dueño de un negocio subió una conversación EJEMPLAR (escrita por otra IA) de cómo le gustaría que venda su vendedor. Abajo está también lo que su vendedor responde HOY a esos mismos mensajes del cliente.

Tu trabajo: sacar del ejemplo lo que MEJORA al vendedor actual y adaptarlo a este negocio. NO copiar el ejemplo al pie de la letra.

REGLAS
- "forma": cómo vender (tono, largo, orden, preguntas, manejo de objeciones, cierre). Escríbela como una indicación corta y general, tuteando ("Cuando el cliente duda del precio, pregúntale qué lo frena antes de…"). Nunca uses voseo (nada de "preguntá", "hacé", "tenés"). Sin precios, montos, plazos ni promesas. Máximo 6, solo las que cambian algo respecto de HOY. Si el vendedor ya lo hace, no la propongas.
- "dato": un hecho del negocio que el ejemplo afirma y el vendedor de hoy no sabe (garantía, qué incluye, horarios…). OJO: el ejemplo lo inventó una IA; propónlo igual pero el dueño lo va a verificar. Nunca propongas precios como dato: los precios salen del catálogo. Incluye "pregunta" (el tema corto, ej "Tiene garantía") y "productoId" si es de un producto del catálogo.
- "configurar": algo que el dueño debería cargar en su producto o negocio para vender como el ejemplo (ej: "subir un video del producto", "cargar la política de devolución").
- "no_aplica": algo del ejemplo que NO conviene (inventa descuentos, presiona, promete lo que no hay, es otro tipo de producto).
- "porque": una frase concreta que cite el turno del ejemplo y lo que hace hoy el vendedor.
- Escribe todo en español neutro y claro, tuteando.

CATÁLOGO REAL (los precios verdaderos)
${p.catalogo.map((c) => `#${c.id} ${c.name} · ${c.price ?? "sin precio"} ${c.currency || "COP"}`).join("\n") || "(vacío)"}

INDICACIONES QUE YA TIENE EL VENDEDOR
${p.indicaciones.map((i) => `- ${i}`).join("\n") || "(ninguna)"}

RESPUESTAS DEL NEGOCIO QUE YA ESTÁN CARGADAS
${p.datos.map((d) => `- ${d.pregunta}: ${d.respuesta ?? "(sin respuesta)"}`).join("\n") || "(ninguna)"}

═══ CONVERSACIÓN EJEMPLAR ═══
${charla(p.ejemplo)}

═══ LO QUE RESPONDE HOY EL VENDEDOR (mismos mensajes del cliente) ═══
${charla(p.hoy)}

Responde SOLO este JSON:
{"resumen":"2-3 frases: qué hace mejor el ejemplo y qué ya hace bien el vendedor","propuestas":[{"tipo":"forma|dato|configurar|no_aplica","texto":"...","pregunta":"solo en dato","productoId":null,"porque":"..."}]}`;
}

/* ── 2 + 3. Todo junto ───────────────────────────────────────────────────── */

export async function analizarEjemplo(tenantId: number, textoDelEjemplo: string) {
  const { correrEnSombra, cargarCatalogoDelNegocio } = await import("./motor-nuevo/adaptador");
  const { armarCadena, crearClienteLLM } = await import("./motor-nuevo/cliente-llm");
  const { montosInventados } = await import("./motor-nuevo/motor");
  const { loQueSabeElVendedor } = await import("./correcciones-del-dueno");

  const sabe = await loQueSabeElVendedor(tenantId);
  const ejemplo = leerConversacion(textoDelEjemplo, sabe.agente?.nombre || "");
  const delCliente = ejemplo.filter((t) => t.role === "customer").map((t) => t.content).slice(0, MAX_TURNOS_DE_CLIENTE);
  if (delCliente.length === 0 || !ejemplo.some((t) => t.role === "agent")) {
    return {
      ok: false as const,
      mensaje:
        'No encontré la conversación en el archivo. Cada mensaje tiene que empezar con quién habla, por ejemplo "Cliente: …" y "Vendedor: …" (también sirve "Asesor:", "Bot:" o el nombre de tu agente).',
    };
  }

  const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId });
  const { servicioDePedidosDePrueba } = await import("./motor-nuevo/adaptador");
  const { getBusinessContext } = await import("./business-context");
  const { CONDICIONES_DE_RESPALDO } = await import("./modelo-de-negocio");
  const negocio: any = await getBusinessContext(tenantId).catch(() => null);
  const pedidos = servicioDePedidosDePrueba({ condiciones: negocio?.condiciones ?? CONDICIONES_DE_RESPALDO });
  const sombra = await correrEnSombra({ tenantId, turnos: delCliente, llm, pedidos: pedidos.servicio });
  const hoy: Turno[] = [];
  sombra.salida.forEach((s: any) => {
    hoy.push({ role: "customer", content: s.mensaje });
    const fichas = (s.tarjetas || []).map((t: any) => `[envía la ficha "${t.seccion || "completa"}" del producto #${t.productId}]`).join(" ");
    hoy.push({ role: "agent", content: [s.texto, fichas].filter(Boolean).join("\n") || "(no respondió)" });
  });

  const catalogo = await cargarCatalogoDelNegocio(tenantId);
  const cat = catalogo.map((c) => ({ id: c.id, name: c.name, price: c.price, currency: c.currency }));
  const prompt = promptDeAnalisis({ ejemplo, hoy, catalogo: cat, indicaciones: sabe.indicaciones, datos: sabe.datos });

  let crudo: any = null;
  try {
    const r = await llm.crear({ messages: [{ role: "user", content: prompt }], temperature: 0.3, maxTokens: 2500 });
    crudo = extraerJson(r.content || "");
  } catch (e: any) {
    logger.warn({ tenantId, err: e?.message }, "[AprenderDeEjemplo] el análisis falló");
  }
  if (!crudo) {
    return { ok: false as const, mensaje: "El análisis no respondió bien. Intenta de nuevo en un momento.", ejemplo, hoy };
  }

  const propuestas = depurarPropuestas(crudo, cat, (t) => montosInventados(t, catalogo));
  return {
    ok: true as const,
    resumen: String(crudo.resumen || "").slice(0, 800),
    ejemplo,
    hoy,
    /** Las partes de cada respuesta de hoy, para mostrarlas como en WhatsApp. */
    partesHoy: sombra.salida.map((x: any) => ({ mensaje: x.mensaje, partes: x.partes || [] })),
    propuestas,
    probados: delCliente.length,
    recortado: ejemplo.filter((t) => t.role === "customer").length > MAX_TURNOS_DE_CLIENTE,
  };
}
