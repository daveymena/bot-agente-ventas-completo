/**
 * PASO 2 del plan de landings: la MISMA landing con cada modelo de Ollama.
 *
 * El brief es el del Pañalera REAL (163, ficha limpia de la basura de
 * importación), con las reglas de SIEMPRE: nada inventado, beneficios de la
 * ficha, español colombiano. La evaluación es objetiva:
 *   · ¿responde con JSON válido?
 *   · ¿tiene las secciones requeridas?
 *   · ¿inventó datos (testimonios, estrellas, urgencia)?
 *   · ¿usó los beneficios de la ficha (los "compartment/cuna/compartimentos")?
 */
import { writeFileSync } from "node:fs";

const HOST = process.env.OLLAMA_HOST || "http://161.97.182.95:11434";

const PRODUCTO = {
  nombre: "Pañalera Mochila Multifuncional 2 en 1",
  ficha: [
    "Es el accesorio ideal para padres modernos.",
    "Se convierte en una cuna portátil para cambiar pañales o dar descanso al bebé durante viajes, paseos o salidas.",
    "Múltiples compartimentos para organizar pañales, teteros, ropa, juguetes, toallitas y accesorios, todo al alcance.",
    "Elegante, espaciosa y resistente al agua.",
  ],
  precio: "$110.990 COP",
  entrega: "pago contra entrega, llega en 3 a 5 días hábiles a todo el país",
};

const PROMPT = `Escribe los TEXTOS de una landing de producto. Devuelve SOLO JSON válido:
{"secciones":[{"type":"hero","title":"...","subtitle":"...","cta":"Pedir ahora"},{"type":"benefits","title":"...","body":"una línea por beneficio, 3 a 5"},{"type":"how-it-works","title":"...","body":"3 pasos, una línea por paso"},{"type":"offer","title":"...","body":"la oferta real","cta":"Pedir ahora"},{"type":"logistics","title":"Envío y pago","body":"las condiciones reales"},{"type":"faq","title":"Preguntas frecuentes","body":"Pregunta | Respuesta (4), una por línea"},{"type":"cta","title":"...","cta":"Pedir ahora"}]}

PRODUCTO: ${PRODUCTO.nombre}
FICHA (lo único verdadero):
${PRODUCTO.ficha.map((x) => "- " + x).join("\n")}
PRECIO: ${PRODUCTO.precio}
ENTREGA: ${PRODUCTO.entrega}

REGLAS (obligatorias):
- SOLO con los datos de la ficha. NO inventes testimonios, estrellas, premios, cifras de clientes, garantías, urgencia, descuentos ni "precio tachado".
- El hero es una pregunta de dolor concreta (lo que el mercado de dropshipping usa) o el beneficio central.
- Los beneficios salen de la ficha, en español colombiano, sin relleno ni adjetivos genérico.
- En faq responde con datos de la ficha o la entrega dada; si la ficha no lo dice, no se pregunta.`;

const MODELOS = ["gpt-oss:120b-cloud", "gemma4:31b-cloud", "gpt-oss:20b-cloud"];

const out: any = { cuando: new Date().toISOString(), producto: PRODUCTO.nombre, modelos: {} };

for (const m of MODELOS) {
  const t0 = Date.now();
  process.stdout.write(`[${m}]: `);
  try {
    const r = await fetch(`${HOST}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: m, messages: [{ role: "user", content: PROMPT }], stream: false, format: "json", options: { temperature: 0.4, num_ctx: 16384 } }),
    });
    if (!r.ok) { out.modelos[m] = { error: `HTTP ${r.status}` }; console.log(`HTTP ${r.status}`); continue; }
    const j = await r.json() as any;
    const texto = String(j.message?.content ?? "");
    let secciones: any[] = [];
    try { secciones = (JSON.parse(texto).secciones ?? JSON.parse(texto).sections ?? []); } catch { }
    const todo = secciones.map((s) => `${s.title || ""} ${s.subtitle || ""} ${s.body || ""}`).join("\n");
    const tipos = secciones.map((s) => String(s.type));
    const requeridas = ["hero", "benefits", "how-it-works", "offer", "logistics", "faq", "cta"];
    const faltan = requeridas.filter((t) => !tipos.includes(t));
    const inventos = {
      testimonios: /(testimonio|reseñ|me encantó|la recomiendo)/i.test(todo),
      estrellas: /(★★|4\.9|5\/5|estrellas)/i.test(todo),
      urgencia: /(solo hoy|últimas unidades|reloj|cuenta regresiva)/i.test(todo),
      garantiaInventada: /(garantía de por vida|devolución total)/i.test(todo),
    };
    const usaFicha = PRODUCTO.ficha.filter((f) => {
      const palabras = f.toLowerCase().split(/\s+/).filter((w) => w.length > 5);
      return palabras.filter((w) => todo.toLowerCase().includes(w.slice(0, -1))).length >= 2;
    }).length;
    out.modelos[m] = {
      ms: Date.now() - t0,
      jsonOk: secciones.length > 0,
      secciones: secciones.length,
      faltan,
      chars: texto.length,
      invento: inventos,
      beneficiosDeFicha: `${usaFicha}/${PRODUCTO.ficha.length}`,
      contenido: secciones,
    };
    console.log(`${secciones.length} secciones · ${out.modelos[m].beneficiosDeFicha} beneficios de ficha · invento=${JSON.stringify(inventos).replace(/true/g, "SI").replace(/false/g, "no")}`);
  } catch (e: any) {
    out.modelos[m] = { error: String(e?.message || e).slice(0, 150) };
    console.log(`fallo: ${out.modelos[m].error}`);
  }
}

writeFileSync("landings-ollama.json", JSON.stringify(out, null, 2));
console.log("guardado: landings-ollama.json");
process.exit(0);