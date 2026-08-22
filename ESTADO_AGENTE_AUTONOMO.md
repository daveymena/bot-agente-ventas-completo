# Qué le falta al agente para ser autónomo de verdad

**Auditoría del 2026-08-22** · Rama `master` · Complementa a `ESTADO_ANUNCIOS_ATLAS.md`

Auditoría sobre el código real (grep + lectura), no sobre lo que el chat afirma.
Dos preguntas: **¿qué le falta a Atlas para controlar Facebook al 100%?** y
**¿qué le falta al agente de WhatsApp para vender como un humano?**

---

## 1. Facebook: 26 herramientas que cubren el ciclo básico

Ya existen y están probadas: `fb_status`, `fb_ad_draft`, `fb_upload_draft_to_meta`,
`fb_create_ad`, `fb_list_campaigns`, `fb_list_adsets`, `fb_campaign_metrics`,
`fb_set_budget`, `fb_pause_campaign`, `fb_resume_campaign`, `fb_make_campaign_deliver`,
`fb_schedule_pause`, `fb_set_ad_status`, `fb_delete_campaign`, `fb_create_pixel`,
`fb_pixel_status`, `fb_suggest_audience`, `fb_why_not_delivering`, `fb_ad_library`,
`fb_page_publish`, `fb_page_preview`, `fb_page_can_post`, `fb_sync_catalog`,
`fb_update_draft_creative`, `fb_list_drafts`, `fb_agent_logs`.

Con eso se puede **crear, encender, apagar y vigilar** una campaña. No se puede
**optimizar, iterar ni recuperar** al que no compró.

### 1.1 Lo que falta (verificado con grep, no supuesto)

| Falta | Evidencia en el código | Qué cuesta |
|---|---|---|
| **Públicos personalizados / similares** | `customAudiences?: string[]` en `lib/facebook.ts:65` es solo un campo de tipo, nunca se llena. `lookalike` solo aparece como texto en `audience-strategist.ts` | **No hay retargeting.** El que escribió por WhatsApp y no compró se pierde para siempre. El agujero más caro |
| **Desgloses de métricas** | cero `breakdowns` en todo el repo | Se ve el gasto total, no qué edad/sexo/ubicación/posición compra. Solo se puede matar la campaña, no afinarla |
| **Video** | cero `advideos` | Solo anuncios de imagen. El formato dominante de Meta queda fuera |
| **Iterar creativos** | cero `ab_test`, sin duplicar campaña, 1 anuncio por conjunto | No se pueden probar 3 copys ni escalar el ganador |
| **Comentarios de anuncios** | `lib/facebook-comments.ts` existe y está en `channel-manager.ts` y `routes/facebook.ts`, pero **NO está en el catálogo `TOOLS`** de `app-operator.ts` | Atlas no puede leer ni responder comentarios: ahí viven las objeciones y los compradores |
| **Messenger** | igual: `lib/facebook-messenger.ts` existe, no es herramienta de Atlas | Idem |
| **Lead Ads** | cero `leadgen_forms` | No se pueden crear formularios ni bajar leads |
| **Instagram** | cero `instagram_actor_id` | Los anuncios corren solo en Facebook, sin identidad de IG |
| **Presupuesto total / franjas / reglas** | cero `lifetime_budget`, `dayparting`, `adrules` | Solo presupuesto diario, sin horarios ni reglas automáticas de Meta |
| **Catálogo** | `catalogId` vacío en el tenant | `fb_sync_catalog` sigue muerto → sin anuncios dinámicos de catálogo |

### 1.2 Un cerebro sin manos

`lib/marketing-team/` tiene **14 agentes** (`marketing-strategist`, `scaling-agent`,
`optimization-agent`, `meta-ads-manager`, `experiment-manager`, `audience-strategist`,
`copywriter`, `creative-director`, `budget-manager`, `performance-analyst`,
`offer-strategist`, `market-researcher`, `diagnostic-agent`, `marketing-memory`).

**Ninguno llama nunca a `facebookService` ni a `adStrategist`** — cero resultados al
grepear en `scaling-agent.ts`, `optimization-agent.ts` y `meta-ads-manager.ts`.
Diagnostican y recomiendan; no ejecutan. Se llega a ellos solo por `marketing_diagnostico`,
`marketing_aprendizajes` y `marketing_attribution`.

`ad-growth-agent.ts` sí actúa por su cuenta (arranca solo con `setInterval`, líneas 596-622),
pero **solo para frenar**: protección de gasto, revisión de tendencia y freno diario.
Nada escala hacia arriba de forma automática.

---

## 2. WhatsApp: el agente no conoce tu negocio, conoce TecnoVariedades

### 2.1 Lo que ya funciona

Transcripción de audios y descripción de imágenes entrantes (`media-entrante`, usado en
`whatsapp.ts:1481-1491`), memoria de la conversación, catálogo completo inyectado en el
prompt, estado de pago, manejo de objeciones, traspaso a humano (`human_handoff`),
aprendizaje del turno anterior, y lead scoring + seguimiento automático — este último
estuvo construido pero muerto hasta que se cableó en `agent.ts:687`.

### 2.2 El negocio está escrito a mano en el motor de conversación

Este es **el 7.2 otra vez**, pero del lado de WhatsApp. En los anuncios quedó resuelto
derivando de `kind` + `deliveryLink` (`anuncio-inteligente.ts:162,236`). En la conversación NO:

- `conversation-engine.ts:1463` → `"Eres Sofía, asesora de TecnoVariedades D&S"`
- `conversation-engine.ts:1502` → `"DATOS REALES: entrega 100% digital por Google Drive. Acceso de por vida. Garantía de 7 días"`
- `conversation-engine.ts:1528` → `"garantía de 7 días 100% libre de riesgo"`
- `fallbackSystem.ts:48` → saludo con la marca escrita a mano
- `brand-voice.ts:97` → preset por defecto TecnoVariedades

Y lo grave: en `agent.ts:921` el tenant **sí** puede reemplazar el prompt del sistema
(`activeAgent.systemPrompt || <default>`), pero el bloque de contexto de
`conversation-engine` se le pega **igual, después**. Resultado: un gimnasio, un
restaurante o una tienda de ropa que se registre en el SaaS recibe un bot que se
presenta como Sofía y promete Google Drive con garantía de 7 días.

**Es la base del punto 2 de la hoja de ruta del usuario y hoy está roto.**

### 2.3 Los otros tres huecos

**No hay memoria del cliente entre conversaciones.** Todo cuelga de
`loadConversationMemory(conversationId)`. Cero `customerProfile` en el flujo de venta.
El que compró hace dos semanas vuelve y es un desconocido: sin historial de compra,
sin "ya tiene el curso X", sin venta cruzada.

**La intención se detecta con listas de palabras** (`GREETING_PATTERNS`,
`OBJECTION_PATTERNS`, `PAYMENT_PATTERNS`… `conversation-engine.ts:121-234`). Es
exactamente la regla ya aprendida a golpes: *las listas cerradas siempre pierden*. El
propio código lo admite y pone un parche pidiéndole a la IA que ignore la etiqueta si
el historial dice otra cosa.

**Hay una regla que le prohíbe vender.** `conversation-engine.ts:1573`:
*"NUNCA termines tu respuesta con una pregunta. NINGUNA."* Un vendedor real califica
preguntando. Contradice a `agent.ts:930` ("avanzás la venta en cada mensaje") y al
propio `agent.ts` ("preguntá UNA cosa concreta si es ambiguo"). Dos prompts peleándose
en el mismo request: el mismo patrón del bug `b4db407`, donde ningún anuncio pasaba
porque el prompt pedía prueba social y el validador la prohibía.

**No hay base de conocimiento del negocio.** Fuera de las filas de productos no hay
dónde responder "¿hacen envíos a Cali?", "¿qué horario tienen?", "¿hacen pedidos
personalizados?". Por eso inventa.

---

## 3. Orden recomendado

1. **Contexto de negocio real, una sola fuente** — por tenant: qué vende, alcance,
   **qué NO puede hacer**, entrega, garantía, horarios. Debe alimentar a la vez el
   prompt de WhatsApp, el bloque de contexto y el validador de anuncios. Borra los
   hardcodes de TecnoVariedades. Desbloquea el punto 2 de la hoja de ruta y no gasta dinero.
2. **Públicos personalizados + retargeting** — lo que más plata deja sobre la mesa hoy.
3. **Comentarios y Messenger como herramientas de Atlas** — el código ya existe, es
   cablearlo al catálogo `TOOLS`.
4. **Desgloses de métricas** — sin eso, escalar es a ciegas.
5. **Darle manos al marketing-team** — conectar scaling/optimization a `facebookService`.

---

## 4. Punto 1 RESUELTO — contexto de negocio, una sola fuente (2026-08-22)

**Sin desplegar todavía.** Compila (`node build.mjs` OK) y las 10 pruebas nuevas pasan.
Las 14 pruebas que fallan en `src/lib/__tests__/` fallaban IGUAL antes del cambio
(verificado con `git stash`): 11 de `flujo-completo-venta` y 3 de `product-matching`,
todas por falta de datos en la BD local.

### Qué se creó

| Archivo | Qué hace |
|---|---|
| `lib/business-context.ts` | La única fuente. Resuelve el perfil del negocio por tenant y lo renderiza para el prompt |
| `routes/business-profile.ts` | `GET`/`PUT /api/business-profile` — el dueño lee y guarda su perfil |
| `lib/__tests__/business-context.test.ts` | 10 pruebas que fijan la regla: lo que no está configurado, no se afirma |
| `app-operator.ts` → `get_business_profile`, `update_business_profile` | Las herramientas con las que Atlas entrevista al dueño y guarda las respuestas |

### Dónde vive el perfil

`tenants.metadata.businessProfile` — **por cliente**. No en `settings`, que es una tabla
GLOBAL de una sola fila: guardarlo ahí haría que el perfil de un negocio se lo comieran
todos los demás (es el mismo bug que ya tuvieron las claves de IA, ver `ai-keys-tenant.ts`).

Campos: `descripcion`, `nicho`, `cobertura`, `horario`, `entrega {metodo, plazo, detalle}`,
`garantia {dias, descripcion}`, `acceso {tipo, descripcion}`, `noPuede[]`, `loQueDebeSaber[]`.

### La regla nueva

**Lo que no está configurado, no se afirma.** Antes un dato faltante se rellenaba con el
de TecnoVariedades y el agente lo afirmaba con seguridad. Ahora un dato faltante se
convierte en una prohibición explícita en el prompt ("DATOS QUE NO TENÉS: … NO lo
inventes"), y en el camino enlatado directamente **no responde**: devuelve `null` y el
mensaje cae en la IA, que sí tiene el bloque de negocio delante.

Orden de resolución: perfil del tenant → `settings` global (respaldo) → derivado de
`products.kind` + `deliveryLink` → nada (modo seguro). Caché de 60s por tenant, y se
invalida sola al guardar. Si la BD falla, devuelve contexto vacío: el agente deja de
afirmar en vez de inventar.

### Qué se borró (los hardcodes de TecnoVariedades)

- `conversation-engine.ts:1463` — "Eres Sofía, asesora de TecnoVariedades D&S" → sale del perfil
- `conversation-engine.ts:1484` — "Preséntate como Sofía" → sale del perfil
- `conversation-engine.ts:1502` — "Google Drive / de por vida / garantía de 7 días" → sale del perfil, o se prohíbe
- `conversation-engine.ts:1527-1528` — objeciones que prometían "pago único de por vida" y "7 días de garantía"
- `conversation-engine.ts:470-474` — **el peor**: `tryHardcodedAnswer` mandaba esas promesas al cliente TAL CUAL, sin que la IA las viera. Ahora cada respuesta exige el dato real
- `tryHardcodedAnswer` → se eliminó la respuesta de "qué incluye": afirmaba "videos en alta definición", "PDFs descargables" y "pago único" para cualquier producto de cualquier negocio. Eso está en la ficha, no en una plantilla
- `agent.ts:930, 940-980` — el bloque "HECHOS CONFIRMADOS" y el ejemplo de formato que enseñaba "acceso de por vida"
- `fallbackSystem.ts:48` — el saludo de emergencia decía "Soy Sofía, de TecnoVariedades D&S"

### Detalle que casi lo rompe

`tenants.metadata` vuelve como **objeto en Postgres y como string en SQLite** (el modo
local). Sin normalizar, el perfil se leía como `undefined` en local y el spread al
guardar generaba un objeto con índices numéricos. Se normaliza en
`normalizarMetadata()`, mismo criterio que `routes/facebook-credentials.ts`.

### ⚠️ Antes de desplegar: cargarle el perfil a TecnoVariedades

Verificado contra la BD local:

```
#1 TecnoVariedades | productos:5 | entrega:Google Drive garantia:— noPuede:3
   fuentes:[derivado de products.kind + deliveryLink]
```

La entrega se deriva sola (Google Drive) y aparecen 3 prohibiciones correctas (nada de
envío físico, clases en vivo ni local). Pero **la garantía de 7 días y el "acceso de por
vida" NO se derivan de ningún lado**: son política del negocio, no del producto. Hasta
que se carguen, el agente va a dejar de prometerlas — que es el comportamiento seguro,
pero para TecnoVariedades es una regresión, porque ahí sí son ciertas.

Se cargan con una sola llamada:

```
PUT /api/business-profile
{
  "garantia": { "dias": 7, "descripcion": "7 días de garantía: si no te convence, se devuelve el dinero" },
  "acceso":   { "tipo": "de por vida", "descripcion": "Pago único, el contenido queda tuyo y no caduca" },
  "descripcion": "Cursos y megapacks digitales",
  "noPuede": ["prometer certificado o diploma: los cursos no lo emiten"]
}
```

O pidiéndoselo a Atlas, que ya tiene `update_business_profile`.

### Lo que sigue

Del orden recomendado en §3 queda pendiente el 2 al 5. El punto 2 de la hoja de ruta
(un agente por tipo de negocio que entreviste al dueño) ya tiene dónde guardar las
respuestas: `update_business_profile` y `GET /api/business-profile` devuelve `faltan[]`,
la lista de lo que el dueño todavía no contestó.

---

## 6. Incidente del 2026-08-22 12:06 — el bot ofreció el producto equivocado

Un cliente llegó de un anuncio de Instagram del **Curso de Piano** y el bot le ofreció un
**Cojín Moto Viajero 3D**. Ocurrió a las 17:06 UTC, dos horas **antes** del deploy de §5,
así que no lo causó ese cambio.

### La cadena real

Meta autocompleta **el mismo texto para todos los anuncios** (`"¡Hola! Quiero más
información"`). El dato que dice a qué le hizo clic viaja aparte, en el `externalAdReply`.
O sea que el texto del cliente **nunca** alcanza para elegir producto.

El emparejador se portó bien: con ese texto devuelve `null` (verificado, no supuesto).
El problema era qué pasaba después de ese `null`:

`conversation-engine.ts`, rama "hay producto en contexto pero la búsqueda no encontró nada":
hacía `productToShow = null`, logueaba, y **no marcaba nada más**. Al bloque de contexto no
le llegaba ni el producto ni un aviso. La IA quedaba sola con el historial del chat y
ofrecía lo último que veía ahí — de otra conversación, de otro tema, de otro día. La frase
"¿Vienes por el Cojín Moto Viajero 3D, cierto?" no está en el código: la escribió la IA
leyendo mensajes viejos.

Ya había un precedente documentado en ese mismo archivo (17-08: *"el cliente preguntó por
el curso de IDIOMAS y el bot le respondió con el de PIANO"*). Entonces se arregló la rama
en que la búsqueda **acierta**; la rama en que **falla** quedó igual.

### Los dos arreglos

**1. Distinguir "no tengo eso" de "todavía no pidió nada".** Nuevo flag
`mensajeSinProducto` + helper `mensajeNombraProducto()`. No es lo mismo `productSearchFailed`
("pidió un saxofón, no lo manejo") que un cliente que solo saludó: contestarle "no lo
manejo" a alguien que acaba de costar plata en publicidad es peor que no contestar. Cuando
el mensaje no nombra nada, el prompt ahora dice explícitamente: **no supongas que sigue
interesado en el producto anterior**, prohibido abrir con "¿Vienes por X?", y si hay un
anuncio, ese es el tema.

El helper reutiliza `quitarSaludoYCortesias()`, que ya existía — sin eso, "hola" contaba
como palabra específica y el mensaje parecía nombrar un producto.

**2. Que el anuncio dure toda la conversación.** `anuncioDeOrigen()` (agent.ts) miraba
**solo el último mensaje del cliente**: el `return null` estaba dentro del bucle. En cuanto
el cliente escribía por segunda vez ("¿cuánto cuesta?"), el anuncio se perdía para siempre.
Ahora busca hacia atrás entre sus mensajes, con dos frenos para no arrastrar un anuncio
viejo a una visita nueva: máximo 10 mensajes suyos y máximo 24h.

### Pruebas

14 pruebas nuevas, todas en verde:
`__tests__/anuncio-producto.test.ts` (8) y `__tests__/anuncio-memoria.test.ts` (6).
Reproducen el incidente con un catálogo como el real (cojín, contabilidad, piano).

### Lo que quedó SIN cerrar

**No pude confirmar si el `externalAdReply` llegó a guardarse.** La cadena existe entera y
se ve correcta (`extraerContextoDeAnuncio` → `message-handler` lo guarda en `metadata` →
`anuncioDeOrigen` lo lee → se le pega el titular al texto de búsqueda), y está probado que
**con** el titular pegado encuentra el piano. Pero los logs de ese momento se perdieron al
reemplazarse el contenedor a las 19:20 UTC. La conversación sigue en Postgres: mirar el
`metadata` de ese mensaje cierra la pregunta.

**Candidato siguiente, no tocado:** `findBestProductMatch` promete en su comentario de
cabecera que "si ningún producto alcanza Nivel 2 o más, devuelve null", pero el código tiene
un "último recurso" que acepta nivel 1. Es lo que hacen fallar a `Caso 4` y `Caso 5` de
`product-matching.test.ts` desde antes de todo esto (score 25 donde se esperaba ≥50). No lo
cambié acá porque el flag nuevo ya cubre el síntoma reportado y tocar el emparejador afecta
todas las búsquedas.
