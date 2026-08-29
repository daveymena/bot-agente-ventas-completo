# TRASPASO — cómo retomar esto en otra sesión

Reescrito el **2026-08-29**. La versión anterior era del 24-08 y para esta fecha
**mentía**: decía que nada estaba desplegado y preguntaba cosas que ya se
respondieron. Un traspaso viejo desorienta más que no tener ninguno.

Lo operativo está acá. Lo que solo puede hacer el admin, en
[`PENDIENTE_ADMIN.md`](./PENDIENTE_ADMIN.md). El código muerto, en
[`CODIGO_MUERTO.md`](./CODIGO_MUERTO.md).

---

## 1. Estado ahora mismo

**Todo lo de las últimas dos sesiones está desplegado y verificado en
producción**, no solo commiteado. 23 commits el 28 y 29 de agosto.

**Lo que se comprobó funcionando de punta a punta**, contra la cuenta real de
Meta y no contra logs:

- Atlas publica una campaña de mensajes a WhatsApp, **con su conjunto de
  anuncios**, en pausa, con copy anclado en datos reales del producto.
  Verificado tres veces (campañas `…670097`, `…350097`, `…620097`).
- El ciclo completo: propone (~113 s) → se confirma → publica (**~10-20 s**).

**Lo que NO está resuelto:** los ~113 s de la propuesta. Publicar es rápido
porque ahí manda el servidor; proponer es lento porque ahí manda el modelo, y
el modelo es Groq gratuito compartido. Ver §3.

⚠️ **Nunca dar un deploy por vivo mirando el hash de commit de EasyPanel**:
mintió un día entero. Verificar por comportamiento. El canario barato es
`GET /api/health` → `uptime`: si es alto, el contenedor no reinició.

---

## 2. Cómo se trabaja acá

**Deploy y entorno se hacen por la API de EasyPanel**, con el token de
`.easypanel.env` (gitignored):

```bash
set -a && . ./.easypanel.env && set +a
curl -sk -X POST -H "Authorization: Bearer $EASYPANEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"json":{"projectName":"tecnoia","serviceName":"bot-agenwhatsapp"}}' \
  "$EASYPANEL_URL/api/trpc/services.app.deployService"
```

Servicios: `tecnoia/bot-agenwhatsapp` (la app), `opencode1/opencode-clean` (el
cerebro de Atlas), `opencode1/oc-{zen,groq,router}` (investigación con
websearch).

⚠️ **`opencode-clean` no se puede reconstruir**: `docker buildx build` falla.
Los cambios de entorno se le aplican con **stopService + startService**, que no
reconstruye. Y su primer pedido tras reiniciar SIEMPRE falla (arranque en
frío): reintentar.

⚠️ **El error de build de EasyPanel devuelve todas las claves en texto plano.**
Ver `PENDIENTE_ADMIN.md` §2.

**Leer producción** se hace con `claude-in-chrome` sobre una pestaña logueada en
ventasproia.com y `fetch('/api/...')`. La base es interna de EasyPanel y no se
alcanza desde el PC. Rate limit 100/900s. El `javascript_tool` corta a los 45 s,
así que un pedido a Atlas hay que lanzarlo sin `await` y consultarlo después.

---

## 3. Proveedores de IA: solo uno vive

Probados uno por uno con `POST /api/ai/test` el 28-08:

| | |
|---|---|
| **groq** | ✅ lo único vivo — `openai/gpt-oss-120b` en 442 ms |
| **opencode** (Zen free) | ⚠️ parcial — `nemotron-3-ultra-free` OK, `big-pickle` sin cupo |
| anthropic | ❌ 401 **clave inválida** (mal pegada, no sin saldo) |
| openrouter · deepseek · mistral · mimo | ❌ sin crédito / sin saldo |
| nvidia_nim · github | ❌ modelo retirado / conexión |
| **copilot** | ❌ **sin token en ningún lado** |

**El techo de todo:** una sola cuenta gratuita de Groq con **8.000 tokens por
minuto**, y DOS consumidores peleándola — Atlas y el bot de ventas. Cada turno
del operador le come la cuota al que vende.

Las listas de candidatos ya no traen proveedores muertos de fábrica
(`CANDIDATOS_PAGOS` en `operator-opencode.ts`, `PROVEEDORES_RAPIDOS` en
`cadena-modelos.ts`). Están **comentados con su motivo**: vuelven cuando haya
saldo, y ese día van arriba de Groq.

---

## 4. Las reglas que rigen el sistema

Tres que se ganaron a los golpes y conviene no romper:

**El servidor decide lo que tiene que salir exacto; el modelo escribe.** Si un
dato crítico está en el mensaje del admin, se lee con código. El destino del
anuncio se resuelve así (`interpretarObjetivo` sobre el texto del admin, no
sobre lo que el modelo recordó pasar): de tres corridas idénticas, el modelo
acertó una.

**Un criterio duplicado es un bug esperando.** Pasó cuatro veces en dos días:
arreglado en una lista y vivo en la otra. Por eso `herramientasDeLaFamilia`,
`usarAdvantagePlus`, `interpretarObjetivo` y las constantes de
`reglas-de-pauta.ts` se COMPARTEN entre rutas.

**El presupuesto de tokens es real y está medido.** Con los esquemas de
herramientas: 2.585 resolvía, 3.474 truncaba el contexto (el modelo alucinaba
"tus imágenes eran muy grandes" sin que hubiera imágenes), 4.197 colgaba el
turno. La prueba que lo vigila es `el-filtro-tiene-que-filtrar.test.ts`.

---

## 5. La suite

**955 pruebas, y ahora sí son de fiar**: 10 corridas seguidas en verde. Antes
fallaba 1 de cada 12 porque la mitad de los archivos compartía base SQLite
(el contador en `globalThis` no persistía como decía su comentario). Arreglado
el 29-08 con un uuid por archivo.

```bash
cd artifacts/api-server && npx vitest run    # no hay script "test"
```

⚠️ **`npx tsc --noEmit` tiene errores preexistentes** en `app.ts`,
`facebook-comments.ts` y algún test (implicit any, `supertest` sin instalar).
No son de los cambios recientes: comprobado corriendo tsc antes y después.

---

## 6. Lo que sigue

**Del admin** (`PENDIENTE_ADMIN.md`): pagar Groq o separar cuotas · rotar
claves · borrar 3 campañas de prueba · arreglar el build de `opencode-clean`.

**De código:**
1. **Costo por conversación medido.** Es el número que falta para poder poner
   precio al SaaS, y es medible hoy.
2. **~2.400 líneas de código muerto** todavía (`CODIGO_MUERTO.md`). Empezar por
   mirar `product-disambiguator.ts` (511) antes de borrarlo: es el bug que
   rompió el bot en agosto.
3. **Huecos de producto** ante un marketer: exclusiones de públicos, carrusel,
   formularios nativos (`OUTCOME_LEADS`).
4. La suite tarda ~15 s pero `collect` se lleva 120 s: vale mirarlo.

---

## 7. Lo único que mide si algo de esto sirvió

**Tratos ganados: 0**, con 18 conversaciones y 106 mensajes.

Todo lo construido son medios. La verificación pendiente es la misma de hace
una semana: **una conversación real que llegue al cierre y cobre.**
