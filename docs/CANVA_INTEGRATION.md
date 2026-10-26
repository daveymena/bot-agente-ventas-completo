# Canva en VentasPro Studio

Implementación: `canva-connector.ts`, `lib/canva/`, `routes/canva-studio.ts` y `CanvaWorkspace`. Usa la cuenta OAuth propia de cada negocio; la conexión de Canva en ChatGPT es independiente.

## Configuración

Configura `CANVA_ENABLED=true`, `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI=https://ventasproia.com/api/canva/callback` y una `CREDENTIALS_ENCRYPTION_KEY` fija. El redirect debe coincidir exactamente en Canva. Conecta en Integraciones y pulsa **Probar conexión**: guardar un token ya no basta para mostrar acceso verificado.

OAuth Authorization Code + PKCE. Los scopes exactos están en `CANVA_SCOPES`: incluyen `design:meta:read`, `design:content:read`, `design:content:write`, `asset:read`, `asset:write`, `brandtemplate:meta:read`, `brandtemplate:content:read` y `profile:read`. Al ampliar permisos, vuelve a autorizar la app. Base REST: `https://api.canva.com/rest/v1`.

Los tokens se cifran con el vault existente. Las consultas renuevan el acceso al vencer o ante un 401, coordinan renovaciones concurrentes y reintentan la consulta una sola vez. Un acceso revocado exige reconectar; no se oculta el error.

## Flujo del dueño

1. Abre Studio → Canva y elige un producto. Precio, características, imagen y marca vienen del negocio autenticado.
2. Usa una familia Studio para digitales, físicos o servicios, o configura campos de una plantilla propia de Canva. Cada campo del dataset debe asignarse explícitamente; si cambia el esquema, la generación se detiene para corregirlo.
3. Prepara hasta tres conceptos en 1:1, 4:5 y 9:16. Revisa titulares y piezas antes de usarlas.
4. Las familias Studio conservan sus escenas editables en el editor de creativos. La copia enviada a Canva es una **imagen compuesta**, no una reconstrucción de capas.
5. Una plantilla Canva con autorrelleno genera copias editables, preservando el original. El autorrelleno y las adaptaciones dependen de permisos y plan de Canva; pueden responder 403. No se presupone que la cuenta los tenga disponibles.
6. Importa un diseño existente como PNG, JPG, PDF o MP4. MP4 exporta contenido de video existente, no genera un video desde texto.
7. Abre Canva, edita y pulsa **Traer cambios** para guardar una versión nueva. Las descargas firmadas de Canva vencen: el servidor copia los bytes al almacenamiento de VentasPro y valida dominio, tamaño y formato.
8. Vincula manualmente un ID de anuncio a una variante para consultar contactos, pagos confirmados e ingresos registrados de los últimos 30 días, usando la atribución existente. No calcula rentabilidad sin gasto ni inventa un ganador sin datos.

Atlas usa `canva_studio` para consultar y `canva_preparar` para preparar borradores, registrar plantillas, reanudar y vincular anuncios. La creación devuelve un trabajo asíncrono: Atlas debe consultar su estado antes de afirmar que terminó. Estas herramientas no publican anuncios.

## Persistencia y límites actuales

Los archivos públicos van a `IMAGE_STORE_DIR/canva/{tenant}`; los manifiestos privados a `CANVA_STUDIO_DIR` o, por defecto, al directorio hermano `canva-studio` de `IMAGE_STORE_DIR`. **Ambos directorios deben estar en un volumen persistente**, como `/app/data` en el despliegue del repositorio. No apuntes un directorio privado a una ruta servida públicamente. Los creativos nativos conservan la persistencia del editor existente.

Cola del proceso: dos trabajos globales, uno por negocio, hasta 200 paquetes y 30 plantillas guardadas por negocio. Reanudación manual tras reiniciar; se conservan IDs remotos y variantes terminadas ya persistidos. Un fallo entre la creación remota y la escritura de su ID puede dejar un borrador huérfano en Canva. No es una cola distribuida ni una garantía de operación para miles de instancias. No hay borrado automático de paquetes ni cuota total de bytes; los límites por descarga son 25 MiB y 80 MiB para video.

No se registra una venta por descargar un creativo. Los resultados dependen de la atribución comercial real existente.

## Verificación

`canva-connector.test.ts` y `canva-studio.test.ts`: renovación, concurrencia, aislamiento por negocio, validación de dataset, paginación, bytes durables, múltiples medidas, precio del catálogo, idempotencia, copia nativa, recuperación y vínculo único de anuncio. Usan proveedor simulado y base de pruebas, sin publicar ni gastar en una cuenta real.

Referencias oficiales: [OAuth y REST](https://www.canva.dev/docs/connect/), [Autofill](https://www.canva.dev/docs/apps/rest-apis/reference/autofills/create-design-autofill-job/), [Exportaciones](https://www.canva.dev/docs/apps/rest-apis/reference/exports/create-design-export-job/), [Adaptaciones](https://www.canva.dev/docs/apps/rest-apis/reference/resizes/create-design-resize-job/).
