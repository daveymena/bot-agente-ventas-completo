# 🚀 Inicio Rápido - Sofía AI Sales

## ⚡ Opción 1: Script Automático (RECOMENDADO)

### Windows (Doble click):
```
start-all.bat
```

### PowerShell:
```powershell
.\start-all.ps1
```

Esto abrirá **2 ventanas**:
1. 🔧 Backend (Puerto 3002)
2. 🎨 Frontend (Puerto 5173)

Luego abre tu navegador en: **http://localhost:5173**

---

## 🛑 Detener Todo

### Windows:
```
stop-all.bat
```

O simplemente cierra las 2 ventanas que se abrieron.

---

## 📝 Opción 2: Manual (2 Terminales)

### Terminal 1 - Backend:
```bash
cd artifacts/api-server
npm run dev
```

### Terminal 2 - Frontend:
```bash
cd artifacts/ventas-pro
npm run dev
```

---

## 🌐 URLs

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **Frontend** | http://localhost:5173 | Aplicación web principal |
| **Backend API** | http://localhost:3002 | API REST |
| **Health Check** | http://localhost:3002/api/health | Estado del servidor |

---

## 🔐 Credenciales de Prueba

**Email:** `daveymena16@gmail.com`  
**Contraseña:** La que configuraste al registrarte

---

## 📱 Flujo de Prueba Completo

1. ✅ **Iniciar servidores** (con `start-all.bat`)
2. ✅ **Abrir navegador** en http://localhost:5173
3. ✅ **Iniciar sesión** en `/auth`
4. ✅ **Ir a Pricing** en `/pricing`
5. ✅ **Seleccionar un plan** (ej: Starter)
6. ✅ **Elegir método de pago** (MercadoPago o PayPal)
7. ✅ **Click en "Actualizar"**
8. ✅ **Serás redirigido** al procesador de pagos

---

## 🐛 Solución de Problemas

### Error: "Puerto ya en uso"
```bash
# Ejecutar stop-all.bat para cerrar procesos anteriores
stop-all.bat
```

### Error: "Cannot find module"
```bash
# Reinstalar dependencias
npm install
```

### Error: "Database connection failed"
Verifica que la base de datos esté accesible en:
- Host: `79.143.187.160`
- Puerto: `5432`
- Database: `tecnovariedades-db`

---

## 📊 Verificar que Todo Funciona

### 1. Backend funcionando:
```bash
curl http://localhost:3002/api/health
```
Debe responder: `{"status":"ok"}`

### 2. Frontend funcionando:
Abre http://localhost:5173 - Debe cargar la aplicación

### 3. Proxy funcionando:
Inicia sesión y ve a pricing - Las cookies deben persistir

---

## 🎯 Próximos Pasos

1. ✅ Configura tu catálogo de productos en `/products`
2. ✅ Conecta WhatsApp en `/whatsapp`
3. ✅ Personaliza tu marca en `/branding`
4. ✅ Configura métodos de pago en `/settings`
5. ✅ ¡Empieza a vender!

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en las ventanas del backend y frontend
2. Verifica que ambos puertos (3002 y 5173) estén libres
3. Asegúrate de tener Node.js instalado (v18+)

---

**¡Listo para vender con IA!** 🚀
