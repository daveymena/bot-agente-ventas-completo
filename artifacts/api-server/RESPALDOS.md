# Respaldos de la base

## Qué hace el sistema
- Cada respaldo se **cifra** con AES-256-GCM (clave derivada de `RESPALDO_CLAVE` con scrypt) antes de tocar el disco. Un archivo alterado no se puede abrir.
- Al arrancar, a los 5 minutos programa un respaldo y luego uno cada `RESPALDO_CADA_HORAS` (defecto 24).
- Cada respaldo exporta **todas** las tablas del esquema a `base-<fecha>.json.gz`, con un manifiesto de conteos.
- Después de escribir, el archivo se **relee y se compara** con el manifiesto. Si no cuadra, se borra y se avisa.
- Se conservan los `RESPALDO_CONSERVAR` más recientes (defecto 14).
- Una tabla declarada en el esquema pero ausente en la base no aborta el respaldo: queda en `faltantes` del manifiesto y se avisa en el log.

## Variables de entorno
| Variable | Defecto | Qué hace |
|---|---|---|
| `RESPALDO_CLAVE` | **obligatoria** (≥16 caracteres) | clave de cifrado de los respaldos. Sin ella no se crea ningún respaldo |
| `RESPALDO_ACTIVO` | activo | `false` lo apaga |
| `RESPALDO_CADA_HORAS` | 24 | frecuencia |
| `RESPALDO_CONSERVAR` | 14 | cuántos respaldos guardar |
| `BACKUP_DIR` | `data/backups` | dónde se guardan |
| `RESPALDO_DESTINO_URL` | (vacío) | **copia fuera del servidor**: cada respaldo se sube por PUT a `<URL>/<archivo>` |
| `RESPALDO_DESTINO_TOKEN` | (vacío) | se envía como `Authorization: Bearer` |

## ⚠️ Lo que el sistema NO resuelve solo
Un respaldo en el mismo disco que la base **no protege** si se pierde el disco o el contenedor.
Con `RESPALDO_DESTINO_URL` configurado, cada respaldo se sube también a ese destino. Sin esa
variable el sistema lo avisa en el log en cada corrida: sin copia externa, el respaldo sirve
para un error de datos, no para una caída del servidor.

El destino tiene que aceptar `PUT` (WebDAV, un endpoint propio, o un prefijo de almacenamiento
con URL firmada). Un bucket S3 requiere firma por objeto; si se usa uno, hay que apuntar a un
endpoint que firme o a una URL prefirmada.

Los respaldos contienen datos de clientes. Están cifrados, pero la clave es lo que los protege:

- **Guarda `RESPALDO_CLAVE` en tu gestor de contraseñas**, no en EasyPanel junto a la base. Si el
  servidor y la clave se pierden juntos, los respaldos son inútiles para siempre; si la clave se
  pierde sola, lo mismo.
- No cambies la clave sin conservar la anterior: los respaldos viejos se abren solo con la que los creó.
- Nunca subas respaldos a git (ya están en `.gitignore`).

## Probar que se pueden restaurar
Un respaldo que nunca se restauró es una suposición. Una vez al mes:
1. Tomar el respaldo más reciente de `BACKUP_DIR`.
2. Verificarlo: `verificarRespaldo(ruta)` debe dar `ok: true`.
3. Restaurar en una base de prueba (no en producción) y comparar conteos con el manifiesto.

## Monitoreo externo
`ops/monitor-produccion.yml` revisa `/api/health` cada 10 minutos desde GitHub.
Si falla HTTP, la base o WhatsApp, abre un issue con la etiqueta `incidente-produccion` y se cierra
solo cuando vuelve a estar bien. GitHub solo ejecuta los `schedule` desde la rama por defecto:
el workflow tiene que estar en esa rama para que corra.
