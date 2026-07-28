/**
 * Genera portadas promocionales de cursos (estilo dorado sobre negro) usando
 * HTML + Chrome headless. El texto se renderiza de verdad, no lo dibuja una IA:
 * los generadores de imagen deforman las letras y aquí los títulos y beneficios
 * tienen que leerse perfectos.
 *
 * El fondo sí se genera con IA (Pollinations), que es lo que hace bien: foto
 * ambiental sin texto. Luego se oscurece y se compone debajo del layout.
 *
 * Uso:
 *   node scripts/make-course-card.mjs data.json salida.jpg [ancho] [alto]
 *
 * data.json:
 *   { "kicker":"CURSO DE", "title":"PIANO", "subtitle":"COMPLETO",
 *     "tagline":"DE CERO A AVANZADO", "intro":"Aprende a tocar...",
 *     "features":[{"icon":"🎹","title":"DESDE CERO","text":"No necesitas..."}],
 *     "bullets":["Acceso ilimitado de por vida", "..."],
 *     "cta":"¡EMPIEZA HOY!", "bgPrompt":"grand piano in dark room..." }
 */
import puppeteer from "puppeteer";
import { readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const [, , dataPath, outPath, wArg, hArg] = process.argv;
if (!dataPath || !outPath) {
  console.error("Uso: node scripts/make-course-card.mjs data.json salida.jpg [ancho] [alto]");
  process.exit(1);
}
const W = Number(wArg) || 1080;
const H = Number(hArg) || 1080;

const d = JSON.parse(await readFile(dataPath, "utf8"));

// Fondo por IA: personas usando el producto, sin nada de texto (la IA no sabe
// escribir). La composición manda el sujeto a la DERECHA y deja la mitad
// izquierda oscura y despejada, que es donde va todo el texto del layout.
async function fetchBackground(prompt) {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(
      prompt +
        ", subject framed in the far right third, well lit and clearly visible, " +
        "left half completely dark empty negative space, " +
        `cinematic photography, dramatic ${d.rimLight || "golden"} rim light, black background, ` +
        "no text, no letters, no words, no watermark",
    )}?width=${W}&height=${H}&nologo=true&model=flux&seed=${d.seed ?? 7}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`fondo: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8000) throw new Error("fondo demasiado pequeño");
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

let bg = "";
try {
  bg = await fetchBackground(d.bgPrompt || d.title);
  console.log("✅ fondo generado");
} catch (e) {
  console.warn(`⚠️  sin fondo IA (${e.message}); se usa degradado sólido`);
}

const features = (d.features || []).slice(0, 4);
const bullets = (d.bullets || []).slice(0, 4);

// Paleta por producto: cada curso lleva el color que le corresponde (el dorado
// para todos hacía que la tienda pareciera un solo producto repetido).
const A1 = d.accentLight || "#FFE9A8"; // brillo alto del degradado del título
const A2 = d.accent || "#F5B301";      // color principal
const A3 = d.accentDark || "#B87700";  // sombra del degradado
const INK = d.ink || "#120c00";        // texto sobre los bloques de color

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:ital,wght@0,600;0,800;0,900;1,800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;font-family:Montserrat,Arial,sans-serif;
       background:#050505;color:#fff;position:relative}
  .bg{position:absolute;inset:0;background:${bg ? `url('${bg}') center/cover` : "radial-gradient(circle at 70% 30%,#2a1f00,#050505)"}}
  /* Oscurecido lateral: negro sólido bajo el texto, y se abre pronto para que
     la persona del tercio derecho se vea de verdad (antes quedaba tapada). */
  .veil{position:absolute;inset:0;background:
    linear-gradient(100deg,rgba(0,0,0,.95) 0%,rgba(0,0,0,.88) 36%,rgba(0,0,0,.30) 58%,rgba(0,0,0,.08) 100%)}
  .glow{position:absolute;width:60%;height:60%;right:-10%;top:-15%;
        background:radial-gradient(circle,${A2}38,transparent 65%)}
  /* gap uniforme + justify-content:space-between en vez de margin-top:auto:
     con auto el bloque de beneficios empujaba el CTA fuera del lienzo */
  .wrap{position:relative;height:100%;display:flex;flex-direction:column;justify-content:space-between;
        padding:${Math.round(H * 0.05)}px ${Math.round(W * 0.055)}px}
  .kicker{font-family:Anton,Impact,sans-serif;font-size:${Math.round(W * 0.046)}px;letter-spacing:.04em;line-height:1}
  /* line-height 1.02 + padding-top: con .88 la caja quedaba más baja que el
     glifo y background-clip:text recortaba las tildes (LOCUCIÓN salía sin Ó). */
  .title{font-family:Anton,Impact,sans-serif;font-size:${Math.round(W * 0.125)}px;line-height:1.02;
    padding-top:.06em;letter-spacing:.01em;
    background:linear-gradient(180deg,${A1} 0%,${A2} 45%,${A3} 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
    filter:drop-shadow(0 4px 14px ${A2}59)}
  .subtitle{font-family:Montserrat;font-style:italic;font-weight:900;font-size:${Math.round(W * 0.062)}px;
    letter-spacing:.02em;margin-top:.06em}
  .tagline{display:inline-block;margin-top:${Math.round(H * 0.014)}px;padding:.3em .9em;
    background:linear-gradient(90deg,${A2},${A3});color:${INK};border-radius:4px;
    font-weight:900;font-size:${Math.round(W * 0.024)}px;letter-spacing:.1em}
  .intro{margin-top:${Math.round(H * 0.018)}px;font-size:${Math.round(W * 0.024)}px;font-weight:600;
    line-height:1.38;color:#E8E6E1;max-width:62%}
  .feats{display:grid;grid-template-columns:1fr 1fr;gap:${Math.round(H * 0.018)}px ${Math.round(W * 0.028)}px;max-width:64%}
  .feat{display:flex;gap:.6em;align-items:flex-start}
  .ico{font-size:${Math.round(W * 0.042)}px;line-height:1;filter:drop-shadow(0 2px 6px ${A2}80)}
  .ft{font-weight:900;font-size:${Math.round(W * 0.023)}px;color:${A2};letter-spacing:.03em;line-height:1.15}
  .fx{font-weight:600;font-size:${Math.round(W * 0.019)}px;color:#C6C4BF;line-height:1.25;margin-top:.15em}
  .panel{border:2px solid ${A2}80;border-radius:16px;
    padding:${Math.round(H * 0.022)}px ${Math.round(W * 0.028)}px;max-width:64%;background:rgba(0,0,0,.45)}
  .ph{font-family:Anton,Impact,sans-serif;font-size:${Math.round(W * 0.036)}px;letter-spacing:.02em}
  .ph em{color:${A2};font-style:normal}
  .bl{display:flex;align-items:center;gap:.5em;margin-top:.42em;font-size:${Math.round(W * 0.0205)}px;font-weight:600}
  .chk{color:${A2};font-size:1.15em;line-height:1}
  .cta{align-self:flex-start;
    background:linear-gradient(90deg,${A2},${A1});color:${INK};
    font-family:Anton,Impact,sans-serif;font-size:${Math.round(W * 0.044)}px;
    padding:.26em 1.05em;border-radius:10px;letter-spacing:.02em;
    box-shadow:0 10px 30px ${A2}59}
  .badge{position:absolute;top:${Math.round(H * 0.055)}px;right:${Math.round(W * 0.055)}px;
    width:${Math.round(W * 0.2)}px;height:${Math.round(W * 0.2)}px;border-radius:50%;
    border:3px solid ${A2};display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;background:rgba(0,0,0,.55);box-shadow:0 0 34px ${A2}73}
  .badge b{font-size:${Math.round(W * 0.026)}px;font-weight:900;line-height:1.1;color:#fff}
  .badge span{font-size:${Math.round(W * 0.021)}px;font-weight:800;color:${A2};line-height:1.1}
  .badge i{font-style:normal;font-size:${Math.round(W * 0.042)}px;color:${A2};margin-top:.06em}
</style></head><body>
  <div class="bg"></div><div class="veil"></div><div class="glow"></div>
  <div class="badge"><b>ONLINE</b><span>DESCARGABLE</span><i>⭳</i></div>
  <div class="wrap">
    ${d.kicker ? `<div class="kicker">${d.kicker}</div>` : ""}
    <div class="title">${d.title}</div>
    ${d.subtitle ? `<div class="subtitle">${d.subtitle}</div>` : ""}
    ${d.tagline ? `<div><span class="tagline">${d.tagline}</span></div>` : ""}
    ${d.intro ? `<div class="intro">${d.intro}</div>` : ""}
    ${features.length ? `<div class="feats">${features
      .map((f) => `<div class="feat"><div class="ico">${f.icon || "★"}</div><div><div class="ft">${f.title}</div><div class="fx">${f.text || ""}</div></div></div>`)
      .join("")}</div>` : ""}
    ${bullets.length ? `<div class="panel"><div class="ph">APRENDE A <em>TU RITMO</em></div>${bullets
      .map((b) => `<div class="bl"><span class="chk">✓</span><span>${b}</span></div>`)
      .join("")}</div>` : ""}
    ${d.cta ? `<div class="cta">${d.cta}</div>` : ""}
  </div>
</body></html>`;

const tmpHtml = path.join(path.dirname(outPath), `.card-${Date.now()}.html`);
await writeFile(tmpHtml, html, "utf8");

// Navegador: por defecto el Chromium que puppeteer instala solo (funciona en
// cualquier máquina y sistema). CHROME_PATH permite forzar uno del sistema.
const launchOpts = {
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
};
if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
const browser = await puppeteer.launch(launchOpts);
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto("file:///" + tmpHtml.replace(/\\/g, "/"), { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready); // sin esto sale con la fuente de reserva
  await page.screenshot({ path: outPath, type: "jpeg", quality: 92 });
  console.log(`✅ ${outPath}`);
} finally {
  await browser.close();
  await unlink(tmpHtml).catch(() => {});
}
