/**
 * Adaptador del prototipo ai_landing_page_studio_pro al stack VentasPro.
 *
 * Lo bueno del prototipo: selector de providers, tabs frontend/backend,
 * prompt editable y export. Lo que NO sirve tal cual:
 *   - keys en el navegador (inseguro) y llamadas directas a cada LLM
 *   - templates SaaS/agencia en inglés, sin COD Colombia
 *   - sin Dropi/Woo, sin geo de ciudades, sin sanear duplicados
 *   - usa `class=` en JSX (no compila en React)
 *
 * Acá se expone lo integrable: la cadena de providers SERVER-SIDE que ya
 * tenemos (agente-landing.ts) + el template COD PostureFit/dav cuyo
 * formulario postea al endpoint real de pedido (Dropi).
 */
export const PROVIDERS_VENTASPRO = [
  { id: "ventaspro", name: "VentasPro (auto: deepseek→groq→openrouter→ollama)", defaultModel: "auto", baseUrl: "/api/landing-studio/chat", requiresKey: false },
  { id: "deepseek", name: "DeepSeek", defaultModel: "deepseek-chat", baseUrl: "server-side", requiresKey: false },
  { id: "groq", name: "Groq API", defaultModel: "llama-3.3-70b-versatile", baseUrl: "server-side", requiresKey: false },
  { id: "openrouter", name: "OpenRouter", defaultModel: "qwen/qwen-2.5-7b-instruct:free", baseUrl: "server-side", requiresKey: false },
  { id: "cerebras", name: "Cerebras", defaultModel: "llama-3.1-8b-instruct", baseUrl: "server-side", requiresKey: false },
  { id: "ollama", name: "Ollama / EasyPanel", defaultModel: "llama3:latest", baseUrl: "server-side", requiresKey: false },
] as const;

export const TEMPLATE_COD_POSTUREFIT = {
  id: "cod-posturefit",
  name: "COD PostureFit / dav (la que convierte)",
  category: "Dropshipping COD Colombia",
  frontendPrompt:
    "Mobile-first Meta Ads CO: hero producto+oferta+CTA arriba, trust-line 3, beneficios cortos, historia visual, specs, oferta repetida, formulario corto COD, FAQ objeciones, sticky móvil. Familia clinica navy #10233D + azul #1769D3 + CTA verde #13B86A.",
  backendPrompt:
    "POST /api/landing-publica/:slug/pedido con {nombre, telefono, documento, direccion, barrio, ciudad, departamento, referencia, cantidad, cupon}. Valida zona Dropi, anti-duplicado 10min, WooCommerce + Dropi, responde {ok, gracias}. Sin cuentas bancarias en la página.",
  pedidoEndpoint: "/api/landing-publica/:slug/pedido",
  envioEndpoint: "/api/landing-publica/:slug/pedido".replace(/\/pedido$/, "/envio"),
} as const;
