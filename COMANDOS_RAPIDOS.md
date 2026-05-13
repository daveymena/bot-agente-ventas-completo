# ⚡ Comandos Rápidos - Despliegue a Easypanel

## 🚀 Despliegue Completo (Copiar y Pegar)

### Windows (PowerShell)

```powershell
# Compilar todo el proyecto
.\build-all.ps1

# Ir a artifacts
cd artifacts

# Construir imagen Docker
docker build -t ventas-pro:latest .

# Probar localmente (opcional)
docker run -p 3002:3002 --env NODE_ENV=production ventas-pro:latest
# Abrir http://localhost:3002 en el navegador
# Presionar Ctrl+C para detener

# Etiquetar para registry (reemplaza con tu registry)
docker tag ventas-pro:latest tu-registry/ventas-pro:latest

# Subir a registry
docker push tu-registry/ventas-pro:latest

# Volver a la raíz
cd ..
```

### Linux/Mac (Bash)

```bash
# Compilar todo el proyecto
chmod +x build-all.sh
./build-all.sh

# Ir a artifacts
cd artifacts

# Construir imagen Docker
docker build -t ventas-pro:latest .

# Probar localmente (opcional)
docker run -p 3002:3002 --env NODE_ENV=production ventas-pro:latest
# Abrir http://localhost:3002 en el navegador
# Presionar Ctrl+C para detener

# Etiquetar para registry (reemplaza con tu registry)
docker tag ventas-pro:latest tu-registry/ventas-pro:latest

# Subir a registry
docker push tu-registry/ventas-pro:latest

# Volver a la raíz
cd ..
```

---

## 🔧 Comandos Individuales

### Compilar Solo el Frontend

```powershell
# Windows
$env:NODE_ENV = "production"
pnpm --filter @workspace/ventas-pro run build
```

```bash
# Linux/Mac
export NODE_ENV=production
pnpm --filter @workspace/ventas-pro run build
```

### Compilar Solo el Backend

```powershell
pnpm --filter @workspace/api-server run build
```

### Verificar Build

```powershell
# Windows
cd artifacts
.\verify-build.ps1
cd ..
```

```bash
# Linux/Mac
cd artifacts
chmod +x verify-build.sh
./verify-build.sh
cd ..
```

### Limpiar y Recompilar Todo

```powershell
# Windows
# Limpiar node_modules y dist
Remove-Item -Recurse -Force node_modules, artifacts\api-server\dist, artifacts\ventas-pro\dist

# Reinstalar y compilar
pnpm install
.\build-all.ps1
```

```bash
# Linux/Mac
# Limpiar node_modules y dist
rm -rf node_modules artifacts/api-server/dist artifacts/ventas-pro/dist

# Reinstalar y compilar
pnpm install
./build-all.sh
```

---

## 🐳 Comandos Docker

### Construir Imagen

```bash
cd artifacts
docker build -t ventas-pro:latest .
```

### Construir Sin Cache (si hay problemas)

```bash
cd artifacts
docker build --no-cache -t ventas-pro:latest .
```

### Probar Localmente

```bash
# Ejecutar contenedor
docker run -p 3002:3002 --env NODE_ENV=production ventas-pro:latest

# En otra terminal, probar
curl http://localhost:3002/api/health
curl http://localhost:3002/

# Abrir en navegador
# http://localhost:3002
```

### Verificar Archivos en el Contenedor

```bash
# Ver estructura del frontend
docker run --rm -it ventas-pro:latest ls -la /app/artifacts/ventas-pro/dist/public

# Ver archivos en assets
docker run --rm -it ventas-pro:latest ls -la /app/artifacts/ventas-pro/dist/public/assets

# Ver backend
docker run --rm -it ventas-pro:latest ls -la /app/dist
```

### Entrar al Contenedor (Debug)

```bash
docker run --rm -it ventas-pro:latest sh
```

Dentro del contenedor:
```sh
# Ver estructura
ls -la /app
ls -la /app/artifacts/ventas-pro/dist/public

# Ver contenido de index.html
cat /app/artifacts/ventas-pro/dist/public/index.html

# Salir
exit
```

---

## 📤 Subir a Registry

### Docker Hub

```bash
# Login
docker login

# Tag
docker tag ventas-pro:latest tu-usuario/ventas-pro:latest

# Push
docker push tu-usuario/ventas-pro:latest
```

### GitHub Container Registry

```bash
# Login
echo $GITHUB_TOKEN | docker login ghcr.io -u tu-usuario --password-stdin

# Tag
docker tag ventas-pro:latest ghcr.io/tu-usuario/ventas-pro:latest

# Push
docker push ghcr.io/tu-usuario/ventas-pro:latest
```

### Registry Privado

```bash
# Login
docker login tu-registry.com

# Tag
docker tag ventas-pro:latest tu-registry.com/ventas-pro:latest

# Push
docker push tu-registry.com/ventas-pro:latest
```

---

## 🔍 Verificación y Debug

### Ver Logs del Contenedor

```bash
# Ver logs en tiempo real
docker logs -f <container-id>

# Ver últimas 100 líneas
docker logs --tail 100 <container-id>

# Buscar errores
docker logs <container-id> | grep -i error
docker logs <container-id> | grep -i frontend
```

### Probar Endpoints

```bash
# Health check
curl http://localhost:3002/api/health

# Frontend (debe devolver HTML)
curl http://localhost:3002/

# Con headers
curl -I http://localhost:3002/
```

### Verificar Puerto

```bash
# Ver qué está escuchando en el puerto 3002
netstat -an | grep 3002

# O en Windows PowerShell
Get-NetTCPConnection -LocalPort 3002
```

---

## 🧹 Limpieza

### Limpiar Imágenes Docker

```bash
# Ver imágenes
docker images

# Eliminar imagen específica
docker rmi ventas-pro:latest

# Eliminar imágenes sin usar
docker image prune -a

# Limpiar todo (cuidado!)
docker system prune -a
```

### Limpiar Builds

```powershell
# Windows
Remove-Item -Recurse -Force artifacts\api-server\dist, artifacts\ventas-pro\dist
```

```bash
# Linux/Mac
rm -rf artifacts/api-server/dist artifacts/ventas-pro/dist
```

---

## 📋 Checklist Rápido

Antes de desplegar, verifica:

```bash
# ✅ Frontend compilado
ls artifacts/ventas-pro/dist/public/index.html

# ✅ Backend compilado
ls artifacts/api-server/dist/index.mjs

# ✅ Verificación completa
cd artifacts && ./verify-build.ps1 && cd ..  # Windows
cd artifacts && ./verify-build.sh && cd ..   # Linux/Mac
```

---

## 🎯 Flujo Completo en 3 Pasos

```bash
# 1. Compilar
./build-all.ps1  # Windows
./build-all.sh   # Linux/Mac

# 2. Construir Docker
cd artifacts && docker build -t ventas-pro:latest . && cd ..

# 3. Desplegar
docker tag ventas-pro:latest tu-registry/ventas-pro:latest
docker push tu-registry/ventas-pro:latest
```

---

## 💡 Tips

- **Siempre verifica el build** antes de construir la imagen Docker
- **Prueba localmente** antes de subir al registry
- **Usa `--no-cache`** si hay problemas con el cache de Docker
- **Revisa los logs** si algo no funciona
- **Guarda los comandos** que uses frecuentemente

---

**¿Problemas?** Consulta `RESUMEN_SOLUCION_FRONTEND.md` o `SOLUCION_FRONTEND_BLANCO.md`
