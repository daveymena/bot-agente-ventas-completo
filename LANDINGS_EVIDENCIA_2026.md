# Landings: qué modelo de página para qué negocio — evidencia (investigado el 2026-10-01)

Fuente de verdad en código: `artifacts/api-server/src/lib/landing/composicion.ts` → `EVIDENCIA`, `NICHO`, `pesoPorPrecio`.
Medición propia: `lib/landing/metricas.ts` (visitas y pedidos por landing, agrupados por modelo).

**Niveles** (CLAUDE.md):
- **verificado**: dato publicado con método explícito.
- **reportado**: cifra de un proveedor o agencia que vende el servicio, con interés comercial.
- **hipótesis**: criterio nuestro, sin medición todavía.

## Cómo elige el sistema

```
peso(modelo) = evidencia(tipo de negocio) × nicho(familia) × precio × rendimiento propio
```

1. **Tipo de negocio** (dropshipping, físico, digital, servicio): decide qué modelos entran y con qué peso de partida.
2. **Nicho**: la familia que eligió `elegirFamilia` por las palabras del producto. Multiplica.
3. **Precio**: digital barato (≤ 60.000 COP) → página corta; digital caro (≥ 300.000) → historia o experto; físico caro (≥ 250.000) → artículo o minimal.
4. **Lo que vendió en la tienda**: conversión de cada modelo contra la media de la tienda, suavizada con 150 visitas a la media. El factor va de 0,4 a 3 y solo cuenta con 150 visitas o más por modelo.
5. **Sorteo con pesos** (no siempre el de más peso): así se siguen probando los demás y la medición propia tiene de dónde aprender.

## Evidencia por tipo de negocio

| Tipo | Modelo con más peso | Por qué | Nivel |
|---|---|---|---|
| Dropshipping / físico | Tienda directa | Unbounce, 15.981 landings de ecommerce: las de menos de 300 palabras convierten mejor; mediana 3,5% | verificado |
| Dropshipping (tráfico frío) | Artículo (advertorial) | Agencias DTC: la pre-venta tipo artículo convierte 2-3× la página de producto (3-8% vs ~2%) | reportado |
| Moda, belleza, hogar | Catálogo visual | Son las categorías que más vende Dropi (según Dropi); se deciden mirando | hipótesis |
| Digital barato | Digital de compra rápida | Unbounce: 275-745 palabras es el rango que más convierte; lectura de 5.º-7.º grado: 11,1% vs 5,3% profesional | verificado |
| Digital caro | Historia larga / Experto | Guías de plataformas de cursos: página larga (1.500-5.000 palabras) para precio alto y oferta compleja | reportado |
| Servicio | Servicio con agenda | Invoca 2025 (60M llamadas): 37% de las llamadas convierte vs ~1,7% de los formularios; botón para escribir arriba, a mitad y al final | reportado |

## Datos que también moldearon las variantes

| Dato | Uso en el diseño | Nivel |
|---|---|---|
| Barra de compra fija abajo + botón arriba: +12% vs botón solo al final (Digital Applied, 2.000 A/B, oct-2025 a mar-2026) | barra fija en celular + botón en la portada | reportado |
| Foto de banco de imágenes en la portada: −11%; video con reproducción automática: −7% (carga lenta) | la portada usa la foto REAL del producto; sin video automático | reportado |
| Formulario de 1 campo 12,4% vs 6 o más campos 3,1% | contraentrega con 4 datos | reportado |
| Carga: 4,4% bajo 1 s → 1,7% con 4 s o más | HTML propio sin librerías; imágenes diferidas | reportado |
| Texto de IA en DTC: −2% (relleno, adjetivos genéricos) | el texto sale de los datos del producto; las reglas de copy prohíben el relleno | reportado |
| Caicedo, sep-2026: la landing por secciones en HTML vendió y la de solo imágenes no (un solo producto, poco gasto) | se descartó el modelo "solo imágenes" | reportado (un caso) |

## Lo que NO se usa, aunque "venda"

- Reseñas, estrellas, "+X entregas" o "unidades vendidas" sin datos reales.
- Precio tachado sin un precio anterior real cargado en `metadata.precioAntes`.
- Imágenes que no son del producto: las fotos salen de la galería del dueño, Dropi o WooCommerce (`fotos-de-producto.ts`); la IA genera una solo si no hay ninguna.

## Fuentes

- [Unbounce — Conversion Benchmark Report](https://unbounce.com/conversion-benchmark-report/)
- [Unbounce — Ecommerce copy insights](https://unbounce.com/copy-analyzer-report/ecommerce/)
- [Digital Applied — 2.000 landings testeadas (2026)](https://www.digitalapplied.com/blog/landing-page-conversion-study-2000-pages-tested-2026)
- [MHI Growth Engine — DTC landing benchmarks por fuente de tráfico](https://mhigrowthengine.com/blog/dtc-landing-page-conversion-benchmarks/)
- [Swipe Pages — landings de bienestar y suplementos 2026](https://swipepages.com/blog/8-best-wellness-supplement-self-care-landing-page-examples-of-2026/)
- [pcnanswers — Calls vs Forms 2026 (cita Invoca 2025)](https://pcnanswers.com/calls-vs-forms-leads-study/)
- [BSPKN — CRO para negocios de servicios 2026](https://www.bspkn.co/insights/conversion-rate-optimization-service-businesses-2026/)
- [LearnWorlds — landing de cursos](https://www.learnworlds.com/blog/market-sell/course-landing-page-with-examples/)
- [EngageBay — guía de páginas de venta 2025](https://www.engagebay.com/blog/sales-page/)
- [Dropi — plataformas de dropshipping en Colombia 2026](https://dropi.co/blog/las-mejores-plataformas-de-dropshipping-en-colombia/)
- Iván Caicedo, "Probé 3 páginas de venta y una vendió mucho más" (YouTube, sep-2026), transcripción leída el 2026-10-01.

## Límites

- En digitales el pago (MercadoPago, PayPal) no vuelve atado a la landing: solo se cuentan visitas. Hasta que exista esa atribución, en digitales manda la evidencia.
- La medición propia necesita 150 visitas o más por modelo. Antes de eso, el factor es 1.
