# Control seguro de EasyPanel

Un lugar **seguro** para dar acceso a la API de EasyPanel sin exponer la key en
el chat ni en git.

## Regla de oro

- ❌ **Nunca** pegues la API key en el chat, en un issue, ni en un commit.
- ❌ **Nunca** la pongas en un archivo versionado (`.env.easypanel`, etc.).
- ✅ La key vive **solo** como variable de entorno o en un archivo local no
  versionado. El script la lee por nombre y **jamás la imprime**.

## Cómo proporcionar la key (elige UNA)

### Opción A — Variable de entorno del entorno (recomendada)
En la configuración del entorno de Claude Code (o en tu shell), define:

```
EASYPANEL_URL=https://panel.tudominio.com
EASYPANEL_API_KEY=****  (tu key)
```

Así el valor se inyecta al arrancar la sesión, no aparece en el chat y se puede
usar por nombre (`$EASYPANEL_API_KEY`).

### Opción B — Archivo local no versionado
```bash
cd scripts/easypanel
cp .easypanel.env.example .easypanel.env
# edita .easypanel.env en tu editor y pega ahí la key (este archivo está gitignored)
```

## Uso

```bash
cd scripts/easypanel
chmod +x easypanel.sh

./easypanel.sh check              # valida credenciales (sin exponer la key)
./easypanel.sh services           # lista proyectos/servicios
./easypanel.sh deploy tienda      # dispara redeploy del servicio "tienda"
./easypanel.sh raw GET /api/...   # llamada cruda a cualquier endpoint
```

> Los endpoints (`/api/trpc/...`) pueden variar según tu versión de EasyPanel.
> Ajusta `easypanel.sh` a tu API si `check` falla. La API de EasyPanel también
> se puede sustituir por **Deploy Webhooks** por servicio (una URL con token) si
> prefieres no usar una API key global.

## Requisitos de red

Este entorno tiene salida HTTPS por un proxy con política de egress. Si `check`
da timeout o 403, es probable que la política no permita tu host de EasyPanel:
habilítalo en la configuración de red del entorno.

## ⚠️ Importante: fuga de secretos existente

Los archivos `.env.easypanel`, `.env.easypanel.optimizado` y
`artifacts/api-server/.env.easypanel` fueron **commiteados con secretos reales**
(tokens de pago, GitHub, DB…). Deben:

1. **Rotarse** (generar nuevos y revocar los viejos) — ya están comprometidos.
2. **Dejar de versionarse**: `git rm --cached <archivo>` y mover sus valores a
   variables de entorno de EasyPanel.
3. Opcional pero recomendado: limpiar el historial (git filter-repo / BFG),
   porque siguen en commits anteriores.
