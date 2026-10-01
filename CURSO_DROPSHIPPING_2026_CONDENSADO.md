# Curso de dropshipping 2026 — condensado para VentasPro

**Fuente:** "Curso Completo para hacer DROPSHIPPING o E-COMMERCE en 2026", Iván Caicedo
(YouTube, playlist `PLqeoihMm_f4O0jh4IDwnia5XKpN7HuH31`, 16 capítulos, ~8 h 30 min).
Transcrito y leído completo el **2026-10-01**.

**Dónde lo usa el sistema:** `artifacts/api-server/src/lib/marketing-team/metodo-de-venta.ts`
→ herramienta de Atlas `metodo_de_venta {tema}` (lectura). Pruebas en
`marketing-team/__tests__/metodo-de-venta.test.ts`.

## Cómo leer este documento

Cada regla lleva una marca de dónde sale:

- **[autor]**: lo dice el autor desde su experiencia. **Ojo:** él vende una mentoría
  (Master Escala) y es afiliado de Dropi, Shopify, Releasit, TikTok, Fluxi, Scalboost,
  Minea y TuWinner. Sus cifras son *dichas*, no medidas por nosotros.
- **[verificado]**: coincide con documentación oficial o con lo que medimos en esta cuenta.
- **[hipótesis]**: adaptación nuestra a VentasPro (venta por WhatsApp, productos digitales). Hay que medirla.

---

## 0. Por qué no hubo ventas (cuenta real, medido el 01-10-2026)

| | |
|---|---|
| Gasto total | 108.806 COP, todo desde la cuenta publicitaria **personal** |
| Repartido en | 15 anuncios · 5 productos · 4 objetivos distintos |
| Conversaciones de WhatsApp abiertas | 59 (a ~1.280 COP c/u) |
| Ventas | **0** (confirmado por el dueño) |
| Píxel | 39 "Purchase" de servidor entre el 04 y el 21-09 → **todos falsos** |

Leído con el método del curso:

1. **El anuncio funcionó:** CPM entre 3.000 y 20.000 COP (el curso pide menos de 30.000) y CTR cerca de 2%. **[verificado]**
2. **La venta se cayó después del clic:** 59 conversaciones baratas y ninguna venta. Eso no se arregla con más pauta. **[hipótesis]**
3. **Pruebas demasiado chicas:** ~7.000 COP por anuncio. El curso prueba con ~60.000 COP al día en una sola campaña con 2 a 6 creativos. **[autor]**
4. **Landings que pierden gente:** curso de IA 23% de los clics llegaron a la página y Educa a tu perro 52%. El curso pide 70%. **[autor]**
5. **Señal de compra contaminada:** `agent.ts` le avisa "Purchase" a Meta cuando el bot entiende un "lo quiero", sin pago verificado y sin excluir el simulador. Meta aprendió de 39 compradores que no existen. **[verificado]**

---

## 1. Elegir qué vender (caps. 1, 4, 10, 16)

- La única característica que importa al empezar es la **demanda**: que ya se venda ese producto o uno muy parecido. Las listas de "efecto wow, recompra, resuelve un problema" engañan al principiante, que cree verlas donde no están. [autor]
- Primero se mira qué vende el mercado y **después** se busca el producto en el proveedor. Nunca al revés. [autor]
- **Biblioteca de anuncios de Meta:** país propio; buscar "paga en casa", "pago contraentrega", "envío gratis", "descuento hoy" o el nicho; filtrar anuncios **activos** que llevan 15 a 30 días al aire. Si alguien paga un anuncio 15 días seguidos, le deja plata. Más de ~2 meses ya es demanda vieja. [autor]
- **TikTok Creative Center → Top Ads:** país, últimos 30 días, idioma del mercado, objetivo conversión. A favor: anuncio reciente, presupuesto alto y muchos likes. [autor]
- **Kalodata:** lo que factura en TikTok Shop de EE. UU. se puede traer a LATAM por anuncios. No quedarse en la primera página. [autor]
- **Oferta y demanda:** se gana más donde la demanda supera a la oferta. Al principio se venden productos con demanda y oferta parecidas, para aprender y ganar las primeras ventas. [autor]
- Traer productos de otros países solo si las condiciones se parecen (nada de productos de invierno a un país sin estaciones). [autor]
- Confirmar al menos **100 unidades** en stock con el proveedor antes de montarlo. [autor]
- Probar en tandas: 10 productos (de a 5) y después ~3 por semana. [autor]
- **No vale la pena gastar en marketing** cuando no se controla el stock, cuando hay muchos vendedores del mismo producto o cuando la ganancia por venta es muy baja. [autor]
- Guardar los anuncios ganadores como **archivo** (no el link, porque los borran) en una planilla con el id del proveedor. [autor]

## 2. Costear (cap. 11)

- Con contraentrega un pedido es una **venta potencial**: solo se gana cuando el cliente recibe y paga. [autor]
- **Cancelado** (antes de despachar): se pierde la publicidad de ese pedido. **Devuelto:** publicidad + flete. El producto no se pierde: vuelve al proveedor. [autor]
- **Fórmula** (`precioDeVenta`):
  - flete con devoluciones = flete base ÷ % entregado de lo despachado
  - publicidad costeada = CPA del administrador ÷ (% no cancelado × % entregado)
  - precio = (costo + flete con devoluciones + publicidad costeada + otros) ÷ (1 − margen)
  - margen objetivo **20%** [autor]
  - Ejemplo del curso: producto 10, flete 7, CPA 4,5, 70% de entrega y 10% de cancelados dan un precio de ~34 y ~7 de ganancia. La prueba lo reproduce. [verificado]
- Porcentajes de devolución con que arranca el autor: Colombia 25% · Ecuador, Perú 30% · México, Chile, Guatemala, España, Argentina 35%. Cancelados 10-20%. Se reemplazan por los propios apenas haya datos. [autor]
- **Punto de equilibrio** = publicidad presupuestada por venta + ganancia por venta. Si el CPA está por debajo, se gana. [autor]
- Antes de escalar algo que vendió bien el primer día: hacer las cuentas con **40% de entrega**. Si así no pierde, se sube de a poco. [autor]
- **Control diario:** pedidos, cancelados, % de devolución y gasto de todas las cuentas dan la ganancia real. El CPA del administrador de anuncios **no es** el costo real. [autor]
- **Digital:** no hay flete ni devolución y el pago es antes de entregar. Queda precio − CPA por venta cerrada − comisión de la pasarela. [hipótesis]

## 3. La página que vende (caps. 2, 3, 5, 6, 15)

- **AIDA:** la Atención la gana el anuncio en los primeros 3 s. La página trabaja Interés, Deseo y Acción. [autor]
- Todo pensado para **celular**. [autor]
- **Primer pantallazo** (lo ve el 100%): título corto, **precio grande**, variantes en desplegable, sin selector de cantidad ni carrito. [autor]
- Cada beneficio tiene que entenderse **sin leer**: GIFs de 3 s como máximo, infografía, producto en uso. [autor]
- Textos como título con beneficio + una línea. Listas con un emoji fijo por tipo (beneficios, características). Preguntas frecuentes al final: envío, devolución, tallas. [autor]
- **Botón pegado abajo** (donde llega el pulgar), de color que contraste (negro o rojo), con "Pedir ahora · Paga en casa". [autor]
- **Formulario de un solo paso** (contraentrega). El teléfono se pide "con WhatsApp — por aquí te confirmamos" y una casilla "confirmo que mis datos son correctos". [autor]
- **Velocidad:** de 100 clics deberían llegar ~80. Las páginas hechas con código cargan más rápido que las de imágenes. [autor]
- **No gastar 2 horas** antes de validar: página mínima rápida. Sin visitas → el problema es el producto o el creativo. Con visitas y sin ventas → recién ahí se mejora la página. [autor]
- Políticas de devolución, privacidad, términos y envío publicadas: sin ellas bloquean la cuenta publicitaria. [autor]
- Mapa de calor con Microsoft Clarity (gratis). [autor]
- Ofertas por cantidad (1, 2 o 3 unidades) y venta adicional ("¿otro par a mitad de precio?") suben el ticket. [autor]
- Secciones de una página completa: portada, beneficios, antes/después, "por qué funciona" (la explicación técnica despierta interés), modo de uso en 3 pasos, reseñas, comparación, garantía y preguntas frecuentes. [autor]
- ⚠️ El curso pone **precio tachado, "últimas unidades", garantía y reseñas** como decorado. Acá van **solo si son verdad y están cargados en el producto**. [verificado: regla del motor]

## 4. Creativos (caps. 8, 9, 14, 16)

- Con **Andromeda** (Meta) y TikTok, el creativo **es** la segmentación: la plataforma mira el video y decide a quién mostrarlo. [autor; coincide con lo que Meta comunicó de Andromeda]
- **Diversidad creativa:** 6 a 9 piezas **radicalmente** distintas (persona, edad, lugar, narrativa, primeros 3 s). Si se parecen, llegan a la misma gente. [autor]
- El cambio más poderoso es el **gancho** (los primeros 3 s). Tomas de 3-4 s como máximo. [autor]
- El **formato** también segmenta: UGC, podcast, entrevista callejera, demostración, antes/después. [autor]
- **Variar un ganador:**
  1. Transcribir su audio (AI Studio, Gemini Flash).
  2. Pedir 3 variaciones del texto.
  3. Grabar la voz (o cambiarla con ElevenLabs).
  4. Subtítulos con el color de la marca.
  5. Logo como marca de agua.
  6. Cambiar el gancho con tomas de otros videos del mismo producto.

  Siempre incluir una versión muy parecida al original. [autor]
- **Copiar o adaptar** vale cuando el anuncio es reciente (días) y ya gasta mucho en otro mercado. [autor]
- **Solución única:** con un solo creativo puede bastar; la diversidad importa cuando hay competencia. [autor]
- **Guion:** dolor en pregunta → "el problema no es X, es Y" → producto → 2-3 beneficios → llamada a la acción. [autor]
- **Video con IA:**
  1. Imagen de la persona con el producto; pedir "foto con celular" da más realismo.
  2. Video frase por frase (Grok).
  3. Tomas de apoyo de cerca del producto.
  4. Armado en CapCut.

  La persona generada **puede presentar**; **no puede decir que compró** ni pasar por cliente. [verificado: regla del motor]
- No poner "envío gratis" ni "paga en casa" en el texto del anuncio: la competencia busca esas palabras y te copia. [autor]

## 5. Montar la campaña (caps. 7, 9, 12)

- Pautar desde un **portafolio comercial** con su cuenta publicitaria, **nunca** desde la cuenta personal. Agregar un segundo administrador. [autor]
- Cuenta en la moneda de la tarjeta, método de pago cargado desde el principio y verificación en dos pasos antes de pautar. [autor]
- Píxel conectado a la cuenta publicitaria. **Un solo evento por etapa** del embudo, para que no se dupliquen. [autor]
- La **señal de compra tiene que ser real**. Una compra de prueba o un Purchase sin pago verificado le enseña a Meta a buscar gente que no compra. [verificado: es lo que pasó en esta cuenta]
- **Prueba de producto:** una campaña de Ventas, presupuesto Advantage+ (~60.000 COP/día), un conjunto con público abierto, optimizando la compra y 2 a 6 anuncios distintos. [autor]
- Del público solo se tocan las exclusiones: lugares sin cobertura o con muchas devoluciones (San Andrés, Leticia, zonas del Chocó) y edad mínima ~20. [autor]
- Apagar ubicaciones de baja calidad (Pangle y CapCut en TikTok; el equivalente en Meta es Audience Network). [autor]
- Llamadas a la acción de compra; quitar "Más información". [autor]
- Pruebas A/B en campañas separadas. Nombre con fecha + producto + tipo. No borrar campañas: apagarlas. Arranque programado a las 5 a. m. [autor]
- Escalar: +20% como máximo cada 48 h (`reglas-de-pauta.ts`). [verificado]
- TikTok: activar la cuenta nueva con una campaña chica, lanzar al menos un producto por semana para que no la bloqueen y escribir el texto del anuncio como lo escribiría un usuario. [autor]
- El autor manda el tráfico a la web porque no quiere atender chats. **En VentasPro el chat es la venta**: la prueba se mide por costo por conversación y % de conversaciones que terminan en pago. [hipótesis]

## 6. Leer los números (caps. 13, 15)

| Métrica | Meta del curso | Si falla |
|---|---|---|
| **CPA** (manda sobre todo lo demás) | por debajo del punto de equilibrio | creativos nuevos, subir el precio o cambiar de producto |
| CPM | menos de ~30.000 COP | mejorar el anuncio (interacción) |
| CTR de enlace | 2% o más | más llamado a la acción, urgencia u oferta real en el anuncio |
| Visitas ÷ clics | 70% o más | página lenta o clics basura |
| Conversión de la página | contraentrega 3-4%; pago anticipado 1,5% | primer pantallazo, dudas, formulario |
| Pagos iniciados ÷ visitas | 10-30% | |
| Compras ÷ pagos iniciados | 20-30% | |

- Con 3% de conversión hacen falta ~35 visitas por pedido: con menos visitas todavía no se juzga la página. [autor]
- **Antes del clic** es terreno de la plataforma; **después del clic** es terreno propio, y ahí está la plata. [autor]
- `diagnosticarEmbudo` ordena los hallazgos de arriba abajo del embudo. Para WhatsApp: **30 o más conversaciones sin venta = fuga en el chat** (umbral nuestro). [hipótesis]

## 7. Lo que aplica al vendedor de WhatsApp

- En contraentrega, la confirmación por WhatsApp separa un pedido de un cancelado; cada cancelado es publicidad perdida. [autor]
- Si el cliente no va a recibir, se cancela **antes** de despachar. [autor]
- La página y el chat responden **todas** las dudas antes de que las pregunten. [autor]
- El aviso de compra a Meta sale cuando el pago está **verificado**. [verificado]

## 8. Lo que el curso enseña y este sistema NO va a recomendar

- Pautar con perfiles prestados, comprados o de familiares.
- "Cuentas infinitas" con documentos o NIT ficticios; proxies y navegadores antidetección.
- "Eludir" las políticas de suplementos o productos de laboratorio.
- Fabricar reseñas, nombres y caras de clientes con IA.
- "Últimas unidades", "solo hoy", precio tachado o garantía que no sean verdad.
- Mandar compras de prueba al píxel de producción.

## 9. Pendiente que sale de este análisis

1. **Arreglar la señal de compra** (`agent.ts` ~L5251): mandar Purchase solo con pago verificado (como ya hace `routes/webhooks.ts`) y nunca para teléfonos `sim-`.
2. **Revisar las 59 conversaciones** que abrieron los anuncios: dónde se cae cada una.
3. **Pasar la pauta al portafolio comercial**: la cuenta que tiene configurada la app tiene gasto 0.
4. Recién después: **una prueba bien hecha** (un producto, 3 a 6 creativos distintos, presupuesto fijo 5-7 días, punto de equilibrio calculado antes).
