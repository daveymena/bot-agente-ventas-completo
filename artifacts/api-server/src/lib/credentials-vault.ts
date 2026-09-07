/**
 * Encripta a nivel de aplicación los tokens/credenciales de terceros que los
 * tenants guardan en el dashboard (tokens de Facebook, API keys, etc.) antes
 * de que lleguen a la base de datos -- así una fuga de la BD (backup
 * filtrado, acceso directo, SQL injection) no entrega credenciales vivas de
 * Meta/GitHub/etc. de cada cliente en texto plano.
 *
 * AES-256-GCM: autenticado (detecta si el valor fue alterado), IV al azar
 * por valor (nunca se reusa un IV con la misma clave).
 */
import crypto from "crypto";
import { randomBytes } from "crypto";
import { logger } from "./logger";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENC_PREFIX = "enc:v1:";

// Mismo patrón que COOKIE_SECRET en app.ts: si no está configurada, no se
// tumba el arranque -- se genera una clave aleatoria en memoria y se avisa
// fuerte. Con la clave temporal, cualquier credencial encriptada ANTES del
// reinicio queda indescifrable después (por diseño: es la única forma de
// que un fallback aleatorio no sea, en la práctica, "no encriptar nada").
// Para producción hace falta CREDENTIALS_ENCRYPTION_KEY fija en las
// variables de entorno.
//
// La clave se deriva LAZY (recién en el primer encrypt/decrypt real), no
// acá arriba al importar el módulo. Se encontró en vivo que derivarla al
// importar es frágil: en un script suelto que importa este módulo ANTES
// que el que carga el .env (el orden de imports estáticos de ES modules
// no es "de arriba hacia abajo" como en JS normal, depende de qué módulo
// importa a qué), CREDENTIALS_ENCRYPTION_KEY todavía no existía en
// process.env y quedaba con la clave aleatoria de ese proceso -- cualquier
// cosa encriptada o leída desde ESE proceso usaba una clave distinta a la
// del servidor real, en silencio, sin ningún error hasta que alguien
// intentara desencriptarlo desde el otro lado.
let encryptionKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (encryptionKey) return encryptionKey;
  const configured = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (configured) {
    encryptionKey = crypto.createHash("sha256").update(configured).digest();
  } else {
    encryptionKey = randomBytes(32);
    const where = process.env.NODE_ENV === "production" ? "PRODUCCIÓN" : "desarrollo";
    logger.warn(
      `[Security] CREDENTIALS_ENCRYPTION_KEY no configurada en ${where} -- usando una clave ` +
      "aleatoria temporal. Los tokens (Facebook, GitHub, etc.) guardados ahora no se podrán " +
      "desencriptar después de un reinicio. Configura CREDENTIALS_ENCRYPTION_KEY (fija, larga) " +
      "en las variables de entorno."
    );
  }
  return encryptionKey;
}

/**
 * ¿Hay una clave FIJA configurada, o se esta usando una aleatoria?
 *
 * Con la aleatoria, todo lo encriptado antes de un reinicio queda ilegible
 * despues. En produccion eso significa que el dueño conecta Facebook, funciona,
 * y al siguiente despliegue "se desconecta solo" -- sin ningun error visible,
 * porque `decryptSecret` devuelve cadena vacia y el sistema lo lee como
 * "nunca configuro nada".
 *
 * Se expone para que `/api/health` lo diga: es un fallo silencioso que
 * solo aparece horas despues y en otra pantalla, y sin esto la unica pista
 * queda en un log de arranque que nadie mira.
 *
 * ⚠️ Devuelve un booleano, NUNCA la clave.
 */
export function tieneClaveFija(): boolean {
  return !!process.env.CREDENTIALS_ENCRYPTION_KEY;
}

/** Encripta un valor para guardarlo en la BD. Vacío/null pasa tal cual. */
export function encryptSecret(plain: string | null | undefined): string {
  if (!plain) return "";
  const iv = randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Desencripta un valor leído de la BD. Si no tiene el prefijo de este
 * esquema, se asume un valor legacy guardado en texto plano (de antes de
 * esta migración) y se devuelve tal cual -- así las credenciales ya
 * guardadas siguen funcionando; se re-encriptan solas la próxima vez que el
 * tenant las guarde desde el panel.
 */
export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(ENC_PREFIX)) return value;
  try {
    const raw = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGO, getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (err) {
    logger.error({ err }, "[CredentialsVault] No se pudo desencriptar un secreto (clave distinta a la que lo encriptó, o dato corrupto)");
    return "";
  }
}
