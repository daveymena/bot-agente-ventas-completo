// Sirve el panel COMPILADO (dist/public) con un API simulado, para ver y medir
// pantallas en un navegador sin tocar produccion ni loguearse. Productos: el
// JSON publico de una tienda (curl https://ventasproia.com/api/public/products/<slug> > cat.json).
//   node scripts/panel-simulado.mjs dist/public cat.json 4173   → http://localhost:4173/products
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const [dist, catalogo, puerto = "4173"] = process.argv.slice(2);
const cat = JSON.parse(readFileSync(catalogo, "utf8"));
const lista = (Array.isArray(cat) ? cat : cat.products).map((p, i) => ({
  id: p.id, name: p.name, description: p.description, price: String(p.price), currency: p.currency || "COP",
  kind: p.kind || "physical", imageUrl: p.image, features: p.features || [], isActive: true,
  categoryId: (i % 4) + 1, tenantId: 1, createdAt: new Date().toISOString(),
}));
const categorias = [
  { id: 1, name: "Alimentos y suplementos", icon: "🥗", color: "#43A047" },
  { id: 2, name: "Bebés y maternidad", icon: "🍼", color: "#EC8FA3" },
  { id: 3, name: "Salud y bienestar", icon: "🩺", color: "#0E9F8A" },
  { id: 4, name: "Hogar y organización", icon: "🏠", color: "#D97706" },
];
const tenant = { id: 1, name: "Prueba", brandName: "Prueba", email: "x@x.co", plan: "pro", status: "active", isAdmin: true, onboardingCompleted: true, trialDaysRemaining: null };
const TIPOS = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const json = (d) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(d)); };
  if (url.pathname.startsWith("/images/")) { res.writeHead(302, { location: `https://ventasproia.com${url.pathname}` }); return res.end(); }
  if (url.pathname.startsWith("/api/")) {
    if (url.pathname === "/api/auth/me") return json({ tenant, user: tenant });
    if (url.pathname === "/api/products") return json(lista);
    if (url.pathname === "/api/categories") return json(categorias);
    if (url.pathname === "/api/conversations") {
      return json([{ id: 1, contactName: "Ana Pérez", contactPhone: "573001234567", status: "human", lastMessage: "¿cuánto vale?", lastMessageAt: new Date().toISOString(), unreadCount: 0, currentStage: "cierre", channel: "whatsapp" }]);
    }
    if (/^\/api\/conversations\/1\/messages/.test(url.pathname)) {
      const msgs = [];
      for (let i = 0; i < 60; i++) {
        msgs.push({ id: i + 1, conversationId: 1, role: i % 2 ? "agent" : "customer", content: i % 2 ? `Claro, te cuento del corrector ${i}.\n\nEs ajustable y llega en 3 a 5 días.` : `pregunta ${i}: ¿y cómo llega?`, stage: "cierre", createdAt: new Date(Date.now() - (60 - i) * 3600000).toISOString() });
      }
      return json(msgs);
    }
    if (url.pathname === "/api/conversations/1") {
      return json({ id: 1, contactName: "Ana Pérez", contactPhone: "573001234567", status: "human", currentStage: "cierre", channel: "whatsapp" });
    }
    if (url.pathname === "/api/code-agent/history") {
      // Un historial largo como el de un admin real: 40 turnos, respuestas
      // de Atlas con títulos, listas y tablas en Markdown.
      const respuesta = (i) => `## Plan ${i}\n\nRevisé el catálogo y encontré **3 cosas** para mejorar:\n\n- El corrector #201 tiene el nombre equivocado\n- Las fotos de 3 productos miden menos de 600 px\n- La landing del corrector usa colores de belleza\n\n| Producto | Estado | Acción |\n|---|---|---|\n| Corrector X | ✅ | Publicar |\n| Faja | ⚠️ | Revisar foto |\n| Rodillera | ❌ | Subir foto |\n\n1. Primero renombro\n2. Después regenero la landing\n3. Por último subo el anuncio en pausa\n\n\`\`\`\nfb_upload_draft_to_meta #${i}\n\`\`\`\n\n¿Lo hago?`;
      const history = [];
      for (let i = 0; i < 40; i++) {
        history.push({ role: "user", content: `pedido ${i}: revisá los correctores y armá el anuncio`, at: Date.now() - (40 - i) * 60000 });
        history.push({ role: "assistant", content: respuesta(i), at: Date.now() - (40 - i) * 60000 + 30000 });
      }
      return json({ history });
    }
    return json(url.pathname.endsWith("s") ? [] : {});
  }
  let f = path.join(dist, decodeURIComponent(url.pathname));
  if (!existsSync(f) || !path.extname(f)) f = path.join(dist, "index.html");
  res.writeHead(200, { "content-type": TIPOS[path.extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(Number(puerto), () => console.log(`panel simulado en http://localhost:${puerto}`));
