# Respaldos de la base

## Qué hace el sistema
- Al arrancar, a los 5 minutos programa un respaldo y luego uno cada `RESPALDO_CADA_HORAS` (defecto 24).
- Cada respaldo exporta **todas** las tablas del esquema a `base-<fecha>.json.gz`, con un manifiesto de conteos.
- Después de escribir, el archivo se **relee y se compara** con el manifiesto. Si no cuadra, se borra y se avisa.
- Se conservan los `RESPALDO_CONSERVAR` más recientes (defecto 14).
- Una tabla declarada en el esquema pero ausente en la base no aborta el respaldo: queda en `faltantes` del manifiesto y se avisa en el log.

## Variables de entorno
| Variable | Defecto | Qué hace |
|---|---|---|
| `RESPALDO_ACTIVO` | activo | `false` lo apaga |
| `RESPALDO_CADA_HORAS` | 24 | frecuencia |
| `RESPALDO_CONSERVAR` | 14 | cuántos respaldos guardar |
| `BACKUP_DIR` | `data/backups` | dónde se guardan |

## ⚠️ Lo que el sistema NO resuelve solo
Un respaldo en el mismo disco que la base **no protege** si se pierde el disco o el contenedor.
Hay que copiar `BACKUP_DIR` fuera del servidor: un volumen aparte de EasyPanel montado en ese
directorio, o una copia periódica a otro almacenamiento. Sin esto, el respaldo sirve para un
error de datos, no para una caída del servidor.

Los respaldos contienen datos de clientes. No los subas a git (ya están en `.gitignore`) ni los
compartas sin cifrar.

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
