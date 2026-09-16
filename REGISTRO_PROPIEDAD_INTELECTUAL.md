# Registro de Propiedad Intelectual — VentasPro / Sofía AI Sales

Guía paso a paso para proteger legalmente la app, el código y la marca.
Esto es **complementario** al software: los avisos de copyright (`LICENSE`)
no sustituyen el registro, pero el registro te da presunción legal de autoría
y es lo que necesitás para reclamar ante una copia.

---

## 0. LO PRIMERO (más importante que cualquier registro)

El repositorio de GitHub **`daveymena/bot-agente-ventas-completo` está PÚBLICO**
hoy mismo. Cualquier persona puede ver y clonar TODO el código, los prompts de
los agentes, los flujos de venta y las plantillas de landing. Ningún registro
protege contra eso si el código ya se puede descargar.

**Acción inmediata: pasar el repositorio a PRIVADO.**

```
gh repo edit daveymena/bot-agente-ventas-completo --visibility private
```

Requisito: la cuenta de GitHub debe tener repositorios privados (plan Free lo
permite). El deploy de EasyPanel ya usa un token (`gho_`) que clona el repo en
el build; al pasar a privado, verificá que ese token tenga acceso al repo (si
el build falla con "repository not found", hay que regenerar el token con
permiso sobre este repo y volver a meterlo en EasyPanel).

---

## 1. Derechos de autor (copyright) del código fuente

El código fuente de software se protege como **obra literaria / programa de
computador**. Registrarlo te da una fecha cierta y presunción de titularidad.

### Opción A — Colombia (DNDA, recomendada por ser tu jurisdicción)

1. Entrá a **https://www.derechodeautor.gov.co** (Dirección Nacional de
   Derecho de Autor).
2. Creá cuenta y solicitá el **Registro de Obra → Software (Programa de
   Computador)**.
3. Adjuntá:
   - El código fuente (una versión estable y documentada; podés entregar
     extractos representativos + la estructura, no necesariamente todo).
   - Manuales y documentación (el repo ya tiene varios `.md`).
   - Datos del autor y del titular (persona natural o jurídica).
4. Guardá el **certificado de registro** (número de registro y fecha).

### Opción B — Estados Unidos (US Copyright Office)

1. **https://www.copyright.gov** → Register a Work → *Computer Program*.
2. Subí el código fuente (puede ser el ZIP del repo) y pagá la tasa (~$65).
3. Sirve como respaldo internacional y ante plataformas (App Store, Meta).

> Consejo: registrá una **versión "release"** (no cada commit). Cada versión
> mayor puede registrarse de nuevo si cambió sustancialmente.

---

## 2. Marca (nombre comercial) — VentasPro / Sofía AI Sales

La marca protege el **nombre y el logo**, no el código. En Colombia se registra
en la Superintendencia de Industria y Comercio (SIC).

1. Entrá a **https://www.sic.gov.co** → Trámites de Propiedad Industrial →
   **Registro de Marca**.
2. Buscá previamente (SIPI) que "VentasPro" y "Sofía AI Sales" no estén ya
   registradas en tu clase.
3. Clases recomendadas (clasificación de Niza):
   - **Clase 9**: software, aplicaciones, programas de IA.
   - **Clase 42**: SaaS, servicios de software, hosting, desarrollo.
   - (Si vendés servicios de marketing/ventas: **Clase 35**).
4. Pagá la tasa y guardá el **certificado de marca**.

> La marca "Sofía AI Sales" puede tener más riesgo de rechazo por ser
> descriptiva ("AI Sales"). "VentasPro" es más distintiva. Si querés una marca
> fuerte, considerá un nombre de fantasía para la marca registrable.

---

## 3. Medidas técnicas anti-robo (además del registro)

| Medida | Estado |
|---|---|
| Repositorio privado | ❌ **PENDIENTE** — hoy está público |
| LICENSE + avisos de copyright | ✅ creado |
| Código minimizado/empaquetado en producción | ✅ (build con esbuild/Vite) |
| Términos de servicio y privacidad | ✅ (`/privacidad` y ToS en la app) |
| Marca de agua "DEMO" en la versión de presentación | ⚠️ recomendado |
| NDA para quien vea demos o pitch | ⚠️ recomendado |
| No compartir `.env` / secretos (ya no se commitea `.env`) | ✅ |

---

## 4. Qué hace cada cosa (para no confundirse)

- **Copyright (DNDA/US Copyright)** → protege el **código y textos**.
- **Marca (SIC)** → protege el **nombre/logo** frente a terceros que lo usen.
- **Repositorio privado** → impide que **copien el código** desde GitHub.
- **LICENSE** → declara legalmente "todo reservado, no es libre".
- **ToS/Privacidad** → regula la relación con tus **clientes**.

El orden correcto para tu caso: **(1) repo privado → (2) LICENSE → (3) registro
copyright → (4) registro de marca**.
