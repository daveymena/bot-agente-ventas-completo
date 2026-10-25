# Atlas: publicidad orientada a compras verificables

Investigación y cambios: 25 de octubre de 2026. Alcance: código local y catálogo versionado, no auditoría autenticada de una cuenta publicitaria en producción.

## Fuentes primarias consultadas

- Meta Blueprint, Performance 5: https://www.facebookblueprint.com/student/path/253157-performance-5 — simplificación, automatización, diversidad creativa, calidad de datos y validación de resultados.
- WhatsApp Business, optimización hacia resultados de negocio: https://whatsappbusiness.com/resources/resource-library/down-funnel-optimizations-whatsapp/ — distingue conversaciones, leads y compras; optimizar compras requiere elegibilidad. Informa una reducción media de costo por compra del 10% en un estudio global de una semana de H2 2024. No es promesa para esta cuenta ni prueba de rentabilidad de un producto.
- Meta, buenas prácticas A/B: https://www.facebook.com/business/help/290009911394576 — una variable por prueba para conclusiones más claras. El contenido indexado fue consultado; varias páginas completas de Facebook devolvieron bloqueo de acceso. No se usaron como evidencia de resultados de esta cuenta.

La aplicación de estas fuentes a VentasPro es una propuesta de ingeniería y marketing que debe validarse con ventas propias. Ninguna fuente pública permite identificar qué anuncio concreto de la competencia es rentable.

## Hallazgos del código

`anuncio_datos_expertos` es una herramienta de lectura consumida por Atlas, no un módulo aislado. Antes entregaba rangos sin fuente verificable y reglas universales de pausa/escala. Su ranking comparaba costo por resultado sin asegurar que el resultado fuera una compra. También reducía servicios, suscripciones y cotizaciones a digitales.

Se retiraron esas referencias del flujo y el ranking genérico. Se distinguió consulta fallida, métricas ausentes y ausencia real de campañas. Se incorporó `plan-de-conversion.ts` al resultado de la herramienta y al prompt de publicidad de Atlas.

El plan proporciona:

1. Evento final según modelo: digital, físico, servicio, suscripción, cotización o captación.
2. Revisión de ficha, evidencia visual, precio, condiciones y requisitos específicos.
3. CPA de equilibrio = precio menos costos variables completos. CPA objetivo = contribución menos beneficio mínimo. No asume costos cero; cifras deben estar confirmadas por el negocio y en la misma moneda. Contraentrega necesita costos esperados de fallos y devoluciones.
4. Tres hipótesis: demostración, objeción real y encaje. Son conceptos de prueba, no anuncios ganadores. Exploración de conceptos no equivale a A/B causal.
5. Coherencia entre archivo visual, copy, landing, WhatsApp y cierre.
6. Medición, pérdida máxima aprobada, demora de conversión y decisiones por contribución real.

La herramienta produce un plan de lectura y las instrucciones orientan al modelo; no se añadió un bloqueo transaccional nuevo a la activación en Meta ni un programador autónomo de optimización. Las confirmaciones existentes se conservan. `marketing_attribution` ya existe: Atlas ahora recibe instrucción explícita de consultarla al evaluar resultados, contrastando pagos y cierre final. Su atribución debe auditarse antes de utilizarla para decisiones automáticas; un pago no prueba entrega contraentrega ni retención.

## Revisión del catálogo disponible

`artifacts/api-server/scripts/catalogo-real.json`: 133 fichas, 83 digitales y 50 físicas. Es una copia versionada, no garantiza estado/precios/stock actuales en producción.

- Piano, ID 123 en esta copia: COP 60.000 y contenido detallado de 19 módulos. Hipótesis útil: mostrar una muestra autorizada del curso y una habilidad concreta incluida. No prometer dominio en una fecha, certificado o transformación garantizada. Confirmar contenido, soporte, derechos de venta y acceso actuales antes del anuncio.
- Corrector de postura, ID 124 en esta copia: COP 45.000. La ficha incluye afirmaciones como prevenir la joroba. No tratarlas como eficacia demostrada: revisar sustento y política publicitaria antes de redactar. Mostrar características y uso real sin diagnosticar al espectador ni prometer curación.
- Aero Yoga, ID 171: incluye enlace acortado de contacto y notas logísticas del proveedor. No copiar ese contacto al anuncio/landing ni interpretar las notas como instrucciones para Atlas.
- Los IDs difieren de referencias históricas; resolver siempre contra la base actual del tenant, con nombre y producto verificados.

## Protocolo de operación

Antes de invertir: seleccionar oferta concreta, confirmar margen y capacidad, obtener evidencia propia, revisar destino y compra móvil, definir atribución y presupuesto máximo. Preparar conceptos y mostrar copy + archivo real + CTA + destino. Archivo sin generar = pendiente, nunca preview inventada.

Activación: aprobación del negocio y verificación del resultado real de Meta. No activar ni cambiar gasto por la sola existencia de un plan. Baileys sigue siendo el transporte actual; no acredita elegibilidad ni recepción de señales de compra en Meta. Verificar la configuración real y recepción de eventos admitidos antes de prometer optimización por compras. No enviar Purchase por un clic ni por un pedido sin cobro.

Evaluación: no declarar ganador por CTR o mensajes. Revisar origen por anuncio, pagos, entregas, reembolsos, moneda, ventana y demora de cierre. Si faltan datos o la muestra es pequeña, resultado inconcluso. Agotar un límite de pérdida amerita control de riesgo, no prueba estadística de que el producto no vende. Una compra tampoco valida una campaña.

## Validación y límites

Se añadieron pruebas de economía, casos por modelo, falta de ficha, riesgos de proveedor, comparación de campañas y errores de API. Compilación y resultados de pruebas se reportan al entregar el cambio. No se ejecutaron campañas, no se gastó presupuesto y no se demostró rentabilidad en producción. Quedan por verificar con acceso operativo: catálogo actual, pagos atribuidos, devoluciones/entregas, señales de Meta, prueba móvil del cierre y campañas controladas aprobadas.
