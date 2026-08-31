/**
 * Redespliega un servicio en EasyPanel.
 *
 * Antes intentaba loguearse con usuario y contraseña contra un endpoint que ya
 * no existe: devolvía 404 y moría en "Login failed". EasyPanel expone una API
 * con token --la misma que usa el resto del proyecto-- y así no hay que guardar
 * credenciales de sesión en ningún lado.
 *
 *   node scripts/redeploy-easypanel.mjs [servicio]   (por defecto bot-agenwhatsapp)
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

const base = String(env.EASYPANEL_URL || "").replace(/\/$/, "");
const key = env.EASYPANEL_API_KEY;
if (!base || !key) {
  console.error("Faltan EASYPANEL_URL o EASYPANEL_API_KEY en .env");
  process.exit(1);
}

const servicio = process.argv[2] || "bot-agenwhatsapp";
const proyecto = env.EASYPANEL_PROJECT || "tecnoia";

const r = await fetch(`${base}/api/trpc/services.app.deployService`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({ json: { projectName: proyecto, serviceName: servicio } }),
  signal: AbortSignal.timeout(120000),
});

if (!r.ok) {
  console.error(`Falló el despliegue de ${servicio}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`Desplegando ${proyecto}/${servicio}... pedido aceptado.`);
