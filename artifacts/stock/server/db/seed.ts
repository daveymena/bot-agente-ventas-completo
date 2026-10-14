/**
 * Datos base (categorías, planes, paquetes, admin) + catálogo de demostración.
 *
 *   pnpm --filter @workspace/stock seed          → crea/actualiza base y demo si está vacío
 *   pnpm --filter @workspace/stock seed -- --reset → borra TODO el catálogo demo y lo regenera
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config, ensureDirs, packageRoot } from "../config";
import { all, get, insert, run, nowIso } from "./client";
import { hashPassword } from "../lib/auth";
import { ingestAsset } from "../lib/ingest";
import { ffmpegAvailable, runFfmpeg } from "../lib/ffmpeg";
import { grantCredits } from "../lib/commerce";
import { svgSeeds, audioSeeds, audioCoverSvg, mulberry32 } from "../../seed/generators";

const SEED_DIR = path.join(packageRoot, "seed");
const log = (...a: any[]) => console.log("[seed]", ...a);

export const CATEGORIES: Array<[string, string, string]> = [
  ["fondos", "Fondos", "Texturas, degradados y patrones para cualquier diseño"],
  ["naturaleza", "Naturaleza", "Bosques, flores, agua y vida silvestre"],
  ["paisajes", "Paisajes", "Montañas, playas, desiertos y horizontes"],
  ["negocios", "Negocios", "Oficinas, equipos, finanzas y emprendimiento"],
  ["tecnologia", "Tecnología", "Dispositivos, datos, IA y futuro"],
  ["personas", "Personas", "Retratos, familias y estilos de vida"],
  ["comida", "Comida", "Platos, ingredientes y cocina"],
  ["bebidas", "Bebidas", "Café, cócteles, jugos y vinos"],
  ["animales", "Animales", "Mascotas, fauna y vida marina"],
  ["viajes", "Viajes", "Destinos, aventura y cultura"],
  ["arquitectura", "Arquitectura", "Interiores, edificios y diseño urbano"],
  ["ciudades", "Paisajes urbanos", "Skylines, calles y vida urbana"],
  ["deportes", "Deportes", "Fitness, competición y aire libre"],
  ["salud", "Salud", "Medicina, bienestar y cuidado personal"],
  ["educacion", "Educación", "Escuela, universidad y aprendizaje"],
  ["moda", "Moda", "Belleza, estilo y accesorios"],
  ["iconos", "Iconos", "Sets de iconos lineales, planos y 3D"],
  ["logos", "Logotipos", "Plantillas de identidad y emblemas"],
  ["redes-sociales", "Redes sociales", "Posts, historias y portadas listas para publicar"],
  ["musica", "Música", "Pistas de fondo por género y estado de ánimo"],
  ["efectos-de-sonido", "Efectos de sonido", "Transiciones, impactos, logos sonoros y ambientes"],
  ["efectos-de-video", "Efectos de vídeo", "Fondos animados, transiciones y overlays"],
  ["plantas", "Plantas", "Botánica, jardines y hojas"],
  ["ia", "IA", "Contenido generado con inteligencia artificial"],
  ["ciencia", "Ciencia", "Laboratorio, espacio e investigación"],
];

const PLANS = [
  { slug: "basico-10", name: "10 créditos al mes", credits: 10, videos: 1, monthly: 12990000, annual: 9990000, badge: null, features: ["Hasta 10 imágenes, vectores, plantillas o pistas de audio al mes", "1 vídeo HD al mes", "Los créditos no usados se acumulan hasta 12 meses", "Licencia estándar incluida", "Cancela cuando quieras"] },
  { slug: "estandar-10-ia", name: "10 créditos + IA Studio", credits: 10, videos: 1, monthly: 16990000, annual: 12990000, badge: "El más popular", features: ["Todo lo del plan de 10 créditos", "Generación de imágenes con IA desde la plataforma", "Autoetiquetado inteligente de tus subidas", "Búsqueda visual ilimitada", "Prueba gratis de 7 días"] },
  { slug: "pro-25", name: "25 créditos + IA Studio", credits: 25, videos: 3, monthly: 25990000, annual: 19990000, badge: "Popular para vídeo", features: ["Hasta 25 recursos al mes", "3 vídeos HD/4K al mes", "IA Studio incluido", "Soporte prioritario", "Facturación electrónica"] },
  { slug: "empresa-750", name: "750 créditos al mes", credits: 750, videos: 25, monthly: 89990000, annual: 74990000, badge: "Paquete de gran valor", features: ["750 créditos para imágenes, vectores, audio y plantillas", "25 vídeos HD/4K al mes", "IA Studio con cuota ampliada", "Licencias para equipos y agencias", "Gestor de cuenta dedicado"] },
];

const PACKS = [
  { credits: 5, price: 9500000, label: "Para probar" },
  { credits: 16, price: 28000000, label: "Pequeños proyectos" },
  { credits: 40, price: 64000000, label: "Más vendido" },
  { credits: 80, price: 115000000, label: "40 imágenes o 10 vídeos HD" },
  { credits: 150, price: 195000000, label: "Agencias" },
];

const SETTINGS: Record<string, any> = {
  home_hero_title: "Busca, licencia y crea: miles de recursos para tu marca",
  home_hero_subtitle: "Fotos, vectores, vídeos, audio y plantillas con licencia comercial, pensados para negocios de habla hispana.",
  free_trial_banner: "Empieza con 3 créditos gratis al registrarte",
  footer_topics: ["logotipos", "moda", "png", "siluetas", "verano", "humor", "viajes", "fondo de pantalla", "navidad", "corazón", "amor", "mapa", "flores", "iconos", "oficina", "café", "montañas", "ciudad"],
};

export async function ensureBaseData() {
  ensureDirs();
  for (const [i, [slug, name, description]] of CATEGORIES.entries()) {
    await run(`INSERT INTO categories(slug, name, description, sort_order) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name, description=coalesce(categories.description, excluded.description), sort_order=excluded.sort_order`, [slug, name, description, i]);
  }
  for (const [i, p] of PLANS.entries()) {
    await run(`INSERT INTO plans(slug, name, credits_per_month, videos_per_month, price_monthly_cents, price_annual_monthly_cents, features, badge, audience, sort_order) VALUES (?,?,?,?,?,?,?,?,'individual',?) ON CONFLICT(slug) DO NOTHING`, [p.slug, p.name, p.credits, p.videos, p.monthly, p.annual, JSON.stringify(p.features), p.badge, i]);
  }
  if (!(await get(`SELECT 1 FROM credit_packs LIMIT 1`))) {
    for (const [i, p] of PACKS.entries()) await run(`INSERT INTO credit_packs(credits, price_cents, label, sort_order) VALUES (?,?,?,?)`, [p.credits, p.price, p.label, i]);
  }
  for (const [k, v] of Object.entries(SETTINGS)) await run(`INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO NOTHING`, [k, JSON.stringify(v)]);

  if (config.admin.email && config.admin.password) {
    const existing = await get<{ id: number }>(`SELECT id FROM users WHERE email=?`, [config.admin.email.toLowerCase()]);
    if (!existing) {
      await insert(`INSERT INTO users(email, password_hash, name, role, credits, contributor_profile) VALUES (?,?,?,'admin',100,?)`, [config.admin.email.toLowerCase(), await hashPassword(config.admin.password), config.admin.name, JSON.stringify({ displayName: config.brand.name, bio: "Equipo editorial", acceptedTermsAt: nowIso() })]);
      log(`admin creado: ${config.admin.email}`);
    }
  } else if (config.isProd) {
    console.warn("[seed] STOCK_ADMIN_PASSWORD no definido: no se creó usuario administrador.");
  }
}

async function demoUser(email: string, name: string, role: "user" | "contributor", profile?: Record<string, any>, credits = 0) {
  const ex = await get<{ id: number }>(`SELECT id FROM users WHERE email=?`, [email]);
  if (ex) return ex.id;
  return insert(`INSERT INTO users(email, password_hash, name, role, credits, contributor_profile, country) VALUES (?,?,?,?,?,?, 'CO')`, [email, await hashPassword("demo12345"), name, role, credits, profile ? JSON.stringify({ ...profile, acceptedTermsAt: nowIso() }) : null]);
}

function daysAgo(n: number) { return new Date(Date.now() - n * 86400e3 - Math.floor(Math.random() * 3600e3)).toISOString(); }

export async function seedDemoIfEmpty() {
  const n = Number((await get<{ n: number }>(`SELECT count(*) AS n FROM assets`))?.n || 0);
  if (n > 0) return false;
  await runDemoSeed();
  return true;
}

export async function runDemoSeed() {
  const started = Date.now();
  const photosMeta = JSON.parse(fs.readFileSync(path.join(SEED_DIR, "photos.json"), "utf8")) as any[];
  const laura = await demoUser("laura@stock.local", "Laura Restrepo", "contributor", { displayName: "Laura Restrepo", bio: "Fotógrafa de viajes y estilo de vida, Cali.", website: "https://ejemplo.co/laura", payoutMethod: "nequi", payoutAccount: "300 000 0000" });
  const andres = await demoUser("andres@stock.local", "Andrés Vargas", "contributor", { displayName: "Andrés Vargas · Diseño", bio: "Vectores, iconos y plantillas para marcas.", payoutMethod: "bancolombia", payoutAccount: "***1234" });
  const camila = await demoUser("camila@stock.local", "Camila Ortiz", "contributor", { displayName: "Camila Ortiz Studio", bio: "Motion, footage y música para contenido digital.", payoutMethod: "paypal", payoutAccount: "camila@ejemplo.co" });
  const cliente = await demoUser("cliente@stock.local", "Cliente Demo", "user");
  if (!(await get(`SELECT 1 FROM credit_transactions WHERE user_id=? LIMIT 1`, [cliente]))) await grantCredits(cliente, 25, "admin_adjust", undefined, "Créditos de demostración");

  const rnd = mulberry32(777);
  const created: Record<string, number[]> = { photo: [], vector: [], illustration: [], template: [], video: [], audio: [] };
  const fakeStats = async (id: number, boost = 1) => { const v = Math.floor(rnd() * 4000 * boost) + 40; await run(`UPDATE assets SET views=?, downloads=?, licenses_count=? WHERE id=?`, [v, Math.floor(v * (0.05 + rnd() * 0.15)), Math.floor(v * (0.01 + rnd() * 0.03)), id]); };

  // 1) Fotos
  const photoFiles: Record<string, Buffer> = {};
  for (const [i, m] of photosMeta.entries()) {
    const file = path.join(SEED_DIR, "photos", m.file);
    if (!fs.existsSync(file)) { log("falta foto", m.file); continue; }
    const buf = fs.readFileSync(file); photoFiles[m.file] = buf;
    const id = await ingestAsset({ buffer: buf, filename: m.file, mimetype: "image/jpeg", type: "photo", title: m.title, description: m.description, keywords: m.keywords, categorySlug: m.category, contributorId: laura, status: "approved", isFree: !!m.free, featured: !!m.featured, hasPeople: (m.people || 0) > 0, peopleCount: m.people || 0, modelRelease: !!m.modelRelease, skipQuality: true, createdAt: daysAgo(3 + i * 4) });
    created.photo.push(id); await fakeStats(id, 1.6);
    log(`foto #${id} ${m.file}`);
  }

  // 2) Vectores / ilustraciones / plantillas
  for (const [i, s] of svgSeeds().entries()) {
    const id = await ingestAsset({ buffer: Buffer.from(s.svg, "utf8"), filename: `${s.slug}.svg`, mimetype: "image/svg+xml", type: s.type, title: s.title, description: s.description, keywords: s.keywords, categorySlug: s.category, contributorId: andres, status: "approved", isFree: !!s.free, isPremium: !!s.premium, featured: !!s.featured, skipQuality: true, createdAt: daysAgo(2 + i * 3) });
    created[s.type].push(id); await fakeStats(id);
    log(`${s.type} #${id} ${s.slug}`);
  }

  // 3) Audio (WAV sintetizado → MP3 si hay ffmpeg)
  const hasFfmpeg = await ffmpegAvailable();
  for (const [i, a] of audioSeeds().entries()) {
    let buffer = a.wav, filename = `${a.slug}.wav`, mimetype = "audio/wav";
    if (hasFfmpeg) {
      const tmpIn = path.join(config.tmpDir, `${a.slug}.wav`), tmpOut = path.join(config.tmpDir, `${a.slug}.mp3`);
      fs.writeFileSync(tmpIn, a.wav);
      const r = await runFfmpeg(["-y", "-i", tmpIn, "-codec:a", "libmp3lame", "-b:a", "128k", tmpOut]);
      if (r.code === 0 && fs.existsSync(tmpOut)) { buffer = fs.readFileSync(tmpOut); filename = `${a.slug}.mp3`; mimetype = "audio/mpeg"; }
      fs.rmSync(tmpIn, { force: true }); fs.rmSync(tmpOut, { force: true });
    }
    const cover = await sharp(Buffer.from(audioCoverSvg(a))).png().toBuffer();
    const id = await ingestAsset({ buffer, filename, mimetype, type: "audio", title: a.title, description: a.description, keywords: [...a.keywords, a.genre.toLowerCase(), a.mood.toLowerCase()], categorySlug: a.category, contributorId: camila, status: "approved", isFree: !!a.free, featured: !!a.featured, cover, skipQuality: true, createdAt: daysAgo(1 + i * 5) });
    created.audio.push(id); await fakeStats(id, 0.7);
    log(`audio #${id} ${a.slug}`);
  }

  // 4) Vídeo (solo con ffmpeg): Ken Burns sobre fotos + fondos animados procedimentales
  if (hasFfmpeg) {
    const clips: Array<{ slug: string; args: string[]; title: string; description: string; keywords: string[]; category: string; featured?: boolean; free?: boolean; people?: number }> = [];
    const kb = (file: string, slug: string, size: string, zoomExpr: string, meta: { title: string; description: string; keywords: string[]; category: string; featured?: boolean; free?: boolean; people?: number }) => {
      const src = path.join(SEED_DIR, "photos", file);
      if (!fs.existsSync(src)) return;
      clips.push({ slug, args: ["-y", "-loop", "1", "-framerate", "25", "-i", src, "-vf", `scale=3200:-2,zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=150:s=${size}:fps=25,format=yuv420p`, "-t", "6", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-movflags", "+faststart"], ...meta });
    };
    kb("paisaje-montanas-amanecer.jpg", "aereo-valle-montanas-amanecer-4k", "1920x1080", "min(zoom+0.0012,1.25)", { title: "Vista aérea lenta de un valle entre montañas al amanecer con niebla", description: "Plano cinematográfico con movimiento suave de acercamiento sobre un valle verde al amanecer. Full HD, 25 fps, 6 s, sin audio.", keywords: ["vídeo", "aéreo", "dron", "valle", "montañas", "amanecer", "niebla", "naturaleza", "cinematográfico", "viaje", "turismo", "paisaje", "lento", "footage", "aerial", "drone", "mountains", "sunrise", "nature", "cinematic", "landscape"], category: "paisajes", featured: true });
    kb("ciudad-noche-skyline.jpg", "skyline-ciudad-noche-timelapse", "1920x1080", "if(lte(zoom,1.0),1.3,max(1.001,zoom-0.0015))", { title: "Skyline nocturno de ciudad con alejamiento suave, luces reflejadas en el río", description: "Plano general de rascacielos iluminados a la hora azul con movimiento de alejamiento. Full HD, 25 fps, 6 s.", keywords: ["vídeo", "ciudad", "skyline", "noche", "rascacielos", "luces", "río", "reflejo", "urbano", "negocios", "finanzas", "intro", "footage", "city", "night", "skyline", "urban", "lights", "cityscape", "timelapse"], category: "ciudades", featured: true });
    kb("mujer-corriendo-playa.jpg", "mujer-corre-playa-atardecer-slow", "1280x720", "min(zoom+0.0009,1.18)", { title: "Mujer corriendo por la playa al atardecer, acercamiento lento", description: "Clip de estilo de vida y deporte con tonos cálidos. HD 720p, 25 fps, 6 s.", keywords: ["vídeo", "mujer", "correr", "playa", "atardecer", "deporte", "fitness", "estilo de vida", "bienestar", "vacaciones", "mar", "cámara lenta", "footage", "woman", "running", "beach", "sunset", "sport", "lifestyle", "wellness"], category: "deportes", people: 1 });
    kb("cafe-colombiano-taza.jpg", "cafe-latte-cenital-acercamiento", "1280x720", "min(zoom+0.0010,1.2)", { title: "Taza de café con arte latte, acercamiento cenital sobre mesa de madera", description: "Clip para cafeterías, menús digitales y anuncios de café. HD 720p, 25 fps, 6 s.", keywords: ["vídeo", "café", "latte", "taza", "cenital", "madera", "cafetería", "desayuno", "bebida", "colombia", "anuncio", "menú digital", "footage", "coffee", "latte art", "cup", "top view", "cafe", "drink"], category: "bebidas", free: true });
    kb("perro-golden-parque.jpg", "perro-golden-parque-otono", "1280x720", "min(zoom+0.0008,1.15)", { title: "Golden retriever feliz en un parque de otoño, plano con acercamiento", description: "Clip alegre para veterinarias, tiendas de mascotas y redes sociales. HD 720p, 25 fps, 6 s.", keywords: ["vídeo", "perro", "golden retriever", "mascota", "parque", "otoño", "hojas", "feliz", "animal", "veterinaria", "footage", "dog", "pet", "park", "autumn", "happy", "animal"], category: "animales" });
    clips.push({ slug: "fondo-animado-degradado-fluido-loop", args: ["-y", "-f", "lavfi", "-i", "gradients=s=1920x1080:c0=#4f46e5:c1=#ec4899:c2=#06b6d4:c3=#f59e0b:speed=0.03:duration=8:rate=25", "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart"], title: "Fondo animado de degradado fluido en violeta, rosa y cian, loop 8 s", description: "Fondo en movimiento continuo para títulos, streams, presentaciones y reels. Full HD, 25 fps, 8 segundos en bucle.", keywords: ["vídeo", "fondo animado", "degradado", "fluido", "loop", "bucle", "violeta", "rosa", "cian", "títulos", "stream", "presentación", "reel", "movimiento", "motion", "background", "gradient", "animated", "loop", "abstract"], category: "efectos-de-video", featured: true, free: true });
    clips.push({ slug: "fondo-animado-vertical-aurora-historias", args: ["-y", "-f", "lavfi", "-i", "gradients=s=1080x1920:c0=#0f172a:c1=#22c55e:c2=#0ea5e9:c3=#1e293b:speed=0.025:duration=8:rate=25", "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart"], title: "Fondo animado vertical estilo aurora boreal para historias y reels", description: "Degradado animado en formato 9:16 (1080×1920) listo para Instagram, TikTok y WhatsApp Status. 8 segundos en bucle.", keywords: ["vídeo", "vertical", "9:16", "historias", "reels", "tiktok", "fondo animado", "aurora", "verde", "azul", "loop", "bucle", "motion", "background", "vertical video", "stories", "animated", "gradient"], category: "efectos-de-video" });
    clips.push({ slug: "fondo-animado-calido-atardecer-4k", args: ["-y", "-f", "lavfi", "-i", "gradients=s=3840x2160:c0=#7c2d12:c1=#f97316:c2=#fbbf24:c3=#be123c:speed=0.02:duration=6:rate=25", "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-movflags", "+faststart"], title: "Fondo animado 4K de degradado cálido atardecer, naranja y rojo", description: "Fondo en movimiento ultra HD (3840×2160) para pantallas grandes, eventos y títulos de vídeo. 6 segundos en bucle.", keywords: ["vídeo", "4k", "uhd", "fondo animado", "degradado", "cálido", "atardecer", "naranja", "rojo", "loop", "eventos", "pantalla", "títulos", "motion", "background", "4k", "gradient", "warm", "animated", "loop"], category: "efectos-de-video" });

    for (const [i, c] of clips.entries()) {
      const out = path.join(config.tmpDir, `${c.slug}.mp4`);
      const r = await runFfmpeg([...c.args, out], 180_000);
      if (r.code !== 0 || !fs.existsSync(out)) { log(`ffmpeg falló para ${c.slug}: ${r.stderr.slice(-300)}`); continue; }
      const buffer = fs.readFileSync(out); fs.rmSync(out, { force: true });
      const id = await ingestAsset({ buffer, filename: `${c.slug}.mp4`, mimetype: "video/mp4", type: "video", title: c.title, description: c.description, keywords: c.keywords, categorySlug: c.category, contributorId: camila, status: "approved", isFree: !!c.free, featured: !!c.featured, hasPeople: (c.people || 0) > 0, peopleCount: c.people || 0, modelRelease: (c.people || 0) > 0, skipQuality: true, createdAt: daysAgo(1 + i * 2) });
      created.video.push(id); await fakeStats(id, 1.2);
      log(`vídeo #${id} ${c.slug}`);
    }
  } else {
    log("ffmpeg no disponible: el catálogo demo no incluye vídeos (instala ffmpeg y ejecuta `pnpm seed -- --reset`).");
  }

  // 5) Colecciones curadas
  const byCat = async (slug: string) => (await all<{ id: number }>(`SELECT a.id FROM assets a JOIN categories c ON c.id=a.category_id WHERE c.slug=? AND a.status='approved' ORDER BY a.views DESC`, [slug])).map((r) => r.id);
  const curated: Array<[string, string, string, number[]]> = [
    ["seleccion-del-editor", "Selección del editor", "Lo mejor del catálogo esta semana, elegido por nuestro equipo.", (await all<{ id: number }>(`SELECT id FROM assets WHERE featured=1 AND status='approved' ORDER BY views DESC`)).map((r) => r.id)],
    ["fondos", "Fondos", "Degradados, patrones y texturas para webs, presentaciones y redes.", [...await byCat("fondos"), ...await byCat("efectos-de-video")]],
    ["negocios", "Negocios", "Equipos, oficinas, infografías y plantillas corporativas.", [...await byCat("negocios"), ...await byCat("ciudades")]],
    ["naturaleza", "Naturaleza", "Paisajes, montañas y animales para campañas con aire fresco.", [...await byCat("paisajes"), ...await byCat("naturaleza"), ...await byCat("animales")]],
    ["comida-y-bebida", "Comida y bebida", "Café, platos saludables y estilo de vida gastronómico.", [...await byCat("comida"), ...await byCat("bebidas")]],
    ["plantillas-para-redes", "Plantillas para redes", "Posts, historias y flyers editables listos para tu marca.", [...await byCat("redes-sociales"), ...created.template]],
    ["gratis", "Gratis", "Recursos sin costo con licencia estándar. Solo necesitas una cuenta.", (await all<{ id: number }>(`SELECT id FROM assets WHERE is_free=1 AND status='approved' ORDER BY views DESC`)).map((r) => r.id)],
    ["musica-y-sonido", "Música y sonido", "Pistas, logos sonoros y ambientes para tus vídeos.", created.audio],
  ];
  for (const [i, [slug, title, description, ids]] of curated.entries()) {
    const uniq = [...new Set(ids)];
    if (!uniq.length) continue;
    let id = (await get<{ id: number }>(`SELECT id FROM collections WHERE slug=?`, [slug]))?.id;
    if (id) await run(`UPDATE collections SET title=?, description=?, cover_asset_id=?, sort_order=?, updated_at=? WHERE id=?`, [title, description, uniq[0], i, nowIso(), id]);
    else id = await insert(`INSERT INTO collections(slug, user_id, title, description, is_public, is_curated, cover_asset_id, sort_order) VALUES (?,NULL,?,?,1,1,?,?)`, [slug, title, description, uniq[0], i]);
    for (const a of uniq) await run(`INSERT OR IGNORE INTO collection_items(collection_id, asset_id) VALUES (?,?)`, [id, a]);
  }

  // 6) Portadas de categorías
  for (const [slug] of CATEGORIES) {
    const ids = await byCat(slug);
    if (ids.length) await run(`UPDATE categories SET cover_asset_id=? WHERE slug=?`, [ids[0], slug]);
  }

  // 7) Historial de búsquedas (tendencias) y eventos de vista para gráficos
  const trending = ["negocios", "fondo", "café", "naturaleza", "plantilla instagram", "iconos", "ciudad noche", "música corporativa", "perro", "degradado", "oficina", "verano"];
  for (const q of trending) for (let k = 0; k < 2 + Math.floor(rnd() * 8); k++) await run(`INSERT INTO search_logs(query, results, created_at) VALUES (?,?,?)`, [q, 10, daysAgo(Math.floor(rnd() * 14))]);
  const approved = await all<{ id: number; contributor_id: number }>(`SELECT id, contributor_id FROM assets WHERE status='approved'`);
  for (const a of approved) for (let k = 0; k < 3 + Math.floor(rnd() * 12); k++) { const d = daysAgo(Math.floor(rnd() * 30)); await run(`INSERT INTO asset_events(asset_id, user_id, kind, day, created_at) VALUES (?,NULL,'view',?,?)`, [a.id, d.slice(0, 10), d]); }

  const total = Number((await get<{ n: number }>(`SELECT count(*) AS n FROM assets`))?.n || 0);
  log(`listo: ${total} recursos en ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return total;
}
