/**
 * REVISAR UNA RESPUESTA DEL VENDEDOR — para el probador del dueño.
 *
 * El dueño (09-10-2026): "que el probador sea algo profesional, que sí
 * corrija y mejore; que no me responda eso porque es mentira". El probador
 * mostraba la respuesta y dependía de que el dueño encontrara lo falso a ojo.
 * Ahora cada respuesta se revisa sola contra los hechos y se le muestra qué
 * frase no se puede sostener y de dónde debería salir el dato.
 *
 * No es otra lista de palabras: usa las MISMAS familias de afirmaciones que
 * los anuncios y la ficha (anuncio-inteligente: PROMESAS y RESULTADOS) contra
 * el respaldo del producto, y las condiciones del negocio para lo de envío.
 */
import { afirmacionesSinRespaldo, respaldoDe } from "./anuncio-inteligente";
import { envioConfirmado, type CondicionesDelNegocio } from "./modelo-de-negocio";

export interface Alerta {
  /** promesa = el producto no la respalda · sin_configurar = dato del negocio que no está cargado. */
  tipo: "promesa" | "sin_configurar";
  frase: string;
  que: string;
  /** Qué hacer, en una línea, para el dueño. */
  arreglo: string;
  /** Corrección lista para mandarle al vendedor con un clic. */
  correccion?: string;
  /** Dónde se carga el dato que falta. */
  enlace?: string;
}

const HABLA_DE_ENVIO = /\benv[ií]os?\b|\bllega(r[aá])?\s+en\b|\bd[ií]as?\s+h[aá]biles\b|\btiempo\s+de\s+entrega\b/i;

export function revisarRespuesta(entrada: {
  textos: string[];
  producto?: { name?: unknown; description?: unknown; features?: unknown; highlight?: unknown } | null;
  condiciones?: CondicionesDelNegocio | null;
}): Alerta[] {
  const texto = entrada.textos.filter(Boolean).join("\n");
  if (!texto.trim()) return [];
  const alertas: Alerta[] = [];
  const vistas = new Set<string>();

  if (entrada.producto) {
    for (const a of afirmacionesSinRespaldo(texto, respaldoDe(entrada.producto as any))) {
      const k = a.frase.toLowerCase();
      if (vistas.has(k)) continue;
      vistas.add(k);
      alertas.push({
        tipo: "promesa",
        frase: a.frase,
        que: a.que,
        arreglo: `Promete ${a.que} y la ficha del producto no lo dice. Si es verdad, agrégalo en Productos; si no, corrígelo.`,
        correccion: `No digas "${a.frase}": no está en la ficha del producto. Habla solo de lo que la ficha dice.`,
      });
    }
  }

  if (entrada.condiciones && !envioConfirmado(entrada.condiciones)) {
    const m = texto.match(HABLA_DE_ENVIO);
    // "Te lo enviamos a tu dirección" no afirma nada; lo que no se puede es
    // ponerle costo o plazo a algo que el negocio no configuró.
    const afirmaAlgo = /\bincluid|\bgratis\b|\bsin\s+costo\b|\d+\s*(a|-|y)\s*\d+\s*d[ií]as?|\bllega(r[aá])?\s+en\s+\d/i.test(texto);
    if (m && afirmaAlgo && !vistas.has("envio")) {
      vistas.add("envio");
      alertas.push({
        tipo: "sin_configurar",
        frase: (texto.match(/[^\n.]*(incluid|gratis|sin\s+costo|\d+\s*(a|-|y)\s*\d+\s*d[ií]as?|llega(r[aá])?\s+en\s+\d)[^\n.]*/i)?.[0] || m[0]).trim(),
        que: "costo o tiempo de envío",
        arreglo: "Tu negocio no tiene configurado cuánto cuesta ni cuánto tarda el envío. Cárgalo en el Perfil del negocio y el vendedor lo dirá bien.",
        enlace: "/perfil-negocio",
      });
    }
  }

  return alertas;
}
