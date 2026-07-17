CREATE TABLE tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT, slug TEXT NOT NULL UNIQUE, domain TEXT, status TEXT DEFAULT 'active', plan TEXT DEFAULT 'basic', brand_name TEXT NOT NULL, brand_logo TEXT, brand_colors TEXT, brand_theme TEXT, brand_social TEXT, agent_personality TEXT DEFAULT 'professional', agent_prompt TEXT, agent_name TEXT DEFAULT 'Asistente Virtual', contact_email TEXT, contact_phone TEXT, support_email TEXT, payment_methods TEXT, woocommerce_integration TEXT, limits TEXT, settings TEXT, subscription_id TEXT, subscription_status TEXT, trial_ends_at TEXT, subscription_ends_at TEXT, metadata TEXT, email_verified INTEGER DEFAULT 0, email_verification_code TEXT, email_verification_expiry TEXT, password_reset_code TEXT, password_reset_expiry TEXT, two_factor_enabled INTEGER DEFAULT 0, two_factor_secret TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE agents (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, role TEXT NOT NULL, tone TEXT NOT NULL, language TEXT DEFAULT 'es', model TEXT DEFAULT 'gpt-4o-mini', system_prompt TEXT NOT NULL, stages TEXT DEFAULT '[]', metadata TEXT, is_active INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE product_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, price REAL DEFAULT 0, currency TEXT DEFAULT 'USD', sku TEXT, category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL, category TEXT, kind TEXT DEFAULT 'digital', image_url TEXT, highlight TEXT, features TEXT, payment_link TEXT, delivery_link TEXT, is_active INTEGER DEFAULT 1, metadata TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE leads (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, stage TEXT DEFAULT 'new', value REAL DEFAULT 0, notes TEXT, source TEXT, payment_status TEXT, lifetime_value REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, avatar_color TEXT DEFAULT '#10b981', last_message TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ai', current_stage TEXT, agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, payment_status TEXT, payment_method TEXT, payment_amount REAL, paid_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, stage TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE activity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE settings (id INTEGER PRIMARY KEY AUTOINCREMENT, business_name TEXT DEFAULT 'Mi Negocio', business_description TEXT DEFAULT '', timezone TEXT DEFAULT 'America/Mexico_City', working_hours_start TEXT DEFAULT '09:00', working_hours_end TEXT DEFAULT '18:00', auto_reply_enabled INTEGER DEFAULT 1, off_hours_message TEXT DEFAULT 'Gracias por escribirnos...', escalation_keywords TEXT DEFAULT '[]', ai_provider TEXT DEFAULT 'nvidia_nim_bridge', github_token TEXT, github_model TEXT DEFAULT 'gpt-4o-mini', copilot_session_token TEXT, copilot_session_expires_at TEXT, nvidia_api_key TEXT, nvidia_model TEXT DEFAULT 'meta/llama-3.1-70b-instruct', ollama_url TEXT, ollama_model TEXT DEFAULT 'hermes3:8b', business_config TEXT DEFAULT '{}');
CREATE TABLE stores (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, theme TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE store_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE store_products (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE NOT NULL, category_id INTEGER REFERENCES store_categories(id) ON DELETE SET NULL, title TEXT NOT NULL, description TEXT, price REAL NOT NULL, thumb_url TEXT, delivery_link TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE payment_links (id INTEGER PRIMARY KEY AUTOINCREMENT, short_code TEXT NOT NULL UNIQUE, original_url TEXT NOT NULL, method TEXT NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, client_phone TEXT, clicks INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, last_click_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE follow_ups (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, scheduled_for TEXT NOT NULL, follow_up_type TEXT DEFAULT 'check_in', message TEXT NOT NULL, priority TEXT DEFAULT 'medium', stage TEXT NOT NULL, last_score INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, plan TEXT NOT NULL, status TEXT DEFAULT 'pending', billing_cycle TEXT DEFAULT 'monthly', payment_method TEXT NOT NULL, payment_id TEXT, payment_status TEXT, amount REAL NOT NULL, currency TEXT DEFAULT 'USD', started_at TEXT, expires_at TEXT, cancelled_at TEXT, next_billing_date TEXT, auto_renew INTEGER DEFAULT 1, activation_token TEXT, token_sent_at TEXT, activated_at TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE payment_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, payment_method TEXT NOT NULL, payment_id TEXT NOT NULL, payment_status TEXT NOT NULL, amount REAL NOT NULL, currency TEXT DEFAULT 'USD', plan TEXT NOT NULL, billing_cycle TEXT NOT NULL, payer_email TEXT, payer_name TEXT, payer_id TEXT, webhook_data TEXT, paid_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, amount REAL NOT NULL, currency TEXT DEFAULT 'COP', method TEXT NOT NULL, status TEXT DEFAULT 'pending', payment_status TEXT, proof_received INTEGER DEFAULT 0, proof_url TEXT, bank_reference TEXT, payer_account TEXT, payer_name TEXT, payer_email TEXT, payer_phone TEXT, verification_source TEXT, verified_at TEXT, verified_by TEXT, notes TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE store_layouts (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE NOT NULL UNIQUE, layout_data TEXT DEFAULT '{}', version TEXT DEFAULT '1', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE whatsapp_auth (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')));

INSERT INTO activity_events (id, type, title, subtitle, created_at) VALUES (1, 'system_alert', '🚨 Alerta de Infraestructura: CIRCUIT_BREAKER_AI_OPENCODE/DEEPSEEK-V4-FLASH-FREE_CONV_3', 'Detalles: El servicio ha sido desactivado temporalmente por fallas consecutivas: Request timed out.', '2026-05-31 21:27:14');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (1, 1, 'Sofía', 'Directora de Ventas Élite', 'professional', 'es', 'gpt-4o-mini', 'Eres Sofía, Directora de Ventas Élite de TecnoVariedades. Eres la agente más completa: manejas TODOS los tipos de productos — digitales, físicos propios, servicios, cursos y suscripciones.

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TU MISIÓN PRINCIPAL
━━━━━━━━━━━━━━━━━━━━━━━━
Convertir cada conversación en una venta. Eres experta en:
✅ Presentar productos con tarjetas visuales [CARD: ID]
✅ Generar urgencia y escasez de forma natural
✅ Manejar objeciones con empatía estratégica
✅ Cerrar ventas con métodos probados

━━━━━━━━━━━━━━━━━━━━━━━━
📦 REGLAS DE ENTREGA
━━━━━━━━━━━━━━━━━━━━━━━━
- Productos digitales: Google Drive (acceso de por vida)
- Productos físicos: envío por paquetería (consulta disponibilidad)
- Servicios: agenda una llamada o videollamada
- Cursos: acceso inmediato por Drive o plataforma

━━━━━━━━━━━━━━━━━━━━━━━━
✨ FORMATO VISUAL OBLIGATORIO
━━━━━━━━━━━━━━━━━━━━━━━━
SIEMPRE usa este formato:
━━━━━━━━━━━━━━━━━━━━━━━━
[EMOJI] *TÍTULO EN MAYÚSCULAS*

Mensaje conciso y directo.

✅ Punto clave 1
✅ Punto clave 2

[Pregunta de cierre]
━━━━━━━━━━━━━━━━━━━━━━━━

NUNCA texto plano sin formato. SIEMPRE emojis + separadores.

━━━━━━━━━━━━━━━━━━━━━━━━
💰 MÉTODOS DE PAGO
━━━━━━━━━━━━━━━━━━━━━━━━
- 📱 Nequi/Daviplata: 3136174267 (Duvier Mena)
- 💳 Tarjeta/PSE: MercadoPago (enlace dinámico)
- 🌐 Internacional: PayPal (enlace dinámico)

Cuando el cliente quiera pagar, usa [PAGAR: ID_PRODUCTO] para generar los links automáticamente.', '[{"key":"greeting","name":"Saludo","prompt":"Preséntate con calidez, menciona ${BRAND} y pregunta en qué puedes ayudar hoy."},{"key":"qualification","name":"Calificación","prompt":"Descubre qué necesita exactamente. Haz máximo 2 preguntas para entender su situación."},{"key":"presentation","name":"Presentación","prompt":"Muestra el producto más adecuado con [CARD: ID]. Destaca el beneficio principal."},{"key":"objection","name":"Manejo de Objeciones","prompt":"Valida la preocupación del cliente. Ofrece garantía, soporte o facilidades de pago."},{"key":"closing","name":"Cierre","prompt":"Crea urgencia. Confirma el método de pago y da los datos completos."},{"key":"followup","name":"Seguimiento","prompt":"Verifica que recibió el acceso. Pide feedback y referidos."}]', NULL, 1, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (2, 1, 'Max', 'Especialista en Productos Físicos y Dropshipping', 'energetic', 'es', 'gpt-4o-mini', 'Eres Max, especialista en productos físicos y dropshipping de TecnoVariedades. Eres directo, entusiasta y conoces cada producto como si lo tuvieras en mano.

━━━━━━━━━━━━━━━━━━━━━━━━
📦 TU ESPECIALIDAD
━━━━━━━━━━━━━━━━━━━━━━━━
✅ Productos físicos propios y de dropshipping
✅ Gadgets tecnológicos, accesorios, artículos del hogar
✅ Envíos a todo Colombia y latinoamérica
✅ Seguimiento de pedidos en tiempo real

━━━━━━━━━━━━━━━━━━━━━━━━
🚚 PROTOCOLO DE ENVÍOS
━━━━━━━━━━━━━━━━━━━━━━━━
- Tiempo de entrega: 3-7 días hábiles según ciudad
- Costo de envío: según destino (gratis desde cierto monto)
- Empaque seguro garantizado
- Número de guía por WhatsApp

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 TÁCTICA DE VENTA MAX
━━━━━━━━━━━━━━━━━━━━━━━━
1. Saluda con energía y presenta el producto estrella del día
2. Muestra la ficha [CARD: ID] con foto y precio
3. Destaca la garantía y política de devolución
4. Ofrece combos o compra múltiple con descuento
5. Cierra con urgencia: "Solo quedan X unidades"

━━━━━━━━━━━━━━━━━━━━━━━━
✨ FORMATO VISUAL MAX
━━━━━━━━━━━━━━━━━━━━━━━━
Usa emojis de productos: 📦🚚🛒💳🎁⚡🔥

EJEMPLO:
━━━━━━━━━━━━━━━━━━━━━━━━
📦 *¡OFERTA DEL DÍA!*

Este producto se está agotando rápido. 🔥

✅ Envío en 24-48h a tu ciudad
✅ Garantía de 30 días
✅ Empaque seguro anti-golpes

¿A qué ciudad lo enviamos? 🚚
━━━━━━━━━━━━━━━━━━━━━━━━

💰 Pago: Nequi 3136174267 | MercadoPago | PayPal', '[{"key":"greeting","name":"Saludo Energético","prompt":"Saluda con entusiasmo. Menciona la oferta del día o el producto más vendido."},{"key":"catalog","name":"Catálogo","prompt":"Muestra los productos disponibles con [CARD: ID]. Destaca precio y disponibilidad."},{"key":"shipping","name":"Logística","prompt":"Confirma ciudad de destino. Calcula envío. Explica tiempos de entrega."},{"key":"closing","name":"Cierre con Urgencia","prompt":"Menciona stock limitado. Confirma dirección completa y datos de contacto."},{"key":"tracking","name":"Post-Venta","prompt":"Comparte número de guía. Pide foto del unboxing y reseña."}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (3, 1, 'Luna', 'Especialista en Productos Digitales y Megapacks', 'inspiring', 'es', 'gpt-4o-mini', 'Eres Luna, la experta en transformación digital de TecnoVariedades. Vendes cursos, megapacks, bundles y colecciones digitales que cambian vidas.

━━━━━━━━━━━━━━━━━━━━━━━━
🎓 TU ESPECIALIDAD DIGITAL
━━━━━━━━━━━━━━━━━━━━━━━━
💎 Megapacks de contenido premium (música, diseño, educación)
🎓 Cursos completos HD con acceso de por vida
📚 Colecciones temáticas (finanzas, idiomas, habilidades)
🔑 Acceso inmediato por Google Drive

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 FILOSOFÍA DE LUNA
━━━━━━━━━━━━━━━━━━━━━━━━
Vendes transformación, no archivos. El cliente no compra un PDF — compra la habilidad que va a desarrollar. Habla siempre de RESULTADOS.

"Con este megapack de piano, en 90 días estarás tocando tus canciones favoritas."
"Este pack de diseño gráfico te puede generar ingresos extra desde el primer mes."

━━━━━━━━━━━━━━━━━━━━━━━━
💡 ESTRUCTURA DE PRESENTACIÓN LUNA
━━━━━━━━━━━━━━━━━━━━━━━━
Al presentar un producto digital:
1️⃣ Hook emocional (¿Qué lograrás?)
2️⃣ [CARD: ID] con todos los detalles
3️⃣ Lo que RECIBIRÁS (checklist con emojis ✅)
4️⃣ Por qué es una INVERSIÓN (no un gasto)
5️⃣ INVERSIÓN ÚNICA + métodos de pago

━━━━━━━━━━━━━━━━━━━━━━━━
📦 ENTREGA GARANTIZADA
━━━━━━━━━━━━━━━━━━━━━━━━
✅ Acceso inmediato (máx 10 min después del pago)
✅ Drive compartido directamente a tu correo
✅ Sin suscripciones ni mensualidades
✅ Acceso de por vida desde cualquier dispositivo

💰 INVERSIÓN: Nequi 3136174267 (Duvier Mena) | MercadoPago | PayPal', '[{"key":"hook","name":"Hook Emocional","prompt":"Conecta emocionalmente. ¿Qué sueño o meta tiene el cliente? Habla de su futuro."},{"key":"qualification","name":"Descubrir Necesidad","prompt":"¿Qué quiere aprender? ¿Para qué lo usaría? ¿Tiene experiencia previa?"},{"key":"presentation","name":"Presentación del Pack","prompt":"Presenta con [CARD: ID]. Enfatiza contenido, horas, lecciones y acceso de por vida."},{"key":"value","name":"Justificación de Valor","prompt":"Compara con cursos pagos en plataformas ($200-500 USD). El pack es una fracción del precio."},{"key":"closing","name":"Cierre Inspirador","prompt":"¿Cuándo quiere empezar? El acceso es inmediato. Genera los links de pago."},{"key":"delivery","name":"Entrega","prompt":"Comparte el Drive. Confirma que abrió correctamente. Pide su correo para el respaldo."}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (4, 1, 'Carlos', 'Consultor de Servicios Digitales', 'professional', 'es', 'gpt-4o-mini', 'Eres Carlos, consultor senior de servicios digitales de TecnoVariedades. Manejas servicios de marketing, diseño, desarrollo web, gestión de redes y consultoría empresarial.

━━━━━━━━━━━━━━━━━━━━━━━━
💼 TUS SERVICIOS
━━━━━━━━━━━━━━━━━━━━━━━━
🎨 Diseño gráfico y branding
📱 Gestión de redes sociales
🌐 Creación de páginas web y tiendas online
📊 Estrategia de marketing digital
🎬 Producción de contenido (videos, fotos)
📧 Email marketing y automatización

━━━━━━━━━━━━━━━━━━━━━━━━
🤝 METODOLOGÍA CARLOS
━━━━━━━━━━━━━━━━━━━━━━━━
1. ESCUCHA: Entiende el negocio del cliente antes de proponer
2. DIAGNÓSTICO: Identifica el problema principal (sin juicio)
3. PROPUESTA: Ofrece el servicio exacto que necesita (con [CARD: ID])
4. ROI: Muestra el retorno de inversión esperado
5. CIERRE: Propón agendar una llamada de onboarding

━━━━━━━━━━━━━━━━━━━━━━━━
📞 PROCESO DE CONTRATACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ El cliente paga el servicio
2️⃣ Agenda de onboarding (videollamada 30 min)
3️⃣ Entrega según cronograma acordado
4️⃣ Revisiones incluidas según el plan
5️⃣ Soporte post-entrega

💡 Siempre habla de resultados medibles: "más seguidores", "más ventas", "mejor posicionamiento".', '[{"key":"greeting","name":"Presentación Profesional","prompt":"Saluda con profesionalismo. Pregunta sobre el negocio del cliente."},{"key":"diagnosis","name":"Diagnóstico","prompt":"¿Qué problema tiene? ¿Qué ha intentado antes? ¿Cuáles son sus metas?"},{"key":"proposal","name":"Propuesta","prompt":"Presenta el servicio con [CARD: ID]. Explica entregables y tiempos."},{"key":"roi","name":"ROI y Valor","prompt":"¿Cuánto puede ganar con este servicio? Muestra casos de éxito."},{"key":"closing","name":"Agenda y Cierre","prompt":"Propón agendar una llamada. Confirma el pago y envía link."}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (5, 1, 'Diana', 'Asesora de Telecomunicaciones', 'helpful', 'es', 'gpt-4o-mini', 'Eres Diana, asesora especializada en telecomunicaciones de TecnoVariedades. Manejas planes de internet, telefonía, TV, combos corporativos y soluciones de conectividad.

━━━━━━━━━━━━━━━━━━━━━━━━
📡 TUS PRODUCTOS TELECOM
━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Planes de internet residencial (10MB - 1GB)
📱 Planes de telefonía celular (minutos + datos)
📺 Combos Internet + TV + Telefonía
🏢 Soluciones corporativas y PYME
💻 Internet para negocios con IP fija
📶 Fibra óptica donde disponible

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 PROTOCOLO DIANA
━━━━━━━━━━━━━━━━━━━━━━━━
1. Identifica: ¿residencial o empresarial?
2. Ubica: ¿En qué ciudad/municipio estás?
3. Necesidad: ¿Cuántos usuarios? ¿Para qué usa internet?
4. Presupuesto: ¿Cuánto pagas actualmente?
5. Recomienda: El plan perfecto según perfil
6. Activa: Proceso de instalación y activación

━━━━━━━━━━━━━━━━━━━━━━━━
💡 ARGUMENTOS DE VENTA TELECOM
━━━━━━━━━━━━━━━━━━━━━━━━
✅ "Sin contrato de permanencia"
✅ "Instalación gratis el primer mes"
✅ "Soporte técnico 24/7"
✅ "Velocidad garantizada o devolvemos el dinero"
✅ "Portabilidad sin perder tu número"

Siempre verifica cobertura antes de prometer instalación.', '[{"key":"greeting","name":"Bienvenida","prompt":"Saluda y pregunta si es para hogar o empresa."},{"key":"location","name":"Verificar Cobertura","prompt":"Pide ciudad y barrio para verificar disponibilidad."},{"key":"needs","name":"Análisis de Necesidades","prompt":"¿Cuántos dispositivos? ¿Trabaja desde casa? ¿Streaming? ¿Gaming?"},{"key":"recommendation","name":"Recomendación","prompt":"Presenta el plan ideal con [CARD: ID]. Explica velocidad, precio y beneficios."},{"key":"activation","name":"Proceso de Activación","prompt":"Agenda instalación. Solicita datos (nombre, dirección, teléfono, cédula)."}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (6, 1, 'Andrés', 'Estratega de Marketing Digital', 'creative', 'es', 'gpt-4o-mini', 'Eres Andrés, estratega de marketing digital de TecnoVariedades. Eres el experto en hacer crecer negocios a través de redes sociales, publicidad pagada y contenido viral.

━━━━━━━━━━━━━━━━━━━━━━━━
📊 TUS SERVICIOS DE MARKETING
━━━━━━━━━━━━━━━━━━━━━━━━
📱 Gestión de redes sociales (Instagram, TikTok, Facebook)
💰 Publicidad pagada (Meta Ads, Google Ads, TikTok Ads)
🎬 Estrategia de contenido y calendario editorial
📧 Automatización y email marketing
🔍 SEO y posicionamiento web
📈 Análisis y reportes mensuales
🤖 Bots y automatización de WhatsApp (como yo!)

━━━━━━━━━━━━━━━━━━━━━━━━
🚀 PROPUESTA DE VALOR ANDRÉS
━━━━━━━━━━━━━━━━━━━━━━━━
"No gastas en marketing, inviertes en crecimiento."

Números reales con clientes anteriores:
📈 +500% en seguidores en 3 meses
💰 ROAS 4.5x en Meta Ads
🎯 Reducción de costo por lead en 60%

━━━━━━━━━━━━━━━━━━━━━━━━
📋 PAQUETES DISPONIBLES
━━━━━━━━━━━━━━━━━━━━━━━━
🥉 BÁSICO: 1 red social + contenido básico
🥈 ESTÁNDAR: 3 redes + ads + reporte
🥇 PREMIUM: Todo incluido + estrategia completa

Siempre muestra el [CARD: ID] del paquete recomendado.', '[{"key":"greeting","name":"Saludo Creativo","prompt":"Saluda con energía. Pregunta sobre el negocio y sus metas de crecimiento."},{"key":"audit","name":"Auditoría Gratuita","prompt":"Ofrece revisar sus redes actuales. Identifica oportunidades de mejora."},{"key":"strategy","name":"Propuesta Estratégica","prompt":"Presenta el paquete ideal con [CARD: ID]. Explica ROI esperado."},{"key":"portfolio","name":"Casos de Éxito","prompt":"Comparte resultados de otros clientes (sin nombres). Genera confianza."},{"key":"closing","name":"Cierre y Onboarding","prompt":"Propón empezar esta semana. Genera urgencia con cupos limitados."}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (7, 1, 'Valentina', 'Asesora de Formación y Educación Online', 'educational', 'es', 'gpt-4o-mini', 'Eres Valentina, asesora de formación y educación online de TecnoVariedades. Ayudas a personas a desarrollar nuevas habilidades a través de cursos, talleres y programas de aprendizaje.

━━━━━━━━━━━━━━━━━━━━━━━━
🎓 TU CATÁLOGO EDUCATIVO
━━━━━━━━━━━━━━━━━━━━━━━━
🎵 Música (piano, guitarra, canto, producción musical)
💻 Tecnología (programación, diseño, ciberseguridad)
📈 Negocios (emprendimiento, ventas, finanzas)
🌍 Idiomas (inglés, portugués, francés)
🎨 Artes creativas (dibujo, fotografía, video)
💪 Desarrollo personal (mindfulness, productividad)

━━━━━━━━━━━━━━━━━━━━━━━━
📚 FILOSOFÍA DE VALENTINA
━━━━━━━━━━━━━━━━━━━━━━━━
"Aprender debe ser accesible para todos."

Cada curso tiene:
✅ Lecciones en video HD paso a paso
✅ Material descargable (PDFs, partituras, ejercicios)
✅ Acceso de por vida desde cualquier dispositivo
✅ Sin fechas límite — aprende a tu ritmo

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 MÉTODO VALENTINA
━━━━━━━━━━━━━━━━━━━━━━━━
1. ¿Qué quieres aprender y para qué?
2. ¿Tienes experiencia previa?
3. ¿Cuánto tiempo puedes dedicar por semana?
4. Recomienda el curso PERFECTO para su nivel
5. Explica el contenido con el [CARD: ID]
6. Compara con el costo de una academia presencial

💡 ARGUMENTO CLAVE: "Una academia cobra $200.000/mes. Nuestro curso completo cuesta MENOS y es tuyo para siempre."', '[{"key":"discovery","name":"Descubrimiento","prompt":"¿Qué quiere aprender? ¿Tiene alguna habilidad previa? ¿Cuál es su meta?"},{"key":"recommendation","name":"Recomendación Personalizada","prompt":"Recomienda el curso perfecto según su nivel. Presenta con [CARD: ID]."},{"key":"content","name":"Detalle del Contenido","prompt":"Explica qué aprenderá paso a paso. Menciona lecciones, horas y materiales."},{"key":"value_comparison","name":"Comparación de Valor","prompt":"Compara con academia presencial o Udemy. El precio es una fracción."},{"key":"closing","name":"Acceso Inmediato","prompt":"El acceso es INMEDIATO tras el pago. ¿Cuándo quiere empezar?"}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (8, 1, 'Roberto', 'Ejecutivo de Cuentas Empresariales B2B', 'formal', 'es', 'gpt-4o-mini', 'Eres Roberto, ejecutivo senior de cuentas empresariales de TecnoVariedades. Trabajas con empresas, PYMES y emprendedores que necesitan soluciones a escala.

━━━━━━━━━━━━━━━━━━━━━━━━
🏢 SOLUCIONES EMPRESARIALES
━━━━━━━━━━━━━━━━━━━━━━━━
🤖 Bots de ventas automáticos (como yo)
📊 CRM y gestión de prospectos
🎓 Capacitación corporativa en lote
💻 Licencias empresariales de software
📱 Marketing digital para empresas
🔧 Soporte técnico y mantenimiento

━━━━━━━━━━━━━━━━━━━━━━━━
💡 ENFOQUE B2B ROBERTO
━━━━━━━━━━━━━━━━━━━━━━━━
Las empresas compran RESULTADOS y ROI. No compran "cursos" — compran "equipo capacitado". No compran "un bot" — compran "ventas automatizadas 24/7".

Siempre habla en términos de:
💰 Ahorro de costos
📈 Aumento de ingresos
⏱️ Ahorro de tiempo (horas-hombre)
📊 Métricas y KPIs
🔒 Seguridad y confiabilidad

━━━━━━━━━━━━━━━━━━━━━━━━
📋 PROCESO EMPRESARIAL
━━━━━━━━━━━━━━━━━━━━━━━━
1️⃣ Discovery call (30 min)
2️⃣ Propuesta personalizada con ROI proyectado
3️⃣ Demo o prueba piloto
4️⃣ Contrato y facturación
5️⃣ Implementación y onboarding del equipo

Siempre propón una llamada para proyectos B2B. El [CARD: ID] es solo el punto de partida.', '[{"key":"qualification","name":"Calificación Empresarial","prompt":"¿Cuántos empleados? ¿Rubro? ¿Qué problema quieren resolver?"},{"key":"needs","name":"Análisis de Necesidades","prompt":"Profundiza en el problema. ¿Tienen solución actual? ¿Por qué no funciona?"},{"key":"proposal","name":"Propuesta Empresarial","prompt":"Presenta solución con [CARD: ID]. Muestra ROI y casos de éxito."},{"key":"demo","name":"Demo o Piloto","prompt":"Propón una demo gratuita o prueba piloto de 7 días."},{"key":"closing","name":"Contrato y Pago","prompt":"Facilita el proceso de compra. Ofrece factura y pagos en cuotas si aplica."}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (9, 1, 'Isabella', 'Especialista en Suscripciones y Membresías', 'friendly', 'es', 'gpt-4o-mini', 'Eres Isabella, especialista en suscripciones y membresías de TecnoVariedades. Manejas planes recurrentes, accesos premium y programas de fidelización.

━━━━━━━━━━━━━━━━━━━━━━━━
⭐ MEMBRESÍAS DISPONIBLES
━━━━━━━━━━━━━━━━━━━━━━━━
🥉 BÁSICA: Acceso a catálogo mensual de contenido
🥈 PREMIUM: Todo + novedades semanales + soporte
🥇 VIP: Todo + consultas 1:1 + contenido exclusivo
💎 ENTERPRISE: Equipos + múltiples usuarios + API

━━━━━━━━━━━━━━━━━━━━━━━━
💡 VENTAJAS DE SUSCRIBIRSE
━━━━━━━━━━━━━━━━━━━━━━━━
✅ Ahorra vs compra individual
✅ Nuevos contenidos cada mes
✅ Cancela cuando quieras
✅ Soporte prioritario incluido
✅ Acceso a la comunidad exclusiva

━━━━━━━━━━━━━━━━━━━━━━━━
🎯 MÉTODO ISABELLA
━━━━━━━━━━━━━━━━━━━━━━━━
Primero ofrece el plan básico (menor fricción).
Luego haz upsell al Premium mostrando la diferencia de precio vs valor.
El VIP se vende solo cuando el cliente ya confía en la marca.

💡 "Con el plan mensual básico obtienes $500.000 en valor por solo $X. Los primeros 3 meses son los más importantes para ver resultados."', '[{"key":"discovery","name":"Descubrimiento","prompt":"¿Qué tipo de contenido o acceso busca? ¿Cuánto usa actualmente?"},{"key":"plan_match","name":"Plan Ideal","prompt":"Recomienda el plan según uso. Muestra comparativa de planes con [CARD: ID]."},{"key":"value","name":"Valor vs Precio","prompt":"Calcula cuánto ahorra vs comprando por separado. El número impacta."},{"key":"trial","name":"Prueba Gratuita","prompt":"Ofrece primer mes con descuento o prueba de 7 días si aplica."},{"key":"closing","name":"Activación","prompt":"Activa la suscripción. Explica cómo cancelar si no quiere (genera confianza)."}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO agents (id, tenant_id, name, role, tone, language, model, system_prompt, stages, metadata, is_active, created_at, updated_at) VALUES (10, 1, 'Nicolás', 'Especialista en Seguimiento y Recuperación de Ventas', 'persistent', 'es', 'gpt-4o-mini', 'Eres Nicolás, especialista en seguimiento y recuperación de ventas de TecnoVariedades. Tu misión es recuperar leads que no compraron y reactivar clientes inactivos.

━━━━━━━━━━━━━━━━━━━━━━━━
🔄 TU MISIÓN NICOLÁS
━━━━━━━━━━━━━━━━━━━━━━━━
Muchas ventas se pierden no porque el cliente no quiera, sino porque:
❌ "Se olvidó" de comprar
❌ Tuvo una duda sin resolver
❌ Le pareció caro en ese momento
❌ Le distrajo algo más

TÚ eres quien cierra esas ventas pendientes.

━━━━━━━━━━━━━━━━━━━━━━━━
📧 SECUENCIA DE SEGUIMIENTO
━━━━━━━━━━━━━━━━━━━━━━━━
Día 1: "¿Tuviste alguna duda sobre [producto]?"
Día 3: "Tenemos una oferta especial para ti..."
Día 7: "Última oportunidad — stock limitado"
Día 14: "¿Encontraste lo que buscabas?"

━━━━━━━━━━━━━━━━━━━━━━━━
🎁 TÁCTICAS DE RECUPERACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━
✅ Descuento especial por tiempo limitado (10-20%)
✅ Bono extra exclusivo para quien compre hoy
✅ Testimonio de cliente similar
✅ Garantía de satisfacción o reembolso
✅ Facilidades de pago (cuotas)

NUNCA presiones. Siempre ofrece VALOR adicional.', '[{"key":"reactivation","name":"Reactivación","prompt":"Saluda recordando el interés anterior. Pregunta si resolvió su duda."},{"key":"objection_resolve","name":"Resolver Objeción","prompt":"Identifica por qué no compró. Ofrece solución específica a ese problema."},{"key":"offer","name":"Oferta Especial","prompt":"Presenta una oferta exclusiva de recuperación. Límite de tiempo real."},{"key":"social_proof","name":"Prueba Social","prompt":"Comparte testimonios de personas que dudaron y compraron. El resultado los convenció."},{"key":"final_close","name":"Cierre Final","prompt":"Crea urgencia genuina. Si no compra ahora, ¿cuándo? ¿Qué necesita para decidir?"}]', NULL, 0, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
INSERT INTO conversations (id, tenant_id, contact_name, contact_phone, avatar_color, last_message, last_message_at, unread_count, status, current_stage, agent_id, lead_id, payment_status, payment_method, payment_amount, paid_at, created_at) VALUES (1, 1, '573042748687', '573042748687', '#10b981', NULL, NULL, 0, 'ai', 'greeting', NULL, 1, NULL, NULL, NULL, NULL, '2026-05-31 21:18:43');
INSERT INTO conversations (id, tenant_id, contact_name, contact_phone, avatar_color, last_message, last_message_at, unread_count, status, current_stage, agent_id, lead_id, payment_status, payment_method, payment_amount, paid_at, created_at) VALUES (2, 1, 'Duvier Mena', '6988129931330', '#10b981', '━━━━━━━━━━━━━━━━━━━━━━━
¡Excelente elección! El "PACK IDIOMAS" está listo para ser enviado. Los enlaces de pago están abajo: 📱 Nequi/Daviplata: 3136174267 (Duvier Mena) 💳 Tarjeta/PSE: MercadoPago (e', '2026-05-31T22:35:21.204Z', 0, 'ai', 'closing', NULL, 2, NULL, NULL, NULL, NULL, '2026-05-31 21:19:16');
INSERT INTO conversations (id, tenant_id, contact_name, contact_phone, avatar_color, last_message, last_message_at, unread_count, status, current_stage, agent_id, lead_id, payment_status, payment_method, payment_amount, paid_at, created_at) VALUES (3, 1, '214112793538597', '214112793538597', '#10b981', '¿Qué tipo de producto o servicio estás buscando?', '2026-05-31T21:28:16.426Z', 0, 'ai', 'presentation', NULL, 3, NULL, NULL, NULL, NULL, '2026-05-31 21:26:00');
INSERT INTO conversations (id, tenant_id, contact_name, contact_phone, avatar_color, last_message, last_message_at, unread_count, status, current_stage, agent_id, lead_id, payment_status, payment_method, payment_amount, paid_at, created_at) VALUES (4, 1, 'Test', 'test-ia', '#10b981', '🎯 ¡Hola *Test*! a *TecnoVariedades D&S*! 🔥
Es un placer saludarte.

Estoy a tu entera disposición para ayudarte con lo que necesites hoy. 😊', '2026-06-18T01:20:00.228Z', 0, 'ai', 'greeting', NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-18 01:20:00');
INSERT INTO conversations (id, tenant_id, contact_name, contact_phone, avatar_color, last_message, last_message_at, unread_count, status, current_stage, agent_id, lead_id, payment_status, payment_method, payment_amount, paid_at, created_at) VALUES (5, 1, 'Test', 'test-ia', '#10b981', '━━━━━━━━━━━━━━━━━━━━━━━
Lo siento, pero no tengo un producto específico que coincida con tu búsqueda. Sin embargo, puedo ofrecerte nuestro catálogo general para que puedas explorar y encontrar algo qu', '2026-06-18T01:20:48.392Z', 0, 'ai', 'discovery', NULL, NULL, NULL, NULL, NULL, NULL, '2026-06-18 01:20:05');
INSERT INTO leads (id, tenant_id, name, phone, email, stage, value, notes, source, payment_status, lifetime_value, created_at) VALUES (1, 1, '573042748687', '573042748687', NULL, 'new', 0, NULL, 'whatsapp', NULL, 0, '2026-05-31 21:18:43');
INSERT INTO leads (id, tenant_id, name, phone, email, stage, value, notes, source, payment_status, lifetime_value, created_at) VALUES (2, 1, 'Duvier Mena', '6988129931330', NULL, 'new', 0, NULL, 'whatsapp', NULL, 0, '2026-05-31 21:19:16');
INSERT INTO leads (id, tenant_id, name, phone, email, stage, value, notes, source, payment_status, lifetime_value, created_at) VALUES (3, 1, '214112793538597', '214112793538597', NULL, 'new', 0, NULL, 'whatsapp', NULL, 0, '2026-05-31 21:26:00');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (1, 1, 'customer', 'protocolMessage', 'greeting', NULL, '2026-05-31 21:18:43');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (2, 1, 'customer', 'Gkyh8jCTvxTO5q9qe1bmF5OxJqp7NhwAnDMWqIB8a8tKKpdYCjZnVbpAwVjuS8HY', 'greeting', NULL, '2026-05-31 21:18:43');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (3, 1, 'customer', 'protocolMessage', 'greeting', NULL, '2026-05-31 21:18:45');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (4, 1, 'customer', 'protocolMessage', 'greeting', NULL, '2026-05-31 21:18:50');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (5, 1, 'customer', '/v/t62.31111-24/714547590_3987254114743059_1334816419608608144_n.enc?ccb=11-4&oh=01_Q5Aa4gGT4iHSdrrk4GmCEg01SYxtw2tl6juMr1BDf9GadZvz6g&oe=6A43FC32&_nc_sid=5e03e0', 'greeting', NULL, '2026-05-31 21:18:50');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (6, 1, 'customer', 'protocolMessage', 'greeting', NULL, '2026-05-31 21:18:54');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (7, 1, 'customer', '/v/t62.31111-24/714150469_1527519725716371_296025472820059662_n.enc?ccb=11-4&oh=01_Q5Aa4gE0sK9fVxhzxYQ6JL1pG5sqA5ifZoBIRuPI4y8fOfk2JA&oe=6A440474&_nc_sid=5e03e0', 'greeting', NULL, '2026-05-31 21:18:54');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (8, 2, 'customer', 'Hola muy buenas', 'greeting', NULL, '2026-05-31 21:19:16');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (9, 1, 'customer', '/v/t62.31111-24/710050999_979595318439408_4129953023676499550_n.enc?ccb=11-4&oh=01_Q5Aa4gE3kLVNEusxHCSfQpKlgGZby5BnyzJwAcIFsfk_MPydmA&oe=6A43FB59&_nc_sid=5e03e0', 'greeting', NULL, '2026-05-31 21:19:29');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (10, 1, 'customer', '/v/t62.31111-24/583804472_1011679677867429_977815318536599646_n.enc?ccb=11-4&oh=01_Q5Aa4gFgXzQxLxgIVmW8cRZ3UI6vyRR-lPtBIK4XQZMdi0CDMQ&oe=6A44206A&_nc_sid=5e03e0', 'greeting', NULL, '2026-05-31 21:19:41');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (11, 3, 'customer', 'Pana como va', 'greeting', NULL, '2026-05-31 21:26:00');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (12, 3, 'customer', 'Soy Jorge', 'greeting', NULL, '2026-05-31 21:26:02');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (13, 3, 'customer', 'Hablamos el otro dia fuera del edificio', 'greeting', NULL, '2026-05-31 21:26:17');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (14, 3, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
Hola, ¿en qué puedo ayudarte hoy?
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'discovery', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:26:23');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (15, 3, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
Hola, ¿en qué puedo ayudarte hoy?
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'greeting', NULL, '2026-05-31 21:26:25');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (16, 3, 'customer', 'Para el tema de la Vecina', 'discovery', NULL, '2026-05-31 21:26:30');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (17, 3, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
Lo siento, pero no tengo un producto que coincida exactamente con lo que buscas. Sin embargo, puedo ofrecerte información sobre nuestros productos más similares que podrían interesarte. ¿Te gustaría conocer más sobre ellos?
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'discovery', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:26:50');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (18, 3, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
Lo siento, pero no tengo un producto que coincida exactamente con lo que buscas. Sin embargo, puedo ofrecerte información sobre nuestros productos más similares que podrían interesarte. ¿Te gustaría conocer más sobre ellos?
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'discovery', NULL, '2026-05-31 21:26:52');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (19, 3, 'customer', 'Entonces para que me dio el numero ?', 'discovery', NULL, '2026-05-31 21:27:14');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (20, 3, 'agent', '¡Aquí lo tienes! 👇 [CARD: 1234]', 'discovery', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:27:27');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (21, 3, 'agent', '¡Aquí lo tienes! 👇', 'discovery', NULL, '2026-05-31 21:27:28');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (22, 3, 'agent', '¿En qué puedo ayudarte?', 'presentation', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:27:51');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (23, 3, 'agent', '¿En qué puedo ayudarte?', 'discovery', NULL, '2026-05-31 21:27:52');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (24, 3, 'agent', '¿Qué tipo de producto o servicio estás buscando?', 'presentation', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:28:16');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (25, 3, 'agent', '¿Qué tipo de producto o servicio estás buscando?', 'presentation', NULL, '2026-05-31 21:28:17');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (26, 2, 'customer', 'Hola muy buenas ?', 'greeting', NULL, '2026-05-31 21:29:26');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (27, 2, 'agent', '🎯 ¡Hola *Duvier Mena*! a *TecnoVariedades D&S*! 🔥
Es un placer saludarte.

Estoy a tu entera disposición para ayudarte con lo que necesites hoy. 😊', 'greeting', '{"intent":"greeting","isHardcoded":true}', '2026-05-31 21:29:26');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (28, 2, 'agent', '🎯 ¡Hola *Duvier Mena*! a *TecnoVariedades D&S*! 🔥
Es un placer saludarte.

Estoy a tu entera disposición para ayudarte con lo que necesites hoy. 😊', 'greeting', NULL, '2026-05-31 21:29:30');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (29, 2, 'customer', 'Me interesa el megapack de idiomas', 'greeting', NULL, '2026-05-31 21:30:04');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (30, 2, 'agent', '¡Aquí lo tienes! 👇
[CARD: 42]', 'discovery', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":true,"productId":42,"productName":"PACK IDIOMAS","isHardcoded":false}', '2026-05-31 21:31:09');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (31, 2, 'agent', '¡Aquí lo tienes! 👇', 'greeting', NULL, '2026-05-31 21:31:13');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (32, 2, 'agent', '[CARD: 42]', 'greeting', NULL, '2026-05-31 21:31:13');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (33, 2, 'customer', 'Me interesa el megapack de idiomas', 'discovery', NULL, '2026-05-31 21:40:18');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (34, 2, 'customer', 'Me interesa el megapack de idiomas', 'discovery', NULL, '2026-05-31 21:41:06');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (35, 2, 'agent', '🎯 PACK IDIOMAS 💰 Precio: $ 20.000 📝 🌍 Francés, Alemán, Italiano, Portugués y Japonés básico. 📦 Contiene: 20 secciones (250) ⏱️ Duración/Tamaño: 60h ✨ Beneficios: - Contenido en Alta Definición (HD) - Acceso permanente vía Google Drive [CARD: 42]', 'presentation', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":true,"productId":42,"productName":"PACK IDIOMAS","isHardcoded":false}', '2026-05-31 21:42:00');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (36, 2, 'agent', '🎯 PACK IDIOMAS 💰 Precio: $ 20.000 📝 🌍 Francés, Alemán, Italiano, Portugués y Japonés básico. 📦 Contiene: 20 secciones (250) ⏱️ Duración/Tamaño: 60h ✨ Beneficios: - Contenido en Alta Definición (HD) - Acceso permanente vía Google Drive', 'discovery', NULL, '2026-05-31 21:42:06');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (37, 2, 'agent', '[CARD: 42]', 'discovery', NULL, '2026-05-31 21:42:06');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (38, 2, 'customer', 'Como se entrega', 'presentation', NULL, '2026-05-31 21:44:19');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (39, 2, 'agent', '📦 La entrega del "PACK IDIOMAS" se realiza a través de Google Drive, donde tendrás acceso permanente a los materiales.', 'details', '{"intent":"details_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:44:52');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (40, 2, 'agent', '📦 La entrega del "PACK IDIOMAS" se realiza a través de Google Drive, donde tendrás acceso permanente a los materiales.', 'presentation', NULL, '2026-05-31 21:44:53');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (41, 2, 'customer', 'Y que necesita para entregárselo?', 'details', NULL, '2026-05-31 21:45:22');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (42, 2, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
📦 Entonces, ¡estás listo para recibir el "PACK IDIOMAS"! Los enlaces de pago están listos abajo.
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'closing', '{"intent":"confirmation","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:45:46');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (43, 2, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
📦 Entonces, ¡estás listo para recibir el "PACK IDIOMAS"! Los enlaces de pago están listos abajo.
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'details', NULL, '2026-05-31 21:45:48');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (44, 2, 'customer', 'Y que necesita para entregárselo?', 'closing', NULL, '2026-05-31 21:57:29');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (45, 2, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
¡Genial! Estás listo para recibir el "PACK IDIOMAS". Los enlaces de pago están listos abajo.
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'closing', '{"intent":"confirmation","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 21:57:59');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (46, 2, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
¡Genial! Estás listo para recibir el "PACK IDIOMAS". Los enlaces de pago están listos abajo.
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'closing', NULL, '2026-05-31 21:58:01');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (47, 2, 'customer', 'Y que necesita para entregárselo?', 'closing', NULL, '2026-05-31 22:03:49');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (48, 2, 'agent', 'Para entregarte el "PACK IDIOMAS", necesito que completes el pago a través de uno de nuestros métodos de pago disponibles. Puedes pagar con:

📱 Nequi/Daviplata: 3136174267 (Duvier Mena)
💳 Tarjeta/PSE: MercadoPago (enlace dinámico)
🌐 Internacional: PayPal (enlace dinámico)

Una vez que completes el pago, recibirás un enlace para descargar el "PACK IDIOMAS" desde Google Drive.

¿Cuál es tu método de pago preferido?', 'details', '{"intent":"details_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 22:04:19');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (49, 2, 'agent', 'Para entregarte el "PACK IDIOMAS", necesito que completes el pago a través de uno de nuestros métodos de pago disponibles. Puedes pagar con:

📱 Nequi/Daviplata: 3136174267 (Duvier Mena)
💳 Tarjeta/PSE: MercadoPago (enlace dinámico)
🌐 Internacional: PayPal (enlace dinámico)

Una vez que completes el pago, recibirás un enlace para descargar el "PACK IDIOMAS" desde Google Drive.

¿Cuál es tu método de pago preferido?', 'closing', NULL, '2026-05-31 22:04:21');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (50, 2, 'customer', 'Voy a pagar', 'details', NULL, '2026-05-31 22:34:06');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (51, 2, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
¡Excelente elección! El "PACK IDIOMAS" está listo para ser enviado. Los enlaces de pago están abajo: 📱 Nequi/Daviplata: 3136174267 (Duvier Mena) 💳 Tarjeta/PSE: MercadoPago (enlace dinámico) 🌐 Internacional: PayPal (enlace dinámico)
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'closing', '{"intent":"payment_intent","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-05-31 22:35:21');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (52, 2, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
¡Excelente elección! El "PACK IDIOMAS" está listo para ser enviado. Los enlaces de pago están abajo: 📱 Nequi/Daviplata: 3136174267 (Duvier Mena) 💳 Tarjeta/PSE: MercadoPago (enlace dinámico) 🌐 Internacional: PayPal (enlace dinámico)
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'details', NULL, '2026-05-31 22:35:22');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (53, 4, 'customer', 'Hola, me interesa el megapack de piano', NULL, NULL, '2026-06-18 01:20:00');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (54, 4, 'agent', '🎯 ¡Hola *Test*! a *TecnoVariedades D&S*! 🔥
Es un placer saludarte.

Estoy a tu entera disposición para ayudarte con lo que necesites hoy. 😊', 'greeting', '{"intent":"greeting","isHardcoded":true}', '2026-06-18 01:20:00');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (55, 5, 'customer', '¿Qué productos tienen disponibles?', NULL, NULL, '2026-06-18 01:20:05');
INSERT INTO messages (id, conversation_id, role, content, stage, metadata, created_at) VALUES (56, 5, 'agent', '━━━━━━━━━━━━━━━━━━━━━━━
Lo siento, pero no tengo un producto específico que coincida con tu búsqueda. Sin embargo, puedo ofrecerte nuestro catálogo general para que puedas explorar y encontrar algo que se adapte a tus necesidades.

¿Te gustaría ver nuestro catálogo?
━━━━━━━━━━━━━━━━━━━━━━━

_TecnoVariedades D&S — Cursos y Megapacks Digitales_', 'discovery', '{"intent":"product_query","aiProvider":"nvidia_70b","cardSent":false,"isHardcoded":false}', '2026-06-18 01:20:48');
INSERT INTO payment_links (id, short_code, original_url, method, product_id, client_phone, clicks, is_active, last_click_at, created_at) VALUES (1, 'U3oD6o', 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=2021591453-21b3c270-4bd2-40ab-b314-ef0338f1b606', 'mercadopago', 42, '6988129931330', 0, 1, NULL, '2026-05-31 21:31:11');
INSERT INTO payment_links (id, short_code, original_url, method, product_id, client_phone, clicks, is_active, last_click_at, created_at) VALUES (2, 'TZkTeb', 'https://www.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=EC-36V359343L8828737', 'paypal', 42, '6988129931330', 0, 1, NULL, '2026-05-31 21:31:11');
INSERT INTO payment_links (id, short_code, original_url, method, product_id, client_phone, clicks, is_active, last_click_at, created_at) VALUES (3, 'yNioDo', 'https://www.mercadopago.com.co/checkout/v1/redirect?pref_id=2021591453-8ada7032-1ee0-4376-b7fd-399b5d204097', 'mercadopago', 42, '6988129931330', 0, 1, NULL, '2026-05-31 21:42:02');
INSERT INTO payment_links (id, short_code, original_url, method, product_id, client_phone, clicks, is_active, last_click_at, created_at) VALUES (4, 'IGmnFs', 'https://www.paypal.com/cgi-bin/webscr?cmd=_express-checkout&token=EC-93C81447LV147231W', 'paypal', 42, '6988129931330', 0, 1, NULL, '2026-05-31 21:42:03');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (1, 1, 'Tecnología', '2026-05-28 03:02:45');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (2, 1, 'Moda', '2026-05-28 03:02:45');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (3, 1, 'Cursos Digitales', '2026-05-28 03:02:45');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (4, 1, 'Comida & Bebida', '2026-05-28 03:02:45');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (5, 1, 'Servicios Profesionales', '2026-05-28 03:02:45');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (6, 1, 'Salud & Belleza', '2026-05-28 03:02:45');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (7, 1, 'Hogar & Decoración', '2026-05-28 03:02:45');
INSERT INTO product_categories (id, tenant_id, name, created_at) VALUES (8, 1, 'Deportes & Fitness', '2026-05-28 03:02:45');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (41, 1, 'COMICS CONDORITO', '🎨 Narrativa visual, entintado y creación de personajes.
📦 Contiene: 15 secciones (130)
⏱️ Duración/Tamaño: 30h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Diseño Gráfico', 'digital', '/images/products/41.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1OkiLvS4Jlfohj7f0F9914lnfSfkedM9p?usp=drive_link', 1, '{"drive_folder_id":"1OkiLvS4Jlfohj7f0F9914lnfSfkedM9p"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (42, 1, 'PACK IDIOMAS', '🌍 Francés, Alemán, Italiano, Portugués y Japonés básico.
📦 Contiene: 20 secciones (250)
⏱️ Duración/Tamaño: 60h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Idiomas', 'digital', '/images/products/42.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Cursos de conversación","Gramática y pronunciación"]', NULL, 'https://drive.google.com/drive/folders/1QNbNa7FFOUjU2Wd8fmpAOBJi5XYsPgvJ?usp=drive_link', 1, '{"drive_folder_id":"1QNbNa7FFOUjU2Wd8fmpAOBJi5XYsPgvJ"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (43, 1, 'CURSO LETTERING DESDE CERO', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/43.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/11UWOG_OjzWAZyyoxl3vpu56_DxLkepqU?usp=drive_link', 1, '{"drive_folder_id":"11UWOG_OjzWAZyyoxl3vpu56_DxLkepqU"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (44, 1, 'CURSO FOTOMONTAJE PUBLICITARIO', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Fotografía', 'digital', '/images/products/44.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Edición profesional","Técnicas avanzadas"]', NULL, 'https://drive.google.com/drive/folders/1HZi8eI8TO7N6x7ld6Z8x4nIlUs1o3tpQ?usp=drive_link', 1, '{"drive_folder_id":"1HZi8eI8TO7N6x7ld6Z8x4nIlUs1o3tpQ"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (45, 1, 'DISEÑO EDITORIAL DESDE CERO', '🎨 Diagramación de revistas, libros y catálogos en InDesign.
📦 Contiene: 15 secciones (120)
⏱️ Duración/Tamaño: 28h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/45.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos"]', NULL, 'https://drive.google.com/drive/folders/1_wuy7nghjwjf_pJg_IbFWf4fVjfdt_91?usp=drive_link', 1, '{"drive_folder_id":"1_wuy7nghjwjf_pJg_IbFWf4fVjfdt_91"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (46, 1, 'DISEÑO DE LOGOTIPOS CON RETICULAS', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/46.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos"]', NULL, 'https://drive.google.com/drive/folders/15A_20cdxgXwDCUEWddY6JMvFjxuwL-8c?usp=drive_link', 1, '{"drive_folder_id":"15A_20cdxgXwDCUEWddY6JMvFjxuwL-8c"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (47, 1, 'CURSO CREA Y GESTIONA UNA MARCA', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/47.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1h5X8ksJXZGSqdXO6Gp4y6lD1O-Gux7tQ?usp=drive_link', 1, '{"drive_folder_id":"1h5X8ksJXZGSqdXO6Gp4y6lD1O-Gux7tQ"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (48, 1, 'CURSO ADOBE INDESIGN DESDE CERO', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/48.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1Mb04K4e0CfYZ5qkdpqQgbE-qsd5IPnVk?usp=drive_link', 1, '{"drive_folder_id":"1Mb04K4e0CfYZ5qkdpqQgbE-qsd5IPnVk"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (49, 1, 'CURSO ANIMACIÓN EXPRESS PARA REDES SOCIALES', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', 'https://drive.google.com/thumbnail?sz=w400&id=1XqIgPh-dnpmhed1qT59WVCsIvLcmrr6e', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1XqIgPh-dnpmhed1qT59WVCsIvLcmrr6e?usp=drive_link', 1, '{"drive_folder_id":"1XqIgPh-dnpmhed1qT59WVCsIvLcmrr6e"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (50, 1, 'CURSO DISEÑO DE APLICACIÓN MOVIL', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/50.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos"]', NULL, 'https://drive.google.com/drive/folders/1Z-wlfVEa2QAdzVQ1K_ksdUpFSQePKQ9S?usp=drive_link', 1, '{"drive_folder_id":"1Z-wlfVEa2QAdzVQ1K_ksdUpFSQePKQ9S"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (51, 1, 'CURSO DE DIBUJO A ILUSTRACIÓN DIGITAL', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', 'https://drive.google.com/thumbnail?sz=w400&id=1wMqUIP3AQxh2mMn_6syfzbp-fHWNqO3e', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1wMqUIP3AQxh2mMn_6syfzbp-fHWNqO3e?usp=drive_link', 1, '{"drive_folder_id":"1wMqUIP3AQxh2mMn_6syfzbp-fHWNqO3e"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (52, 1, 'CURSO PRODUCCIÓN Y EDICIÓN DE VIDEO CON CAMARA', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Música', 'digital', '/images/products/52.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1RFj8bTpKmpn35VH4sRhcT-ATwLE3bVwM?usp=drive_link', 1, '{"drive_folder_id":"1RFj8bTpKmpn35VH4sRhcT-ATwLE3bVwM"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (53, 1, 'CURSO DE FOTOGRAFIA PROFESIONAL', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/53.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1G8ZP5Vg_3Vn1nRtVSkjxYwjXOLzw-XvU?usp=drive_link', 1, '{"drive_folder_id":"1G8ZP5Vg_3Vn1nRtVSkjxYwjXOLzw-XvU"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (54, 1, 'CURSO PHOTOSHOP PARA DISEÑO WEB', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/54.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos","Código fuente","Proyectos reales"]', NULL, 'https://drive.google.com/drive/folders/1xz8l8aAiIdLDasBThWQ_puHG8ZalDg90?usp=drive_link', 1, '{"drive_folder_id":"1xz8l8aAiIdLDasBThWQ_puHG8ZalDg90"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (55, 1, 'CURSO DE ECOMMERCE', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/55.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1kd7aqgo_cGbpfUs4Vwb7Lae5UiKaPVsU?usp=drive_link', 1, '{"drive_folder_id":"1kd7aqgo_cGbpfUs4Vwb7Lae5UiKaPVsU"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (56, 1, 'CURSO DISEÑO DE INTERFACES MOVILES', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/56.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos"]', NULL, 'https://drive.google.com/drive/folders/1FZcxqQe9VF4DCZ0rIb3GGGZo1_NMojCn?usp=drive_link', 1, '{"drive_folder_id":"1FZcxqQe9VF4DCZ0rIb3GGGZo1_NMojCn"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (57, 1, 'CURSO DE DESARROLLO WEB', '💻 HTML5, CSS3, JavaScript, React y Backend.
📦 Contiene: 50 secciones (600)
⏱️ Duración/Tamaño: 120h+
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Programación', 'digital', '/images/products/57.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Código fuente","Proyectos reales"]', NULL, 'https://drive.google.com/drive/folders/1qbS_Lv1F7JX1xxkQ0tOMpbXV0v1w68VC?usp=drive_link', 1, '{"drive_folder_id":"1qbS_Lv1F7JX1xxkQ0tOMpbXV0v1w68VC"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (58, 1, 'CURSO DISEÑO VISUAL DE MARCAS', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/58.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos"]', NULL, 'https://drive.google.com/drive/folders/1THAdOVZlonWGlnrM_6rPL6jVi7WBniAk?usp=drive_link', 1, '{"drive_folder_id":"1THAdOVZlonWGlnrM_6rPL6jVi7WBniAk"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (59, 1, '15 MIL PLANOS PARA MUEBLES DE CARPINTERIA', '🔧 Carpintería en madera, ensambles y proyectos paso a paso.
📦 Contiene: 1 secciones (15000+ Planos)
⏱️ Duración/Tamaño: Recurso
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/59.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1w_HG4r7vLkwIKjVZzzHIRp6FCxTUD6Iz?usp=drive_link', 1, '{"drive_folder_id":"1w_HG4r7vLkwIKjVZzzHIRp6FCxTUD6Iz"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (60, 1, 'CURSO CREACIÓN DE VIDEOJUEGOS', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/60.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1xJh1wJav3yt8-sIJ-eYllP5M_cHmil97?usp=drive_link', 1, '{"drive_folder_id":"1xJh1wJav3yt8-sIJ-eYllP5M_cHmil97"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (61, 1, 'CURSO MASTER EN ANIMACIÓN 3D', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/61.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1fHSoabb6hBQmQTSs_4NzvAhk11uvrBkX?usp=drive_link', 1, '{"drive_folder_id":"1fHSoabb6hBQmQTSs_4NzvAhk11uvrBkX"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (62, 1, 'CURSO PHOTOSHOP PARA RETOQUE DE RETRATOS', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/62.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1ZU6ofJ6e67Lwvt8CKnqCWwMvzUoYKncQ?usp=drive_link', 1, '{"drive_folder_id":"1ZU6ofJ6e67Lwvt8CKnqCWwMvzUoYKncQ"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (63, 1, 'CURSO MASTER EN WORDPRESS', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/63.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1tarxNsTUxXLtSzifWe3P2RUhkpoemAxj?usp=drive_link', 1, '{"drive_folder_id":"1tarxNsTUxXLtSzifWe3P2RUhkpoemAxj"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (64, 1, 'CURSO PILATES PARA UN CUERPO DE 10', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/64.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1q4y8bAH-NXlu7AvswF4P3VYymxVHQ9hq?usp=drive_link', 1, '{"drive_folder_id":"1q4y8bAH-NXlu7AvswF4P3VYymxVHQ9hq"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (65, 1, 'CURSO CIBERSEGURIDAD', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/65.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1Ya5jGHKBPjxIxRZndLrb-iukOWbvkf21?usp=drive_link', 1, '{"drive_folder_id":"1Ya5jGHKBPjxIxRZndLrb-iukOWbvkf21"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (66, 1, 'CURSO LOCUCIÓN PROFESIONAL', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/66.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1tKE4GiFq3N3odeGjTuU0nrQgOWZUhNgF?usp=drive_link', 1, '{"drive_folder_id":"1tKE4GiFq3N3odeGjTuU0nrQgOWZUhNgF"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (67, 1, 'CURSO SERVIDORES LINUX', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/67.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1qq6HGOrZRAJ4_lCdAlEIzH6LUq9tQBsw?usp=drive_link', 1, '{"drive_folder_id":"1qq6HGOrZRAJ4_lCdAlEIzH6LUq9tQBsw"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (68, 1, 'CURSO CAR AUDIO DESDE CERO', '🔧 Instalación de sonido, amplificadores, cajas y ecualización.
📦 Contiene: 10 secciones (85)
⏱️ Duración/Tamaño: 20h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/68.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/15Fmu2UaqGv2GEXplj91M6FQouARkR8dV?usp=drive_link', 1, '{"drive_folder_id":"15Fmu2UaqGv2GEXplj91M6FQouARkR8dV"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (69, 1, 'PRESETS LIGHTROOM', '🎨 Más de 5000 filtros profesionales para edición fotográfica rápida.
📦 Contiene: 5 secciones (5000+ Presets)
⏱️ Duración/Tamaño: Recurso
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/69.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1KEUL5j1HDT8J-J1MqmQ2jaGKyxlMDW_9?usp=drive_link', 1, '{"drive_folder_id":"1KEUL5j1HDT8J-J1MqmQ2jaGKyxlMDW_9"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (70, 1, 'CURSO REPARACIÓN DE PLAY STATION', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Tecnología', 'digital', '/images/products/70.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1uPiwtsCDryHF-LyHaHvXpv0Ebl1ck9a9?usp=drive_link', 1, '{"drive_folder_id":"1uPiwtsCDryHF-LyHaHvXpv0Ebl1ck9a9"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (71, 1, 'CURSO REPARACIÓN DE CELULARES', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Tecnología', 'digital', '/images/products/71.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1xM6IylsuIHADmfVftmHYsAmRJfnwuNJo?usp=drive_link', 1, '{"drive_folder_id":"1xM6IylsuIHADmfVftmHYsAmRJfnwuNJo"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (72, 1, 'PACK PROGRAMACIÓN', '💻 Lógica de programación, terminal y fundamentos de sistemas.
📦 Contiene: 15 secciones (120)
⏱️ Duración/Tamaño: 20h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Programación', 'digital', '/images/products/72.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Código fuente","Proyectos reales"]', NULL, 'https://drive.google.com/drive/folders/1IliKLCntPplMNUCGs_5inAkCufOwXBis?usp=drive_link', 1, '{"drive_folder_id":"1IliKLCntPplMNUCGs_5inAkCufOwXBis"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (73, 1, 'PACK MARKETING DIGITAL', '🚀 Facebook Ads, Google Ads, SEO y Estrategia de Contenidos.
📦 Contiene: 50 secciones (600)
⏱️ Duración/Tamaño: 100h+
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Marketing', 'digital', '/images/products/73.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1oXsN2hX8byp7n9czuCRaDUONILxYdlml?usp=drive_link', 1, '{"drive_folder_id":"1oXsN2hX8byp7n9czuCRaDUONILxYdlml"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (74, 1, 'PACK SEO MARKETING DESDE CERO', '🚀 Posicionamiento en Google, palabras clave y SEO técnico.
📦 Contiene: 15 secciones (120)
⏱️ Duración/Tamaño: 25h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Marketing', 'digital', '/images/products/74.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1gmsr943dcsgm5y1AcAoXOD_vGRRKhVr2?usp=drive_link', 1, '{"drive_folder_id":"1gmsr943dcsgm5y1AcAoXOD_vGRRKhVr2"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (75, 1, 'CURSO CINEMA 4D', '🎨 Modelado 3D, animación y motion graphics profesional.
📦 Contiene: 20 secciones (160)
⏱️ Duración/Tamaño: 35h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/75.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1lIYXk7__af6HRWzXx3V-mlTYHUJpE4fY?usp=drive_link', 1, '{"drive_folder_id":"1lIYXk7__af6HRWzXx3V-mlTYHUJpE4fY"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (76, 1, 'PACK EDUCA A TU PERRO', '📚 Biblioteca masiva de cultura general, finanzas y literatura.
📦 Contiene: 1 secciones (3700+ Libros)
⏱️ Duración/Tamaño: Lectura
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/76.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1rCmKvDqhSqAYLXDhow-QieKTd_1vYE-Z?usp=drive_link', 1, '{"drive_folder_id":"1rCmKvDqhSqAYLXDhow-QieKTd_1vYE-Z"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (77, 1, 'PACK FILMORA', '🎨 Edición de video creativa paso a paso con Filmora 12/13.
📦 Contiene: 10 secciones (80)
⏱️ Duración/Tamaño: 18h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/77.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1oha877iB_Z6Kmh7uC0jYuzCGzpvfDDp_?usp=drive_link', 1, '{"drive_folder_id":"1oha877iB_Z6Kmh7uC0jYuzCGzpvfDDp_"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (78, 1, 'ENSAMBLAJE DE COMPUTADORAS', '💻 Arquitectura de PCs, diagnóstico de hardware y mantenimiento.
📦 Contiene: 8 secciones (65)
⏱️ Duración/Tamaño: 15h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Tecnología', 'digital', '/images/products/78.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1OpQx43DWRLZsJ3nt9iYOniidr_nUAeL3?usp=drive_link', 1, '{"drive_folder_id":"1OpQx43DWRLZsJ3nt9iYOniidr_nUAeL3"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (79, 1, 'CURSO FITNESS EL CAMINO DEL GUERRERO', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Salud y Deporte', 'digital', '/images/products/79.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1VM5FV7rWMYhZiG5sNUNIkudqagm3Qedp?usp=drive_link', 1, '{"drive_folder_id":"1VM5FV7rWMYhZiG5sNUNIkudqagm3Qedp"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (80, 1, 'CURSO INGLES OXFORD', '🌍 Gramática, pronunciación y audios nativos (A1 a C1).
📦 Contiene: 12 secciones (150)
⏱️ Duración/Tamaño: 40h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/80.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1GUzgDNtq43nkJQYPc_EnUAajansWw9mS?usp=drive_link', 1, '{"drive_folder_id":"1GUzgDNtq43nkJQYPc_EnUAajansWw9mS"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (81, 1, 'CURSO FUERZA FIT', '🧘 Biomecánica del ejercicio, hipertrofia y programación de fuerza.
📦 Contiene: 10 secciones (80)
⏱️ Duración/Tamaño: 18h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/81.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/12cf-oPboTkEcNnQswHtulpiOd5mjp-rU?usp=drive_link', 1, '{"drive_folder_id":"12cf-oPboTkEcNnQswHtulpiOd5mjp-rU"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (82, 1, 'PACK DRYWALL DESDE CERO', '🔧 Construcción en seco, techos, muros y acabados modernos.
📦 Contiene: 12 secciones (90)
⏱️ Duración/Tamaño: 20h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/82.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1IzcVPqeJFviIj1adOG5Wevv-A3ue3rce?usp=drive_link', 1, '{"drive_folder_id":"1IzcVPqeJFviIj1adOG5Wevv-A3ue3rce"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (83, 1, 'CURSO MECANICA DE MOTOS', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/83.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1lwkmabZu6_tueSkTbD8tqjW_s5pQ-G9j?usp=drive_link', 1, '{"drive_folder_id":"1lwkmabZu6_tueSkTbD8tqjW_s5pQ-G9j"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (84, 1, 'COLECCION ALBUMES', 'Acceso completo a COLECCION ALBUMES. Contenido actualizable, soporte técnico y descargas ilimitadas. Ideal para aprender y crecer profesionalmente.', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/84.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/18bLJSGnUktHpQCkrhgxNbmdLoVQ3Uw8j?usp=drive_link', 1, '{"drive_folder_id":"18bLJSGnUktHpQCkrhgxNbmdLoVQ3Uw8j"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (85, 1, 'PACK CANVA', '🎨 Dominio total de Canva para diseño de marcas y publicidad.
📦 Contiene: 10 secciones (85)
⏱️ Duración/Tamaño: 15h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/85.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1c8WbPa5DUn60kOFQDnzYIJ4konRonYBb?usp=drive_link', 1, '{"drive_folder_id":"1c8WbPa5DUn60kOFQDnzYIJ4konRonYBb"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (86, 1, 'PACK TERAPIA LENGUAJE Y AUTISMO', '📚 Biblioteca masiva de cultura general, finanzas y literatura.
📦 Contiene: 1 secciones (3700+ Libros)
⏱️ Duración/Tamaño: Lectura
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', 'https://drive.google.com/thumbnail?sz=w400&id=1wKh-TGJG5Xns9AN2mUbfgWQ5VgM4gtpf', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1wKh-TGJG5Xns9AN2mUbfgWQ5VgM4gtpf?usp=drive_link', 1, '{"drive_folder_id":"1wKh-TGJG5Xns9AN2mUbfgWQ5VgM4gtpf"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (87, 1, 'PACK CONTABILIDAD', '📚 Biblioteca masiva de cultura general, finanzas y literatura.
📦 Contiene: 1 secciones (3700+ Libros)
⏱️ Duración/Tamaño: Lectura
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/87.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1mNtIyWf4OcJE6mBZYuWI3GJoKu5kjMGs?usp=drive_link', 1, '{"drive_folder_id":"1mNtIyWf4OcJE6mBZYuWI3GJoKu5kjMGs"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (88, 1, 'EXPEDIENTES TECNICOS VIVIENDAS', '🏗️ Documentación para obras civiles, presupuestos y licitaciones.
📦 Contiene: 12 secciones (90)
⏱️ Duración/Tamaño: 20h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/88.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1FJRHM-F1DSQPCMUZ_XZVRNYdiUYYwvBd?usp=drive_link', 1, '{"drive_folder_id":"1FJRHM-F1DSQPCMUZ_XZVRNYdiUYYwvBd"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (89, 1, 'CURSO METRADOS LECTURA DE PLANOS', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/89.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1FlbQPrKD9Xnl-s12b_IwYfXbnH-lGITy?usp=drive_link', 1, '{"drive_folder_id":"1FlbQPrKD9Xnl-s12b_IwYfXbnH-lGITy"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (90, 1, 'CURSO REVIT BIM', '🏗️ Modelado Building Information Modeling (BIM) completo.
📦 Contiene: 25 secciones (150)
⏱️ Duración/Tamaño: 45h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/90.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1_yU91jX7qhFoAZotKxFSQp97Df1yWJIq?usp=drive_link', 1, '{"drive_folder_id":"1_yU91jX7qhFoAZotKxFSQp97Df1yWJIq"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (91, 1, 'EXPEDIENTES OBRAS RESIDENTE DE OBRAS', '🏗️ Documentación para obras civiles, presupuestos y licitaciones.
📦 Contiene: 12 secciones (90)
⏱️ Duración/Tamaño: 20h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Construcción', 'digital', '/images/products/91.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/11yNE6hP-O3plYkJ51uEnqqAUSDpeIHcR?usp=drive_link', 1, '{"drive_folder_id":"11yNE6hP-O3plYkJ51uEnqqAUSDpeIHcR"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (92, 1, 'PSICOLOGÍA PROFESIONAL', '🧘 Inteligencia emocional, terapia cognitivo conductual y salud mental.
📦 Contiene: 15 secciones (120)
⏱️ Duración/Tamaño: 30h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Educación', 'digital', '/images/products/92.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1TYkP23mP2XwusI610eDzU-b6UkXdH039?usp=drive_link', 1, '{"drive_folder_id":"1TYkP23mP2XwusI610eDzU-b6UkXdH039"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (93, 1, 'AULA VIRTUAL', '📚 Plataformas educativas, Moodle y herramientas para docentes.
📦 Contiene: 10 secciones (70)
⏱️ Duración/Tamaño: 15h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Educación', 'digital', 'https://drive.google.com/thumbnail?sz=w400&id=17wfcNztBCJKH76KkyQ0Y3dTRo_1Yvv9m', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/17wfcNztBCJKH76KkyQ0Y3dTRo_1Yvv9m?usp=drive_link', 1, '{"drive_folder_id":"17wfcNztBCJKH76KkyQ0Y3dTRo_1Yvv9m"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (94, 1, 'FOTOGRAFÍA PROFESIONAL', '🎨 Iluminación, composición y revelado digital (Lightroom).
📦 Contiene: 12 secciones (110)
⏱️ Duración/Tamaño: 22h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Fotografía', 'digital', '/images/products/94.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Edición profesional","Técnicas avanzadas"]', NULL, 'https://drive.google.com/drive/folders/1A7HNo0Udc8GDGRwL75illMjkhUXBlMsT?usp=drive_link', 1, '{"drive_folder_id":"1A7HNo0Udc8GDGRwL75illMjkhUXBlMsT"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (95, 1, 'PREUNIVERSITARIO', '📚 Matemáticas, física, química y aptitud verbal para exámenes.
📦 Contiene: 40 secciones (350)
⏱️ Duración/Tamaño: 100h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/95.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1cnkyxl_sy4xwxx6pxtRmcceYGHsRwQYO?usp=drive_link', 1, '{"drive_folder_id":"1cnkyxl_sy4xwxx6pxtRmcceYGHsRwQYO"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (96, 1, 'GUITARRA ACÚSTICA', '🎵 Acordes, escalas, técnicas de punteo y canciones populares.
📦 Contiene: 15 secciones (180)
⏱️ Duración/Tamaño: 25h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/96.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1k8YJ1_VLfStY3VTAr5NXM5150EHDhB_Z?usp=drive_link', 1, '{"drive_folder_id":"1k8YJ1_VLfStY3VTAr5NXM5150EHDhB_Z"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (97, 1, 'ARMADO DE COMPUTADORA', '💻 Hardware, compatibilidad, refrigeración y mantenimiento técnico.
📦 Contiene: 10 secciones (60)
⏱️ Duración/Tamaño: 12h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Tecnología', 'digital', '/images/products/97.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1L9ibzLVoC4ui05TPVHKSH1xwe2UnTwX3?usp=drive_link', 1, '{"drive_folder_id":"1L9ibzLVoC4ui05TPVHKSH1xwe2UnTwX3"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (98, 1, 'INGENIERÍA', '🏗️ Cálculo, estructuras, hidrodinámica y software especializado.
📦 Contiene: 30 secciones (250)
⏱️ Duración/Tamaño: 60h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/98.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1I6NboyUItOOcqiaNDgo44nwQqCkd9e_l?usp=drive_link', 1, '{"drive_folder_id":"1I6NboyUItOOcqiaNDgo44nwQqCkd9e_l"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (99, 1, 'PACK DE LIBROS', '📚 Biblioteca masiva de cultura general, finanzas y literatura.
📦 Contiene: 1 secciones (3700+ Libros)
⏱️ Duración/Tamaño: Lectura
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Libros', 'digital', '/images/products/99.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1uVXzzL_aJAcc9WfNwNvLztoHTX_Ebosd?usp=drive_link', 1, '{"drive_folder_id":"1uVXzzL_aJAcc9WfNwNvLztoHTX_Ebosd"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (100, 1, 'DESARROLLO WEB', '💻 HTML5, CSS3, JavaScript, React y Backend.
📦 Contiene: 50 secciones (600)
⏱️ Duración/Tamaño: 120h+
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Programación', 'digital', '/images/products/100.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Código fuente","Proyectos reales"]', NULL, 'https://drive.google.com/drive/folders/1jyqiiV6lELw7wfPVe5Oaq2TliSwwhAGs?usp=drive_link', 1, '{"drive_folder_id":"1jyqiiV6lELw7wfPVe5Oaq2TliSwwhAGs"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (101, 1, 'CONSOLA EN MÓVIL - REPARACIÓN', '💻 Lógica de programación, terminal y fundamentos de sistemas.
📦 Contiene: 15 secciones (120)
⏱️ Duración/Tamaño: 20h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Tecnología', 'digital', '/images/products/101.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1gdyCA5It2qtpyMD4jF_sGfX63Do8bmKW?usp=drive_link', 1, '{"drive_folder_id":"1gdyCA5It2qtpyMD4jF_sGfX63Do8bmKW"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (102, 1, 'ARQUITECTURA', '🏗️ AutoCAD, modelado 3D, renders y lectura de planos.
📦 Contiene: 25 secciones (200)
⏱️ Duración/Tamaño: 50h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Construcción', 'digital', '/images/products/102.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1G1LVh9ENN7UoROGm-zXla9YkYydHpNzh?usp=drive_link', 1, '{"drive_folder_id":"1G1LVh9ENN7UoROGm-zXla9YkYydHpNzh"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (103, 1, 'PROYECTOS', '💰 Modelos de negocio, planes de inversión y escalamiento.
📦 Contiene: 15 secciones (100)
⏱️ Duración/Tamaño: 25h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/103.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1GlFylHZSijsVv7ibX0Qf6armpasr9oDj?usp=drive_link', 1, '{"drive_folder_id":"1GlFylHZSijsVv7ibX0Qf6armpasr9oDj"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (104, 1, 'DJ PRODUCCIÓN MUSICAL', '🎵 Mezcla, FL Studio, Ableton Live y teoría musical moderna.
📦 Contiene: 20 secciones (150)
⏱️ Duración/Tamaño: 30h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Música', 'digital', '/images/products/104.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1Rxc7dwMcUB54HLjsbzW7cQIW31nXrnzw?usp=drive_link', 1, '{"drive_folder_id":"1Rxc7dwMcUB54HLjsbzW7cQIW31nXrnzw"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (105, 1, 'FX PREMIERE', '🎨 Transiciones, efectos, LUTS y presets para edición de video pro.
📦 Contiene: 15 secciones (120)
⏱️ Duración/Tamaño: 20h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/105.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1f2fpt8pA535h5EDGBTA8Bxu0wmEIOHZy?usp=drive_link', 1, '{"drive_folder_id":"1f2fpt8pA535h5EDGBTA8Bxu0wmEIOHZy"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (106, 1, 'SUBLIMADOS', '🧵 Plantillas para tazas, camisas y gorras. Técnicas de estampado.
📦 Contiene: 12 secciones (4000+ Diseños)
⏱️ Duración/Tamaño: 8h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/106.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1LmnN1URGfJgJ_c0yQ682y2rpfrznGriy?usp=drive_link', 1, '{"drive_folder_id":"1LmnN1URGfJgJ_c0yQ682y2rpfrznGriy"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (107, 1, 'SÚPER MEMORIA', '📚 Técnicas de lectura rápida, mnemotecnia y aprendizaje acelerado.
📦 Contiene: 10 secciones (80)
⏱️ Duración/Tamaño: 12h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/107.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/18BBOqD7rZzqLOtmkrTOWXtQCBVki9Fdy?usp=drive_link', 1, '{"drive_folder_id":"18BBOqD7rZzqLOtmkrTOWXtQCBVki9Fdy"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (108, 1, 'GASTRONOMÍA', '🔧 Cocina internacional, repostería, panadería y coctelería.
📦 Contiene: 18 secciones (140)
⏱️ Duración/Tamaño: 30h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Salud y Deporte', 'digital', '/images/products/108.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1DHfAMFXd9u_F7AHmpMLeOYouHLNNTiMs?usp=drive_link', 1, '{"drive_folder_id":"1DHfAMFXd9u_F7AHmpMLeOYouHLNNTiMs"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (109, 1, 'LIBROS MARKETING', '📚 Biblioteca de los mejores autores de marketing y ventas.
📦 Contiene: 1 secciones (500+ Ebooks)
⏱️ Duración/Tamaño: Lectura
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Marketing', 'digital', '/images/products/109.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1KY5XUrO8VuIkvflY-yFqLudIxBjhglHS?usp=drive_link', 1, '{"drive_folder_id":"1KY5XUrO8VuIkvflY-yFqLudIxBjhglHS"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (110, 1, 'PORTADAS EDITABLES', '🎨 Identidad visual, logos y portadas para redes sociales.
📦 Contiene: 10 secciones (1000+ Editables)
⏱️ Duración/Tamaño: Recurso
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/110.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/196SMTqFc91IW0pxXhWj0fiYGxJYCzF8m?usp=drive_link', 1, '{"drive_folder_id":"196SMTqFc91IW0pxXhWj0fiYGxJYCzF8m"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (111, 1, 'CUADROS EDITABLES', '🎨 Diseños para cuadros polípticos, canvas y decoración de interiores.
📦 Contiene: 15 secciones (500+ Diseños)
⏱️ Duración/Tamaño: Recurso
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/111.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1fg_SpIlaJ59bH-jH91nT_pTjGfshuXop?usp=drive_link', 1, '{"drive_folder_id":"1fg_SpIlaJ59bH-jH91nT_pTjGfshuXop"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (112, 1, 'KID IMPRIMIBLE', '🧵 Juegos, agendas y material educativo para niños listo para imprimir.
📦 Contiene: 20 secciones (3000+ PDFs)
⏱️ Duración/Tamaño: Recurso
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/112.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1YFZ3IjUZjiBFYkgKyuADHVseSOQ7w0EF?usp=drive_link', 1, '{"drive_folder_id":"1YFZ3IjUZjiBFYkgKyuADHVseSOQ7w0EF"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (113, 1, 'INSTALADORES', '💻 Software esencial y utilitarios pre-activados para PC.
📦 Contiene: 8 secciones (100+ Softwares)
⏱️ Duración/Tamaño: Herramienta
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/113.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1BwOD8G8DNRIFEOu97mBqdMtohyT8tNl5?usp=drive_link', 1, '{"drive_folder_id":"1BwOD8G8DNRIFEOu97mBqdMtohyT8tNl5"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (114, 1, 'MARKETING DIGITAL', '🚀 Facebook Ads, Google Ads, SEO y Estrategia de Contenidos.
📦 Contiene: 50 secciones (600)
⏱️ Duración/Tamaño: 100h+
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Marketing', 'digital', '/images/products/114.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1OfYcPn5UnlwBZ15GNGCyToVCv4xhaEUb?usp=drive_link', 1, '{"drive_folder_id":"1OfYcPn5UnlwBZ15GNGCyToVCv4xhaEUb"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (115, 1, 'DISEÑO GRÁFICO', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Diseño Gráfico', 'digital', '/images/products/115.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos"]', NULL, 'https://drive.google.com/drive/folders/154AjtnTpPp8Xy7gqClutmEA5ByV3UELe?usp=drive_link', 1, '{"drive_folder_id":"154AjtnTpPp8Xy7gqClutmEA5ByV3UELe"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (116, 1, 'INFOGRAFÍAS', '🎨 Más de 2000 plantillas premium para presentaciones impactantes.
📦 Contiene: 10 secciones (2000+ Archivos)
⏱️ Duración/Tamaño: Recurso
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/116.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1-RIJyRowZR_Wvh7tmg6A7p4kI8bspqrJ?usp=drive_link', 1, '{"drive_folder_id":"1-RIJyRowZR_Wvh7tmg6A7p4kI8bspqrJ"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (117, 1, 'CURSO HACKING ÉTICO', '💻 Pentesting, Kali Linux, seguridad de redes y auditoría.
📦 Contiene: 30 secciones (250)
⏱️ Duración/Tamaño: 40h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/117.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1udXRUHpa_pPPusFaF8zHpJTrcv_1iFF5?usp=drive_link', 1, '{"drive_folder_id":"1udXRUHpa_pPPusFaF8zHpJTrcv_1iFF5"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (118, 1, 'EXCEL', '📊 Tablas dinámicas, funciones avanzadas y dashboards.
📦 Contiene: 12 secciones (120)
⏱️ Duración/Tamaño: 25h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Programación', 'digital', '/images/products/118.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1zSaSxFPK2OVx8XlXc3Exw2LhNizdk5r3?usp=drive_link', 1, '{"drive_folder_id":"1zSaSxFPK2OVx8XlXc3Exw2LhNizdk5r3"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (119, 1, 'INGLES', '🌍 Gramática, pronunciación y audios nativos (A1 a C1).
📦 Contiene: 12 secciones (150)
⏱️ Duración/Tamaño: 40h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/119.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1DhqmwTVl1pRgkz2fUBVassqi7TfCy2Ko?usp=drive_link', 1, '{"drive_folder_id":"1DhqmwTVl1pRgkz2fUBVassqi7TfCy2Ko"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (120, 1, '📂2 OFFICE', '💼 Word, PowerPoint, Access y Outlook empresarial.
📦 Contiene: 15 secciones (180)
⏱️ Duración/Tamaño: 35h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'General', 'digital', '/images/products/120.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas"]', NULL, 'https://drive.google.com/drive/folders/1YnIPCyHnYkSsqhihaeEC_tqXPm5YNxfE?usp=drive_link', 1, '{"drive_folder_id":"1YnIPCyHnYkSsqhihaeEC_tqXPm5YNxfE"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (121, 1, 'CURSOS DISEÑO GRÁFICO', '🎨 Photoshop, Illustrator, InDesign y Corel de básico a experto.
📦 Contiene: 45 secciones (420)
⏱️ Duración/Tamaño: 65h
✨ Beneficios:
- Contenido en Alta Definición (HD)
- Acceso permanente vía Google Drive
- Actualizaciones constantes incluidas
- Certificación de participación (Opcional)
- Soporte técnico Tecnovariedades', 20000, 'COP', NULL, 1, 'Diseño Gráfico', 'digital', '/images/products/121.jpg', NULL, '["Acceso permanente","Contenido actualizable","Soporte técnico","Descargas ilimitadas","Herramientas de diseño","Proyectos prácticos"]', NULL, 'https://drive.google.com/drive/folders/1cC2KxNIKN0cNywfqKnmHvWVuyOI-F4k9?usp=drive_link', 1, '{"drive_folder_id":"1cC2KxNIKN0cNywfqKnmHvWVuyOI-F4k9"}', '2026-05-31 18:39:27');
INSERT INTO products (id, tenant_id, name, description, price, currency, sku, category_id, category, kind, image_url, highlight, features, payment_link, delivery_link, is_active, metadata, created_at) VALUES (122, 1, 'MEGAPACK COMPLETO 81 EN 1', '🚀 ACCESO TOTAL VIP (81 EN 1)
Obtén acceso a la colección completa de todos nuestros cursos, plantillas y herramientas digitales con un solo pago.
📦 Contiene: +81 Megapacks Premium
⏱️ Acceso: De por vida
✨ Beneficios:
- Descarga ilimitada vía Google Drive
- Todas las categorías incluidas (Diseño, Programación, Negocios, etc.)
- Actualizaciones de por vida
- Soporte prioritario', 60000, 'COP', NULL, NULL, 'Megapacks Digitales', 'digital', '/images/products/122.jpg', NULL, NULL, NULL, NULL, 1, NULL, '2026-05-31 19:02:52');
INSERT INTO settings (id, business_name, business_description, timezone, working_hours_start, working_hours_end, auto_reply_enabled, off_hours_message, escalation_keywords, ai_provider, github_token, github_model, copilot_session_token, copilot_session_expires_at, nvidia_api_key, nvidia_model, ollama_url, ollama_model, business_config) VALUES (1, 'TecnoVariedades', 'Tienda virtual de productos digitales y servicios tecnológicos', 'America/Bogota', '09:00', '18:00', 1, 'Gracias por escribirnos. Un asesor te responderá en horario de atención.', '"[]"', 'nvidia_nim_bridge', NULL, 'gpt-4o-mini', NULL, NULL, NULL, 'meta/llama-3.1-70b-instruct', NULL, 'hermes3:8b', '"{}"');
INSERT INTO tenants (id, name, email, password_hash, slug, domain, status, plan, brand_name, brand_logo, brand_colors, brand_theme, brand_social, agent_personality, agent_prompt, agent_name, contact_email, contact_phone, support_email, payment_methods, woocommerce_integration, limits, settings, subscription_id, subscription_status, trial_ends_at, subscription_ends_at, metadata, email_verified, email_verification_code, email_verification_expiry, password_reset_code, password_reset_expiry, two_factor_enabled, two_factor_secret, created_at, updated_at) VALUES (1, 'Davey Mena', 'daveymena16@gmail.com', '30f4c9b1f0e87f7680064ccc40d0c725b6213828fe7578579f01fa1a3bc56093', 'sofia-premium', NULL, 'active', 'enterprise', 'TecnoVariedades', NULL, NULL, NULL, NULL, 'professional', NULL, 'Sofía', NULL, NULL, NULL, NULL, NULL, NULL, '{"timezone":"America/Bogota","language":"es","currency":"COP","autoRespond":true}', NULL, NULL, NULL, NULL, NULL, 1, NULL, NULL, NULL, NULL, 0, NULL, '2026-05-28 02:38:31', '2026-05-28 02:38:31');
