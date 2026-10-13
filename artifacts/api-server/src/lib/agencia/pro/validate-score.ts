/**
 * AGENCIA PRO — ValidateScore
 * ===========================
 * Validador ligero (sin LLM) para copy y creativo pro.
 * - No deja pasar promesas vacías (garantía/certificación/envío gratis/stock/testimonios inventados).
 * - Score 0-100: ≥70 publica, <70 corrige una vez, <50 bloquea.
 */
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";

export interface ValidadorResultado {
  score: number; // 0-100
  ok: boolean;   // score >=70
  motivos: string[]; // por qué bajó
  bloqueado: boolean; // score <50 o invento grave
}

const PATRONES_INVENTO: Array<{ re: RegExp; msg: string; grave?: boolean }> = [
  { re: /garant[ií]a\s+de\s+devoluci[oó]n|satisfacci[oó]n\s+garantizada|reembolso\s+garantizado/i, msg: "Afirma garantía de devolución sin respaldo en ficha" },
  { re: /certificad[oa]s?\b|avalad[oa]s?\s+por/i, msg: "Afirma certificación/aval sin respaldo", grave: true },
  { re: /env[ií]o\s+gratis/i, msg: "Afirma envío gratis sin respaldo (verificar negocio)" },
  { re: /stock\s+limitado|quedan\s+pocas\s+unidades|últimas\s+unidades/i, msg: "Afirma escasez/stock sin dato real" },
  { re: /miles\s+de\s+clientes|\+?\s*\d{3,}\s+clientes\s+satisfechos/i, msg: "Afirma volumen de clientes sin dato" },
  { re: /resultados?\s+garantizados|100\s*%\s*garantizado/i, msg: "Promete resultado garantizado", grave: true },
  { re: /original|oficial/i, msg: "Afirma 'original/oficial' sin marca verificada" },
];

const COPY_REGLAS: Array<{ test: (t: string, p: ProductInfo) => boolean; msg: string; peso: number }> = [
  { test: (t) => t.split("\n").filter(l=>l.trim()).length > 14, msg: "Primary demasiado largo (>14 líneas): se lee como folleto", peso: 10 },
  { test: (t) => !t.includes("✅") && !t.includes("•") && !t.includes("✔"), msg: "Sin bullets de beneficios", peso: 12 },
  { test: (t) => (t.match(/!/g) || []).length > 3, msg: "Exceso de exclamaciones", peso: 6 },
  { test: (t) => /tenemos disponible|nuevo ingreso|oferta imperdible/i.test(t), msg: "Gancho genérico ('tenemos disponible'/'oferta imperdible')", peso: 10 },
  { test: (t, p) => !!p.price && !t.includes(String(Math.round(p.price/1000))) && !t.includes(p.price.toLocaleString("es-CO").slice(0,4)), msg: "No menciona el precio real", peso: 14 },
  { test: (t) => !/whatsapp|comprar|ver m[aá]s|pedir/i.test(t), msg: "Sin CTA clara", peso: 12 },
];

export function validarCopy(
  variants: Array<{ primaryText: string; headline?: string; description?: string }>,
  product: ProductInfo,
): ValidadorResultado {
  let score = 100;
  const motivos: string[] = [];
  let grave = false;

  for (const v of variants) {
    const texto = `${v.primaryText || ""} ${v.headline || ""} ${v.description || ""}`;
    for (const { re, msg, grave: g } of PATRONES_INVENTO) {
      if (re.test(texto)) {
        score -= g ? 28 : 18;
        motivos.push(msg);
        if (g) grave = true;
      }
    }
    for (const r of COPY_REGLAS) {
      if (r.test(texto, product)) {
        score -= r.peso;
        if (!motivos.includes(r.msg)) motivos.push(r.msg);
      }
    }
    if ((v.headline || "").length > 40) {
      score -= 8;
      motivos.push(`Headline >40 chars (${(v.headline||"").length})`);
    }
    if ((v.primaryText || "").length < 120) {
      score -= 10;
      motivos.push("Primary demasiado corto (<120 chars), se ve pobre");
    }
  }

  score = Math.max(0, Math.min(100, score));
  const bloqueado = grave || score < 50;
  return { score, ok: score >= 70 && !bloqueado, motivos: [...new Set(motivos)], bloqueado };
}

export function validarCreativo(
  creativos: Array<{ imagePrompt?: string; hookEnImagen?: string; formato?: string }>,
): ValidadorResultado {
  let score = 100;
  const motivos: string[] = [];
  for (const c of creativos) {
    if (!c.imagePrompt || c.imagePrompt.length < 30) {
      score -= 20; motivos.push("imagePrompt vacío o demasiado corto");
    }
    if (c.hookEnImagen && c.hookEnImagen.split(" ").length > 6) {
      score -= 12; motivos.push(`Hook en imagen >6 palabras: "${c.hookEnImagen.slice(0,40)}"`);
    }
    if (c.formato && !/4:5|1:1|9:16|vertical/i.test(c.formato)) {
      score -= 6; motivos.push(`Formato no estándar: ${c.formato}`);
    }
    if (/garant|certific|envio gratis/i.test(c.imagePrompt || "")) {
      score -= 18; motivos.push("Creativo afirma garantía/envío gratis sin respaldo");
    }
  }
  score = Math.max(0, Math.min(100, score));
  return { score, ok: score >= 70, motivos: [...new Set(motivos)], bloqueado: score < 50 };
}
