/**
 * @vitest-environment jsdom
 *
 * Smoke test del frontend: renderiza las rutas principales contra la API real
 * (STOCK_API_URL, por defecto http://localhost:3010) y comprueba que aparece el
 * contenido esperado sin errores de React. Se salta si la API no responde.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/store/auth";
import { TooltipProvider, Toaster } from "@/components/ui";
import { AuthDialog } from "@/components/AuthDialog";
import { SaveDialog } from "@/components/assets/SaveDialog";
import App from "@/App";

const API = process.env.STOCK_API_URL || "http://localhost:3010";
let apiUp = false;
let cookie = "";
const errors: string[] = [];

// ── Entorno de navegador mínimo que jsdom no trae ─────────────────────────
class RO { observe() {} unobserve() {} disconnect() {} }
class IO { constructor(_cb: any) {} observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
(globalThis as any).ResizeObserver = RO;
(globalThis as any).IntersectionObserver = IO;
window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } as any));
window.scrollTo = () => {};
(HTMLMediaElement.prototype as any).play = () => Promise.resolve();
(HTMLMediaElement.prototype as any).pause = () => {};
(HTMLMediaElement.prototype as any).load = () => {};
(URL as any).createObjectURL = () => "blob:test"; (URL as any).revokeObjectURL = () => {};
(Element.prototype as any).scrollIntoView = () => {};
(Element.prototype as any).hasPointerCapture = () => false; (Element.prototype as any).setPointerCapture = () => {}; (Element.prototype as any).releasePointerCapture = () => {};

// fetch relativo → API real, con un cookie jar manual.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: RequestInit = {}) => {
  const url = typeof input === "string" && input.startsWith("/") ? API + input : input;
  const headers = new Headers(init.headers || {});
  if (cookie) headers.set("cookie", cookie);
  const res = await realFetch(url, { ...init, headers });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return res;
}) as any;

function Providers({ route, children }: { route: string; children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return (
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[route]}><AuthProvider><TooltipProvider>{children}<AuthDialog /><SaveDialog /><Toaster /></TooltipProvider></AuthProvider></MemoryRouter></QueryClientProvider>
  );
}
const mount = (route: string) => render(<Providers route={route}><App /></Providers>);
const findText = (re: RegExp | string, timeout = 15_000) => screen.findAllByText(re, {}, { timeout });

async function login(email: string, password: string) {
  cookie = "";
  const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
}

beforeAll(async () => {
  try { apiUp = (await realFetch(`${API}/api/meta`)).ok; } catch { apiUp = false; }
  vi.spyOn(console, "error").mockImplementation((...a: any[]) => { const m = a.map(String).join(" "); if (!/not implemented|act\(|Warning:/i.test(m)) errors.push(m); });
});
afterEach(() => { cleanup(); cookie = ""; });

describe.skipIf(!process.env.STOCK_API_URL && !(await (async () => { try { return (await realFetch(`${API}/api/meta`)).ok; } catch { return false; } })()))("frontend contra la API", () => {
  it("portada", async () => { mount("/"); await findText(/Explora categorías populares/i); await findText(/IA Studio/i); expect(errors).toEqual([]); });
  it("búsqueda con resultados y facetas", async () => { mount("/buscar?q=cafe"); await findText(/resultados/i); await waitFor(() => expect(document.querySelectorAll("a[href*='/imagenes/'],a[href*='/video/'],a[href*='/audio/']").length).toBeGreaterThan(0), { timeout: 15_000 }); expect(errors).toEqual([]); });
  it("búsqueda sin resultados muestra vacío", async () => { mount("/buscar?q=zzzzqqqxxx"); await findText(/No encontramos resultados/i); expect(errors).toEqual([]); });
  it("ficha de recurso con caja de licencia", async () => {
    const s = await (await fetch("/api/search?perPage=1&tab=images")).json();
    const a = s.items[0];
    mount(`/imagenes/x/${a.id}`);
    await findText(new RegExp(a.title.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    await findText(/Licenciar este recurso|Ya tenés licencia/i);
    await findText(/Palabras clave/i);
    expect(errors).toEqual([]);
  });
  it("ficha de vídeo y de audio", async () => {
    const v = (await (await fetch("/api/search?perPage=1&tab=video")).json()).items[0];
    mount(`/video/x/${v.id}`); await findText(/Licenciar este recurso/i); cleanup();
    const au = (await (await fetch("/api/search?perPage=1&tab=audio")).json()).items[0];
    mount(`/audio/x/${au.id}`); await findText(/Licenciar este recurso/i);
    expect(errors).toEqual([]);
  });
  it("precios, licencias, bibliotecas, IA, colaborar", async () => {
    mount("/precios"); await findText(/Paquetes de créditos/i); cleanup();
    mount("/licencias"); await findText(/Licencia ampliada/i); cleanup();
    mount("/bibliotecas"); await findText(/Colecciones seleccionadas/i); cleanup();
    mount("/ia"); await findText(/Tus generaciones/i); cleanup();
    mount("/colaborar"); await findText(/Programa de colaboradores/i); cleanup();
    mount("/no-existe"); await findText(/404/);
    expect(errors).toEqual([]);
  });
  it("colección curada", async () => {
    const cols = await (await fetch("/api/collections")).json();
    mount(`/bibliotecas/${cols[0].slug}`); await findText(new RegExp(cols[0].title.slice(0, 12), "i"));
    expect(errors).toEqual([]);
  });
  it("cuenta de cliente", async () => {
    await login("cliente@stock.local", "demo12345");
    mount("/cuenta/licencias"); await findText(/Licencias y descargas/i); cleanup();
    mount("/cuenta/creditos"); await findText(/Movimientos de créditos/i); cleanup();
    mount("/cuenta/perfil"); await findText(/Sesiones activas/i);
    expect(errors).toEqual([]);
  });
  it("panel de colaborador", async () => {
    await login("laura@stock.local", "demo12345");
    mount("/colaborador"); await findText(/Recursos publicados/i); cleanup();
    mount("/colaborador/recursos"); await findText(/Publicados/i); await waitFor(() => expect(document.querySelectorAll("li").length).toBeGreaterThan(0), { timeout: 15_000 }); cleanup();
    mount("/colaborador/subir"); await findText(/Arrastrá tus archivos/i); cleanup();
    mount("/colaborador/ganancias"); await findText(/Solicitar retiro/i);
    expect(errors).toEqual([]);
  });
  it("panel de administración", async () => {
    await login("admin@stock.local", "admin12345");
    mount("/admin"); await findText(/Ingresos \(pagados\)/i); cleanup();
    mount("/admin/moderacion"); await findText(/Cola de revisión/i); cleanup();
    mount("/admin/recursos"); await findText(/Publicados/i); cleanup();
    mount("/admin/usuarios"); await findText(/admin@stock.local/i); cleanup();
    mount("/admin/pedidos"); await findText(/Pedidos/i); cleanup();
    mount("/admin/pagos"); await findText(/Retiros de colaboradores/i); cleanup();
    mount("/admin/colecciones"); await findText(/Colecciones curadas/i); cleanup();
    mount("/admin/ajustes"); await findText(/Título del hero/i);
    expect(errors).toEqual([]);
  });

  it("flujo: iniciar sesión desde el header, guardar en biblioteca y licenciar", async () => {
    const a = (await (await fetch("/api/search?perPage=1&tab=images&price=free")).json()).items[0] || (await (await fetch("/api/search?perPage=1&tab=images")).json()).items[0];
    mount(`/imagenes/x/${a.id}`);
    await findText(/Licenciar este recurso|Ya tenés licencia/i);
    // Abrir diálogo de acceso
    fireEvent.click((await screen.findAllByText("Iniciar sesión"))[0]);
    const email = await screen.findByPlaceholderText("tu@correo.com");
    fireEvent.change(email, { target: { value: "cliente@stock.local" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "demo12345" } });
    fireEvent.submit(email.closest("form")!);
    await waitFor(() => expect(cookie).toContain("="), { timeout: 10_000 });
    await findText(/créditos|Ya tenés licencia|Descargar gratis/i);
    // Guardar en biblioteca
    fireEvent.click((await screen.findAllByText(/^Guardar|^Guardado/))[0]);
    await findText(/Guardar en una biblioteca/i);
    expect(errors).toEqual([]);
    cleanup();
    // Licenciar (o reutilizar si ya estaba licenciado)
    mount(`/imagenes/x/${a.id}`);
    const state = await findText(/Licenciar por|Descargar gratis|Descargar con mi plan|Ya tenés licencia/i);
    if (!/Ya tenés licencia/.test(state[0].textContent || "")) { fireEvent.click(state[0].closest("button")!); await findText(/¡Licencia lista!/i); }
    expect(errors).toEqual([]);
  }, 60_000);
});
