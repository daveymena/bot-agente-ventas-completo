/**
 * CORRECCIONES DEL DUEÑO — lo que se corrige desde el chat de prueba.
 *
 * El dueño le escribe al vendedor como si fuera un cliente y, si una respuesta
 * sale mal, la corrige ahí mismo (como el chat de prueba de la IA de Meta).
 * La corrección se aplica AL INSTANTE, pero no como una capa nueva de prompt:
 * va a las dos fuentes que el vendedor ya lee en cada mensaje.
 *
 *   dato  → `product_knowledge` (la herramienta `consultar_conocimiento`).
 *           "El envío es gratis", "la garantía es de 6 meses".
 *   forma → `agents.metadata.indicaciones` ("INDICACIONES DEL DUEÑO" del
 *           prompt v2), escrito con `configurarAgente`, que ya valida que ahí
 *           no se cuelen precios ni plazos (esos van en la base).
 *
 * Las dos se ven y se borran desde el mismo chat: deshacer es un clic.
 */

import { and, desc, eq } from "drizzle-orm";
import { db, agents, products, productKnowledge } from "@workspace/db";
import { PALABRAS_GENERICAS } from "./motor-nuevo/herramientas";

/** Largo máximo de lo que el dueño escribe en una corrección. */
const LARGO_MAXIMO = 500;

function objeto(valor: unknown): Record<string, any> {
  if (!valor) return {};
  if (typeof valor === "string") {
    try {
      const p = JSON.parse(valor);
      return p && typeof p === "object" ? p : {};
    } catch {
      return {};
    }
  }
  return typeof valor === "object" ? { ...(valor as Record<string, any>) } : {};
}

/* ── Partes puras (con test) ─────────────────────────────────────────────── */

/** Las indicaciones, una por renglón, sin viñetas ni renglones vacíos. */
export function renglonesDeIndicaciones(texto: string | null | undefined): string[] {
  return String(texto ?? "")
    .split("\n")
    .map((r) => r.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/** Suma una indicación al final. Si ya estaba (misma frase), no la repite. */
export function agregarIndicacion(actual: string | null | undefined, nueva: string): string {
  const renglones = renglonesDeIndicaciones(actual);
  const limpia = nueva.trim();
  const igual = (a: string) => a.toLowerCase() === limpia.toLowerCase();
  if (limpia && !renglones.some(igual)) renglones.push(limpia);
  return renglones.map((r) => `- ${r}`).join("\n");
}

/** Quita la indicación número `indice` (la que se ve en la lista). */
export function quitarIndicacion(actual: string | null | undefined, indice: number): string {
  return renglonesDeIndicaciones(actual)
    .filter((_, i) => i !== indice)
    .map((r) => `- ${r}`)
    .join("\n");
}

/**
 * La pregunta en sí, sin el saludo que venía antes: de "Hola, me interesa el
 * curso. ¿Tiene certificado?" queda "Tiene certificado". Es el tema que se le
 * anuncia al vendedor y del que salen los disparadores; con el mensaje entero,
 * "hola" o "curso" disparaban la respuesta del certificado.
 */
export function temaDeLaPregunta(mensajeDelCliente: string): string {
  const texto = String(mensajeDelCliente || "").replace(/\s+/g, " ").trim();
  // Frases: se corta después de . ! ? y antes de ¿ ¡
  const frases = texto
    .split(/(?<=[.!?])\s+|(?=[¿¡])/)
    .map((f) => ({ conPregunta: f.includes("?"), limpia: f.replace(/[¿?¡!.]/g, "").trim() }))
    .filter((f) => f.limpia);
  const elegida = [...frases].reverse().find((f) => f.conPregunta) ?? frases[frases.length - 1];
  return (elegida?.limpia || texto).slice(0, 200);
}

/**
 * Las palabras con que el cliente lo preguntó, para que `consultar_conocimiento`
 * encuentre la respuesta la próxima vez. Mismo piso de 3 letras que exige la
 * herramienta de Atlas: una palabra más corta coincidiría con todo.
 */
export function disparadoresDe(mensajeDelCliente: string): string[] {
  const palabras = mensajeDelCliente
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 4 && !PALABRAS_GENERICAS.has(w));
  return [...new Set(palabras)].slice(0, 8);
}

/* ── Lo que el vendedor sabe hoy ─────────────────────────────────────────── */

/**
 * En v1 `configurarAgente` escribe el `prompt` en `tenants.agentPrompt`, que es
 * el prompt ENTERO del negocio: una corrección de una línea lo pisaría. El chat
 * de prueba corre el motor v2, así que la forma solo se corrige ahí.
 */
async function soloEnV2(tenantId: number): Promise<Resultado | null> {
  const { motorDelTenant } = await import("./motor-nuevo/activacion");
  if ((await motorDelTenant(tenantId)) === "v2") return null;
  return { ok: false, mensaje: "Este negocio atiende con el motor viejo (v1): la forma de hablar se cambia en Agentes IA, no desde el chat de prueba." };
}

/**
 * Los agentes que atienden: TODOS los activos. Medido en producción el
 * 25-09-2026: el negocio tenía "Atlas" y "AtlasDrops"; la corrección se
 * guardaba solo en el primero y el corrector (producto físico) lo atendía el
 * segundo, así que el vendedor que vendía nunca la veía. Lo que corrige el
 * dueño vale para el negocio, no para un agente. Sin activos, el principal.
 */
async function agentesQueAtienden(tenantId: number) {
  const todos = await db.select().from(agents).where(eq(agents.tenantId, tenantId));
  const activos = todos.filter((a: any) => a.isActive).sort((a: any, b: any) => a.id - b.id);
  if (activos.length) return activos;
  const principal = [...todos].sort((a: any, b: any) => a.id - b.id)[0];
  return principal ? [principal] : [];
}

/** Las indicaciones de todos los agentes que atienden, sin repetir. */
function indicacionesDe(agentes: any[]): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const a of agentes) {
    for (const r of renglonesDeIndicaciones(objeto(a.metadata).indicaciones)) {
      const k = r.toLowerCase();
      if (!vistas.has(k)) { vistas.add(k); salida.push(r); }
    }
  }
  return salida;
}

export async function loQueSabeElVendedor(tenantId: number) {
  const agentes = await agentesQueAtienden(tenantId);
  const datos = await db
    .select()
    .from(productKnowledge)
    .where(eq(productKnowledge.tenantId, tenantId))
    .orderBy(desc(productKnowledge.id))
    .limit(100);
  return {
    agente: agentes[0] ? { id: agentes[0].id, nombre: agentes[0].name } : null,
    agentes: agentes.map((a: any) => ({ id: a.id, nombre: a.name })),
    indicaciones: indicacionesDe(agentes),
    datos: datos.map((k: any) => ({
      id: k.id,
      pregunta: String(k.pregunta || ""),
      respuesta: k.respuesta ? String(k.respuesta) : null,
      productId: k.productId ?? null,
    })),
  };
}

/* ── Presentación de la IA ─────────────────────────────────────────────── */

/**
 * La ficha de un físico la redacta la IA y se guarda en
 * `products.metadata.presentacion` con una firma de (producto + indicaciones).
 * Cuando cambia una indicación, la firma cambia y se re-redacta sola en el
 * próximo mensaje. Pero si la firma llegara a coincidir (reorden, mayúsculas)
 * o el dueño quiere ver el cambio YA, se borra el caché acá para forzar la
 * re-redacción en el siguiente turno. Sin esto, "Corregir" guardaba bien pero
 * la ficha seguía saliendo igual hasta que algo más tocara el producto.
 */
export async function invalidarPresentaciones(tenantId: number): Promise<void> {
  try {
    const filas = await db
      .select({ id: products.id, metadata: products.metadata })
      .from(products)
      .where(eq(products.tenantId, tenantId))
      .limit(200);
    for (const f of filas as any[]) {
      const meta = objeto(f.metadata);
      if (!("presentacion" in meta)) continue;
      delete meta.presentacion;
      await db.update(products).set({ metadata: JSON.stringify(meta) } as any).where(eq(products.id, f.id));
    }
  } catch {
    // El caché es optimización: si falla, la firma igual fuerza la re-redacción.
  }
}

/* ── Corregir ────────────────────────────────────────────────────────────── */

export type Resultado = { ok: boolean; mensaje: string };

/** Un dato que faltó o salió mal: queda como respuesta del negocio. */
export async function corregirDato(
  tenantId: number,
  p: { mensajeDelCliente: string; respuestaCorrecta: string; productId?: number | null },
): Promise<Resultado> {
  const pregunta = temaDeLaPregunta(p.mensajeDelCliente);
  const respuesta = String(p.respuestaCorrecta || "").trim();
  if (!pregunta) return { ok: false, mensaje: "Falta el mensaje del cliente que se está corrigiendo." };
  if (!respuesta) return { ok: false, mensaje: "Escribe qué debió responder." };
  if (respuesta.length > LARGO_MAXIMO) return { ok: false, mensaje: `La respuesta es muy larga (máximo ${LARGO_MAXIMO} caracteres).` };

  const disparadores = disparadoresDe(pregunta);
  if (disparadores.length === 0) {
    return { ok: false, mensaje: "El mensaje del cliente es muy corto para reconocerlo después. Corrige un mensaje con la pregunta completa." };
  }

  await db.insert(productKnowledge).values({
    tenantId,
    productId: p.productId ?? null,
    pregunta,
    disparadores: disparadores.join(", "),
    respuesta,
  });
  return { ok: true, mensaje: "Listo: desde el próximo mensaje el vendedor responde eso." };
}

/** Escribe las indicaciones de cada agente que atiende con `configurarAgente`. */
async function reescribirIndicaciones(
  tenantId: number,
  cambiar: (actuales: string | undefined) => string,
): Promise<Resultado & { agentes?: string[] }> {
  const bloqueo = await soloEnV2(tenantId);
  if (bloqueo) return bloqueo;
  const agentes = await agentesQueAtienden(tenantId);
  if (!agentes.length) return { ok: false, mensaje: "No hay ningún agente creado. Crea uno en Agentes IA primero." };
  const { configurarAgente } = await import("./configurar-agente");
  const hechos: string[] = [];
  for (const agente of agentes) {
    const r = await configurarAgente(tenantId, { prompt: cambiar(objeto(agente.metadata).indicaciones), agentId: agente.id });
    if (!r.ok || r.aplicados.length === 0) {
      const motivo = r.ignorados.map((i) => i.motivo).join(" ") || r.summary;
      return { ok: false, mensaje: `No se aplicó${hechos.length ? ` en ${agente.name}` : ""}: ${motivo}` };
    }
    hechos.push(agente.name);
  }
  return { ok: true, mensaje: "", agentes: hechos };
}

/** La forma de vender: se suma a las indicaciones de TODOS los agentes que atienden. */
export async function corregirForma(tenantId: number, indicacion: string): Promise<Resultado> {
  const texto = String(indicacion || "").trim();
  if (!texto) return { ok: false, mensaje: "Escribe cómo debe hablar el vendedor." };
  if (texto.length > LARGO_MAXIMO) return { ok: false, mensaje: `La indicación es muy larga (máximo ${LARGO_MAXIMO} caracteres).` };
  const r = await reescribirIndicaciones(tenantId, (actuales) => agregarIndicacion(actuales, texto));
  if (!r.ok) return r;
  await invalidarPresentaciones(tenantId);
  const quienes = r.agentes!;
  return { ok: true, mensaje: `Listo: ${quienes.join(" y ")} ya lo ${quienes.length > 1 ? "aplican" : "aplica"} desde el próximo mensaje.` };
}

/**
 * La corrección tal como la escribió el dueño ("no debe enviar video, ya lo
 * envió"), clasificada por el modelo: una REGLA de cómo vender va a las
 * indicaciones; un DATO para decirle al cliente va a las respuestas del
 * negocio. Medido en producción el 25-09-2026: con la elección a mano, las 4
 * correcciones del dueño eran reglas guardadas como "dato" -- el vendedor
 * nunca las aplicaba, y encima podía leerle al cliente "No debe decir o
 * repetir si quiere ver el video".
 */
export async function corregirComoCorresponde(
  tenantId: number,
  p: { correccion: string; mensajeDelCliente: string; respuestaBot: string; productId?: number | null },
): Promise<Resultado & { tipo?: "forma" | "dato"; guardado?: string }> {
  const correccion = String(p.correccion || "").trim();
  if (!correccion) return { ok: false, mensaje: "Escribe qué debió responder o hacer." };
  if (correccion.length > LARGO_MAXIMO) return { ok: false, mensaje: `Es muy largo (máximo ${LARGO_MAXIMO} caracteres).` };

  const c = await clasificarCorreccion(tenantId, { ...p, correccion });
  if (c.tipo === "dato") {
    const r = await corregirDato(tenantId, { mensajeDelCliente: c.pregunta || p.mensajeDelCliente, respuestaCorrecta: c.texto, productId: p.productId });
    return { ...r, tipo: "dato", guardado: `${c.pregunta ? `${c.pregunta}: ` : ""}${c.texto}` };
  }
  const r = await corregirForma(tenantId, c.texto);
  return { ...r, tipo: "forma", guardado: c.texto };
}

/** Lo que decide dónde va la corrección (pura, con test). Ante la duda, regla. */
export function leerClasificacion(crudo: any, correccion: string): { tipo: "forma" | "dato"; texto: string; pregunta?: string } {
  const tipo = crudo?.tipo === "dato" ? "dato" : "forma";
  const texto = String(crudo?.texto || "").trim().slice(0, LARGO_MAXIMO) || correccion;
  const pregunta = String(crudo?.pregunta || "").trim().slice(0, 200);
  if (tipo === "dato" && !pregunta) return { tipo: "forma", texto: correccion };
  return tipo === "dato" ? { tipo, texto, pregunta } : { tipo, texto };
}

async function clasificarCorreccion(
  tenantId: number,
  p: { correccion: string; mensajeDelCliente: string; respuestaBot: string },
): Promise<{ tipo: "forma" | "dato"; texto: string; pregunta?: string }> {
  try {
    const { armarCadena, crearClienteLLM } = await import("./motor-nuevo/cliente-llm");
    const { extraerJson } = await import("./entender-al-cliente");
    const llm = crearClienteLLM({ cadena: await armarCadena({ tenantId }), tenantId });
    const prompt = [
      "El dueño de un negocio está corrigiendo una respuesta de su vendedor de WhatsApp.",
      "",
      `CLIENTE: ${p.mensajeDelCliente || "(sin mensaje)"}`,
      `VENDEDOR RESPONDIÓ: ${p.respuestaBot || "(sin texto)"}`,
      `CORRECCIÓN DEL DUEÑO: ${p.correccion}`,
      "",
      "Decide qué es la corrección:",
      '- "forma": una REGLA de cómo debe actuar o vender el vendedor (qué mandar, en qué orden, qué no repetir, cuándo preguntar, el tono, el largo). Reescríbela como una indicación clara, general y corta para el vendedor, tuteando, en una frase (ej: "No vuelvas a ofrecer el video si ya se lo enviaste."). Sin precios ni plazos.',
      '- "dato": un HECHO del negocio que el vendedor debe decirle al cliente (garantía, qué incluye, horarios, tallas, cómo se usa). Da "pregunta" (el tema corto, ej "Tiene garantía") y "texto" (la respuesta tal como se le diría al cliente).',
      'Si dice "debe", "no debe", "debería", "antes de", "primero", "no repitas" o habla del vendedor en tercera persona, es "forma".',
      "",
      'Responde SOLO este JSON: {"tipo":"forma|dato","texto":"...","pregunta":"solo si es dato"}',
    ].join("\n");
    const r = await llm.crear({ messages: [{ role: "user", content: prompt }], temperature: 0.1, maxTokens: 300 });
    return leerClasificacion(extraerJson(r.content || ""), p.correccion);
  } catch {
    // Sin modelo se guarda como regla: una regla mal puesta no se le lee al
    // cliente; un dato mal puesto sí.
    return { tipo: "forma", texto: p.correccion };
  }
}

/* ── Deshacer ────────────────────────────────────────────────────────────── */

export async function borrarDato(tenantId: number, id: number): Promise<Resultado> {
  // El tenantId en el WHERE: un id de otro negocio no se borra.
  await db.delete(productKnowledge).where(and(eq(productKnowledge.id, id), eq(productKnowledge.tenantId, tenantId)));
  return { ok: true, mensaje: "Respuesta borrada." };
}

/** Quita la indicación número `indice` de la lista unida, en TODOS los agentes. */
export async function borrarIndicacion(tenantId: number, indice: number): Promise<Resultado> {
  const lista = indicacionesDe(await agentesQueAtienden(tenantId));
  const texto = lista[indice];
  if (!texto) return { ok: false, mensaje: "Esa indicación ya no existe." };
  const r = await reescribirIndicaciones(tenantId, (actuales) => {
    const renglones = renglonesDeIndicaciones(actuales);
    const i = renglones.findIndex((x) => x.toLowerCase() === texto.toLowerCase());
    return i < 0 ? renglones.map((x) => `- ${x}`).join("\n") : quitarIndicacion(actuales, i);
  });
  if (!r.ok) return r;
  await invalidarPresentaciones(tenantId);
  return { ok: true, mensaje: "Indicación quitada." };
}

/* ── Editar (todo modificable sin salirse de los parámetros) ─────────────── */

/**
 * Edita la respuesta de un dato existente. El disparador/pregunta NO cambia
 * (es como el cliente lo preguntó); solo el texto que dice el vendedor.
 * Los parámetros mandan: tope de largo, sin vacío.
 */
export async function editarDato(tenantId: number, id: number, respuestaCorrecta: string): Promise<Resultado> {
  const respuesta = String(respuestaCorrecta || "").trim();
  if (!Number.isInteger(id) || id <= 0) return { ok: false, mensaje: "id inválido" };
  if (!respuesta) return { ok: false, mensaje: "Escribe qué debe responder." };
  if (respuesta.length > LARGO_MAXIMO) return { ok: false, mensaje: `La respuesta es muy larga (máximo ${LARGO_MAXIMO} caracteres).` };
  const filas = await db
    .select({ id: productKnowledge.id })
    .from(productKnowledge)
    .where(and(eq(productKnowledge.id, id), eq(productKnowledge.tenantId, tenantId)))
    .limit(1);
  if (!filas.length) return { ok: false, mensaje: "Esa respuesta ya no existe." };
  await db.update(productKnowledge).set({ respuesta } as any).where(and(eq(productKnowledge.id, id), eq(productKnowledge.tenantId, tenantId)));
  return { ok: true, mensaje: "Respuesta actualizada: desde el próximo mensaje el vendedor responde eso." };
}

/**
 * Edita una indicación existente (la número `indice` de la lista unida).
 * Pasa por `configurarAgente`, así que mantiene sus reglas: nada de precios
 * ni plazos en la forma (esos van en la base, no en el prompt).
 */
export async function editarIndicacion(tenantId: number, indice: number, nueva: string): Promise<Resultado> {
  const texto = String(nueva || "").trim();
  if (!Number.isInteger(indice) || indice < 0) return { ok: false, mensaje: "índice inválido" };
  if (!texto) return { ok: false, mensaje: "Escribe cómo debe hablar el vendedor." };
  if (texto.length > LARGO_MAXIMO) return { ok: false, mensaje: `La indicación es muy larga (máximo ${LARGO_MAXIMO} caracteres).` };
  const lista = indicacionesDe(await agentesQueAtienden(tenantId));
  const vieja = lista[indice];
  if (!vieja) return { ok: false, mensaje: "Esa indicación ya no existe." };
  if (vieja.toLowerCase() === texto.toLowerCase()) return { ok: true, mensaje: "Sin cambios: ya decía eso." };
  const r = await reescribirIndicaciones(tenantId, (actuales) => {
    const renglones = renglonesDeIndicaciones(actuales);
    const i = renglones.findIndex((x) => x.toLowerCase() === vieja.toLowerCase());
    if (i < 0) return renglones.map((x) => `- ${x}`).join("\n");
    renglones[i] = texto;
    // Sin duplicados: si el nuevo texto ya estaba en otro renglón, se quita el viejo.
    const vistos = new Set<string>();
    return renglones
      .filter((x) => {
        const k = x.toLowerCase();
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
      })
      .map((x) => `- ${x}`)
      .join("\n");
  });
  if (!r.ok) return r;
  await invalidarPresentaciones(tenantId);
  return { ok: true, mensaje: "Indicación actualizada: aplica desde el próximo mensaje." };
}
