import { catalog, createJob, FIELDS, linkAd, listJobs, productData, registerTemplate, resumeJob, sourceDataset } from "./studio";
import { templates } from "./store";

export async function readCanvaStudio(tenantId: number, a: any) {
  switch (a.accion) {
    case "catalogo": return catalog(tenantId, String(a.query || ""), String(a.continuation || ""), a.sourceType === "brand_template" ? "brand_template" : "design");
    case "dataset": return { dataset: await sourceDataset(tenantId, a.sourceType === "brand_template" ? "brand_template" : "design", a.sourceId), fields: FIELDS };
    case "producto": return productData(tenantId, Number(a.productId));
    case "plantillas": return { items: await templates(tenantId), fields: FIELDS };
    case "resultados": {
      const { getAttributionSummary } = await import("../marketing-team/attribution");
      const result = await getAttributionSummary(tenantId, 30);
      const bindings = (await listJobs(tenantId)).flatMap((j) => j.pieces.flatMap((p) => (p.adIds || []).map((adId) => ({ jobId: j.id, pieceKey: p.key, adId }))));
      return { days: 30, items: bindings.map((b) => ({ ...b, attribution: result.rows.find((r) => r.adId === b.adId) || null })) };
    }
    case "trabajos": return { items: await listJobs(tenantId) };
    default: throw new Error("Acción de lectura: catalogo, dataset, producto, plantillas, trabajos o resultados");
  }
}
export async function prepareCanvaStudio(tenantId: number, a: any) {
  switch (a.accion) {
    case "paquete": case "importar": { const j = await createJob(tenantId, { ...a, native: !a.templateId && !a.designId }); return { id: j.id, state: j.state, url: `/estudio?espacio=canva&producto=${j.productId}`, mensaje: "Paquete en cola. Consulta trabajos para ver el progreso y las vistas previas. No se ha publicado ningún anuncio." }; }
    case "plantilla": return registerTemplate(tenantId, a);
    case "continuar": { const j = await resumeJob(tenantId, a.jobId); return { id: j.id, state: j.state }; }
    case "vincular": { await linkAd(tenantId, a.jobId, a.pieceKey, a.adId); return { ok: true }; }
    default: throw new Error("Acción de borrador: paquete, importar, plantilla, continuar o vincular");
  }
}
