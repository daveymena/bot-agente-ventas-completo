/**
 * ¿El bot puede ver imágenes, o está ciego?
 *
 * La ceguera de este sistema es silenciosa: `VISION_MODELS` apuntó semanas a
 * proveedores sin clave y nadie se enteró hasta que un cliente pagó y el bot
 * le dijo "recibí tu comprobante" sin haber visto nada.
 */
import { visionDisponible } from "../src/lib/media-entrante";

const v = visionDisponible();
console.log(`VISION_MODELS: ${process.env.VISION_MODELS || "(sin configurar)"}`);
console.log(`con clave: ${v.conClave.length ? v.conClave.join(", ") : "NINGUNO"}`);
console.log(`sin clave: ${v.sinClave.join(", ") || "-"}`);
console.log(v.hay ? "\n=> el bot PUEDE ver imagenes" : "\n=> el bot esta CIEGO: no puede leer ninguna imagen");
process.exit(v.hay ? 0 : 1);
