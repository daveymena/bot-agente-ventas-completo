# PLAN DE ACCIÓN INMEDIATO - Agent-Sales-Bot SaaS

## ⚡ RESUMEN: 5 CRÍTICOS QUE BLOQUEAN MONETIZACIÓN

Todos se pueden resolver en **3-5 días de trabajo**. Estos son los **únicos que imposibilitan vender dinero real**.

---

## CRITICAL #1: COOKIE_SECRET No Validado

### El Problema
```typescript
// app.ts línea 245 - INSEGURO
let cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  cookieSecret = randomBytes(32).toString("hex"); // ❌ En memoria
}
```

**Riesgo:** Si el servidor reinicia (deploy), todas las sesiones se invalidan. Pero **peor**: sin el secret fijo, cualquiera PUEDE forjar cookies.

### Fix (30 minutos)
```typescript
// app.ts línea 245 - SEGURO
const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  logger.error(
    "[FATAL] COOKIE_SECRET es requerido en producción. Genera con:\n" +
    "python -c \"import secrets; print(secrets.token_hex(32))\""
  );
  process.exit(1);
}
```

### Verificación
```bash
# Esto debería fallar sin COOKIE_SECRET:
unset COOKIE_SECRET && node dist/index.mjs
# Error: [FATAL] COOKIE_SECRET es requerido en producción...

# Esto debería funcionar con secret:
export COOKIE_SECRET=abcd1234... && node dist/index.mjs
# Server listening on port 3002
```

---

## CRITICAL #2: Rate Limiting Sin Redis

### El Problema
```typescript
// rateLimiting.ts línea 38-131 - INSEGURO
class RateLimitStorage {
  private storage: Map<string, ...> = new Map(); // En memoria - perdido en restart
}
```

**Riesgo:** 
- Ataques de fuerza bruta contra login/password-reset no se pueden bloquear
- En infraestructura con 2+ servidores, cada uno tiene su propio contador

### Fix (4-6 horas)

**Paso 1:** Instalar Redis
```bash
# Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# O en servidor Linux:
apt-get install redis-server
systemctl start redis-server
```

**Paso 2:** Cambiar rateLimiting.ts
```typescript
// rateLimiting.ts - arriba del archivo
import redis, { Redis } from "ioredis";
const redisClient = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

class RateLimitStorage {
  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const resetTime = now + windowMs;
    
    // Usar Redis en lugar de Map:
    const count = await redisClient.incr(key);
    if (count === 1) {
      await redisClient.pexpire(key, windowMs);
    }
    
    return {
      allowed: true,
      totalHits: count,
      resetTime: new Date(resetTime),
    };
  }
}
```

**Paso 3:** Actualizar .env
```env
REDIS_URL=redis://localhost:6379
# O en producción:
REDIS_URL=redis://:password@redis-host:6379
```

### Verificación
```bash
# Test rate limit persiste en restart:
# 1. Hacer 101 requests en 15 minutos
# 2. Recibir 429 (Too Many Requests)
# 3. Reiniciar servidor: npm run build && npm start
# 4. Intentar request: Sigue siendo 429 (no se resetea)
# 5. Esperar 15 minutos: Ahora funciona
```

---

## CRITICAL #3: Webhooks Sin Verificación de Firma

### El Problema
```typescript
// subscription-webhooks.ts línea 86 - INSEGURO
router.post("/mercadopago", async (req, res) => {
  const { type, data } = req.body; // ❌ Cree lo que sea
```

**Riesgo:** Atacante puede enviar POST con pago "aprobado" y ganar acceso gratis

```bash
# Ataque simple:
curl -X POST http://target/api/webhooks/subscription/mercadopago \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment",
    "data": {
      "id": "fake-payment-123",
      "status": "approved",
      "external_reference": "subscription_1",
      "payer": { "email": "attacker@gmail.com" }
    }
  }'
# ❌ Suscripción se activa sin pagar
```

### Fix (2-3 horas)

**Paso 1:** Obtener webhook secret de MercadoPago
- Ir a: https://www.mercadopago.com.ar/developers/panel
- Webhooks → Webhook secret → Copiar

**Paso 2:** Guardar en .env
```env
MERCADO_PAGO_WEBHOOK_SECRET=mp_whsec_... # Copied from panel
```

**Paso 3:** Verificar firma en cada webhook
```typescript
// subscription-webhooks.ts línea 86
import crypto from "crypto";

router.post("/mercadopago", async (req, res) => {
  const signature = req.get("X-Hub-Signature-256");
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  
  // Signature falta:
  if (!signature || !secret) {
    logger.error("[Webhook] Missing signature or secret");
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // Reconstruir HMAC de request:
  const rawBody = (req as any).rawBody; // Capturado en app.ts línea 261
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody || JSON.stringify(req.body))
    .digest("hex")
  }`;
  
  // Comparación timing-safe (evita timing attacks):
  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  )) {
    logger.warn("[Webhook] Invalid signature");
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  // Procesar webhook...
  const { type, data } = req.body;
  // ...
});
```

**Paso 4:** Repetir para PayPal
```typescript
// En mismo archivo, agregar:

router.post("/paypal", async (req, res) => {
  // PayPal usa X-PAYPAL-TRANSMISSION-SIG
  // Buscar: "Verify PayPal Webhook Signatures" en PayPal docs
  const signature = req.get("X-PAYPAL-TRANSMISSION-SIG");
  // ... similar logic
});
```

### Verificación
```bash
# Test 1: Webhook SIN firma = 401
curl -X POST http://localhost:3002/api/webhooks/subscription/mercadopago \
  -H "Content-Type: application/json" \
  -d '{"type":"payment"}'
# Esperado: 401 Unauthorized

# Test 2: Webhook CON firma válida = 200
# (Requiere generar firma válida con el secret)
```

---

## CRITICAL #4: Credenciales Sin Encripción

### El Problema
```typescript
// tenants.ts línea 35-39 - INSEGURO
woocommerceIntegration: jsonb("woocommerce_integration").$type<{
  consumerKey?: string;  // ❌ Texto plano en BD
  consumerSecret?: string; // ❌ Texto plano en BD
}>(),
```

**Riesgo:** Si alguien accede a PostgreSQL, tiene tokens de TODOS los negocios

```sql
-- Atacante con acceso a BD:
SELECT woocommerce_integration FROM tenants WHERE id = 1;
-- {"consumerKey": "ck_live_abcd1234...", "consumerSecret": "cs_live_xyz789..."}
```

### Fix (4-5 horas)

**Paso 1:** Crear módulo de crypto
```typescript
// lib/crypto.ts
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 16; // IV size

export function getEncryptionKey(): Buffer {
  const keyHex = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length < 64) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY debe ser un hex de 64 caracteres (32 bytes)\n" +
      "Genéra con: python -c \"import secrets; print(secrets.token_hex(32))\""
    );
  }
  return Buffer.from(keyHex, "hex");
}

export function encryptCredential(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(SALT_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  // Formato: iv:authTag:ciphertext (separado por :)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptCredential(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, ciphertext] = encrypted.split(":");
  
  if (!ivHex || !tagHex || !ciphertext) {
    throw new Error("Invalid encrypted format");
  }
  
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
```

**Paso 2:** Usar en woocommerce.ts
```typescript
// routes/woocommerce.ts línea 61
import { encryptCredential, decryptCredential } from "../lib/crypto";

router.put("/config", async (req, res) => {
  // ...
  
  const newConfig = {
    enabled: enabled ?? currentConfig.enabled ?? false,
    storeUrl: storeUrl || currentConfig.storeUrl || "",
    
    // Encriptar secrets:
    consumerKey: consumerKey && consumerKey !== "••••••••"
      ? encryptCredential(consumerKey)  // ✓ Encriptado
      : currentConfig.consumerKey || "",
    
    consumerSecret: consumerSecret && consumerSecret !== "••••••••"
      ? encryptCredential(consumerSecret)  // ✓ Encriptado
      : currentConfig.consumerSecret || "",
  };
  
  // ...
});
```

**Paso 3:** Desencriptar cuando se use
```typescript
// En WooCommerceService:
const service = new WooCommerceService({
  storeUrl: config.storeUrl,
  consumerKey: decryptCredential(config.consumerKey), // ✓ Desencriptado
  consumerSecret: decryptCredential(config.consumerSecret), // ✓ Desencriptado
});
```

**Paso 4:** Agregar a .env
```env
# Generar:
# python -c "import secrets; print(secrets.token_hex(32))"
CREDENTIALS_ENCRYPTION_KEY=a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3
```

### Verificación
```bash
# Test 1: Encriptación funciona
node -e "
const { encryptCredential, decryptCredential } = require('./lib/crypto');
const secret = 'ck_live_xyz123';
const encrypted = encryptCredential(secret);
console.log('Encriptado:', encrypted);
console.log('Desencriptado:', decryptCredential(encrypted));
"

# Test 2: Datos en BD están encriptados
psql $DATABASE_URL -c "
SELECT woocommerce_integration FROM tenants WHERE id = 1;
-- Debe mostrar: 'consumerKey: \"a1b2c3:d4e5f6:7g8h9i...\"' (no el texto plano)
"
```

---

## CRITICAL #5: Sin Rate Limit en Login

### El Problema
```typescript
// auth.ts línea 138 - INSEGURO
router.post("/login", async (req, res, next) => {
  const { email, password } = loginSchema.parse(req.body);
  // ❌ NO HAY RATE LIMIT
```

**Riesgo:** Brute force con 10,000 intentos/minuto contra un email

### Fix (30 minutos)

**Paso 1:** Crear el rate limit (en rateLimiting.ts, ya existe template)
```typescript
// rateLimiting.ts - ya está para password reset, reutilizar:
export const loginRateLimit = rateLimitingMiddleware.createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 5, // 5 intentos máximo
  keyGenerator: (req) => {
    const email = (req.body as any)?.email || "";
    return `login_${req.ip}_${email}`;
  }
});
```

**Paso 2:** Aplicar en auth.ts
```typescript
// auth.ts línea 138
import { loginRateLimit } from "../middleware/rateLimiting";

router.post("/login", loginRateLimit, async (req, res, next) => {
  // ... resto del código
});
```

**Paso 3:** Agregar feedback al usuario
```typescript
// En auth.ts, al rechazar por limit:
// (El middleware ya lo hace, pero asegurar que el header se devuelve)
res.set({
  'X-RateLimit-Remaining': remaining.toString(),
  'X-RateLimit-Reset': resetTime.toISOString(),
});
```

### Verificación
```bash
# Test: Después de 5 intentos fallidos, recibir 429
for i in {1..7}; do
  curl -X POST http://localhost:3002/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrongpassword"}'
  echo "\nIntento $i"
done
# Intento 1-5: 401 (credenciales inválidas)
# Intento 6-7: 429 (Too Many Requests)
```

---

## 📋 RESUMEN DE TAREAS

| # | Tarea | Archivo | Tiempo | Criticidad |
|---|-------|---------|--------|------------|
| 1 | COOKIE_SECRET obligatorio | app.ts:245 | 30 min | 🔴 |
| 2 | Migrar a Redis | rateLimiting.ts:38 | 4h | 🔴 |
| 3 | Webhooks HMAC MP | subscription-webhooks.ts:86 | 1.5h | 🔴 |
| 4 | Webhooks HMAC PayPal | subscription-webhooks.ts:200+ | 1.5h | 🔴 |
| 5 | Encripción de credenciales | lib/crypto.ts + woocommerce.ts | 4h | 🔴 |
| 6 | Rate limit en login | auth.ts:138 | 30 min | 🔴 |

**Total estimado: 11-12 horas de trabajo = ~1.5 días full-time**

---

## ⚠️ SEGUNDO NIVEL DE PRIORIDAD (Alta)

Estos NO bloquean monetización inicial pero son urgentes en las primeras 2 semanas:

| # | Problema | Fix Time | Impacto |
|---|----------|----------|---------|
| 6 | 2FA para admin | 1 semana | Proteger cuenta VIP |
| 7 | CSRF tokens | 3 días | XSS + CSRF |
| 8 | Security headers | 1 día | HSTS, CSP, etc. |
| 9 | PII en logs | 2 días | No loguear passwords/tokens |
| 10 | Falta HTTPS redirect | 1 día | Forzar HTTPS en prod |

---

## ✅ CHECKLIST ANTES DE IR A PRODUCCIÓN CON DINERO REAL

- [ ] COOKIE_SECRET es requerido + exit si falta
- [ ] Redis está corriendo (test con `redis-cli ping`)
- [ ] MercadoPago: MERCADO_PAGO_WEBHOOK_SECRET seteado
- [ ] PayPal: Configurar webhook secret en panel
- [ ] CREDENTIALS_ENCRYPTION_KEY de 64 hex chars
- [ ] Datos WooCommerce están encriptados en BD
- [ ] POST /login tiene rate limit (5/15min)
- [ ] Password reset tiene rate limit (5/15min)
- [ ] POST /register tiene rate limit (3/hora)
- [ ] HTTPS forzado (no HTTP)
- [ ] Backup automático de BD configurado
- [ ] Logs NO contienen passwords/tokens (grep test)
- [ ] App inicia correctamente sin .env en memoria

---

## 🚀 DESPUÉS DE RESOLVER CRÍTICOS

Una vez tengas los 5 críticos listos, **puedes abrir beta con dinero real**, pero continúa con:

**Semana 2-3:**
- [ ] Implementar 2FA (TOTP)
- [ ] Agregar CSRF tokens
- [ ] Security headers (HSTS, CSP, X-Frame-Options)

**Semana 4:**
- [ ] Suite de tests (Jest + Playwright)
- [ ] APM (Application Performance Monitoring)
- [ ] Monitoreo de errores (Sentry)

**Semana 5+:**
- [ ] Performance optimization
- [ ] Database optimization
- [ ] Load testing

---

## CONTACTO PARA DUDAS

Si algo no está claro en este plan:
1. Ver AUDIT_REPORT.md para más contexto
2. Líneas específicas referenciadas apuntan a código actual
3. Todos los fixes usan dependencias ya en package.json

**¡Éxito! Esto es totalmente ejecutable.**
