# 📤 Cómo Subir el Proyecto a GitHub

## 🎯 Paso 1: Crear el Repositorio en GitHub

1. **Ve a GitHub**: https://github.com
2. **Inicia sesión** con tu cuenta
3. **Click en el botón "+"** (arriba a la derecha)
4. **Selecciona "New repository"**

5. **Configurar el repositorio**:
   - **Repository name**: `OpenCode-ia-puetne`
   - **Description**: `Wrapper de Python para usar modelos gratuitos de OpenCode (DeepSeek V4, Qwen, etc.)`
   - **Public** ✅ (para que otros puedan usarlo)
   - **NO marques** "Add a README file" (ya lo tenemos)
   - **NO marques** "Add .gitignore" (ya lo tenemos)
   - **License**: MIT (opcional)

6. **Click en "Create repository"**

## 🚀 Paso 2: Subir el Código

Una vez creado el repositorio, GitHub te mostrará instrucciones. Usa estas:

### Si ya tienes Git configurado:

```bash
cd C:\Users\ADMIN\Desktop\ia

# El repositorio ya está inicializado, solo falta hacer push
git push -u origin main
```

### Si Git pide autenticación:

**Opción A: HTTPS (Recomendado)**

GitHub ya no acepta contraseñas. Necesitas un **Personal Access Token**:

1. Ve a: https://github.com/settings/tokens
2. Click en "Generate new token" → "Generate new token (classic)"
3. Dale un nombre: "OpenCode Upload"
4. Marca el scope: `repo` (acceso completo a repositorios)
5. Click en "Generate token"
6. **COPIA EL TOKEN** (solo se muestra una vez)

Luego:
```bash
git push -u origin main

# Cuando pida usuario: tu-usuario-github
# Cuando pida password: PEGA-EL-TOKEN (no tu contraseña)
```

**Opción B: SSH (Más seguro)**

Si prefieres SSH:

```bash
# Cambiar remote a SSH
git remote set-url origin git@github.com:gavimosquera3-netizen/OpenCode-ia-puetne.git

# Configurar SSH key (si no lo has hecho)
# Sigue: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

# Push
git push -u origin main
```

## ✅ Paso 3: Verificar

1. Ve a: https://github.com/gavimosquera3-netizen/OpenCode-ia-puetne
2. Deberías ver todos los archivos
3. El README.md se mostrará automáticamente

## 📝 Paso 4: Configurar el Repositorio (Opcional)

### Agregar Topics

En tu repositorio en GitHub:
1. Click en el ⚙️ (Settings) o en "About"
2. Agregar topics:
   - `python`
   - `opencode`
   - `ai`
   - `deepseek`
   - `free-ai`
   - `wrapper`
   - `chatbot`

### Agregar Descripción

En "About" (lado derecho):
- **Description**: `🤖 Wrapper de Python para usar modelos gratuitos de OpenCode (DeepSeek V4, Qwen 3.6+, Minimax, etc.) - 100% funcional`
- **Website**: Dejar vacío o poner `https://opencode.ai`

### Habilitar Issues

En Settings → Features:
- ✅ Issues (para que la gente pueda reportar problemas)

## 🎨 Paso 5: Personalizar README (Opcional)

Puedes agregar badges al README:

```markdown
# 🚀 OpenCode Free Models Wrapper

![Python](https://img.shields.io/badge/python-3.7+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

[resto del README...]
```

## 📊 Estructura Final del Repositorio

```
OpenCode-ia-puetne/
├── .gitignore                    ← Archivos a ignorar
├── README.md                     ← Documentación principal ⭐
├── ACCESO_RAPIDO.md             ← Guía de acceso rápido ⭐
├── INSTALACION.md               ← Guía de instalación
├── INTEGRACION.md               ← Guía de integración
├── RESUMEN_FINAL.md             ← Resumen del proyecto
├── SITUACION_REAL.md            ← Análisis técnico
├── opencode_cli_wrapper.py      ← Biblioteca principal ⭐
└── chat_interactivo.py          ← Chat interactivo ⭐
```

## 🔄 Actualizaciones Futuras

Cuando hagas cambios:

```bash
# Ver cambios
git status

# Agregar cambios
git add .

# Commit
git commit -m "Descripción de los cambios"

# Push
git push
```

## 📢 Compartir el Proyecto

Una vez subido, comparte:

**URL del repositorio:**
```
https://github.com/gavimosquera3-netizen/OpenCode-ia-puetne
```

**Instrucciones para otros usuarios:**
```bash
# Clonar
git clone https://github.com/gavimosquera3-netizen/OpenCode-ia-puetne.git
cd OpenCode-ia-puetne

# Usar
python chat_interactivo.py
```

## 🎯 Checklist Final

Antes de compartir, verifica:

- [ ] Repositorio creado en GitHub
- [ ] Código subido (`git push`)
- [ ] README.md se ve bien en GitHub
- [ ] Topics agregados
- [ ] Descripción agregada
- [ ] Issues habilitados
- [ ] Probado: `git clone` funciona
- [ ] Probado: `python chat_interactivo.py` funciona

## 🆘 Problemas Comunes

### Error: "remote: Repository not found"

**Causa**: El repositorio no existe en GitHub

**Solución**: Crear el repositorio primero en https://github.com/new

### Error: "Permission denied"

**Causa**: No tienes permisos o autenticación incorrecta

**Solución**: 
- Verifica que estás logueado en GitHub
- Usa Personal Access Token en vez de contraseña
- O configura SSH keys

### Error: "failed to push some refs"

**Causa**: El repositorio remoto tiene cambios que no tienes localmente

**Solución**:
```bash
git pull origin main --rebase
git push origin main
```

## 📞 Ayuda

Si tienes problemas:

1. **GitHub Docs**: https://docs.github.com
2. **Git Docs**: https://git-scm.com/doc
3. **Abre un issue** en el repositorio una vez creado

---

**¡Listo!** Una vez subido, tu proyecto estará disponible para todo el mundo en:
https://github.com/gavimosquera3-netizen/OpenCode-ia-puetne
