# 🚀 Guía de Despliegue en Easypanel

## ✅ Estado Actual

Los cambios ya están en GitHub:
- ✅ Dockerfile corregido para el frontend
- ✅ Scripts de compilación automática
- ✅ Scripts de verificación
- ✅ Documentación completa

**Repositorio**: https://github.com/daveymena/bot-agente-ventas-completo

---

## 📋 Pasos para Desplegar en Easypanel

### 1️⃣ Configurar la Aplicación en Easypanel

1. **Accede a tu panel de Easypanel**
   - Ve a https://easypanel.io (o tu instancia)
   - Inicia sesión

2. **Crear o Editar tu Aplicación**
   - Si es nueva: Click en "Create App"
   - Si ya existe: Selecciona tu app existente

3. **Configurar el Source (Origen)**
   - **Source Type**: Git Repository
   - **Repository URL**: `https://github.com/daveymena/bot-agente-ventas-completo`
   - **Branch**: `main`
   - **Auto Deploy**: ✅ Activado (opcional, para despliegues automáticos)

### 2️⃣ Configurar el Build

En la sección de Build Configuration:

```yaml
Build Method: Dockerfile
Build Context: /artifacts
Dockerfile Path: ./Dockerfile
```

**Importante**: El contexto debe ser `/artifacts` porque ahí está el Dockerfile.

### 3️⃣ Configurar Variables de Entorno

En la sección de Environment Variables, agrega:

#### Variables Requeridas

```env
NODE_ENV=production
PORT=3002
HOST=0.0.0.0
```

#### Variables de tu Aplicación

Agrega las variables específicas de tu aplicación desde tu archivo `.env`:

```env
# Base de datos
DATABASE_URL=postgresql://usuario:password@host:5432/database

# WhatsApp (si usas)
WHATSAPP_API_KEY=tu-api-key
WHATSAPP_PHONE_NUMBER=tu-numero

# OpenAI (si usas)
OPENAI_API_KEY=tu-openai-key

# Otras variables según tu .env
# ...
```

**⚠️ Importante**: NO subas el archivo `.env` a Git. Configura las variables directamente en Easypanel.

### 4️⃣ Configurar el Puerto

En la sección de Networking:

```
Port: 3002
Protocol: HTTP
```

### 5️⃣ Configurar Dominio (Opcional)

Si quieres un dominio personalizado:

1. Ve a la sección "Domains"
2. Agrega tu dominio: `tu-app.tudominio.com`
3. Configura los DNS según las instrucciones de Easypanel

### 6️⃣ Desplegar

1. **Guardar la configuración**
2. **Click en "Deploy"** o "Rebuild"
3. **Esperar** (el primer build puede tardar 5-10 minutos)

---

## 🔍 Verificación del Despliegue

### 1. Verificar Logs

En Easypanel, ve a la pestaña "Logs" y busca:

```
[Frontend] ✅ Frontend encontrado en: /app/artifacts/ventas-pro/dist/public
[Frontend] Archivos: index.html, assets, ...
Server listening on port 3002
```

### 2. Probar el Health Check

```bash
curl https://tu-app.easypanel.host/api/health
```

Debería responder:
```json
{"status":"ok"}
```

### 3. Probar el Frontend

Abre en tu navegador:
```
https://tu-app.easypanel.host/
```

Deberías ver la página de login de VentasPro.

---

## 🐛 Troubleshooting

### Problema: Build falla

**Solución 1**: Verifica los logs de build en Easypanel
- Busca errores de compilación
- Verifica que todas las dependencias se instalen correctamente

**Solución 2**: Verifica que el Build Context sea correcto
- Debe ser `/artifacts` (no la raíz del proyecto)

### Problema: Frontend en blanco

**Solución 1**: Verifica los logs del contenedor
```
[Frontend] ✅ Frontend encontrado en: /app/artifacts/ventas-pro/dist/public
```

Si ves `❌ No se pudo encontrar el directorio del frontend compilado`:
- El build del frontend falló
- Verifica los logs de build

**Solución 2**: Verifica la consola del navegador
- Abre DevTools (F12)
- Ve a Console
- Busca errores de carga de recursos

### Problema: Error 502 Bad Gateway

Esto significa que el contenedor no está respondiendo.

**Solución**:
1. Verifica que el puerto sea `3002`
2. Verifica que `HOST=0.0.0.0` esté configurado
3. Revisa los logs del contenedor para errores

### Problema: Variables de entorno no funcionan

**Solución**:
1. Verifica que las variables estén configuradas en Easypanel
2. Haz un "Rebuild" después de cambiar variables
3. Verifica los logs para ver si las variables se están leyendo

---

## 🔄 Actualizar el Despliegue

### Opción A: Auto Deploy (Recomendado)

Si activaste "Auto Deploy":
1. Haz cambios en tu código
2. Commit y push a GitHub
3. Easypanel detectará los cambios y desplegará automáticamente

### Opción B: Manual

1. Haz cambios en tu código
2. Commit y push a GitHub
3. Ve a Easypanel
4. Click en "Rebuild"

---

## 📊 Monitoreo

### Métricas Disponibles

Easypanel te muestra:
- **CPU Usage**: Uso de CPU del contenedor
- **Memory Usage**: Uso de memoria
- **Network**: Tráfico de red
- **Logs**: Logs en tiempo real

### Health Checks

Tu aplicación tiene endpoints de health:

```bash
# Health básico
curl https://tu-app.easypanel.host/api/health

# Health del sistema completo
curl https://tu-app.easypanel.host/api/health/system
```

---

## 🎯 Checklist de Despliegue

Antes de desplegar, verifica:

- [ ] El código está en GitHub (branch `main`)
- [ ] Las variables de entorno están configuradas en Easypanel
- [ ] El Build Context es `/artifacts`
- [ ] El Dockerfile Path es `./Dockerfile`
- [ ] El puerto es `3002`
- [ ] `NODE_ENV=production` está configurado

Después de desplegar, verifica:

- [ ] Los logs muestran "Server listening on port 3002"
- [ ] Los logs muestran "Frontend encontrado"
- [ ] El health check responde correctamente
- [ ] El frontend carga en el navegador
- [ ] No hay errores en la consola del navegador

---

## 📚 Recursos Adicionales

- **Comandos rápidos**: `COMANDOS_RAPIDOS.md`
- **Solución frontend**: `SOLUCION_FRONTEND_BLANCO.md`
- **Resumen ejecutivo**: `RESUMEN_SOLUCION_FRONTEND.md`

---

## 💡 Tips

1. **Usa Auto Deploy** para despliegues automáticos al hacer push
2. **Revisa los logs** regularmente para detectar problemas
3. **Configura alertas** en Easypanel para errores críticos
4. **Haz backups** de tu base de datos regularmente
5. **Usa variables de entorno** para configuración sensible

---

## 🆘 Soporte

Si tienes problemas:

1. **Revisa los logs** en Easypanel
2. **Consulta la documentación** en este repositorio
3. **Verifica la configuración** de variables de entorno
4. **Prueba localmente** con Docker antes de desplegar

---

**¡Listo para desplegar! 🚀**

Sigue los pasos anteriores y tu aplicación estará en producción en minutos.
