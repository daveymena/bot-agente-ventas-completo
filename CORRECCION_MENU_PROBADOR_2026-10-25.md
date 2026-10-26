# Menú y probador de vendedor — 25 de octubre de 2026

## Cambios

- Menú de escritorio con accesos diarios siempre visibles, Atlas destacado, secciones independientes, herramientas de configuración al pie y barra compacta con etiquetas emergentes. Se conservan las rutas y los permisos de administrador. Studio y Creativos se distinguen por su consulta, sin marcar ambos como activos. El tema claro/oscuro queda limitado al menú.
- El motor cargaba `settings` después de decidir `proveedorElegido`. Al recibir solamente `tenantId`, el probador y otros llamadores podían ignorar el proveedor guardado. Ahora la configuración se resuelve primero; se conserva el respaldo de proveedores.
- WhatsApp guardaba el contenido y el precio de las tarjetas en su historial; la simulación guardaba solamente `[ficha]`. Ambos usan ahora `textoDelTurnoParaHistorial`. La API devuelve esa memoria y el frontend la conserva para el siguiente turno y para regenerar. El guion inicial también recibe el producto en foco.
- Cada respuesta del probador muestra el proveedor/modelo que informó el motor y sus herramientas. Los pedidos siguen siendo simulados.
- Una revisión que fallaba se mostraba como «no promete nada fuera de la ficha». Ahora se distingue revisión no disponible de comprobaciones completadas sin alertas; ninguna etiqueta certifica la coherencia completa del vendedor.
- Guardar una corrección y comprobar su efecto son estados distintos. La interfaz permite comparar respuestas, informa si no cambió y conserva la conversación si falla la regeneración. Se bloquea el reinicio mientras se genera una respuesta.

- La prueba real de certificado descubrió una segunda divergencia: «incluye» en el nombre de un portátil se consideraba identidad de producto. La búsqueda y el cambio de foco ahora excluyen las palabras genéricas; los disparadores explícitos del conocimiento del dueño siguen reconociéndose. Se prueba el caso literal junto a búsquedas por nombres y cambios de producto.
- El foco se actualizaba después de construir el prompt. Ahora se resuelve antes, con el guion del producto elegido: su descripción y los datos negativos confirmados están disponibles desde la primera llamada de IA. La prueba de integración comprueba la entrada real del cliente LLM.
- El corrector muestra un selector explícito del producto al que se aplica un dato. Una ficha seleccionada tiene prioridad sobre el foco general; un producto no disponible bloquea el guardado. El backend rechaza productos inexistentes o ajenos al negocio.

## Verificación

- Backend: 274 pruebas aprobadas en diez archivos, incluidos búsquedas, cambios de producto, condiciones de las fichas y caché del prompt.
- Frontend: seis pruebas aprobadas (rutas del menú y estados de revisión).
- Compilaciones de backend y frontend aprobadas.
- La prueba de integración usa SQLite aislado y un cliente LLM controlado: comprueba memoria de tarjetas entre turnos, prioridad del proveedor guardado y lectura de correcciones reales por las herramientas del motor. No abre conversaciones reales ni envía WhatsApp.
- Navegador de producción: respondió precio/contenido del piano y recordó los 19 módulos; prometió confirmar el certificado sin tener el dato cargado. Un turno al cambiar de producto falló; el reintento mostró cursos de diseño. Esto verifica el comportamiento de la versión desplegada, no el de los cambios locales.
- El navegador remoto no alcanza el servidor local (`ERR_CONNECTION_REFUSED`). Posteriormente se observó el menú nuevo en producción y se verificaron contraer/expandir y los enlaces visibles. La nueva versión del motor y del corrector aún requiere comprobarse después del despliegue.
- La comprobación general de tipos sigue bloqueada por declaraciones de dependencias de workspace sin compilar (`TS6305`) y errores preexistentes; no se afirma que haya pasado.
- Vitest informa temporizadores abiertos al cerrar el proceso; las 274 aserciones de pruebas pasaron. No se cambió la infraestructura de pruebas para ocultar ese aviso.

## Certificado observado en producción

Por indicación expresa del dueño se añadió «Este curso no incluye certificado» a la descripción del producto real CURSO DE PIANO COMPLETO (123). La web confirmó «Producto actualizado». El corrector anterior había vinculado ese dato al portátil ASUS Vivobook 15 (128) debido al cambio de foco; ese registro erróneo sigue pendiente de reparación. La revisión automática rechazó modificarlo con un texto que consideró ambiguo; no se reintentó esa modificación por otra vía.

La versión anterior del motor todavía contestó que sí había certificado en una prueba nueva. Esa observación llevó al arreglo del orden de construcción del contexto; no debe presentarse la actualización de la ficha como prueba de que el motor desplegado ya está corregido.

## Datos del negocio

El panel observado tenía instrucciones generales de contraentrega para productos físicos junto a un catálogo de cursos digitales, además de una garantía general de fábrica. Esos datos necesitan mantenerse por producto o tipo de producto; no se cambiaron garantías ni condiciones por suposición. La ausencia de un dato no autoriza al vendedor a prometer una verificación posterior que nadie ejecuta.

Subir esta rama a Git no despliega automáticamente la aplicación. Este cambio no afirma resolver todos los fallos de proveedor ni todos los comportamientos comerciales.
