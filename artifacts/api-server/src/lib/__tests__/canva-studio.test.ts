import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import { db, tenants, products } from "@workspace/db";
import { eq } from "drizzle-orm";
vi.mock("../credentials-vault", () => ({ encryptSecret: (s: string) => `enc:${s}`, decryptSecret: (s: string) => s.replace(/^enc:/, "") }));
vi.mock("../creativos/atlas", () => ({ crearCreativos: vi.fn(async (tid: number) => ({ ok: true, creativos: [{ id: "native-scene-1234", png: `/uploads/creativos/${tid}/fixture.png` }] })) }));
import { CANVA_SCOPES, canvaRequest } from "../canva-connector";
import { catalog, createJob, linkAd, mapFields, productData, registerTemplate, resumeJob, storeExport } from "../canva/studio";
import { getJob, jobs, saveJob, templates } from "../canva/store";
const API = "https://api.canva.com/rest/v1";
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.from("image-fixture")]);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let tid: number, pid: number, dir: string;
let calls: { url: string; body: any; auth: string }[];
let handler: (url: string, init: RequestInit) => Promise<Response> | Response;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "canva-studio-test-"));
  vi.stubEnv("IMAGE_STORE_DIR", path.join(dir, "uploads")); vi.stubEnv("CANVA_STUDIO_DIR", path.join(dir, "private")); vi.stubEnv("CREATIVOS_DIR", path.join(dir, "creatives"));
  vi.stubEnv("CANVA_CLIENT_ID", "test-client"); vi.stubEnv("CANVA_CLIENT_SECRET", "test-secret"); vi.stubEnv("CANVA_ENABLED", "true");
  const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [t] = await db.insert(tenants).values({ name: "Canva test", brandName: "Marca de prueba", slug: `cv-${key}`, email: `cv-${key}@test.local`, metadata: { canva: { accessToken: "enc:old", refreshToken: "enc:refresh", expiraEn: Date.now() + 3600000 } } } as any).returning(); tid = t.id;
  const [p] = await db.insert(products).values({ tenantId: tid, name: "Curso de piano", price: "60000", currency: "COP", description: "19 módulos. No incluye certificado.", features: ["19 módulos en video"], imageUrl: "https://example.com/piano.png", kind: "digital", isActive: true } as any).returning(); pid = p.id;
  calls = []; handler = () => { throw new Error("Petición no configurada"); };
  vi.stubGlobal("fetch", vi.fn(async (input: any, init: RequestInit = {}) => { const url = String(input); let body: any; try { body = JSON.parse(String(init.body)); } catch { body = init.body; } calls.push({ url, body, auth: String((init.headers as any)?.Authorization || "") }); return handler(url, init); }));
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });
async function finished(jobId: string) { for (let i = 0; i < 120; i++) { const j = await getJob(tid, jobId); if (j?.state === "listo" || j?.state === "error") return j; await delay(200); } throw new Error("El trabajo no terminó"); }
function provider() {
  let n = 0; const pending = new Map<string, string>();
  handler = (url, init) => {
    if (url.startsWith("https://export-download.canva.com/")) return new Response(png);
    const route = url.replace(API, "");
    if (route.endsWith("/dataset")) return json({ dataset: { titulo: { type: "text" }, valor: { type: "text" }, imagen: { type: "image" } } });
    if (init.method === "POST") {
      if (route === "/designs") return json({ design: { id: `D${++n}`, urls: { edit_url: `https://www.canva.com/design/D${n}/edit` } } });
      const id = `job-${++n}`; pending.set(id, route); return json({ job: { id, status: "in_progress" } });
    }
    const kind = pending.get(route.split("/").at(-1)!);
    if (kind === "/url-asset-uploads") return json({ job: { status: "success", asset: { id: "asset-piano" } } });
    if (kind === "/exports") return json({ job: { status: "success", urls: [`https://export-download.canva.com/${n}.png`] } });
    if (kind) return json({ job: { status: "success", result: { design: { id: `D${++n}`, urls: { edit_url: `https://www.canva.com/design/D${n}/edit` } } } } });
    if (route.startsWith("/designs?")) return json({ items: [], continuation: "next-page" });
    if (route.startsWith("/designs/")) return json({ design: { id: "source", urls: { edit_url: "https://www.canva.com/design/source/edit" } } });
    throw new Error(`Ruta inesperada: ${route}`);
  };
}
it("renueva al recibir 401 aunque el vencimiento guardado todavía no llegó", async () => {
  handler = (url, init) => url.endsWith("/oauth/token") ? json({ access_token: "fresh", refresh_token: "next", expires_in: 14400 }) : (init.headers as any).Authorization === "Bearer fresh" ? json({ items: [] }) : json({}, 401);
  expect(await canvaRequest(tid, "/designs?limit=1")).toEqual({ items: [] });
  expect(calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1); expect(calls.at(-1)?.auth).toBe("Bearer fresh");
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tid)); expect((t.metadata as any).canva.refreshToken).toBe("enc:next");
});
it("coordina renovaciones concurrentes para no reutilizar refresh tokens rotados", async () => {
  await db.update(tenants).set({ metadata: { canva: { accessToken: "enc:old", refreshToken: "enc:refresh", expiraEn: 1 } } } as any).where(eq(tenants.id, tid));
  handler = async (url) => { if (url.endsWith("/oauth/token")) { await delay(20); return json({ access_token: "fresh", refresh_token: "rotated" }); } return json({ items: [] }); };
  await Promise.all([canvaRequest(tid, "/designs?limit=1"), canvaRequest(tid, "/designs?limit=1")]); expect(calls.filter((c) => c.url.endsWith("/oauth/token"))).toHaveLength(1);
});
it("limita el reintento de autenticación y solicita el permiso de listar plantillas", async () => {
  handler = (url) => url.endsWith("/oauth/token") ? json({ access_token: "still-invalid" }) : json({}, 401);
  await expect(canvaRequest(tid, "/designs")).rejects.toMatchObject({ code: "reconnect_required" }); expect(calls).toHaveLength(3); expect(CANVA_SCOPES).toContain("brandtemplate:meta:read");
});
it("valida campos y cambios de esquema antes de crear copias", () => {
  const ds = { headline: { type: "text" }, image: { type: "image" } };
  expect(() => mapFields(ds, { headline: "nombre" }, { nombre: "Piano", foto: "x" })).toThrow(/Asigna/);
  expect(() => mapFields(ds, { headline: "precio", image: "foto", viejo: "nombre" }, { precio: "60000", foto: "x" })).toThrow(/cambió/);
  expect(mapFields(ds, { headline: "precio", image: "foto" }, { precio: "60000 COP", foto: "x" }, { foto: "asset1" })).toEqual({ headline: { type: "text", text: "60000 COP" }, image: { type: "image", asset_id: "asset1" } });
});
it("aísla productos, plantillas y rutas por negocio", async () => {
  provider(); await expect(productData(tid + 999, pid)).rejects.toMatchObject({ status: 404 });
  await registerTemplate(tid, { sourceType: "design", sourceId: "D1", family: "digital", title: "Piano", mapping: { titulo: "nombre", valor: "precio", imagen: "foto" } });
  expect(await templates(tid)).toHaveLength(1); expect(await templates(tid + 999)).toHaveLength(0); expect(await getJob(tid, "../../templates")).toBeNull();
});
it("conserva paginación del catálogo", async () => { provider(); expect((await catalog(tid, "piano", "page-two")).continuation).toBe("next-page"); expect(calls[0].url).toContain("continuation=page-two"); });
it("guarda bytes permanentes y rechaza destinos o contenido manipulados", async () => {
  handler = () => new Response(png); const saved = await storeExport(tid, "https://export-download.canva.com/test.png", "png");
  expect(await readFile(path.join(dir, "uploads", saved.url.replace(/^\/uploads\//, "")))).toEqual(png);
  await expect(storeExport(tid, "https://canva.com.attacker.test/test.png", "png")).rejects.toThrow(/no permitida/);
  handler = () => new Response("<html>wrong file</html>"); await expect(storeExport(tid, "https://export-download.canva.com/test.png", "png")).rejects.toThrow(/no coincide/);
});
it("crea dos medidas con el precio real, conserva archivos y evita duplicar la solicitud", async () => {
  provider(); const t = await registerTemplate(tid, { sourceType: "design", sourceId: "source", family: "digital", title: "Piano", mapping: { titulo: "gancho", valor: "precio", imagen: "foto" } });
  const input = { requestId: "request-idempotent-123", productId: pid, templateId: t.id, formats: ["4:5", "9:16"], threeAngles: false, texts: { precio: "1 COP" } };
  const j = await createJob(tid, input); expect((await createJob(tid, input)).id).toBe(j.id);
  const done = await finished(j.id); expect(done.state, done.error).toBe("listo"); expect(done.pieces).toHaveLength(2);
  expect(done.pieces.every((p) => p.files?.[0].url.startsWith(`/uploads/canva/${tid}/`))).toBe(true);
  const fills = calls.filter((c) => c.url === `${API}/autofills`); expect(fills).toHaveLength(1); expect(fills[0].body.data.valor.text).toBe("60.000 COP"); expect(fills[0].body.type).toBe("create_from_design");
  expect(calls.filter((c) => c.url === `${API}/resizes`).map((c) => c.body.design_type.height)).toEqual([1350, 1920]);
  expect(await jobs(tid + 999)).toEqual([]); expect(await getJob(tid + 999, j.id)).toBeNull(); expect((await resumeJob(tid, j.id)).state).toBe("listo");
}, 30000);
it("las familias Studio conservan las capas nativas y crean la copia de Canva sin plantillas", async () => {
  provider(); const j = await createJob(tid, { requestId: "native-job-1234", productId: pid, native: true, formats: ["4:5"], threeAngles: false });
  const done = await finished(j.id); expect(done.state, done.error).toBe("listo"); expect(done.pieces[0].creativeId).toBe("native-scene-1234"); expect(done.pieces[0].designId).toBeTruthy();
  expect(calls.some((c) => c.url === `${API}/designs` && c.body.asset_id === "asset-piano")).toBe(true);
}, 10000);

it("reanuda una copia nativa rechazada sin repetir el render ni la subida", async () => {
  provider(); const base = handler; let reject = true;
  handler = (url, init) => url === `${API}/designs` && init.method === "POST" && reject ? json({}, 403) : base(url, init);
  const j = await createJob(tid, { requestId: "native-retry-1234", productId: pid, native: true, formats: ["4:5"], threeAngles: false });
  const failed = await finished(j.id); expect(failed.state).toBe("error"); expect(failed.pieces[0].creativeId).toBeTruthy(); expect(failed.pieces[0].designId).toBeUndefined();
  reject = false; await resumeJob(tid, j.id); const done = await finished(j.id); expect(done.state, done.error).toBe("listo");
  expect(calls.filter((c) => c.url === `${API}/url-asset-uploads`)).toHaveLength(1);
}, 10000);
it("un anuncio no puede atribuirse a dos variantes aunque se vinculen a la vez", async () => {
  const make = (id: string) => ({ id, tenantId: tid, productId: pid, productName: "Piano", objective: "mensajes", usage: "anuncio", state: "listo", phase: "Listo", exportFormat: "png", created: new Date().toISOString(), updated: new Date().toISOString(), texts: {}, requestHash: id, pieces: [{ key: "beneficio", angle: "beneficio", format: "4:5" }] } as any);
  await saveJob(make("first-ad-job")); await saveJob(make("second-ad-job"));
  const result = await Promise.allSettled([linkAd(tid, "first-ad-job", "beneficio", "123456789"), linkAd(tid, "second-ad-job", "beneficio", "123456789")]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1); expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
});
