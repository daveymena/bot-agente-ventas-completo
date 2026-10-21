# Estado del sistema — 21-oct-2026

Documento de cierre de la sesión. Todo lo que aquí dice "medido" se verificó con un comando o un test; lo que dice "no verificado" no se probó.

## Veredicto

**No es un sistema completo listo para clientes reales.** Está en una etapa de piloto controlado.

- Producción responde (HTTP 200, base OK, WhatsApp conectado), pero corre el build de las 02:30 UTC y **no incluye nada de lo hecho hoy**.
- El build del api-server no se pudo verificar en Windows (sandbox). El build real corre en Docker (Linux) y no se ha probado desde esta sesión.
- Quedan **214 errores de TypeScript** (medido después de la última corrección de Atlas) y **27 tests fallando** en la última corrida completa.
- Atlas tiene buena cobertura de tests (148/150), pero depende de un proveedor de IA con cupo limitado (ver sección Atlas).

## Qué está en producción (`para-subir` = `591d44c`)

- Claves visibles retiradas del código actual de 29 ramas. **Las claves que estuvieron públicas hay que rotarlas**: siguen válidas hasta que se roten.
- Protección de la ruta de agent-lab (solo superadmin).
- Puertos de Postgres y Ollama retirados del `easypanel.yml` del repo (en EasyPanel hay que cerrarlos a mano).
- Correcciones de WhatsApp: proxy con la API actual de los agentes y tipos del pipeline.
- Backups de pruebas (392 archivos) retirados de git.

## Qué está solo en la rama `fase1/base-compila` (no desplegado)

| Commit | Qué hace |
|---|---|
| `0df4524` | Tipos de la base con Postgres; bug de tuplas en la memoria del cerebro (un `TypeError` en cada mensaje) |
| `1006901` | Fechas como `Date` en analytics; el especulador ahora usa los `tags` |
| `8bacca9` | Decisión explícita: `useUnknownInCatchVariables` desactivado |
| `8814578` | Autonomía: auto-aplicar solo con evidencia (≥10 simulaciones, mejora media mínima, cero empeoramientos) |
| `d06d458` | Razonador: los fallos del LLM quedan como `error_razonador` y escalan; campos fantasma corregidos |
| `de742e9` | 132 parámetros con `any` explícito (**deuda**: hay que tiparlos) |
| `591d44c` | Backups de pruebas fuera de git |
| `6c1cd9b` | Respaldo completo de la base + monitoreo externo (el workflow está en `ops/`, no activo) |
| `66ff08f` | Copia de respaldos a un destino externo (`RESPALDO_DESTINO_URL`) |
| `9ee0611` | Respaldos cifrados con AES-256-GCM (`RESPALDO_CLAVE` obligatoria) |
| `be8f6a2` | Vendedor: una sola pregunta y un beneficio de la ficha al primer interés |
| `ec7a03e`, `108c890` | Atlas: bugs reales corregidos y tipos de Atlas en 0 |

**Nota:** `para-subir` ya tiene `591d44c`, y `fase1/base-compila` tiene `be8f6a2`. Esos dos commits **no** están en la rama de producción.

## Respaldos de la base

- **Estado real:** no hay ningún respaldo de producción. El sistema está en la rama de revisión, no desplegado.
- **Carpeta local:** `artifacts/api-server/data/backups/` tiene 424 archivos `reset-1-*.json` generados por las pruebas. No son respaldos de producción.
- **Riesgo para cuando se despliegue:** `BACKUP_DIR` por defecto está dentro del contenedor. Sin volumen montado, los respaldos se pierden al redesplegar.
- **Pendiente:** montar volumen, definir `RESPALDO_CLAVE`, definir `RESPALDO_DESTINO_URL` (requiere firma S3 si es B2 o R2) y probar una restauración real. Hasta probarla, el respaldo es una suposición.

## Monitoreo

- `ops/monitor-produccion.yml` revisa `/api/health` cada 10 minutos desde GitHub y abre un issue si falla HTTP, la base o WhatsApp.
- **No está activo:** GitHub rechazó el workflow sin el scope `workflow`. Hay que moverlo a `.github/workflows/` con un token que lo tenga.

## Atlas: revisión detallada

Medido:

- `app-operator.ts`: **12.114 líneas**. `operator-opencode.ts`: 2.963 líneas.
- Errores de TypeScript en el código de Atlas: **18 al empezar, 0 ahora**.
- Tests de Atlas (17 archivos, 150 casos): **148 pasan, 2 fallan** (sin cambio en esto).

Bugs reales de Atlas corregidos en esta sesión (commits `ec7a03e` y `108c890`):
- El enlace de WhatsApp de los anuncios salía sin número (leía un campo que no existe).
- La caché del negocio no se invalidaba al guardar el píxel de Facebook.
- Guardar la sesión de Copilot lanzaba `RangeError` (campo `expires_at` inexistente).
- Las instrucciones del admin para una landing se perdían en silencio.
- Una página de servicio se generaba con texto de "pago contra entrega".
- El historial de conversación podía mandar roles inválidos al proveedor.
  - `prompt-de-atlas`: el prompt no cabe en el límite de Groq (el proveedor gratuito).
  - `catalogo-de-capacidades`: el catálogo que Atlas consulta supera los 1.700 caracteres.

Lo que eso significa:

1. **Atlas puede hacer muchas cosas, pero no es confiable como operador total hoy.** Su prompt es demasiado grande para el proveedor gratuito que usa, y si ese proveedor se queda sin cupo, Atlas se corta. Ya pasó antes (memoria del proyecto: "se cae la conexión = sin cupo de IA").
2. **Sin cupo pagado no hay Atlas completo.** La decisión de pagar un tier de Groq, o de montar una segunda cuenta, sigue abierta desde agosto.
3. **Atlas toca dinero y cuentas reales** (Dropi, Meta, pedidos). Un error de Atlas tiene consecuencias comerciales. Hoy esas acciones tienen confirmación del dueño, pero no hay una auditoría completa de qué puede hacer sin confirmación.
4. **Atlas no está verificado de punta a punta en producción desde esta sesión.**

## Qué falta para "completo", en orden

1. Desplegar lo de `fase1/base-compila` y verificar el build en Docker.
2. Llevar los 243 errores de TypeScript a cero, empezando por Atlas (18) y WhatsApp.
3. Hacer que los 27 tests fallando pasen, o marcar explícitamente los que son de infraestructura.
4. Reducir el prompt y el catálogo de Atlas hasta que quepan en el proveedor que se use, con una prueba que lo garantice.
5. Decidir el cupo de IA (pagado o segunda cuenta) antes de prometer Atlas a clientes.
6. Rotar las claves que estuvieron públicas.
7. Volumen y clave para los respaldos, y una restauración probada.
8. Activar el monitoreo externo.
9. Piloto con un negocio real, con seguimiento diario durante una semana.

## Cómo verificar lo que dice este documento

```
cd artifacts/api-server
npx vitest run            # estado de tests
npx tsc -p tsconfig.json --noEmit   # estado de tipos (243 errores esperados)
curl https://ventasproia.com/api/health
```
