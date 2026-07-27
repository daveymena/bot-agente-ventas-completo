/**
 * Píxel de Meta para la tienda.
 *
 * El ID NO va escrito en el código: llega del API por tenant, porque en el SaaS
 * cada tienda mide en su propia cuenta. Por eso el script se inyecta en runtime
 * y no con una etiqueta fija en index.html.
 *
 * Si el tenant no tiene píxel configurado, todas las funciones son inertes —
 * la tienda sigue funcionando igual, simplemente no mide.
 */

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

let initialized = false;
let currentPixelId: string | null = null;

/**
 * Carga el píxel una sola vez. Llamar en cada render es seguro: si ya está
 * cargado con el mismo ID no hace nada (recargarlo duplicaría los PageView).
 */
export function initPixel(pixelId?: string | null): void {
  if (!pixelId || typeof window === "undefined") return;
  if (initialized && currentPixelId === pixelId) return;

  if (!window.fbq) {
    /* eslint-disable */
    // Snippet oficial de Meta, adaptado a TypeScript.
    (function (f: any, b: Document, e: string, v: string) {
      let n: any, t: any, s: any;
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e) as HTMLScriptElement;
      t.async = true;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode?.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
  }

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");

  initialized = true;
  currentPixelId = pixelId;
}

function track(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.fbq || !initialized) return;
  window.fbq("track", event, params);
}

/** Cliente abrió la ficha de un producto */
export function trackViewContent(p: {
  id: number | string;
  name: string;
  price: number;
  currency?: string | null;
  category?: string;
}): void {
  track("ViewContent", {
    content_ids: [String(p.id)],
    content_name: p.name,
    content_type: "product",
    content_category: p.category,
    value: p.price,
    currency: p.currency || "COP",
  });
}

/** Cliente agregó al carrito */
export function trackAddToCart(p: {
  id: number | string;
  name: string;
  price: number;
  currency?: string | null;
}): void {
  track("AddToCart", {
    content_ids: [String(p.id)],
    content_name: p.name,
    content_type: "product",
    value: p.price,
    currency: p.currency || "COP",
  });
}

/**
 * Cliente inició el pago. Se dispara ANTES de redirigir a la pasarela: una vez
 * fuera del sitio ya no se puede medir, y este es el último punto propio del
 * embudo. La compra confirmada la reporta el webhook desde el servidor.
 */
export function trackInitiateCheckout(items: {
  ids: (number | string)[];
  value: number;
  currency?: string | null;
}): void {
  track("InitiateCheckout", {
    content_ids: items.ids.map(String),
    content_type: "product",
    num_items: items.ids.length,
    value: items.value,
    currency: items.currency || "COP",
  });
}

/** Cliente pidió información por WhatsApp — señal fuerte de intención */
export function trackContact(source: string): void {
  track("Contact", { content_name: source });
}
