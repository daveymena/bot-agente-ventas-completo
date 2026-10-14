/**
 * Configuración central de VentasPro Stock.
 *
 * Todo sale del entorno con valores por defecto seguros para desarrollo. En
 * producción lo único obligatorio es STOCK_SESSION_SECRET (si falta, el
 * arranque falla a propósito: una clave fija en código invalidaría todas las
 * sesiones de todos los despliegues).
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Busca un .env en el paquete o en la raíz del monorepo (mismo criterio que lib/db).
for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", "..", ".env"),
]) {
  if (fs.existsSync(candidate)) { loadEnv({ path: candidate }); break; }
}

const isProd = process.env.NODE_ENV === "production";

function requireSecret(): string {
  const s = process.env.STOCK_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (isProd) throw new Error("STOCK_SESSION_SECRET (≥16 caracteres) es obligatoria en producción.");
  return "dev-secret-no-usar-en-produccion";
}

/**
 * Raíz del paquete (donde vive package.json). Sirve tanto en desarrollo
 * (server/config.ts) como en el bundle de producción (dist/server/index.mjs).
 */
function findPackageRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(from, "..");
}
export const packageRoot = findPackageRoot(__dirname);

const dataDir = path.resolve(process.env.STOCK_DATA_DIR || path.join(packageRoot, "data"));

export const config = {
  isProd,
  port: Number(process.env.STOCK_PORT || process.env.PORT || 3010),
  host: process.env.HOST || "0.0.0.0",
  /** URL pública (para enlaces en correos / webhooks). */
  appUrl: (process.env.STOCK_APP_URL || process.env.APP_URL || `http://localhost:${Number(process.env.STOCK_PORT || process.env.PORT || 3010)}`).replace(/\/$/, ""),
  sessionSecret: requireSecret(),
  sessionDays: Number(process.env.STOCK_SESSION_DAYS || 30),
  dataDir,
  dbPath: process.env.STOCK_DB_PATH || path.join(dataDir, "stock.db"),
  /** Archivos originales: NUNCA se sirven directo; solo con licencia. */
  originalsDir: path.join(dataDir, "originals"),
  /** Derivados públicos (miniaturas, previsualizaciones con marca de agua). */
  publicDir: path.join(dataDir, "public"),
  tmpDir: path.join(dataDir, "tmp"),
  brand: {
    name: process.env.STOCK_BRAND_NAME || "VentasPro Stock",
    tagline: process.env.STOCK_BRAND_TAGLINE || "Fotos, vectores, vídeos, audio y plantillas con licencia para tu negocio",
    watermark: process.env.STOCK_WATERMARK_TEXT || process.env.STOCK_BRAND_NAME || "VentasPro Stock",
    supportEmail: process.env.STOCK_SUPPORT_EMAIL || "soporte@ventasproia.com",
  },
  currency: (process.env.STOCK_CURRENCY || "COP").toUpperCase(),
  locale: process.env.STOCK_LOCALE || "es-CO",
  /** Valor nominal de 1 crédito en centavos de la moneda configurada (para regalías). */
  creditValueCents: Number(process.env.STOCK_CREDIT_VALUE_CENTS || 1200000), // $12.000 COP
  royalty: {
    image: Number(process.env.STOCK_ROYALTY_IMAGE || 0.33),
    video: Number(process.env.STOCK_ROYALTY_VIDEO || 0.35),
    audio: Number(process.env.STOCK_ROYALTY_AUDIO || 0.35),
  },
  payoutMinimumCents: Number(process.env.STOCK_PAYOUT_MIN_CENTS || 10000000), // $100.000 COP
  signupBonusCredits: Number(process.env.STOCK_SIGNUP_BONUS_CREDITS || 3),
  admin: {
    email: process.env.STOCK_ADMIN_EMAIL || "admin@stock.local",
    password: process.env.STOCK_ADMIN_PASSWORD || (isProd ? "" : "admin12345"),
    name: process.env.STOCK_ADMIN_NAME || "Administración",
  },
  upload: {
    maxImageBytes: Number(process.env.STOCK_MAX_IMAGE_MB || 60) * 1024 * 1024,
    maxVideoBytes: Number(process.env.STOCK_MAX_VIDEO_MB || 1024) * 1024 * 1024,
    maxAudioBytes: Number(process.env.STOCK_MAX_AUDIO_MB || 120) * 1024 * 1024,
    minImagePixels: Number(process.env.STOCK_MIN_IMAGE_PIXELS || 4_000_000), // Adobe exige 4 MP
  },
  ai: {
    apiKey: process.env.STOCK_AI_API_KEY || process.env.OPENAI_API_KEY || "",
    baseUrl: (process.env.STOCK_AI_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    visionModel: process.env.STOCK_AI_VISION_MODEL || "gpt-4o-mini",
    textModel: process.env.STOCK_AI_TEXT_MODEL || "gpt-4o-mini",
    imageModel: process.env.STOCK_AI_IMAGE_MODEL || "gpt-image-1",
  },
  payments: {
    mercadoPagoAccessToken: process.env.STOCK_MP_ACCESS_TOKEN || process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
    transfer: {
      bank: process.env.STOCK_TRANSFER_BANK || process.env.TRANSFER_BANK || "",
      account: process.env.STOCK_TRANSFER_NUMBER || process.env.TRANSFER_NUMBER || "",
      holder: process.env.STOCK_TRANSFER_NAME || process.env.TRANSFER_NAME || "",
    },
  },
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  seedDemo: process.env.STOCK_SEED_DEMO !== "false",
};

export type Config = typeof config;

export function ensureDirs() {
  for (const d of [config.dataDir, config.originalsDir, config.publicDir, config.tmpDir]) {
    fs.mkdirSync(d, { recursive: true });
  }
}
