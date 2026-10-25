# VentasPro: revisión funcional y de diseño

Fecha: 25 de octubre de 2026. Entornos distintos: navegador autenticado contra producción, código local en la rama del PR 20 y pruebas aisladas en SQLite. Los cambios de esta revisión no están desplegados. No se debe presentar la inspección del servidor publicado como validación visual de los nuevos estilos locales.

## Evidencia del navegador

- Inicio de sesión Google completado por el usuario; panel accesible y sesión compartida entre pestañas.
- Atlas: conversación separada de prueba, consulta de disponibilidad de proveedores, respuesta obtenida. No se confirmó ningún plan antiguo ni se activaron campañas. El primer turno se detuvo ante un aviso ambiguo.
- Proveedores: Groq respondió en 419 ms; DeepSeek, 1.020 ms; OpenRouter, 8.701 ms. Ollama Cloud y OpenAI devolvieron 429. NVIDIA agotó el tiempo de la prueba. Son muestras puntuales del botón de prueba, no garantía de capacidad de tool-calling ni de disponibilidad sostenida. No se cambiaron modelos, claves ni proveedor activo.
- Catálogo: 142 productos visibles, frente a 50 que informaba el diagnóstico inicial de Atlas. Modal de creación abierto y cancelado sin guardar: moneda predeterminada MXN pese al catálogo COP.
- Navegación: se abrieron panel, catálogo, conversaciones, CRM, pedidos, aprobaciones de pago, punto de venta, agentes, WhatsApp, marketing, Facebook, diagnóstico, Studio, integraciones, Agent Lab y monitor WhatsApp. Esto es un recorrido de navegación: algunos módulos solo mostraron su estructura o carga inicial durante la inspección; no constituye validación de cada operación interna.
- Studio: landing existente seleccionada, cambio entre móvil y escritorio sin publicar. Vista móvil: iframe de 374 px con documento interior de 359 px, scrollWidth 359 px, sin desborde horizontal. Dos fotos principales cargadas; otras imágenes de carga diferida no se verificaron después de desplazar toda la página. El formulario existe, no se envió. Se observó contradicción entre envío por confirmar y envío sin costo en contenido guardado: requiere auditoría comercial del contenido antes de pautar.
- Tienda pública: catálogo y navegación abiertos, acceso al panel de la tienda disponible. No se enviaron pedidos ni se ejecutaron cobros.
- Probador del vendedor: consulta del curso de piano sobre precio/contenido y certificado. Informó COP 60.000, 19 módulos y no incluyó certificado. La primera respuesta fue redundante y preguntó por precio después de haber sido solicitado; la segunda prometió anotar/avisar al equipo sin evidencia verificada de esa acción. La revisión automática no lo advirtió. Las instrucciones actuales del negocio contienen reglas de contraentrega y garantía de fábrica para todos los productos: deben revisarse para separar físicos y digitales. No se alteraron esas instrucciones en producción.

## Correcciones implementadas

1. Aviso de arranque de Atlas: proveedores de IA ya no se confunden con proveedores logísticos o con campañas mencionadas en una prohibición. Es texto de progreso: el aviso equivocado no demuestra una mutación de campañas.
2. Diagnóstico inicial: consume el conteo completo de analyze_system, con desglose físico/digital, en lugar de contar una página de list_products.
3. Studio: los botones y respuestas breves de aprobación/rechazo llegan sin el prefijo de contexto. El reconocedor acepta hacelo como unidad explícita de aprobación; se conserva el tratamiento de mensajes con correcciones. Pruebas usan el reconocedor real, sin ejecutar campañas.
4. Productos: moneda nueva inferida del catálogo, preservando la explícita y la de productos existentes; no fuerza MXN a todos los negocios.
5. Memoria multicapa: los pares regex/tag estaban escritos con operador coma en vez de tuplas; se corrige el fallo de ejecución. Sus 12 pruebas pasan. Esto no activa el módulo experimental en el vendedor.
6. Probador de proveedores: resuelve la clave del tenant y limita cada solicitud corta a 15 segundos, sin reintento automático del SDK. No cambia el tiempo de las conversaciones largas del agente.
7. Pantalla de acceso: se retira el ejemplo que afirmaba un certificado para el curso. Panel de proveedores: se retiran afirmaciones de disponibilidad ilimitada y rotación garantizada.

## Diseño después de la revisión funcional

- Menú de escritorio: Atlas como acceso principal, grupos expandibles, estado activo para Studio/Creativos, iconografía contenida, foco visible y controles de 44 px.
- Menú móvil: búsqueda de módulos sin acentos obligatorios, controles más legibles y accesos principales con menos ruido visual. Layout usa altura dinámica y reduce el exceso de espacio reservado al pie.
- Probador de WhatsApp: encabezado de laboratorio con estado de prueba privada, conversación y panel de conocimiento separados, sugerencias táctiles, barra de escritura con mayor espacio y fondo discreto. El motor y los mensajes no se reemplazan por ejemplos simulados.
- Landings: Creator incorpora composición editorial, marco de producto y bento asimétrico; Servicios Pro usa composición de proceso, imagen vertical y FAQ lineal. Se mejoran lectura, foco y controles táctiles compartidos. Movimiento de Creator pasa de flotación repetida a una entrada única, respetando reduced-motion. No se inventan fotos, testimonios ni condiciones nuevas.

## Resultado de pruebas

Primera batería: 389 archivos; 4.659 aprobadas, 39 fallidas y 12 omitidas (4.710 en total). Segunda batería después de correcciones/diseño: 391 archivos; 4.680 aprobadas, 27 fallidas y 12 omitidas (4.719). Regresiones focalizadas de confirmación, conteo, moneda, avisos y memoria: 45 pruebas aprobadas. Frontend y backend compilan; persisten avisos de sourcemaps y casos duplicados en proveedores.

El chequeo completo de tipos no está aprobado: hay errores y referencias a declaraciones faltantes tanto en API como frontend. Compilar con Vite/esbuild no equivale a pasar TypeScript. Vitest informa un recurso que demora el cierre pese a completar los casos.

Fallos pendientes por grupo:

- Agent Lab: suites con fixtures de tenant ausentes, una importación de motor no resoluble y acceso a un resultado sin inicializar.
- Presupuestos de contexto: catálogo de capacidades y dos presupuestos de esquemas excedidos; no se aumentaron los límites para ocultar el problema.
- Selección de familia y modelos: expectativas que difieren de la selección actual; requieren validar el comportamiento deseado antes de cambiar pruebas.
- Formato del vendedor y envío: expectativas textuales antiguas que no coinciden con reglas actuales; no se restauraron promesas de envío sin configurar para obtener verde.
- Cerebro experimental: autonomía, especulación, planificación y razonador tienen casos fallidos; no se activaron para producción.
- Render antiguo: cinco expectativas de marco, beneficios, galería, FAQ y cierre fallan; debe contrastarse cada renderer con contenido y publicación reales.
- Orquestador de marketing: saludo detectado como help frente a expectativa unknown.
- Enfriamiento de saldo: una prueba espera 6 horas y la política actual aplica 24 horas; revisar intención antes de unificar.

## Límite de la validación móvil y externa

Se comprobó el viewport móvil del visor de landing. El panel administrativo completo no se pudo ejecutar en un viewport de teléfono con las capacidades de este navegador: tiene revisión de código responsive y compilación, pero no una aprobación visual móvil completa. Tampoco se probaron cobros reales, despachos, envío a clientes, publicaciones, eliminación de datos ni gasto publicitario. No hay certificación de carga, rentabilidad o regresión visual de todos los estados. El PR debe seguir en borrador hasta resolver bloqueos y validar el despliegue.

## Adaptación de tienda por negocio

- Se mantiene la elección explícita del dueño; sin elección, los catálogos totalmente digitales reciben una portada editorial de colección, los de servicios su página profesional y los mixtos la vitrina por departamentos. Se añade `digital` al perfil y a la herramienta administrativa existente de Atlas. Un catálogo vacío no se interpreta como digital o servicios.
- La línea explícita de cada oferta manda sobre el tipo heredado. Los servicios en negocios mixtos llevan a una ficha de consulta, sin agregar al carrito ni abrir una pasarela. Carritos antiguos con servicios reconocibles se detienen antes del pago. Una solicitud por WhatsApp no equivale a una reserva confirmada.
- Las fichas digitales y físicas explican su recorrido sin prometer acceso vitalicio, entrega por Drive, originalidad o pago único por defecto. Encabezado y barra de condiciones usan mensajes neutrales; se retiran promesas genéricas de entrega inmediata en los bloques de confianza de la vitrina. El contenido comercial guardado en landings requiere auditoría aparte.
- La tienda vacía o con error ya no rellena la vitrina con productos de demostración guardados en el navegador. No se migró ni modificó ningún catálogo de producción.
- Servicios: fotos reales si existen, moneda de cada oferta y campos accesibles; digitales: búsqueda y categorías conectadas también al buscador del encabezado. El diseño usa rejillas responsive y controles táctiles. No se ha validado visualmente esta nueva portada en un navegador de móvil/escritorio ni desplegado.
- Pruebas focalizadas de presentación, clasificación, carrito, confirmaciones, catálogo y avisos: 32 aprobadas en 5 archivos. Tienda y backend compilan. TypeScript de la tienda conserva errores del editor y otros módulos; no se declara aprobado el chequeo general.
