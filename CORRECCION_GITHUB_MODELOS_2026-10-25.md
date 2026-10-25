# Configuración de GitHub Models / Copilot

Fecha: 25 de octubre de 2026. Base: para-subir, 34176e85c4bcb83f86eb80ce519509e41038311a.

## Causas

- El catálogo moderno ofrecía GitHub Models como disponible y omitía GitHub Copilot. GitHub Models fue retirado el 30 de julio de 2026; modificar su clave no restablece el servicio.
- El panel histórico guardaba el modelo de Copilot en settings.githubModel. Atlas buscaba únicamente businessConfig.aiProviders, con otro identificador de proveedor y una ruta directa que no admite la autenticación de Copilot.
- El probador podía preferir un token antiguo del entorno a la cuenta recién conectada.

## Cambios

- Tarjeta de GitHub Models informativa, sin controles para reactivarlo; endpoints de catálogo, prueba y activación responden 410 con explicación. La configuración histórica permite cambiar a Copilot explícitamente.
- Copilot aparece separado y lleva al panel existente de conexión por código. No se solicita ni se expone un token nuevo en el navegador.
- Selector de modelos de la cuenta: consulta el catálogo con la sesión renovable existente; respeta modelos deshabilitados y selección manual no disponible. Carga, error, catálogo vacío y modelo guardado ausente se muestran explícitamente. No se presume que listar un modelo pruebe saldo o capacidad de respuesta.
- Una sola fuente de guardado: settings.githubModel. Se aplica al entorno, al catálogo y a la prioridad github-copilot de OpenCode. Cuando Copilot está seleccionado y tiene conexión/host de OpenCode configurados, se utiliza su recorrido OAuth existente; sin esa configuración se conservan los respaldos directos.
- La prueba corta resuelve la misma cuenta de Copilot que su catálogo, incluso si existe una credencial antigua en el entorno.

## Verificación

42 pruebas aprobadas en cinco archivos: catálogo y persistencia reales en SQLite aislado, token de sesión frente al OAuth, políticas del catálogo, cuenta recién conectada frente al entorno, prioridad de Atlas, device-flow y rotación. No se realizaron llamadas de inferencia reales ni se guardaron credenciales del usuario. Backend y frontend compilan; continúan avisos de proveedores duplicados y sourcemaps. El chequeo general de tipos sigue bloqueado por errores y declaraciones de workspace ausentes; no se presenta como aprobado.

La corrección de tipos introducida en el selector se revisó antes de publicar. Queda pendiente probar visualmente los nuevos controles en escritorio/móvil y realizar la conexión, consulta e inferencia con la cuenta real tras desplegar. Subir este código no despliega el servidor ni cambia el proveedor activo de producción.

## Fuentes primarias

- Retiro de GitHub Models: https://docs.github.com/en/github-models
- Anuncio final: https://github.blog/changelog/2026-07-30-github-models-is-now-retired/
- Disponibilidad por plan y cliente de Copilot: https://docs.github.com/en/copilot/reference/ai-models/supported-models

Se reutiliza la integración interna de Copilot que ya tiene esta aplicación. La documentación oficial confirma que Copilot y GitHub Models son servicios distintos; no garantiza que todos los modelos de Copilot sean invocables desde esta integración.
