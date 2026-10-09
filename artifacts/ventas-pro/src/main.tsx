import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registrarSW } from "./lib/pwa";

// PWA: service worker (shell offline + push). No bloquea el arranque.
if (typeof window !== "undefined") {
  if (document.readyState === "complete") registrarSW();
  else window.addEventListener("load", () => registrarSW());
}

// Error handler global
window.addEventListener("error", (event) => {
  console.error("❌ Error global:", event.error);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("❌ Promise rejection:", event.reason);
});

const root = document.getElementById("root");
if (!root) {
  console.error("❌ No se encontró el elemento #root");
  document.body.innerHTML = "<h1>Error: No se encontró el elemento root</h1>";
} else {
  console.log("✅ Elemento root encontrado, renderizando App...");
  try {
    createRoot(root).render(<App />);
    console.log("✅ App renderizada exitosamente");
  } catch (error) {
    console.error("❌ Error renderizando App:", error);
    root.innerHTML = `<h1>Error renderizando la app: ${error}</h1>`;
  }
}
