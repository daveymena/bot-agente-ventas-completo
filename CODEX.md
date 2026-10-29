# 🚨 CODEX — LEER ESTO ANTES DE TOCAR NADA

> Para el proyecto **bot-agente-ventas-completo**
> (bot de WhatsApp con IA, ventas y estudio de diseño)

---

## 📍 CONFIGURACIÓN EXACTA

```
GITHUB OWNER:  daveymena
GITHUB REPO:   bot-agente-ventas-completo
RAMA:          para-subir        ← ⚠️ NO es "main" ni "master"

DOMINIO:       https://ventasproia.com
```

### Servicio en EasyPanel (servidor 144.91.112.79)

```
PROYECTO:      tecnoia
SERVICIO:      bot-agenwhatsapp       ← el principal (ventasproia.com)
SERVICIO:      bot-agenwhatsapp-demo  ← la demo
BASE DATOS:    tecnoia/bot-whatsapp   (postgres)
```

### Build y puerto

```
Dockerfile:      SÍ (en la raíz)
Puerto interno:  3002
Variable:        PORT=3002
Base de datos:   DATABASE_URL
```

---

## 🛠️ FLUJO DE TRABAJO OBLIGATORIO

```bash
# 1. Clonar
git clone https://github.com/daveymena/bot-agente-ventas-completo.git
cd bot-agente-ventas-completo

# 2. Verificar la rama — debe decir * para-subir
git branch

# 3. Instalar
pnpm install

# 4. Hacer los cambios

# 5. COMPILAR ANTES DE SUBIR  ← OBLIGATORIO
pnpm run build

# Si falla, NO SUBIR.

# 6. Subir
git add -A
git commit -m "feat: <descripción>"
git push origin para-subir
```

---

## 🔴 REGLAS QUE NO SE PUEDEN ROMPER

### 1. La rama es `para-subir`

```bash
git push origin para-subir    # ✅ el servicio lo toma
git push origin main          # ❌ el servicio NO lo toma
git push origin master        # ❌ el servicio NO lo toma
```

### 2. Compilar antes de subir

```bash
pnpm run build
```

**Si `pnpm run build` falla, es probable que el typecheck also falle.**
El script `build` corre `pnpm run typecheck` primero.

### 3. Nunca subir secretos

Verificar `.gitignore`:
```
.env
.env.local
node_modules/
.cache/
.pnpm-store/
*.log
```

### 4. Preinstall borra el lock file

```json
"preinstall": "rm -f package-lock.json yarn.lock"
```

**Es intencional** — fuerza a usar pnpm. No lo quites.

---

## 📁 ESTRUCTURA DEL PROYECTO

```
agent/         → el agente de IA (conversación, herramientas)
artifacts/     → paquetes compartidos (build del monorepo)
scripts/       → utilidades
docs/          → documentación

Dockerfile     → build de producción
package.json   → monorepo con pnpm
pnpm-workspace.yaml
```

### Documentación existente

```
README.md                              → general
README_INICIO_RAPIDO.md                → arranque
docs/AGENTE_OMNICANAL_COMPLETO.md      → el agente
docs/CANVA_INTEGRATION.md              → integración de diseño
docs/MOTOR_V2_IMPLEMENTACION.md        → el motor
docs/IMPLEMENTACION_V2_BASELINE.md     → baseline
```

---

## ✅ VERIFICACIÓN DESPUÉS DEL DEPLOY

```bash
# El sitio responde
curl -I https://ventasproia.com
# Esperado: HTTP 200
```

Si el servicio no arranca, revisar en EasyPanel:
```
tecnoia → bot-agenwhatsapp → Logs
```

---

## 🔑 VARIABLES DE ENTORNO

Se configuran en EasyPanel, **no en el repo**:

```
PORT                 3002
DATABASE_URL         postgres://...  (interna de EasyPanel)
WHATSAPP_*           credenciales de WhatsApp
OPENAI_API_KEY / ANTHROPIC_API_KEY / etc.
```

**Nunca hardcodear claves.**

---

## ⚠️ CUIDADO CON ESTO

### El servicio es de producción

`ventasproia.com` está **en vivo**. Un build roto deja el bot caído.

**Siempre compilar antes de subir.**

### Hay dos servicios del mismo repo

```
tecnoia/bot-agenwhatsapp       ← producción (ventasproia.com)
tecnoia/bot-agenwhatsapp-demo  ← demo
```

Si cambiás algo, **verificá en los dos** cuál querés actualizar.

### La base de datos no se toca desde el código

```
tecnoia/bot-whatsapp  (postgres)
```

Las migraciones se corren aparte. No borrar datos de producción.

---

## 🎯 RESUMEN PARA NO EQUIVOCARSE

```
REPO:      daveymena/bot-agente-ventas-completo
RAMA:      para-subir
COMPILAR:  pnpm run build   (antes de cada push)
DEPLOY:    EasyPanel → tecnoia → bot-agenwhatsapp → Deploy
VERIFICAR: https://ventasproia.com  → HTTP 200
```
