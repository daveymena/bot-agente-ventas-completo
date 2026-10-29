# Confirmaciones de Atlas desde Studio

Verificación del 27 de octubre de 2026: Canva y Figma aparecen en Studio de producción; Canva muestra un paquete con tres variantes terminado. Figma está disponible y pendiente de autorización propia del negocio. No se ejecutaron los planes comerciales pendientes durante esta revisión.

El historial visible contiene varios ciclos de «Sí, hacelo» seguidos de una nueva propuesta. La interfaz actual ya envía las respuestas de los botones sin contexto, y se comprobó en una regresión que una respuesta con el prefijo `[CONTEXTO DEL ESTUDIO]`, enviado por clientes anteriores, no se reconocía como un sí explícito. Ese formato podía devolver el turno al modelo y generar otra propuesta. No se atribuyen todos los mensajes históricos a esa única causa sin registros del turno.

`decisionSinContextoEstudio` elimina únicamente ese prefijo exacto, separado por un párrafo, cuando el cuerpo es una aprobación o un rechazo simple. Conserva las condiciones, los pedidos de cambios y los mensajes completos. Se aplica antes de consultar el plan pendiente en `/operator-opencode`. Las aprobaciones reconocidas ya no consultan el clasificador de intención del modelo antes de ejecutar el plan vigente. Se conserva el aislamiento existente por negocio y sesión.

`studio-confirmacion.test.ts` usa los reconocedores reales del servidor para cubrir botones actuales, mensajes de clientes anteriores, aprobaciones coloquiales, rechazo, condiciones y pedidos nuevos con un sí incrustado. `atlas-confirmacion.test.ts` conserva los casos existentes. No se alteró el vendedor de WhatsApp.

Esta comprobación no acredita una nueva ejecución en producción: se revisaron el estado visible y las regresiones locales; la corrección adicional requiere desplegar el nuevo commit.
