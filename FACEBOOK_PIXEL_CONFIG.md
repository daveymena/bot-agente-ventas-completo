# 📊 Configuración de Facebook Pixel para Landing Page

## 🔑 Setup básico

### 1. Obtener tu Pixel ID

1. Ve a **Meta Business Suite**
2. Selecciona **Events Manager**
3. Copia tu **Pixel ID**
4. Pégalo en tu configuración de tienda

```
Tu Pixel ID: [PEGA_AQUI_TU_ID]
```

---

## 📍 Eventos Recomendados

### Para Dropshipping optimizado:

```javascript
// Evento cuando entra a la landing
fbq('track', 'ViewContent', {
  content_name: 'Landing Page',
  content_type: 'product',
  value: 0.01,
  currency: 'COP'
});

// Cuando ve los productos
fbq('track', 'ViewContent', {
  content_ids: ['producto_1', 'producto_2'],
  content_name: 'Productos Destacados',
  content_type: 'product_group',
  value: 49.99,
  currency: 'COP'
});

// Cuando hace scroll al CTA final
fbq('track', 'ViewContent', {
  content_name: 'CTA Final',
  content_type: 'product',
  value: 0.01,
  currency: 'COP'
});

// Cuando hace clic en "Ver Productos"
fbq('track', 'Lead', {
  content_name: 'Click Ver Productos',
  content_type: 'product',
  lead_type: 'store_visitor'
});

// Cuando agrega al carrito
fbq('track', 'AddToCart', {
  content_ids: ['producto_id'],
  content_name: 'Producto agregado',
  content_type: 'product',
  value: 49.99,
  currency: 'COP'
});

// Cuando completa compra
fbq('track', 'Purchase', {
  value: 89.98,
  currency: 'COP',
  content_name: 'Compra Completada',
  content_type: 'product'
});
```

---

## 🎯 Estrategia de Pixelado

### Fase 1: Awareness (Primeros días)
```javascript
// Rastrear solo vistas
fbq('track', 'ViewContent');
```

### Fase 2: Consideration (Días 3-7)
```javascript
// Rastrear vistas + clics
fbq('track', 'ViewContent');
fbq('track', 'Lead');
```

### Fase 3: Conversion (Después de día 7)
```javascript
// Rastrear todo
fbq('track', 'ViewContent');
fbq('track', 'Lead');
fbq('track', 'AddToCart');
fbq('track', 'Purchase');
```

---

## 📊 Configuración en la plataforma

### En tu tienda (config admin):
```json
{
  "pixelId": "TU_PIXEL_ID_AQUI",
  "pixelEnabled": true,
  "trackEvents": {
    "viewContent": true,
    "lead": true,
    "addToCart": true,
    "purchase": true
  }
}
```

---

## 🔄 Conversiones Automatizadas

Después de recopilar datos, crea **Custom Conversions**:

### Custom Conversion 1: Landing Visitor
```
Event: ViewContent
Condition: Page Title contains "Descubre"
Value: Flujo de visita a landing
```

### Custom Conversion 2: Product Click
```
Event: Lead
Condition: content_type = 'product'
Value: Persona interesada
```

### Custom Conversion 3: Compra Completada
```
Event: Purchase
Condition: value >= 1000 COP
Value: Compra realizada
```

---

## 🎨 Audiencias Personalizadas

### Audience 1: Landing Visitors
```
Evento: ViewContent en últimos 7 días
Tamaño esperado: 100-500 personas
Usos: Retargeting con descuento
```

### Audience 2: Product Viewers
```
Evento: ViewContent + Lead en últimos 3 días
Tamaño esperado: 50-200 personas
Usos: Retargeting urgencia
```

### Audience 3: Add to Cart (No compraron)
```
Evento: AddToCart pero NO Purchase
Tamaño esperado: 20-100 personas
Usos: Carrito abandonado
```

### Audience 4: Compradores
```
Evento: Purchase en últimos 30 días
Tamaño esperado: 5-50 personas
Usos: Vender complementos
```

---

## 📝 Anuncio Recomendado #1: Awareness

**Objetivo:** Traffic  
**Presupuesto:** $10-15/día  
**Duración:** 5 días

```
Headline: "Descuentos de hasta 40% en productos premium"
Body: "Calidad garantizada, envío rápido y 30 días de garantía. 
       Compra ahora y ahorra grande."
CTA: "Ver Productos Ahora"
Imagen: Producto más popular (4:5 ratio)
```

---

## 📝 Anuncio Recomendado #2: Consideration

**Objetivo:** Conversions  
**Presupuesto:** $15-25/día  
**Duración:** 7 días  
**Audiencia:** Landing Visitors

```
Headline: "¿Dudas? 30 días de garantía + devolución gratis"
Body: "Compra con confianza. Pago 100% seguro. 
       Miles de clientes satisfechos."
CTA: "Comprar Ahora"
Imagen: Testimonios (carrusel)
```

---

## 📝 Anuncio Recomendado #3: Conversion

**Objetivo:** Conversions  
**Presupuesto:** $20-40/día  
**Duración:** Continuo  
**Audiencia:** Product Viewers

```
Headline: "⏰ ÚLTIMA OPORTUNIDAD: 40% OFF Hoy"
Body: "Solo quedan pocas unidades. Envío GRATIS.
       Paga mañana y pierde la oferta."
CTA: "Comprar Antes que se Acabe"
Imagen: Producto con badge "Últimas unidades"
```

---

## 📝 Anuncio Recomendado #4: Retargeting

**Objetivo:** Conversions  
**Presupuesto:** $10-15/día  
**Duración:** 14 días  
**Audiencia:** Add to Cart (No compraron)

```
Headline: "Se te olvidó tu carrito 👀"
Body: "Completa tu compra ahora y obtén 5% extra en descuento.
       Oferta válida solo hoy."
CTA: "Completar Compra"
Imagen: Carousel de los productos en carrito
```

---

## 🚀 Cronograma de Lanzamiento

### Semana 1: Test Inicial
```
Día 1-3: Anuncio #1 (Awareness) - $10/día
Día 4-7: Analiza resultados
```

### Semana 2: Expand
```
Si ROAS > 2:1 → Amplía presupuesto a $20/día
Si ROAS < 1:1 → Para y revisa creativo/landing
```

### Semana 3-4: Optimiza
```
Lanza Anuncios #2 y #3
Pausa lo que no funciona
Mantén ROAS objetivo > 3:1
```

### Semana 5+: Escala
```
Si funciona → Aumenta 30% presupuesto
Añade Anuncio #4 (Retargeting)
Prueba nuevas audiencias
```

---

## 💹 Métricas de Éxito

| Métrica | Objetivo | Rango Aceptable |
|---------|----------|-----------------|
| CPC (Costo por Clic) | $0.30-0.70 | <$1.00 |
| CTR (Click Rate) | >3% | >1.5% |
| Conversion Rate | 1-2% | >0.5% |
| ROAS (Retorno) | 3:1 | >2:1 |
| CPL (Costo por Lead) | $0.50-1.50 | <$2.00 |

---

## ⚠️ Errores comunes

### ❌ Error 1: No rastrear nada
✅ Solución: Implementa pixel desde día 1

### ❌ Error 2: Presupuesto muy bajo
✅ Solución: Mínimo $10/día para datos confiables

### ❌ Error 3: Cambiar anuncio cada día
✅ Solución: Espera mínimo 3 días de datos

### ❌ Error 4: No hacer A/B tests
✅ Solución: Siempre prueba 2 variantes

### ❌ Error 5: Ignorar retargeting
✅ Solución: Retargeting es 5x más barato que awareness

---

## 🔍 Debugging

### Verificar que el pixel funciona:

**Opción 1: Facebook Pixel Helper**
1. Instala extensión en Chrome
2. Ve a tu landing page
3. Verifica que veas el ✅ verde

**Opción 2: DevTools**
```javascript
// En la consola del navegador
fbq('getState') // Debe mostrar data del pixel
```

**Opción 3: Events Manager**
1. Ve a Meta Business Suite
2. Events Manager → Prueba
3. Verifica eventos en tiempo real

---

## 📞 Contacto Meta

- **Support:** business.facebook.com/support
- **Community:** facebook.com/business/community
- **Docs:** facebook.com/business/help

---

**Última actualización:** Agosto 2024  
**Versión:** 1.0  
**Próxima revisión:** Octubre 2024
