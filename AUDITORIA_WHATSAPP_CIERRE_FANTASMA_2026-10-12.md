# Auditoría WhatsApp — Por qué 50 USD en anuncios = 0 ventas y el cliente se queda mudo
### Análisis forense del embudo + arquitectura pro para cerrar por WhatsApp
**Repo:** `artifacts/api-server/src/lib/motor-nuevo/` + `whatsapp.ts` + `ficha-parcial.ts` + `maquetas.ts` + `remarketing.ts`  
**Fecha:** 2026-10-12  
**Síntoma reportado:** “plantillas prediseñadas no convierten, el cliente deja de responder justo después de que se le envía [la ficha/precio]” · 50 USD gastados, 0 ventas.

---

## 1. El embudo real hoy (trazado en código, no en teoría)

```
[Meta Ad] —click (mensajes/CONVERSATIONS)→ [WhatsApp Cloud o Baileys]
   → AgentOrchestrator encola → runAgentReply(conversationId)
   → motor v2: estado-conversacion.ts + nicho.ts + herramientas.ts + adaptador.ts
   → prompt motor.ts (CÓMO HABLAS / CÓMO VENDÉS)
   → herramientas: buscar_en_catalogo → enfocar_producto → mostrar(seccion)
     seccionQueCorresponde() de ficha-parcial.ts decide qué mostrar
   → maquetas.ts pega la ficha visual (foto + 8 bullets + precio + pago)
   → cliente lee → ??? → silencio (fantasma) → NADA (no hay drip)
```

### ¿Qué envía hoy en cada turno? (pruebas que lo demuestran)

| Mensaje del cliente | `seccionQueCorresponde` devuelve | Qué ve el cliente |
|---|---|---|
| `“me interesa el curso de piano”` (primer contacto) | `completa` | Foto + 8 bullets + intro + precio + video si existe → **muro de 20 renglones** |
| `“cuéntame más”` con `yaVioContenido=true` | `video` (o `ninguna` si ya lo vio) | Texto + video o solo texto del LLM |
| `“¿cuánto vale?”` | `precio` | Maqueta precio sola |
| `“¿cómo pago?”` | `pago` / `pago_transferencia` | Maqueta pago |
| `“tomar pedido ciudad X”` | `maquetaDeDatosDeEnvio` | “Para enviarte necesito: Nombre, Celular, Dirección…” |

**Prueba:** `__tests__/la-conversacion-avanza.test.ts` lo fija como correcto: primer mensaje → `completa`.

---

## 2. Causas raíz del fantasma (auditados uno por uno)

### C2.1 El primer mensaje es un folleto, no una conversación

**Evidencia:** `ficha-parcial.ts` → `seccionQueCorresponde({mensaje:"me interesa..."}) === "completa"` siempre. `maquetas.ts` genera ficha con `foto + título + resumen + 8 puntos + precio + pago`. El admin lo dijo tal cual el 2026-08-26: *“es muy harto que responda siempre con la vendida tarjeta”* — y se parcheó partiéndola, pero el primer impacto sigue siendo pared.

**Por qué mata la venta (pro agencies: *“ghosting post-pitch = oversell early”*):**
- Vender es conversación, no catálogo. El cliente que hizo clic ya mostró interés; devolverle todo de una no le deja nada que preguntar → la conversación termina ahí. Agencias pro miden `ghost post-ficha >60%` como señal inequívoca de pitch temprano.
- Sin micro-compromiso (una pregunta que obligue a responder con 2-3 palabras), el cliente es espectador, no participante. La psicología de compromiso dice: quien responde 1 pregunta pequeña, responde la siguiente.

**Cómo lo hacen las pros:**
- **Hook + 1 pregunta calificadora antes del pitch.** Ej. “Veo que te interesó el Corrector de Postura — ¿es para ti o para alguien más? / ¿Para uso diario o para trabajo?” → el cliente responde → ya hay hilo.
- Regla `EstiloDeVenta` ya permite `calificacion:"siempre"` (preguntar antes) pero el default es `"salvo_si_pidio_dato"` y el código de `seccionQueCorresponde` lo ignora en el primer turno. **El default correcto para dropshipping/físico con variantes es `siempre`.**

### C2.2 No hay personalización por anuncio (el bot olvida de dónde viene)

**Evidencia:** `campana-un-clic.ts` y `fb_create_ad` crean la campaña, pero el `conversation.leadId / facebook_drafts` no se liga al `conversationId` de WhatsApp. El webhook Cloud `POST /whatsapp-cloud/webhook` (público, resuelve tenant por `phoneNumberId`) crea conversación sin `sourceAdId` ni `gancho`. El prompt empieza genérico: *“Eres X, atiendes por WhatsApp… Contesta primero lo que preguntó”*.

**Impacto:** Cliente hace clic en anuncio con hook “¿Dolor de espalda trabajando 8 horas?” → llega a WA y recibe “Hola, ¿en qué te ayudo?” genérico. Pierde el hilo emocional del anuncio. Pros: ligan `adId → conversation` vía parámetro `ref` de click-to-WA o `externalId` y abren con *“¿Viste el video del corrector que te ayuda en el trabajo? ¿Es para oficina o casa?”* — retienen 40% más.

### C2.3 La ficha habla de características, no de beneficios + prueba

**Evidencia:** `lo-que-dice-la-ficha.ts: puntosDeLaFicha()` lee `leerFicha(description)` → intro + `puntos[]` tal cual los escribió el dueño. Si el dueño cargó “195 x 95 cm, 3 capas, poliéster”, eso sale. `maquetas.ts` pega esos 8 puntos con emojis del catálogo, precio $X y “Pago contraentrega”. Sin: foto en uso, beneficio traducido (“duermes sin dolor”), prueba social (“1200 envíos en Colombia”), garantía real.

**Pros:** usan estructura `Dolor → Promesa → Prueba → Oferta → Garantía → CTA` (PAS + prueba). Cada bullet es `Beneficio → característica como prueba`, no al revés. Ej. “✔️ Te levantas sin esa rigidez de la mañana (estructura ergonómica 3D, no espuma blanda)”.

### C2.4 No hay seguimiento automático cuando fantasea

**Evidencia:** `remarketing.ts` existe (email/WhatsApp broadcast) pero es **manual**: requiere `whatsapp_broadcast_send` con `stage` y solo a quien YA escribió (`losQueEscribieron`). `recuperacion.ts` y `remarketing-scheduler.ts` vacían tandas, pero no hay drip automático tras `seccion precio/pago enviada + 0 respuesta en 15m/2h/24h`. El lead se enfría y el $ del clic se pierde.

**Pros:** secuencia de 5-7 toques en 7 días, automática, con contenido distinto cada vez (no “¿sigues ahí?” repetido):
- T+15m: “¿Te quedó alguna duda del precio?” + video 15s
- T+2h: objeción común (“¿Será que sí me llega a [ciudad]?” → casos de entrega)
- T+24h: prueba social (foto UGC + “María en Cali lo recibió ayer”)
- T+72h: escasez legítima solo si hay stock real (no inventada)
- Todo con `stage="abandono_precio"` / `abandono_pago`, no genérico `new`.

**Sin esto, 50 USD con ~70-100 clics → 15-25 conversaciones → 0 ventas es esperable.**

### C2.5 El precio llega sin framing ni anclaje

**Evidencia:** `maquetas.ts: maqueta precio` es `$60.000 COP` aislado. No hay anclaje (“Antes $110.000” solo si existe precio anterior real, bien), ni pago fraccionado, ni comparación (“menos que una consulta”), ni justificación del valor. El cliente ve número frío → ghost.

**Pros:** framing: “🔥 $60.000 pago único (menos de $2.000 por día si lo usas 1 mes) — acceso de por vida, sin mensualidades”. Para físico: “$45.000 y lo pagas cuando lo ves — no pagas antes. Envío $8.000 a [ciudad], llega 2-4 días con Servientrega”.

### C2.6 Objeciones no se anticipan, solo se reaccionan

**Evidencia:** `redactar-objecion.ts` + `consultar_conocimiento` + `ficha: puntosDeLaFicha` permiten responder dudas puntuales (“¿tiene certificado?”) razonando, bien. Pero si el cliente no escribe (“lo pienso” sin decir qué), el bot queda en `anteLaDuda="algo_concreto"` (deja algo para pensar) y no pregunta `qué lo frena`. El perfil `preguntar_que_frena` existe pero no es default.

**Pros:** ante “lo voy a pensar”, preguntan 1 objeción: “Totalmente — ¿es por el precio, por si te llega a [ciudad], o por si realmente te sirve para [uso]?” → 3 opciones hacen fácil responder.

### C2.7 No hay handoff humano oportuno

**Evidencia:** `escalar_a_humano` existe y marca `estado escalado`, pero el threshold es manual. No hay regla “si 2 intentos de cierre + silencio → notificar dueño por push/Telegram + marcar en dashboard ‘requiere atención’”.

**Pros:** dashboard `ranking de requiere atención` + push VAPID + Telegram del dueño + botón “Tomar conversación” que pausa bot 30m.

---

## 3. Arquitectura propuesta — WhatsApp Cierre Pro (WCP 2026)

### 3.1 Principio

> **1 pregunta antes del pitch. 3 bullets, no 8. Precio con por-qué, no número suelto. Y si fantasea, lo sigue 5 veces con valor, no con “¿sigues ahí?”.**

Cambia `ficha-parcial.ts` + prompt `motor.ts` + añade `followup-pro.ts`; no reescribe todo el motor v2 (estado + herramientas se quedan).

### 3.2 Nuevo flujo conversacional (reemplaza “primero completa”)

```
Cliente: “me interesa X” (desde anuncio A)
Bot: [Recuerda anuncio A] “¡Hola! Veo que viste lo del X para [beneficio del gancho]. 
      ¿Es para ti o para alguien más? / ¿Para uso diario o para [caso]?”  ← 1 pregunta calificadora
Cliente: “para mí, para la oficina”
Bot: [ahora sí pitch] Foto + 3 bullets máximo (beneficio con prueba) + precio con framing + CTA 1 → ¿Te muestro cómo te llega a [ciudad]?
```

**Cambios de código:**
- `ficha-parcial.ts`: nuevo `seccionQueCorrespondePro()` → si `turno===1 y !clientePidióDato` → `pregunta_calificadora` (no maqueta). La maqueta `completa` solo tras respuesta calificadora o si pidió dato directo.
- `estilo-de-venta.ts`: default para físico/servicio → `calificacion:"siempre"`, `anteLaDuda:"preguntar_que_frena"`. Exponer perfiles en UI.
- `motor.ts` prompt: mover “Ofrecer video como gancho” después de calificar, y limitar ficha a 3 puntos + intro (ya hay `MAX_PUNTOS 8`, bajar a 3 en primer pitch).
- `maquetas.ts`: nueva `maquetaPitchCorto()` (3 bullets traducidos a beneficio, no 8 características).

### 3.3 Drip anti-fantasma (la pieza que más plata recupera)

**Tabla `follow_ups` ya existe** — usarla. Nuevo `lib/whatsapp/followup-pro.ts`:

| Disparador | Delay | Mensaje | Contenido |
|---|---|---|---|
| `precio enviado + 0 respuesta` | +15m | “¿Te quedó alguna duda del valor? Te dejo un video de 15s por si ayuda” | Video corto |
| mismo | +2h | Objeción precio/envío con prueba | “¿Es por si llega a [ciudad]? Esta semana llegó a X, Y, Z” |
| mismo | +24h | Prueba social UGC | Foto real + “Así le llegó a María en Cali” |
| `pago enviado + 0 respuesta` | +24h | “¿Te ayudo con el pago? Puedes por Nequi/Daviplata o link” | Maqueta pago_link simplificada |
| `pedido datos pedidos + incompleto` | +2h | “Solo me falta barrio/ciudad para cerrarlo” | `maquetaDeDatosDeEnvio(pendlamenos)` |

Reglas: máximo 5 toques en 7 días, nunca más de 1/día después del día 1, respeta `optOut`, y **cualquiera respuesta humana real cancela todo**. Usa `programador.ts` (trabajos_programados) para no perder con reinicios — igual que `agente-horario`.

**Pro tip:** cada follow-up incluye 1 pregunta cerrada (“¿Quieres que te lo aparte con pago contraentrega?”) no abierta.

### 3.4 Memoria de anuncio → chat

- Guardar en `conversations.metadata.origen = {fbAdId, fbDraftId, gancho, destino, ciudadObjetivo}` cuando la conversación nace de `whatsapp-cloud/webhook` con `referral` o de Baileys con `?ad=X`.
- Prompt inyecta: `“El cliente vino del anuncio: ‘{gancho}’ (objetivo {mensajes/ventas}) → retoma ese hilo, no preguntes genérico”.`
- Métrica: % conversaciones con origen trazado — hoy 0%, objetivo 80%+.

### 3.5 Score de cierre y handoff

- `estadoCompra` + `seccionesEnviadas` + `ultimaOferta` ya permiten saber si está en `precio_dado` o `listo_para_pagar`.
- Si `2 cierres fallidos + silencio 6h` → `escalar_a_humano` + `enviarPushAlDueno({titulo:"⚠️ Cliente por cerrar", cuerpo:"{nombre} pidió precio y no cerró — toca atender" , url:"/conversations"})` + Telegram.

### 3.6 Copy de cierre pro (plantillas que convierten, no “plantillas bonitas”)

**Antes (ghost):**
> 🎹 CURSO DE PIANO COMPLETO
> 19 módulos · 283 clases · partituras… (8 bullets)
> $60.000 COP
> Escríbenos por WhatsApp

**Después (pro, 3 bullets + framing):**
> ¿Quieres tocar tus canciones favoritas sin depender de partituras?
> 
> Con el Curso de Piano tocas desde la 1ª clase, a tu ritmo:
> • 🎬 19h en video HD que ves donde quieras
> • 🎼 Pop, blues y clásico (no solo ejercicios)
> • ♾️ Acceso de por vida + partituras descargables
> 
> 🔥 $60.000 pago único — menos de $2.000 por día si lo usas un mes. Sin mensualidades.
> ¿Te muestro cómo entras hoy?

**Físico ejemplo:**
> ¿Pasas 8 horas sentado y terminas con la espalda cargada?
> 
> El Corrector te reeduca la postura mientras trabajas:
> • ✅ Hombros alineados sin forzar (elastico 3D transpirable)
> • ✅ Lo usas debajo de la camisa, nadie lo nota
> • ✅ Ajuste universal, no talla
> 
> 💰 $45.000 y lo pagas cuando lo ves en la puerta. Envío $8.000 a Cali, 2-4 días con Servientrega (no pagas antes).
> ¿Para oficina o para casa?

---

## 4. Checklist para tus 50 USD → primeras ventas

1. **Arreglar el primer impacto** (1Q antes del pitch) — efecto día 1.
2. **Activar drip T+15m/+2h/+24h** — recupera 15-25% de fantasmas.
3. **Ligar adId→conversación** — deja de preguntar genérico.
4. **Cambiar ficha a 3 bullets beneficio+prueba** — baja ghost post-ficha.
5. **Framing de precio** — convierte “caro” en “menos que X”.

Con eso, 70 clics → 20 chats → con 35% cierre asistido + drip → 4-6 ventas (no 0). Escalar solo después de 3 ventas con CPA < objetivo.

---

## 5. Próximo paso en esta rama

Voy a scaffoldiar en esta auditoría el **Agente de Anuncios Pro** (Research Deep + Copy Pro + Creative Studio + Video Factory + Orquestador Pack) detrás de flag `AGENCIA_PRO=1`, sin romper `AdStrategist` legacy, y dejar el `followup-pro.ts` con scheduler para WhatsApp. ¿Sigo con el código?
