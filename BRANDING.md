# 🎨 BRANDING - VentasPro

Guía completa de identidad visual y uso del logo de VentasPro.

---

## 📋 ARCHIVOS DE LOGO

### Ubicación
Todos los archivos de logo están en: `artifacts/ventas-pro/public/`

### Archivos Disponibles

1. **`logo.svg`** - Logo completo (icono + texto)
   - Uso: Sidebar, header, documentos
   - Tamaño: 200x50px
   - Fondo: Transparente
   - Colores: Texto oscuro + gradiente morado

2. **`logo-white.svg`** - Logo completo en blanco
   - Uso: Fondos oscuros, presentaciones
   - Tamaño: 200x50px
   - Fondo: Transparente
   - Colores: Texto blanco + gradiente claro

3. **`favicon.svg`** - Icono del navegador
   - Uso: Pestaña del navegador, favoritos
   - Tamaño: 180x180px
   - Fondo: Gradiente morado
   - Icono: Burbujas de chat con puntos

---

## 🎨 PALETA DE COLORES

### Colores Principales

```css
/* Primario (Morado) */
--primary: #6366f1;
--primary-dark: #4f46e5;
--primary-light: #818cf8;

/* Secundario (Morado oscuro) */
--secondary: #8b5cf6;
--secondary-dark: #7c3aed;
--secondary-light: #a78bfa;

/* Gradiente Principal */
background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
```

### Colores de Texto

```css
/* Texto oscuro (para fondos claros) */
--text-dark: #1e293b;
--text-gray: #64748b;

/* Texto claro (para fondos oscuros) */
--text-light: #ffffff;
--text-light-secondary: #a5b4fc;
```

---

## 🖼️ USO DEL LOGO

### En el Sidebar (Actual)

```tsx
<img 
  src="/logo.svg" 
  alt="VentasPro Logo" 
  className="h-10 w-auto"
/>
```

### En Fondos Oscuros

```tsx
<img 
  src="/logo-white.svg" 
  alt="VentasPro Logo" 
  className="h-10 w-auto"
/>
```

### Como Favicon

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

---

## 📐 DIMENSIONES Y ESPACIADO

### Logo Completo
- **Ancho mínimo:** 150px
- **Ancho recomendado:** 200px
- **Altura:** Proporcional (mantener aspect ratio)
- **Espacio alrededor:** Mínimo 20px

### Favicon
- **Tamaño:** 180x180px (SVG escalable)
- **Formato:** SVG (recomendado) o PNG
- **Fondo:** Con gradiente incluido

---

## 🎯 CONCEPTO DEL LOGO

### Icono
- **Elemento:** Burbujas de chat superpuestas
- **Significado:** Conversaciones automatizadas con IA
- **Estilo:** Moderno, minimalista, tecnológico

### Puntos Animados
- **Elemento:** Tres puntos en la burbuja principal
- **Significado:** "Escribiendo..." (IA respondiendo)
- **Color:** Morado primario (#6366f1)

### Tipografía
- **Fuente:** Inter (Bold/700)
- **Texto:** "Ventas" (oscuro) + "Pro" (morado)
- **Estilo:** Sans-serif, moderno, profesional

---

## 🚀 VARIACIONES DEL LOGO

### 1. Logo Completo (Recomendado)
```
[Icono] VentasPro
```
Uso: Sidebar, header, documentos oficiales

### 2. Solo Icono
```
[Icono]
```
Uso: Favicon, apps móviles, espacios reducidos

### 3. Solo Texto
```
VentasPro
```
Uso: Títulos, encabezados, cuando el icono ya está presente

---

## 📱 RESPONSIVE

### Desktop (>1024px)
- Logo completo: 200px de ancho
- Icono: 40x40px

### Tablet (768px - 1024px)
- Logo completo: 180px de ancho
- Icono: 36x36px

### Mobile (<768px)
- Solo icono: 32x32px
- Texto opcional según espacio

---

## 🎨 EJEMPLOS DE USO

### Header Principal
```tsx
<header className="bg-white border-b">
  <img src="/logo.svg" alt="VentasPro" className="h-12" />
</header>
```

### Footer Oscuro
```tsx
<footer className="bg-slate-900">
  <img src="/logo-white.svg" alt="VentasPro" className="h-10" />
</footer>
```

### Página de Login
```tsx
<div className="flex flex-col items-center">
  <img src="/logo.svg" alt="VentasPro" className="h-16 mb-8" />
  <h1>Iniciar Sesión</h1>
</div>
```

---

## 🔧 PERSONALIZACIÓN

Si necesitas personalizar el logo para un cliente específico (multi-tenant):

1. **Ir a:** Dashboard → Personalización
2. **Subir logo personalizado**
3. **El sistema usará:** Logo del cliente en lugar del logo por defecto

---

## 📄 ARCHIVOS ADICIONALES

### Manifest.json
```json
{
  "name": "VentasPro - Sistema de Ventas con IA",
  "short_name": "VentasPro",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "/favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

### HTML Meta Tags
```html
<title>VentasPro - Sistema de Ventas con IA</title>
<meta name="theme-color" content="#6366f1" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="manifest" href="/manifest.json" />
```

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [x] Logo SVG completo creado
- [x] Logo blanco para fondos oscuros creado
- [x] Favicon SVG creado
- [x] Manifest.json configurado
- [x] HTML meta tags actualizados
- [x] Logo integrado en sidebar
- [x] Paleta de colores definida
- [x] Documentación completa

---

## 🎯 PRÓXIMOS PASOS

1. **Crear versiones PNG** (opcional)
   - Logo: 512x128px
   - Favicon: 512x512px, 256x256px, 128x128px, 64x64px, 32x32px

2. **Crear Open Graph Image**
   - Tamaño: 1200x630px
   - Uso: Compartir en redes sociales

3. **Crear Email Signature**
   - Logo + información de contacto
   - Formato HTML

---

**Creado:** 5 de Mayo de 2026  
**Versión:** 1.0  
**Autor:** Kiro AI
