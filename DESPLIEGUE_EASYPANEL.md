# 🚀 Guía de Despliegue en EasyPanel

## ✅ Estado Actual

- **Commit:** `2eb0c560` - fix: validación estricta de productos
- **Branch:** `main`
- **Build:** ✅ Exitoso
- **Tests:** ✅ Ejecutados
- **Push:** ✅ Completado

---

## 📋 Pasos para Desplegar en EasyPanel

### 1. Acceder a EasyPanel

```
URL: https://easypanel.io
Usuario: daveymena16@gmail.com
```

### 2. Seleccionar el Proyecto

- Ir a **Projects**
- Buscar: **Agent-Sales-Bot** o **bot-agente-ventas-completo**
- Hacer clic en el proyecto

### 3. Configurar el Despliegue

#### 3.1 Verificar Configuración de Git
```
Repository: https://github.com/daveymena/bot-agente-ventas-completo.git
Branch: main
Auto-deploy: Habilitado (opcional)
```

#### 3.2 Verificar Variables de Entorno
```
DATABASE_URL=postgres://postgres:****@79.143.187.160:5432/tecnovariedades-db?sslmode=disable
NODE_ENV=production
PORT=3000
```

#### 3.3 Verificar Build Command
```
npm run build
```

#### 3.4 Verificar Start Command
```
npm start
```

### 4. Desplegar

#### Opción A: Despliegue Manual
1. Ir a **Deployments**
2. Hacer clic en **Deploy**
3. Seleccionar **main** branch
4. Hacer clic en **Deploy Now**
5. Esperar a que se complete (5-10 minutos)

#### Opción B: Despliegue Automático
1. Ir a **Settings**
2. Habilitar **Auto-deploy on push**
3. El despliegue se ejecutará automáticamente cuando hagas push a main

### 5. Monitorear el Despliegue

```
Logs → Ver logs en tiempo real
Status → Verificar estado del servicio
Health → Verificar salud de la aplicación
```

### 6. Verificar que Funciona

```bash
# Verificar que el servicio está corriendo
curl https://tu-dominio.com/health

# Ver logs
tail -f /var/log/easypanel/agent-sales-bot.log
```

---

## 🔍 Verificaciones Post-Despliegue

### 1. Verificar Build
```
✅ Build completado sin errores
✅ Archivos compilados en dist/
✅ Tamaño del build: ~10.8MB
```

### 2. Verificar Servicio
```
✅ Servicio corriendo en puerto 3000
✅ Base de datos conectada
✅ Variables de entorno cargadas
```

### 3. Verificar Funcionalidad
```
✅ Bot responde a mensajes
✅ Productos se cargan de BD
✅ Precios son correctos
✅ Links de pago funcionan
```

### 4. Monitorear Logs
```
Buscar por:
- [PARSER] - Validaciones de parser
- [DECISION] - Decisiones del motor
- [PAYMENT-VALIDATION] - Validaciones de pago
- ERROR - Errores
```

---

## 📊 Cambios Desplegados

### Archivos Modificados
```
artifacts/api-server/src/lib/agent.ts
artifacts/api-server/src/lib/conversation-engine.ts
artifacts/api-server/src/lib/response-brain.ts
```

### Cambios Principales
```
✅ Parser de partes: Validación estricta
✅ Motor de decisión: Cambio de producto controlado
✅ Búsqueda: Desempate mejorado
✅ Validación de pago: Detección de mismatches
```

---

## 🆘 Troubleshooting

### Si el despliegue falla

1. **Verificar logs**
   ```
   Deployments → Ver logs del despliegue
   ```

2. **Verificar build**
   ```
   npm run build
   ```

3. **Verificar dependencias**
   ```
   npm install
   ```

4. **Rollback**
   ```
   Deployments → Seleccionar versión anterior
   Deployments → Deploy
   ```

### Si el servicio no responde

1. **Reiniciar servicio**
   ```
   Services → Agent-Sales-Bot → Restart
   ```

2. **Verificar puerto**
   ```
   Port: 3000
   ```

3. **Verificar BD**
   ```
   Verificar conexión a PostgreSQL
   ```

---

## 📝 Checklist de Despliegue

- [ ] Commit hecho: `2eb0c560`
- [ ] Push completado a main
- [ ] EasyPanel accesible
- [ ] Proyecto seleccionado
- [ ] Variables de entorno verificadas
- [ ] Build command correcto
- [ ] Start command correcto
- [ ] Despliegue iniciado
- [ ] Logs monitoreados
- [ ] Servicio respondiendo
- [ ] BD conectada
- [ ] Bot funcionando
- [ ] Tests pasados
- [ ] Productos cargándose
- [ ] Precios correctos
- [ ] Links de pago funcionando

---

## 🎯 Resumen

**Cambios:** Validación estricta de productos
**Commit:** 2eb0c560
**Branch:** main
**Status:** ✅ Listo para desplegar

**Próximos pasos:**
1. Acceder a EasyPanel
2. Seleccionar proyecto
3. Hacer clic en Deploy
4. Esperar a que se complete
5. Monitorear logs
6. Verificar que funciona

---

**Fecha:** 23 de Mayo de 2026
**Versión:** 1.0.0
**Estado:** ✅ LISTO PARA DESPLEGAR
