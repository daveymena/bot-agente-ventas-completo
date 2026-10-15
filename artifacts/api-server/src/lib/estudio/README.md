# Estudio: editor de landings y de creativos

Núcleo de diseño **compartido** por el servidor, la pantalla y Atlas. Son módulos
puros (sin node ni DOM). La app los importa con el alias `@estudio`
(`ventas-pro/vite.config.ts`).

| Archivo | Qué es |
|---|---|
| `fuentes.ts` | Las tipografías (Google Fonts, OFL) y parejas título/texto. |
| `retoque.ts` | El **tema** de una landing (`design.retoque`): acento, letras, redondeo. |
| `escena.ts` | El **creativo**: escena JSON (capas en % del lienzo) → HTML. Revisión antes de exportar. |
| `maquetas-creativo.ts` | 16 maquetas que diagraman solas (apilan piezas según el largo del texto) en 4:5, 1:1, 9:16 y 1.91:1. `armarCreativo` = maqueta + kit de marca. |
| `kit.ts` | **Kit de marca** (acento, oscuro, claro, letras, logo): reemplaza los neutros y el acento adivinado de las maquetas, corrige contraste con tintas de la marca y pone el logo donde no pisa texto. Paletas desde un color. |

## Regla: un solo dibujante

La vista previa no puede mentir (ya pasó dos veces: el panel de "Diseño" de
septiembre y la preview que llamaba al renderer con menos datos que `/l/<slug>`).

- **Landing:** `lib/landing/html-por-secciones.ts` arma el HTML para la preview
  del editor **y** para la URL pública, y hornea el tema con `aplicarRetoque`.
  El tema no se aplica a copias HTML de otros sitios ni a landings con HTML
  propio (sus variables CSS son otras).
- **Creativo:** `capasAHtml` lo usa el lienzo en pantalla y Chromium en
  `lib/creativos/render.ts` para el PNG. El lienzo lleva `max-width:none`
  porque el panel tiene `* { max-width: 100% }` global.

## Hechos vs. redacción

Precio, fotos, sellos de entrega ("Paga al recibir" solo si el negocio cobra
contraentrega) y beneficios salen de la base (`lib/creativos/datos.ts`). La IA
solo escribe ganchos, y un gancho con cifras o porcentajes que no están en la
ficha se descarta (`inventaCifras`).

## Dónde se guarda

Los creativos son JSON por negocio en `CREATIVOS_DIR` (por defecto
`<IMAGE_STORE_DIR>/../creativos/<tenantId>/`, dentro del volumen y fuera de
`/uploads`). Los PNG van a `/uploads/creativos/<tenantId>/`. No es tabla a
propósito (ver `lib/creativos/almacen.ts`).

## Atlas

`landing_tema`, `creativo_maquetas`, `creativo_listar`, `creativo_crear`,
`creativo_editar` (en `app-operator.ts`). `landing_editar` también entiende
`update_theme` ("poné los botones verdes").

## Zonas seguras de Meta

14 % arriba / 35 % abajo / 6 % a los lados en 9:16. Fuente: guías de terceros
consultadas el 2026-10-14 (adkit.so, billo.app, adsuploader.com): **vendor-reported**,
no documentación de Meta. Se usan como guía visual y aviso, nunca como bloqueo.

## Contra el look genérico (14-10-2026)

- **Kit de marca** (Studio → Marca; Atlas: `marca_kit_ver` / `marca_kit_cambiar`).
  Se guarda en `<CREATIVOS_DIR>/_kits/<tenant>.json`. NO se deduce de
  `tenants.brand_colors` (suele tener los valores por defecto del sistema); del
  perfil solo se toma el logo. En landings se aplica con "Usar mi marca" en el
  tema (no automático: no se cambian páginas publicadas sin que el dueño lo pida).
- **Recorte de fondo** (`lib/creativos/recorte.ts`, sharp, sin modelos): solo
  fondos lisos; sigue degradados y sombras suaves; si lo que borró tiene textura
  vuelve al recorte estricto. **No recorta** (y se usa la foto completa) cuando:
  el fondo no es liso, la foto mide menos de 320 px, o queda >12 % de "fondo"
  encerrado dentro del producto (producto claro sobre fondo claro). Umbrales
  medidos con 6 fotos el 14-10: las limpias tenían ≤ 8,5 %, la sucia (faja
  blanca de Dropi) 16 %. Las paletas del kit salen del color del producto
  recortado, no de la foto entera (que daba el gris del fondo).
- **Juez visual** (`lib/creativos/juez.ts`): reglas medibles siempre (contraste
  WCAG del texto contra su fondo, tamaño, zona segura, foto visible) + modelo de
  visión con rúbrica de director de arte cuando hay uno con clave. Sin modelo, lo
  dice y no inventa puntaje. `creativo_crear` arma hasta 2 candidatos de más y se
  queda con los de mejor puntaje.
