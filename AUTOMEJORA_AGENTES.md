# TAREA: Acotar Sofía, darle rails a Atlas y crear auto-mejora curada de agentes

Repo: C:\Users\ADMIN\Videos\Agent-Sales-Bot (monorepo pnpm, ESM, Node 22+, dual SQLite/PG).
Trabajá SOLO en este repo. No rompas lo que ya funciona.

## 0. Leer antes de tocar nada (obligatorio)
- CLAUDE.md
- AGENTS.md
- TRASPASO_2026-09-21.md
- artifacts/api-server/src/lib/motor-nuevo/README.md

Reglas duras que NO podés violar:
- NO agregues capas al motor v1. Si un arreglo es de comportamiento de venta, va en
  artifacts/api-server/src/lib/motor-nuevo/ (herramientas o estado), nunca otra regex/condicional.
- Los hechos (precio, ficha, video, pagos, entrega) los emiten HERRAMIENTAS desde la base;
  el modelo solo redacta la conversación. No dejes que el modelo invente precios/stock/garantías.
- El agente vendedor de WhatsApp NO debe depender de Atlas ni de OpenCode en su camino crítico.
- No introduzcas OpenCode/MCP en el vendedor.
- Definición de terminado: compila + tests del área + un caso de prueba por cada fallo corregido.

## 1. Cambio 1 — Acotar Sofía (archivo: artifacts/api-server/src/lib/agent-templates.ts)

Sofía hoy es "general" y su prompt dice "Manejas TODOS los tipos de productos". Eso la
convierte en un catch-all que derrota la especialización. Convertila en RECEPCIONISTA.

Ubicá el objeto de Sofía (name: "Sofía", agentType: "general"). Reemplazá:
- role: "Directora de Ventas Élite"  ->  "Recepcionista de Ventas"
- su systemPrompt completo por este:

    systemPrompt: `Eres Sofía, recepcionista de ${BRAND}. Tu misión única es recibir al cliente, entender qué busca y pasarlo al especialista correcto. Sos la primera impresión del negocio, no la vendedora final.

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TU MISIÓN (única y clara)
━━━━━━━━━━━━━━━━━━━━━━━━
1. Saludás con calidez y preguntás qué necesita (máximo 2 preguntas).
2. Detectás qué tipo de producto o servicio busca.
3. Si hay un especialista para eso, cedés el turno y lo presentás.
4. Respondés solo preguntas generales: horarios, ubicación, formas de contacto, qué venden en general.

━━━━━━━━━━━━━━━━━━━━━━━━
⛔ LO QUE NO HACÉS (restricciones duras)
━━━━━━━━━━━━━━━━━━━━━━━━
- NO presentás fichas de producto [CARD: ID] ni precios.
- NO cerrás ventas de un producto concreto: eso es del especialista.
- NO entrás a fondo en envíos, suscripciones, cursos ni servicios: derivás.
- No inventás stock, precios, plazos ni promociones.

━━━━━━━━━━━━━━━━━━━━━━━━
✨ CÓMO ESCRIBÍS
━━━━━━━━━━━━━━━━━━━━━━━━
- Mensajes cortos: una idea por bloque, línea en blanco entre bloques.
- 1 a 3 emojis con sentido, sin apilar.
- Cerrá con UNA pregunta que permita derivar bien.
- No abras siempre con "¡Perfecto!" ni "¡Claro!".`,

- y sus stages por estos:

    stages: [
      { key: "greeting", name: "Saludo", prompt: "Saluda con calidez, menciona ${BRAND} y pregunta en qué puedes ayudar (máximo 2 preguntas)." },
      { key: "qualification", name: "Calificación", prompt: "Identifica el tipo de producto o servicio que busca el cliente." },
      { key: "handoff", name: "Derivación", prompt: "Pasa el turno al especialista correcto según lo que busca el cliente." },
      { key: "general", name: "Atención general", prompt: "Responde solo preguntas generales: horarios, ubicación, contacto, qué venden." },
    ],

## 2. Cambio 2 — Rails de seguridad al Arquitecto/Atlas (mismo archivo)

El objeto del "Arquitecto" (name: "Arquitecto", agentType: "architect") dice
"TIENES PODER ABSOLUTO SOBRE TODO EL SISTEMA... Dios del Sistema". NO lo desgloses en
agentes separados (Atlas ES el orquestador por diseño, ver app-operator.ts). En su lugar,
agregale una sección de RESTRICCIONES duras justo DESPUÉS del bloque "## PROPOSITO".
Agregá este texto (adaptalo al formato del prompt existente):

## 🛡️ LÍMITES DUROS (no sos un dios, sos un operador con rieles)

- Solo actuás sobre tareas EXPLÍCITAS que pidió el dueño. Nunca "mejorás solo" por iniciativa propia.
- Toda escritura queda registrada en architect-memory y en el historial de cambios (con revert).
- PROHIBIDO: borrar datos de clientes/conversaciones, tocar credenciales o claves, cambiar métodos de pago.
- Cambiar precios o publicar campañas requiere aprobación explícita del dueño (nunca automático).
- Si un cambio no está 100% claro, preguntás antes de ejecutar.
- Para trabajo pesado o recurrente, DELEGÁS en los sub-agentes que ya existen
  (marketing-team/orchestrator.ts, ad-growth-agent.ts, architect-optimizer.ts),
  no lo hacés todo vos a mano.

## 3. Cambio 3 — Router: traspaso de Sofía (archivo: artifacts/api-server/src/lib/agent-router.ts)

Hoy el routing por tipo de producto (digital vs dropshipping) va ANTES de la continuidad,
pero los especialistas NO digital/físico (services, telecom, courses, b2b, etc.) solo se
alcanzan por keywords, que van DESPUÉS de la continuidad. Resultado: si Sofía atiende un
"hola", se queda toda la conversación aunque el cliente después pida un curso o un servicio.

Agregá, DESPUÉS del bloque de continuidad (conversation.agentId) y ANTES del scoring por
keywords, una regla de traspaso:

- Si el agente dueño de la conversación es de tipo "general" (getAgentType(...) === "general")
  Y el mensaje actual nombra una intención concreta (usá el mismo `mensajeNombraProducto` +
  `findBestProductMatch` que ya se importa dinámicamente, o las keywords de un especialista
  no-digital con confianza alta),
  entonces permití el cambio al especialista que matchee.

Reglas:
- El traspaso exige motivo duro (producto/servicio concreto nombrado), no una palabra suelta.
- No rompas el traspaso digital/físico ya existente ni la continuidad para agentes especializados.
- Añadí un test en artifacts/api-server/src/lib/ (patrón existente) que cubra:
  conversación asignada a "general" + mensaje "quiero el curso de piano" -> deriva al especialista de cursos/digital.

## 4. Cambio 4 — Motor de auto-reflexión curada (archivo NUEVO)

Contexto importante: YA existe infraestructura. Leé antes:
- artifacts/api-server/src/lib/auto-tune.ts (versiones de prompt + rollback + aplica sugerencia)
- artifacts/api-server/src/lib/response-analytics.ts (getStats/getConversionRate; outcome
  incluye 'customer_confused', 'customer_left', 'sale_completed', 'lead_progressed'; sentimentScore)
- artifacts/api-server/src/lib/architect-memory-service.ts (recordLearning / retrieveRelevantMemories)
- artifacts/api-server/src/lib/reentrenar-agente.ts (por qué el auto-aprendizaje viejo FALLÓ)

El auto-aprendizaje anterior ("conversation-learning") inyectaba heurísticas SIN CURAR en el
prompt en cada turno y degradaba al agente (reentrenar-agente.ts lo limpia). NO repitas ese error.

Creá artifacts/api-server/src/lib/auto-reflexion.ts con un motor que:

a) DETECTA errores en segundo plano (no en el turno del cliente). Señales:
   - responseAnalytics.outcome = 'customer_confused' o 'customer_left' (agrupado por agente, últimos N días)
   - sentimentScore bajo
   - conversión baja (getConversionRate)
   Requiere un mínimo de muestras (p.ej. >= 5) antes de opinar; con poca data no hace nada.

b) REFLEXIONA con el LLM (usá getProviderConfig/getProviderConfig + fetch como en
   media-entrante.ts o leer-comprobante.ts; NO introduzcas OpenCode): dado el resumen de la
   señal de error, que devuelva UNA lección concreta y acotada ("qué hacer distinto"), no un
   manifiesto. Pedile JSON con {titulo, leccion, gravedad, accion}.

c) CURA antes de aplicar:
   - Rechaza lecciones vacías, genéricas o que contradigan las reglas de CLAUDE.md
     (p.ej. que sugieran inventar escasez, precios o garantías).
   - Deduplicá contra lecciones ya guardadas (architect_memory, tag 'auto-reflexion').
   - Solo aplica si la gravedad/confianza supera un umbral.

d) APLICA de forma segura y reversible:
   - Guardá la lección en architect_memory con tag 'auto-reflexion' (memoryType 'reflection').
   - Aplicá como un ajuste ADITIVO acotado al systemPrompt del agente usando el patrón de
     auto-tune.ts (saveVersion + update agents.systemPrompt), para poder hacer rollback.
   - Nunca borres el prompt base; solo agregás una sección "MEJORA CONTINUA" pequeña y acotada.

e) EXPONE una función runAutoReflexion(tenantId) y un resumen de lo aplicado (para logs/Atlas).

No lo conectes a ningún cron todavía: dejalo como módulo testeable. Añadí tests (patrón
existente en artifacts/api-server/src/lib/__tests__/) que cubran al menos:
- con poca data -> no hace nada (return sin cambios)
- una lección genérica/prohibida -> se rechaza (no se aplica)
- una lección concreta válida -> se guarda en memoria + se aplica con versión (rollback posible)

## 5. Verificación final (obligatorio)
- pnpm install (si hace falta) en la raíz del monorepo.
- npx tsc --build lib/db (si tocaste schema; si no, saltealo).
- Typecheck del área: cd artifacts/api-server && npx tsc --noEmit  (reportá solo errores NUEVOS
  que introdujiste; el repo tiene errores TS preexistentes que NO debés arreglar).
- Corré los tests del área: pnpm --filter @workspace/api-server test  (o el runner que use;
  fijate en package.json). Añadí los tests de los puntos 3 y 4.
- NO commitees ni pushees. Dejá los cambios listos y reportá un resumen de archivos tocados,
  tests agregados y estado de typecheck/tests.