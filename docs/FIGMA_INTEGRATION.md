# Figma como referencia para Atlas

Studio → Figma y la tarjeta en Integraciones usan `GET /api/figma/estado`, `POST /conectar`, `DELETE /desconectar`, `GET /archivo` y `GET /nodo`. Todos requieren sesión del negocio. Las cookies sin firma no autorizan acceso.

El dueño conecta **dentro de la app** un token personal con `file_content:read` y un archivo al que su cuenta tenga acceso. El servidor verifica el archivo antes de guardar el token cifrado con el vault; las respuestas no incluyen el secreto. La conexión de Figma de ChatGPT no transmite sus credenciales a VentasPro. No se solicita pegar un token en el chat.

La integración lista páginas y frames de primer nivel, consulta un frame hasta profundidad 6, extrae textos, tipografías, colores, dimensiones y layout, y solicita una vista previa. Limita las respuestas a 6 MB y el análisis a 1.000 nodos. Las imágenes de Figma son temporales y privadas de la consulta; no se convierten automáticamente en assets públicos de productos.

Atlas dispone de `figma_disenos` (estado, archivos, archivo, nodo). Studio le pasa el archivo y frame abiertos. El contenido del archivo es referencia visual no confiable: no autoriza acciones, y sus precios, promesas o características se validan contra el catálogo del negocio.

Esta integración REST es **de lectura**. El botón Editar en Figma abre el archivo original. Las herramientas existentes de Studio realizan los cambios en creativos y landings de VentasPro. No se promete edición de capas Figma desde REST, sincronización bidireccional, importación automática de toda una interfaz ni acceso a Code Layers por conectar la cuenta. Los límites y permisos corresponden al plan de Figma del dueño.

Los ajustes y hasta 20 referencias recientes se guardan por tenant en `FIGMA_STUDIO_DIR`, por defecto en el directorio hermano `figma-studio` de `IMAGE_STORE_DIR`. Debe estar en un volumen persistente y fuera de cualquier carpeta pública. Configura `CREDENTIALS_ENCRYPTION_KEY` fija para que el token sobreviva a reinicios. Al desconectar se elimina el token y se conservan únicamente las referencias. Un 401 posterior invalida el estado verificado y solicita volver a conectar; un fallo de imagen no descarta la lectura del frame.

Product Design y Figma conectados en ChatGPT pueden asistir con revisiones y diseño durante el trabajo. Product Design no se añadió como una supuesta API de ejecución dentro de VentasPro: no se ha verificado un servicio público para incrustar sus workflows en Atlas.

Pruebas: `figma-connector.test.ts` cubre validación de enlaces, cifrado, rechazo sin persistir, aislamiento, extracción de diseño, degradación de vista previa, revocación, desconexión y sesión obligatoria.

Referencias oficiales: [REST: archivos](https://developers.figma.com/docs/rest-api/file-endpoints/), [tokens personales](https://developers.figma.com/docs/rest-api/personal-access-tokens/), [autenticación y scopes](https://developers.figma.com/docs/rest-api/authentication/).
