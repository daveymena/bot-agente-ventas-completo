# Estudio: editor de landings y de creativos

Núcleo de diseño **compartido** por el servidor, la pantalla y Atlas. Son módulos
puros (sin node ni DOM). La app los importa con el alias `@estudio`
(`ventas-pro/vite.config.ts`).

| Archivo | Qué es |
|---|---|
| `fuentes.ts` | Las tipografías (Google Fonts, OFL) y parejas título/texto. |
| `retoque.ts` | El **tema** de una landing (`design.retoque`): acento, letras, redondeo. |
| `escena.ts` | El **creativo**: escena JSON (capas en % del lienzo) → HTML. Revisión antes de exportar. |
| `maquetas-creativo.ts` | 10 maquetas que diagraman solas (apilan piezas según el largo del texto) en 4:5, 1:1, 9:16 y 1.91:1. |

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
