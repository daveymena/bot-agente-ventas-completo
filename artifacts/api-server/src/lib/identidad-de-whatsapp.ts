/**
 * ============================================================================
 * LA IDENTIDAD DEL DISPOSITIVO — lo que WhatsApp ve cuando el bot se conecta
 * ============================================================================
 *
 * Baileys se conecta emulando la app de WhatsApp Web. En el handshake manda un
 * "fingerprint" del dispositivo: plataforma, navegador y versión. WhatsApp lo
 * compara con lo que esperaría ver de un cliente real.
 *
 * ── El bug que esto corrige ────────────────────────────────────────────────
 *
 * El código mandaba, en los DOS caminos de conexión:
 *
 *     browser: ["VentasPro", "Chrome", "1.0.0"]
 *
 * "VentasPro" no es un navegador. Y "Chrome 1.0.0" es una versión que existió
 * en 2008. Eso no es un detalle cosmético: es exactamente la firma que delata a
 * un cliente no oficial, y los propios usuarios de Baileys lo reportan como
 * causa de baneo (issue #1869, ola de baneos de oct-2025, 39 comentarios):
 *
 *   "si usás algo que se conecta vía WhatsApp Web, tiene que verse igual"
 *
 * Con 2 clientes el riesgo es teórico. Con 100, un baneo no deja sin WhatsApp a
 * este servidor: deja sin WhatsApp al negocio de un cliente que paga, y eso es
 * una demanda, no un incidente técnico. Es el cambio más barato que hay para
 * bajar ese riesgo.
 *
 * ── Por qué no se usa `Browsers.appropriate` ───────────────────────────────
 *
 * Sería lo más cómodo (toma la plataforma y la versión del SO solo), pero
 * reporta el sistema operativo REAL del servidor: `release()` devuelve el kernel
 * del contenedor, algo como "6.8.0-45-generic". Ningún Windows ni Mac real
 * manda eso, así que cambiábamos una firma rara por otra igual de rara.
 *
 * Se usa un perfil REAL y estable en su lugar. Estable importa: si el
 * fingerprint cambia entre reconexiones, WhatsApp ve al mismo número
 * reconectándose desde "dispositivos" distintos, que es un patrón más
 * sospechoso que el original.
 */

/**
 * Un perfil de dispositivo real, fijo y verosímil.
 *
 * Windows 10 con Chrome 131 es una combinación que existe de verdad y que
 * millones de usuarios tienen. `Browsers.windows()` arma la tupla con la
 * versión de Windows que corresponde.
 */
export const PERFIL_DE_DISPOSITIVO = {
  /** Lo que se manda como plataforma/navegador/versión. */
  navegador: ["Windows", "Chrome", "131.0.0.0"] as [string, string, string],
  /** Para el log: qué se está reportando. */
  descripcion: "Windows 10 · Chrome 131",
} as const;

/**
 * Devuelve el fingerprint a usar.
 *
 * Es una función (y no una constante exportada) para poder probar que NO cambia
 * entre llamadas: un fingerprint inestable es peor que uno feo.
 */
export function fingerprintDeDispositivo(): [string, string, string] {
  return [...PERFIL_DE_DISPOSITIVO.navegador] as [string, string, string];
}

/**
 * ¿Este fingerprint parece de un cliente real?
 *
 * Lo usan los tests para que nadie vuelva a poner el nombre del producto acá:
 * el error original fue creer que ese campo era para "personalizar la marca".
 * No lo es — es lo que el servidor de WhatsApp valida.
 */
export function pareceReal(navegador: [string, string, string]): boolean {
  const [plataforma, navegadorNombre, version] = navegador;
  const plataformasValidas = ["Windows", "Mac OS", "Ubuntu", "Android", "iOS"];
  if (!plataformasValidas.includes(plataforma)) return false;

  // El nombre no puede ser el de nuestro producto: eso no es un navegador.
  if (/ventaspro|atlas|bot/i.test(navegadorNombre)) return false;

  // La versión tiene que ser plausible. Windows reporta la versión del
  // NAVEGADOR ("131.0.0.0"), mientras macOS y Ubuntu reportan la del SISTEMA
  // ("14.4.1", "22.04.4") — así los arma Baileys en `Browsers`. Por eso el
  // piso es 1, no 50: lo que se rechaza es "1.0.0", la versión del bug
  // original, no un esquema de versiones distinto.
  const partes = String(version).split(".");
  const mayor = Number(partes[0]);
  const menor = Number(partes[1] ?? 0);
  if (!Number.isFinite(mayor) || mayor < 1) return false;
  if (mayor === 1 && menor === 0 && Number(partes[2] ?? 0) === 0) return false; // "1.0.0"

  return true;
}
