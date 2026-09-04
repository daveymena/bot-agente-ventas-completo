# EasyPanel MCP Bridge → ChatGPT

## Arquitectura

```text
ChatGPT
   │ HTTPS + Bearer MCP_SECRET
   ▼
EasyPanel MCP Bridge :4001
   │ token de EasyPanel almacenado solo como variable del servidor
   ▼
EasyPanel API
```

## Variables de entorno

Obligatorias:

- EASYPANEL_URL
- EASYPANEL_TOKEN
- MCP_SECRET
- MCP_PORT=4001

Opcionales para herramientas del bot:

- BOT_URL
- BOT_SESSION_COOKIE
- BOT_EMAIL
- BOT_PASSWORD

Las credenciales nunca deben estar en el repositorio.

## Endpoints

- GET /health — health check público.
- POST /mcp — endpoint MCP remoto principal.
- GET /sse — transporte SSE legado.

`/mcp` requiere autenticación Bearer usando `MCP_SECRET`.

## Herramientas

Lectura:

- ep_list_projects
- ep_get_service_logs
- ep_get_service_env (valores sensibles redactados)
- ep_get_service_status
- ep_list_domains
- ep_get_bot_health
- ep_get_bot_conversations

Acciones:

- ep_restart_service
- ep_send_message

Las acciones de escritura están marcadas como destructivas para clientes MCP compatibles.

## Despliegue en EasyPanel

1. Crear un servicio desde este repositorio.
2. Seleccionar `Dockerfile.easypanel-mcp`.
3. Exponer el puerto 4001 mediante HTTPS/dominio.
4. Configurar las variables como secrets/environment variables.
5. Hacer deploy.
6. Comprobar `/health`.
7. Conectar ChatGPT al dominio HTTPS terminado en `/mcp`.

## Seguridad

- El token de EasyPanel permanece dentro del servicio.
- No se desactiva la verificación TLS.
- Los valores sensibles de las variables se redactan antes de llegar a ChatGPT.
- Usar HTTPS y un MCP_SECRET largo y aleatorio.
- No guardar contraseñas, cookies ni tokens en Git.
- Si una contraseña estuvo alguna vez en el historial de Git, debe rotarse aunque ya se haya eliminado del archivo actual.
