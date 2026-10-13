/**
 * AGENCIA PRO — ResearchDeep
 * ==========================
 * Investigación que SÍ investiga. No plantilla fija: lee ficha real + referencias
 * multi-idioma + lo que Meta ya gastó, y devuelve 9 hooks distintos.
 *
 * Usa callMarketingAI con fallback determinístico (nunca rompe el pack).
 */
import { callMarketingAI } from "../../marketing-team/ai";
import type { ProductInfo, ResearchResult } from "../../marketing-team/agents/market-researcher";
import { buildResearchFallback } from "../../marketing-team/agents/market-researcher";
import { getBusinessContext } from "../../business-context";
import { codigoDePais } from "../../modelo-de-negocio";

export type HookArquetipo =
  | "Dolor_agudo"
  | "Promesa_transformacion"
  | "Prueba_social"
  | "POV_personal"
  | "Error_comun"
  | "Pregunta_incomoda"
  | "Antes_despues"
  | "Miedo_perdida"
  | "Curiosidad_secreto";

export interface HookPro {
  arquetipo: HookArquetipo;
  angulo: string;
  hook: string; // primera línea del anuncio, lista para usar
  porQueConvierte: string;
}

export interface ResearchDeepResult extends ResearchResult {
  hooksPro: HookPro[];
  pais: string;
  referenciasUsadas: string[];
  loQueYaFuncionaEnLaCuenta: string | null;
  notasParaCopy: string[];
}

const ARQUETIPOS: Array<{ tipo: HookArquetipo; instruccion: string }> = [
  { tipo: "Dolor_agudo", instruccion: "Nombra el dolor físico/emocional exacto que el cliente siente HOY (ej. '¿Te levantas con la espalda cargada?')." },
  { tipo: "Promesa_transformacion", instruccion: "Promesa concreta con plazo/resultado (ej. 'Toca tu primera canción en 7 días')." },
  { tipo: "Prueba_social", instruccion: "Cuántos ya lo usan / caso real sin inventar números si no hay dato." },
  { tipo: "POV_personal", instruccion: "Primera persona UGC: 'Yo también pensé que... hasta que probé...'" },
  { tipo: "Error_comun", instruccion: "El error que todos cometen y este producto evita (ej. 'El error al comprar corrector barato')." },
  { tipo: "Pregunta_incomoda", instruccion: "Pregunta que hace dudar del status quo." },
  { tipo: "Antes_despues", instruccion: "Contraste en 1 línea: antes X, después Y." },
  { tipo: "Miedo_perdida", instruccion: "Qué sigue perdiendo si no actúa (sin inventar escasez)." },
  { tipo: "Curiosidad_secreto", instruccion: "Secreto/método que 'no te contaron' — solo si la ficha lo respalda." },
];

export function hooksProFallback(product: ProductInfo): HookPro[] {
  const nombre = product.name || "este producto";
  const corto = nombre.split(" ").slice(0, 3).join(" ");
  return ARQUETIPOS.map(({ tipo, instruccion }) => ({
    arquetipo: tipo,
    angulo: instruccion.slice(0, 48),
    hook: `${corto}: ${tipo.replace("_", " ")}`,
    porQueConvierte: instruccion,
  }));
}

export async function researchDeep(
  product: ProductInfo,
  opts: { tenantId?: number; fb?: any; objetivo?: string } = {},
): Promise<ResearchDeepResult> {
  const base = buildResearchFallback(product);
  const ctx = opts.tenantId ? await getBusinessContext(opts.tenantId).catch(() => null) : null;
  const pais = codigoDePais((ctx?.condiciones as any)?.pais || null) || "CO";
  let referenciasUsadas: string[] = [`Referencias ${pais} (multi-idioma ES+EN)`];

  let loQueYaFunciona: string | null = null;
  if (opts.fb?.isConfigured?.()) {
    try {
      const { datosExpertosParaAnuncio } = await import("../../marketing-team/ad-intelligence");
      const datos: any = await datosExpertosParaAnuncio({ tenantId: opts.tenantId!, productId: Number(product.id), fb: opts.fb });
      if (datos?.cuenta?.mejor) loQueYaFunciona = `Mejor campaña: ${datos.cuenta.mejor.nombre} — ${datos.cuenta.mejor.gancho || "sin gancho"}`;
      if (datos?.referenciasDelRubro) referenciasUsadas.push("referenciasDelRubro ES+EN");
    } catch { /* fb sin datos, sigue con fallback */ }
  }

  const ai = await callMarketingAI<Partial<ResearchDeepResult> & { hooksPro?: HookPro[] }>({
    tenantId: opts.tenantId,
    json: true,
    maxTokens: 1400,
    systemPrompt:
      `Eres ResearchDeep, investigador senior de una agencia performance (ROAS, no branding).\n` +
      `Tu trabajo: dado un producto REAL, extraer problema/deseo/objeciones SIN INVENTAR y proponer 9 hooks distintos, UNO por arquetipo.\n` +
      `Reglas duras:\n` +
      `• NUNCA inventes precio, garantía, certificación, stock, envío gratis ni testimonios. Si no está en la ficha, no existe.\n` +
      `• Cada hook es la PRIMERA LÍNEA del anuncio (máx 15 palabras, pregunta o afirmación corta que detiene el scroll).\n` +
      `• Devuelve JSON: {"problemaPrincipal":str,"deseo":str,"objeciones":str[],"oportunidad":str,"angulos":str[],"lenguajeDelMercado":str[],"hipotesis":str[],"hooksPro":[{"arquetipo":enum,"angulo":str,"hook":str,"porQueConvierte":str}]}\n` +
      `Arquetipos válidos: ${ARQUETIPOS.map(a=>a.tipo).join(", ")} — uno de cada, sin repetir.\n` +
      `Idioma: español neutro, con giro colombiano si el país es CO.\n`,
    userPrompt:
      `Producto: ${product.name}\n` +
      `Descripción: ${product.description || "(sin descripción)"}\n` +
      `Precio: ${product.price ? `${product.currency || "COP"} ${product.price}` : "no definido"}\n` +
      `Características: ${(product.features || []).join(" | ") || "ninguna listada"}\n` +
      `Categoría: ${product.category || "general"} | País: ${pais}\n` +
      `${loQueYaFunciona ? `Lo que ya funciona en la cuenta: ${loQueYaFunciona}\n` : ""}` +
      `Arquetipos a cubrir (uno de cada):\n${ARQUETIPOS.map(a=>`- ${a.tipo}: ${a.instruccion}`).join("\n")}\n` +
      `Entrega los 9 hooks.`,
  });

  const hooks: HookPro[] = (ai?.hooksPro && ai.hooksPro.length >= 5
    ? ai.hooksPro.slice(0, 9)
    : hooksProFallback(product)
  ).map((h: any, i: number) => ({
    arquetipo: (ARQUETIPOS[i]?.tipo as HookArquetipo) || h.arquetipo || "Dolor_agudo",
    angulo: String(h.angulo || h.hook || "").slice(0, 80),
    hook: String(h.hook || "").slice(0, 90),
    porQueConvierte: String(h.porQueConvierte || h.angulo || "").slice(0, 120),
  }));

  // Asegurar 9 únicos
  while (hooks.length < 9) hooks.push(...hooksProFallback(product).slice(hooks.length, 9));

  const data: ResearchDeepResult = {
    problemaPrincipal: (ai?.problemaPrincipal as string) || base.problemaPrincipal,
    deseo: (ai?.deseo as string) || base.deseo,
    objeciones: (ai?.objeciones as string[])?.length ? (ai!.objeciones as string[]).slice(0, 6) : base.objeciones,
    oportunidad: (ai?.oportunidad as string) || base.oportunidad,
    angulos: (ai?.angulos as string[])?.length ? (ai!.angulos as string[]).slice(0, 9) : hooks.map(h=>h.hook),
    lenguajeDelMercado: (ai?.lenguajeDelMercado as string[])?.length ? (ai!.lenguajeDelMercado as string[]).slice(0, 8) : base.lenguajeDelMercado,
    hipotesis: (ai?.hipotesis as string[])?.length ? (ai!.hipotesis as string[]).slice(0, 5) : base.hipotesis,
    hooksPro: hooks,
    pais,
    referenciasUsadas,
    loQueYaFuncionaEnLaCuenta: loQueYaFunciona,
    notasParaCopy: [
      pais === "CO" ? "Usar COP, 'pago contraentrega' solo si el negocio lo ofrece de verdad." : `Adaptar moneda a ${pais}, no asumir COP.`,
      "Precio siempre con framing (no número suelto) y entrega (Drive / contraentrega / envío).",
      "Un gancho = una primera línea. No mezclar dos arquetipos en la misma variante.",
    ],
  };
  return data;
}
