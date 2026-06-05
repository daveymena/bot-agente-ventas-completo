# 🚀 INSTRUCCIONES DE REDEPLOY EN EASYPANEL

**Fecha**: 23 de Mayo de 2026  
**Razón**: Actualizar código con fixes de búsqueda de productos y manejo de errores 400

---

## 📋 Cambios Desplegados

### Commits Subidos a Git
```
✅ c333e1fe - fix: mejorar tiebreaker en búsqueda de productos
✅ 1fbb9976 - docs: agregar setup guide y env example sin secretos
✅ a219d253 - fix: estandarizar errores 400 y agregar rate limiting
```

### Cambios Principales
1. **Búsqueda de Productos**: Mejorado tiebreaker para evitar confusiones
2. **Manejo de Errores**: Estandarización de errores 400
3. **Seguridad**: Rate limiting en endpoints sensibles
4. **Configuración**: Setup guide para EasyPanel

---

## 🔧 Pasos de Redeploy

### Opción 1: Redeploy desde EasyPanel Dashboard (RECOMENDADO)

1. **Abre EasyPanel**
   - URL: https://easypanel.io
   - Inicia sesión con tu cuenta

2. **Selecciona tu Aplicación**
   - Busca "Agent-Sales-Bot" o "tecnovariedades"
   - Haz clic para abrir

3. **Redeploy**
   - Busca el botón "Redeploy" o "Rebuild"
   - Haz clic
   - Espera a que termine (2-5 minutos)

4. **Verifica el Estado**
   - Debe mostrar "Running" o "Active"
   - Revisa los logs para errores

### Opción 2: Redeploy desde Terminal

```bash
# Si tienes acceso SSH a EasyPanel
ssh user@easypanel-host

# Navega al directorio de la app
cd /path/to/agent-sales-bot

# Pull de los cambios
git pull origin main

# Rebuild
docker-compose build
docker-compose up -d

# Verifica
docker-compose logs -f
```

### Opción 3: Redeploy Automático (si está configurado)

Si EasyPanel está configurado con **auto-deploy en push a main**:
- ✅ Ya debería estar desplegando automáticamente
- ⏳ Espera 2-5 minutos
- 🔍 Verifica en los logs de EasyPanel

---

## ✅ Verificación Post-Redeploy

### 1. Verificar que la App está Corriendo
```bash
curl https://your-easypanel-domain/health
# Debe retornar: {"status":"ok"}
```

### 2. Probar en WhatsApp
```
Usuario: "Me interesa el megapack de piano"
Bot debe responder: [Mostrar tarjeta del Mega Pack de Piano]
```

### 3. Revisar Logs
En EasyPanel Dashboard:
- Ve a "Logs"
- Busca errores o warnings
- Verifica que no hay "Cannot find product"

---

## 🐛 Troubleshooting

### Problema: "No tenemos un megapack de piano disponible"

**Causa**: EasyPanel aún está usando código viejo

**Solución**:
1. Verifica que el commit está en main: `git log --oneline -5`
2. Haz redeploy nuevamente
3. Espera 5 minutos
4. Prueba de nuevo

### Problema: Error 500 después de redeploy

**Causa**: Posible error en el código o variables de entorno

**Solución**:
1. Revisa los logs en EasyPanel
2. Verifica que todas las variables de entorno están configuradas
3. Revisa `.env.example` para ver qué variables son necesarias
4. Contacta a soporte si persiste

### Problema: Cambios no se ven después de redeploy

**Causa**: Cache del navegador o del bot

**Solución**:
1. Limpia el cache del navegador (Ctrl+Shift+Del)
2. Reinicia la sesión de WhatsApp
3. Prueba con un nuevo usuario
4. Espera 10 minutos (puede haber cache en el servidor)

---

## 📊 Monitoreo Post-Redeploy

### Métricas a Verificar

1. **Búsqueda de Productos**
   - ✅ "megapack de piano" → Mega Pack de Piano
   - ✅ "curso de inglés" → Curso de Inglés
   - ✅ "excel" → Excel Avanzado

2. **Manejo de Errores**
   - ✅ Errores 400 con mensajes claros
   - ✅ Rate limiting funcionando
   - ✅ Sin errores 500 genéricos

3. **Performance**
   - ✅ Respuestas en < 5 segundos
   - ✅ Sin timeouts
   - ✅ Conexión a BD estable

---

## 📝 Checklist de Redeploy

- [ ] Verificar que los commits están en main
- [ ] Hacer redeploy en EasyPanel
- [ ] Esperar a que termine (2-5 minutos)
- [ ] Verificar que la app está "Running"
- [ ] Probar en WhatsApp
- [ ] Verificar búsqueda de productos
- [ ] Revisar logs para errores
- [ ] Confirmar que todo funciona

---

## 🔗 Enlaces Útiles

- **EasyPanel Dashboard**: https://easypanel.io
- **GitHub Repo**: https://github.com/daveymena/bot-agente-ventas-completo
- **Commits Recientes**: https://github.com/daveymena/bot-agente-ventas-completo/commits/main

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en EasyPanel
2. Verifica que las variables de entorno están correctas
3. Contacta a soporte de EasyPanel
4. Abre un issue en GitHub

---

**Última actualización**: 23 de Mayo de 2026  
**Versión**: 1.0

