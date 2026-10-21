#!/usr/bin/env python3
"""
Sistema de IA - Servidor Flask Optimizado
API REST con autenticación por API keys y frontend web
Optimizado para alta velocidad y rendimiento
"""

from flask import Flask, request, jsonify, render_template_string, send_from_directory, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_compress import Compress
from opencode_cli_wrapper import OpenCodeCLI, resolve_upstream_base_url
from auth_manager import AuthManager
import os
import logging
import sys
import time
import json
import hashlib
from datetime import datetime, timedelta
from functools import wraps, lru_cache
from dotenv import load_dotenv

# Cargar .env antes de leer cualquier variable de entorno
load_dotenv()

# Configuración optimizada
class Config:
    OPENCODE_ZEN_API_KEY = os.environ.get('OPENCODE_ZEN_API_KEY')
    PORT = int(os.environ.get('PORT', 5000))
    DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    DEFAULT_MODEL = os.environ.get('DEFAULT_MODEL', 'deepseek-v4-flash-free')
    MAX_TIMEOUT = int(os.environ.get('MAX_TIMEOUT', 180))
    OPENCODE_ZEN_BASE_URL = resolve_upstream_base_url()
    RATE_LIMIT_PER_MINUTE = int(os.environ.get('RATE_LIMIT_PER_MINUTE', 100))  # Aumentado
    API_KEY = os.environ.get('API_KEY') or "sk-REEMPLAZA_CON_TU_CLAVE"
    
    # Configuraciones de cache
    CACHE_TIMEOUT = int(os.environ.get('CACHE_TIMEOUT', 300))  # 5 minutos
    MODELS_CACHE_TIMEOUT = int(os.environ.get('MODELS_CACHE_TIMEOUT', 3600))  # 1 hora

config = Config()

# Cache en memoria simple
class SimpleCache:
    def __init__(self):
        self._cache = {}
        self._timestamps = {}
    
    def get(self, key, timeout=300):
        if key in self._cache:
            if time.time() - self._timestamps[key] < timeout:
                return self._cache[key]
            else:
                del self._cache[key]
                del self._timestamps[key]
        return None
    
    def set(self, key, value):
        self._cache[key] = value
        self._timestamps[key] = time.time()
    
    def clear(self):
        self._cache.clear()
        self._timestamps.clear()

# Cache global
cache = SimpleCache()

# Configurar logging optimizado
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/opencode-api.log') if os.path.exists('logs') else logging.NullHandler(),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Crear app Flask optimizada
app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False  # Mejor rendimiento JSON
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False  # JSON compacto

# Habilitar compresión
Compress(app)

# CORS optimizado
CORS(app, 
     origins="*",
     methods=["GET", "POST", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "X-API-Key"],
     max_age=3600)  # Cache preflight por 1 hora

# Rate limiting optimizado
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{config.RATE_LIMIT_PER_MINUTE} per minute"],
    storage_uri="memory://",
    strategy="moving-window"  # Más suave que fixed-window
)
limiter.init_app(app)

# Cliente OpenCode
try:
    # Detectar si estamos en contenedor (Linux) o Windows
    opencode_cmd = "opencode" if os.name != 'nt' else "opencode.cmd"
    client = OpenCodeCLI(opencode_cmd, default_model=config.DEFAULT_MODEL)
    logger.info(
        "Cliente OpenCode listo — upstream: %s, modelo: %s",
        client.base_url,
        config.DEFAULT_MODEL,
    )
except Exception as e:
    logger.error(f"Error inicializando cliente OpenCode: {e}")
    client = None

# Gestor de autenticación
auth_manager = AuthManager()
logger.info("Gestor de autenticación inicializado")


def _openai_error_response(exc: Exception, status: int = 500):
    """Mapea excepciones del upstream a códigos HTTP OpenAI-compatibles."""
    msg = str(exc)
    if status == 500 and ("RATE_LIMIT" in msg or "FreeUsageLimit" in msg or "Rate limit" in msg):
        status = 429
        err_type = "rate_limit_error"
        msg = "Rate limit alcanzado en Zen API. Los modelos free están saturados. Por favor intenta en unos minutos o compra créditos en https://opencode.ai/zen"
    elif "Invalid API key" in msg or "Error HTTP 401" in msg:
        status = 401
        err_type = "auth_error"
        msg = "Error de autenticación en Zen API: API Key inválida o sin acceso a este modelo"
    elif "Timeout" in msg:
        status = 504
        err_type = "timeout_error"
    elif "Error HTTP 502" in msg or "Error HTTP 503" in msg:
        status = 502
        err_type = "upstream_error"
    else:
        err_type = "server_error"
    return jsonify({"error": {"message": msg, "type": err_type}}), status


# Autenticación optimizada con cache
def require_api_key(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Obtener API key del header X-API-Key o Authorization: Bearer
        api_key = request.headers.get('X-API-Key')
        
        if not api_key:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                api_key = auth_header.split(' ')[1]
        
        # Si no hay API key y se requiere, retornar error
        if not api_key:
            return jsonify({
                'error': 'API key requerida',
                'message': 'Incluye tu API key en el header X-API-Key o Authorization: Bearer'
            }), 401
        
        # Cache de validación de API keys (5 minutos)
        cache_key = f"api_key_validation:{hashlib.md5(api_key.encode()).hexdigest()}"
        cached_result = cache.get(cache_key, timeout=300)
        
        if cached_result:
            request.api_key_data = cached_result
            request.api_key = api_key
            return f(*args, **kwargs)
        
        # Validar API key
        is_valid = False
        key_data = None
        
        # 1. Validar contra variables de entorno fijas
        if config.API_KEY and api_key == config.API_KEY:
            is_valid = True
            key_data = {
                'id': 0,
                'name': 'API_KEY Env Var',
                'owner': 'admin',
                'rate_limit': 1000,
                'usage_count': 0
            }
        elif config.OPENCODE_ZEN_API_KEY and api_key == config.OPENCODE_ZEN_API_KEY:
            is_valid = True
            key_data = {
                'id': 0,
                'name': 'OPENCODE_ZEN_API_KEY Env Var',
                'owner': 'admin',
                'rate_limit': 1000,
                'usage_count': 0
            }
        else:
            # 2. Validar contra la base de datos SQLite
            try:
                is_valid, key_data = auth_manager.validate_api_key(api_key)
            except Exception as e:
                logger.error(f"Error validando API key en DB: {e}")
                is_valid = False
        
        if not is_valid:
            return jsonify({
                'error': 'API key inválida o expirada',
                'message': 'Verifica tu API key'
            }), 401
        
        # Cachear resultado válido
        cache.set(cache_key, key_data)
        
        # Pasar datos de la key al endpoint
        request.api_key_data = key_data
        request.api_key = api_key
        
        return f(*args, **kwargs)
    
    return decorated_function

# Cache para modelos disponibles
@lru_cache(maxsize=1)
def get_cached_models():
    """Cache de modelos disponibles por 1 hora"""
    return {
        'models': [
            {
                'id': 'opencode/deepseek-v4-flash-free',
                'name': 'DeepSeek V4 Flash',
                'description': 'Rápido y versátil para uso general',
                'free': True,
                'speed': 5,
                'quality': 4
            },
            {
                'id': 'opencode/qwen3.6-plus-free',
                'name': 'Qwen 3.6 Plus',
                'description': 'Excelente para generación de código',
                'free': True,
                'speed': 4,
                'quality': 5
            },
            {
                'id': 'opencode/minimax-m2.5-free',
                'name': 'Minimax M2.5',
                'description': 'Bueno para conversación natural',
                'free': True,
                'speed': 4,
                'quality': 4
            },
            {
                'id': 'opencode/nemotron-3-super-free',
                'name': 'Nemotron 3 Super',
                'description': 'Análisis profundo y razonamiento',
                'free': True,
                'speed': 3,
                'quality': 5
            }
        ],
        'default': config.DEFAULT_MODEL,
        'cached_at': datetime.utcnow().isoformat()
    }


# HTML para interfaz web
HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>OpenCode Free AI</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f5f5f5;
        }
        .container { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; margin-bottom: 30px; }
        .chat-container { 
            border: 1px solid #ddd; 
            height: 400px; 
            overflow-y: auto; 
            padding: 15px; 
            margin: 20px 0; 
            background: #fafafa;
            border-radius: 8px;
        }
        .input-container { 
            display: flex; 
            gap: 10px; 
            margin-top: 20px;
        }
        input[type="text"] { 
            flex: 1; 
            padding: 12px; 
            border: 1px solid #ddd; 
            border-radius: 6px;
            font-size: 16px;
        }
        button { 
            padding: 12px 24px; 
            background: #007bff; 
            color: white; 
            border: none; 
            border-radius: 6px;
            cursor: pointer; 
            font-size: 16px;
            transition: background 0.2s;
        }
        button:hover { background: #0056b3; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        .message { 
            margin: 15px 0; 
            padding: 12px; 
            border-radius: 8px; 
            max-width: 80%;
        }
        .user { 
            background: #e3f2fd; 
            margin-left: auto;
            text-align: right; 
        }
        .bot { 
            background: #f5f5f5; 
            border-left: 4px solid #007bff;
        }
        .loading { color: #666; font-style: italic; }
        .model-selector {
            margin: 20px 0;
            text-align: center;
        }
        select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
        }
        .info {
            background: #e8f4fd;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #007bff;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 OpenCode Free AI</h1>
        
        <div class="info">
            <strong>Modelos Gratuitos Disponibles:</strong>
            <ul>
                <li><strong>DeepSeek V4 Flash:</strong> Rápido y versátil</li>
                <li><strong>Qwen 3.6 Plus:</strong> Excelente para código</li>
                <li><strong>Minimax M2.5:</strong> Bueno para conversación</li>
            </ul>
        </div>

        <div class="model-selector">
            <label for="model">Modelo: </label>
            <select id="model">
                <option value="">Por defecto (DeepSeek V4 Flash)</option>
                <option value="opencode/qwen3.6-plus-free">Qwen 3.6 Plus (Código)</option>
                <option value="opencode/minimax-m2.5-free">Minimax M2.5 (Conversación)</option>
                <option value="opencode/nemotron-3-super-free">Nemotron 3 Super (Análisis)</option>
            </select>
        </div>

        <div id="chat" class="chat-container">
            <div class="message bot">
                🤖 ¡Hola! Soy tu asistente de IA gratuito. Puedo ayudarte con:
                <ul>
                    <li>Responder preguntas</li>
                    <li>Generar código</li>
                    <li>Explicar conceptos</li>
                    <li>Resolver problemas</li>
                </ul>
                ¿En qué puedo ayudarte?
            </div>
        </div>

        <div class="input-container">
            <input type="text" id="message" placeholder="Escribe tu mensaje..." onkeypress="if(event.key==='Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }">
            <button id="sendBtn" onclick="sendMessage()">Enviar</button>
        </div>
    </div>

    <script>
        let isLoading = false;

        async function sendMessage() {
            if (isLoading) return;
            
            const input = document.getElementById('message');
            const sendBtn = document.getElementById('sendBtn');
            const modelSelect = document.getElementById('model');
            
            const message = input.value.trim();
            if (!message) return;

            // UI updates
            addMessage('user', message);
            input.value = '';
            isLoading = true;
            sendBtn.disabled = true;
            sendBtn.textContent = 'Enviando...';

            const loadingMsg = addMessage('bot', '🤔 Pensando...', 'loading');

            try {
                const payload = { message };
                if (modelSelect.value) {
                    payload.model = modelSelect.value;
                }

                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const data = await response.json();
                
                // Remove loading message
                loadingMsg.remove();
                
                if (data.success) {
                    addMessage('bot', data.response);
                } else {
                    addMessage('bot', '❌ Error: ' + (data.error || 'Error desconocido'));
                }
            } catch (error) {
                loadingMsg.remove();
                addMessage('bot', '❌ Error de conexión: ' + error.message);
            } finally {
                isLoading = false;
                sendBtn.disabled = false;
                sendBtn.textContent = 'Enviar';
                input.focus();
            }
        }

        function addMessage(type, text, className = '') {
            const chat = document.getElementById('chat');
            const div = document.createElement('div');
            div.className = `message ${type} ${className}`;
            
            if (type === 'user') {
                div.textContent = text;
            } else {
                // Para mensajes del bot, permitir HTML básico
                div.innerHTML = text.replace(/\\n/g, '<br>');
            }
            
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
            return div;
        }

        // Focus en input al cargar
        document.getElementById('message').focus();
    </script>
</body>
</html>
"""

# Rutas
@app.route('/')
def index():
    """Página principal - siempre servir el dashboard (el frontend maneja la redirección)"""
    return send_from_directory('templates', 'dashboard.html')

@app.route('/login')
def login_page():
    """Página de login"""
    return send_from_directory('templates', 'login.html')

@app.route('/dashboard')
def dashboard_page():
    """Página del dashboard"""
    return send_from_directory('templates', 'dashboard.html')

@app.route('/api/chat', methods=['POST'])
@require_api_key
def chat():
    """API endpoint para chat"""
    if not client:
        return jsonify({
            'success': False,
            'error': 'Cliente OpenCode no disponible'
        }), 503
    
    try:
        start_time = time.time()
        
        # Obtener datos del request
        try:
            data = request.get_json(force=True, silent=True) or {}
        except:
            data = {}
        
        message = data.get('message')
        model = data.get('model')
        
        if not message:
            return jsonify({'error': 'Mensaje requerido'}), 400
        
        logger.info(f"Chat request from {request.api_key_data['owner']}: {message[:50]}... (model: {model or 'default'})")
        
        response = client.chat(
            message, 
            model=model, 
            timeout=config.MAX_TIMEOUT
        )
        
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Registrar uso
        auth_manager.log_api_usage(
            request.api_key,
            '/api/chat',
            'POST',
            200,
            response_time_ms
        )
        
        logger.info(f"Chat response: {response[:50]}... (time: {response_time_ms}ms)")
        
        return jsonify({
            'success': True,
            'response': response,
            'model': model or config.DEFAULT_MODEL,
            'response_time_ms': response_time_ms
        })
    
    except Exception as e:
        logger.error(f"Error en chat: {e}")
        try:
            auth_manager.log_api_usage(
                request.api_key,
                '/api/chat',
                'POST',
                500,
                0
            )
        except:
            pass
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/generate-code', methods=['POST'])
@require_api_key
def generate_code():
    """API endpoint para generar código"""
    if not client:
        return jsonify({
            'success': False,
            'error': 'Cliente OpenCode no disponible'
        }), 503
    
    try:
        # Obtener datos del request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        description = data.get('description')
        language = data.get('language', 'Python')
        
        if not description:
            return jsonify({'error': 'Descripción requerida'}), 400
        
        logger.info(f"Code generation request: {description[:50]}... (language: {language})")
        
        code = client.generate_code(description, language)
        
        return jsonify({
            'success': True,
            'code': code,
            'language': language
        })
    
    except Exception as e:
        logger.error(f"Error generando código: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/explain-code', methods=['POST'])
@require_api_key
def explain_code():
    """API endpoint para explicar código"""
    if not client:
        return jsonify({
            'success': False,
            'error': 'Cliente OpenCode no disponible'
        }), 503
    
    try:
        # Obtener datos del request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        code = data.get('code')
        
        if not code:
            return jsonify({'error': 'Código requerido'}), 400
        
        logger.info(f"Code explanation request: {code[:50]}...")
        
        explanation = client.explain_code(code)
        
        return jsonify({
            'success': True,
            'explanation': explanation
        })
    
    except Exception as e:
        logger.error(f"Error explicando código: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/health')
def health():
    """Health check detallado"""
    try:
        zen = getattr(client, 'zen_status', None) if client else None
        opencode_status = 'connected' if client and zen and zen.get('ok') else (
            'not_initialized' if not client else zen.get('status', 'degraded') if zen else 'unknown'
        )
        return jsonify({
            'status': 'healthy' if client else 'degraded',
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'opencode-free-api',
            'version': '1.0.0',
            'opencode_status': opencode_status,
            'zen_upstream': client.base_url if client else None,
            'zen_models': zen.get('model_count') if zen else None,
            'default_model': config.DEFAULT_MODEL,
            'hint': (
                'Si chat falla con 429: añade créditos en opencode.ai/zen o espera rate limit. '
                'OPENCODE_ZEN_API_KEY debe ser la de Zen, no API_KEY del proxy.'
            ) if zen and not zen.get('ok') else None,
        })
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 503

@app.route('/api/models')
def list_models():
    """Listar modelos disponibles - Con cache optimizado"""
    return jsonify(get_cached_models())

@app.route('/api/stats')
@require_api_key
def stats():
    """Estadísticas básicas (requiere API key)"""
    return jsonify({
        'uptime': 'N/A',  # Implementar si es necesario
        'requests_today': 'N/A',  # Implementar con base de datos
        'models_available': 4,
        'status': 'operational'
    })

# ─── Endpoints de Autenticación y Gestión de Keys ───────────────────────────────

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Registrar nuevo usuario"""
    try:
        # Obtener datos del request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        username = data.get('username')
        password = data.get('password')
        email = data.get('email', '')
        
        if not username or not password:
            return jsonify({'error': 'Username y password requeridos'}), 400
        
        if len(password) < 6:
            return jsonify({'error': 'Password debe tener al menos 6 caracteres'}), 400
        
        success = auth_manager.create_user(username, password, email)
        
        if not success:
            return jsonify({'error': 'Usuario ya existe'}), 409
        
        # Generar una API key automáticamente para el nuevo usuario
        api_key, key_prefix = auth_manager.generate_api_key(username, username, f"Default key for {username}")
        
        logger.info(f"Nuevo usuario registrado: {username}")
        
        return jsonify({
            'success': True,
            'message': 'Usuario registrado exitosamente',
            'username': username,
            'api_key': api_key
        }), 201
    
    except Exception as e:
        logger.error(f"Error en registro: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login de usuario"""
    try:
        # Obtener datos del request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({'error': 'Username y password requeridos'}), 400
        
        is_valid, user = auth_manager.verify_user(username, password)
        
        if not is_valid:
            return jsonify({'error': 'Credenciales inválidas'}), 401
        
        logger.info(f"Login exitoso: {username}")
        
        # Obtener la primera API key activa del usuario
        api_keys = auth_manager.list_api_keys(username)
        active_keys = [k for k in api_keys if k.get('is_active') and k.get('raw_key')]
        
        if active_keys:
            api_key = active_keys[0]['raw_key']
        else:
            api_key, key_prefix = auth_manager.generate_api_key(username, username, f"Default key for {username}")
        
        return jsonify({
            'success': True,
            'user': user,
            'api_key': api_key,
            'message': 'Login exitoso'
        })
    
    except Exception as e:
        logger.error(f"Error en login: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/keys/generate', methods=['POST'])
@require_api_key
def generate_api_key():
    """Generar nueva API key"""
    try:
        # Obtener datos del request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        name = data.get('name')
        description = data.get('description', '')
        expires_in_days = data.get('expires_in_days')
        rate_limit = data.get('rate_limit', 60)
        
        if not name:
            return jsonify({'error': 'Nombre de la key requerido'}), 400
        
        owner = request.api_key_data['owner']
        
        api_key, key_prefix = auth_manager.generate_api_key(
            name=name,
            owner=owner,
            description=description,
            expires_in_days=expires_in_days,
            rate_limit=rate_limit
        )
        
        logger.info(f"Nueva API key generada para {owner}: {key_prefix}")
        
        return jsonify({
            'success': True,
            'api_key': api_key,
            'key_prefix': key_prefix,
            'name': name,
            'message': 'Guarda esta API key en un lugar seguro. No podrás verla de nuevo.'
        }), 201
    
    except Exception as e:
        logger.error(f"Error generando API key: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/keys/list', methods=['GET'])
@require_api_key
def list_api_keys():
    """Listar API keys del usuario"""
    try:
        owner = request.api_key_data['owner']
        keys = auth_manager.list_api_keys(owner)
        
        return jsonify({
            'success': True,
            'keys': keys,
            'total': len(keys)
        })
    
    except Exception as e:
        logger.error(f"Error listando API keys: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/keys/revoke', methods=['POST'])
@require_api_key
def revoke_api_key():
    """Revocar una API key"""
    try:
        # Obtener datos del request
        if request.is_json:
            data = request.get_json()
        else:
            data = request.form.to_dict()
        
        # Aceptar tanto 'api_key' como 'key_prefix'
        key_to_revoke = data.get('api_key') or data.get('key_prefix')
        
        if not key_to_revoke:
            return jsonify({'error': 'API key o key_prefix requerida'}), 400
        
        # Verificar que el usuario sea propietario de la key
        # Primero intentar como key completa
        is_valid, key_data = auth_manager.validate_api_key(key_to_revoke)
        
        if not is_valid:
            # Si no es válida como key completa, buscar por prefijo
            keys = auth_manager.list_api_keys(request.api_key_data['owner'])
            matching_key = next((k for k in keys if k['key_prefix'] == key_to_revoke), None)
            if not matching_key:
                return jsonify({'error': 'API key no encontrada'}), 404
            key_data = {'owner': request.api_key_data['owner']}
        
        if key_data['owner'] != request.api_key_data['owner']:
            return jsonify({'error': 'No tienes permiso para revocar esta key'}), 403
        
        # Revocar por prefijo (que es lo que tenemos)
        success = auth_manager.revoke_api_key_by_prefix(key_to_revoke)
        
        if success:
            logger.info(f"API key revocada por {request.api_key_data['owner']}")
            return jsonify({
                'success': True,
                'message': 'API key revocada exitosamente'
            })
        else:
            return jsonify({'error': 'No se pudo revocar la API key'}), 500
    
    except Exception as e:
        logger.error(f"Error revocando API key: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/keys/stats', methods=['GET'])
@require_api_key
def get_key_stats():
    """Obtener estadísticas de la API key actual"""
    try:
        stats = auth_manager.get_api_key_stats(request.api_key)
        
        if not stats:
            return jsonify({'error': 'No se encontraron estadísticas'}), 404
        
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        logger.error(f"Error obteniendo estadísticas: {e}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/v1/chat/completions', methods=['POST'])
@require_api_key
def openai_chat_completions():
    """Endpoint compatible con OpenAI Chat Completions"""
    if not client:
        return jsonify({
            "error": {
                "message": "Cliente OpenCode no disponible",
                "type": "server_error"
            }
        }), 503
        
    try:
        import uuid
        import time
        import json
        from flask import Response
        
        start_time = time.time()
        
        # Obtener datos del request
        try:
            data = request.get_json(force=True, silent=True) or {}
        except:
            data = {}
            
        messages = data.get('messages', [])
        model = data.get('model', config.DEFAULT_MODEL)
        stream = data.get('stream', False)
        
        if not messages:
            return jsonify({
                "error": {
                    "message": "messages es requerido",
                    "type": "invalid_request_error"
                }
            }), 400

        api_messages = []
        for msg in messages:
            role = msg.get("role", "user")
            if role not in ("system", "user", "assistant"):
                role = "user"
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(
                    p.get("text", "") if isinstance(p, dict) else str(p)
                    for p in content
                )
            api_messages.append({"role": role, "content": str(content)})

        response_format = data.get("response_format", {})
        if isinstance(response_format, dict) and response_format.get("type") == "json_object":
            api_messages.append({
                "role": "system",
                "content": (
                    "Responde ÚNICAMENTE con JSON válido, sin markdown ni texto extra."
                ),
            })

        logger.info(f"OpenAI compatible request - Model: {model}, Stream: {stream}")

        response = client.complete_messages(
            api_messages,
            model=model,
            timeout=config.MAX_TIMEOUT,
        )
        
        response_time_ms = int((time.time() - start_time) * 1000)
        
        # Registrar uso
        try:
            auth_manager.log_api_usage(
                request.api_key,
                '/v1/chat/completions',
                'POST',
                200,
                response_time_ms
            )
        except:
            pass
            
        if stream:
            # Generador para simular streaming en formato OpenAI
            def generate_stream():
                chunk_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
                created_time = int(time.time())
                
                # Chunk de inicio / delta
                chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created_time,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {
                            "role": "assistant",
                            "content": response
                        },
                        "finish_reason": None
                    }]
                }
                yield f"data: {json.dumps(chunk)}\n\n"
                
                # Chunk de fin
                final_chunk = {
                    "id": chunk_id,
                    "object": "chat.completion.chunk",
                    "created": created_time,
                    "model": model,
                    "choices": [{
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop"
                    }]
                }
                yield f"data: {json.dumps(final_chunk)}\n\n"
                yield "data: [DONE]\n\n"
                
            return Response(generate_stream(), mimetype='text/event-stream')
            
        else:
            # Respuesta OpenAI estándar
            return jsonify({
                "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0
                }
            })
            
    except Exception as e:
        logger.error(f"Error en /v1/chat/completions: {e}")
        return _openai_error_response(e)


@app.route('/v1/responses', methods=['POST'])
@require_api_key
def openai_responses():
    """
    Endpoint compatible con OpenAI Responses API (usado por opencode v1.15+).
    Traduce el formato Responses API al formato chat/completions internamente.
    """
    if not client:
        return jsonify({
            "error": {
                "message": "Cliente OpenCode no disponible",
                "type": "server_error"
            }
        }), 503

    try:
        import uuid
        import time
        import json
        from flask import Response

        start_time = time.time()

        try:
            data = request.get_json(force=True, silent=True) or {}
        except:
            data = {}

        model = data.get('model', config.DEFAULT_MODEL)
        stream = data.get('stream', False)

        # Responses API usa "input" en lugar de "messages"
        input_data = data.get('input', [])

        # Convertir input al formato de mensajes
        messages = []
        if isinstance(input_data, str):
            messages = [{"role": "user", "content": input_data}]
        elif isinstance(input_data, list):
            for item in input_data:
                if isinstance(item, dict):
                    role = item.get('role', 'user')
                    content = item.get('content', '')
                    # content puede ser lista de objetos {type, text}
                    if isinstance(content, list):
                        text_parts = [c.get('text', '') for c in content if isinstance(c, dict)]
                        content = ' '.join(text_parts)
                    messages.append({"role": role, "content": content})

        if not messages:
            return jsonify({
                "error": {
                    "message": "input es requerido",
                    "type": "invalid_request_error"
                }
            }), 400

        api_messages = []
        for msg in messages:
            r = msg.get("role", "user")
            if r in ("developer",):
                r = "system"
            if r not in ("system", "user", "assistant"):
                r = "user"
            api_messages.append({"role": r, "content": str(msg.get("content", ""))})

        logger.info(f"Responses API request - Model: {model}, Stream: {stream}")

        response_text = client.complete_messages(
            api_messages,
            model=model,
            timeout=config.MAX_TIMEOUT,
        )

        response_time_ms = int((time.time() - start_time) * 1000)

        try:
            auth_manager.log_api_usage(
                request.api_key,
                '/v1/responses',
                'POST',
                200,
                response_time_ms
            )
        except:
            pass

        resp_id = f"resp_{uuid.uuid4().hex[:16]}"
        created_time = int(time.time())

        if stream:
            def generate_stream():
                # Evento response.created
                event = {
                    "type": "response.created",
                    "response": {
                        "id": resp_id,
                        "object": "realtime.response",
                        "status": "in_progress",
                        "model": model,
                        "output": []
                    }
                }
                yield f"data: {json.dumps(event)}\n\n"

                # Evento output_item.added
                yield f"data: {json.dumps({'type': 'response.output_item.added', 'output_index': 0, 'item': {'id': f'msg_{uuid.uuid4().hex[:8]}', 'type': 'message', 'role': 'assistant', 'content': []}})}\n\n"

                # Evento content_part.added
                yield f"data: {json.dumps({'type': 'response.content_part.added', 'output_index': 0, 'content_index': 0, 'part': {'type': 'output_text', 'text': ''}})}\n\n"

                # Enviar el texto completo como delta
                delta_event = {
                    "type": "response.output_text.delta",
                    "output_index": 0,
                    "content_index": 0,
                    "delta": response_text
                }
                yield f"data: {json.dumps(delta_event)}\n\n"

                # Evento done
                done_event = {
                    "type": "response.output_text.done",
                    "output_index": 0,
                    "content_index": 0,
                    "text": response_text
                }
                yield f"data: {json.dumps(done_event)}\n\n"

                # Evento response.completed
                completed = {
                    "type": "response.completed",
                    "response": {
                        "id": resp_id,
                        "object": "realtime.response",
                        "status": "completed",
                        "model": model,
                        "output": [{
                            "type": "message",
                            "role": "assistant",
                            "content": [{"type": "output_text", "text": response_text}]
                        }],
                        "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
                    }
                }
                yield f"data: {json.dumps(completed)}\n\n"
                yield "data: [DONE]\n\n"

            return Response(generate_stream(), mimetype='text/event-stream')

        else:
            return jsonify({
                "id": resp_id,
                "object": "response",
                "created_at": created_time,
                "model": model,
                "status": "completed",
                "output": [{
                    "type": "message",
                    "id": f"msg_{uuid.uuid4().hex[:8]}",
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": response_text}]
                }],
                "usage": {
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0
                }
            })

    except Exception as e:
        logger.error(f"Error en /v1/responses: {e}")
        return _openai_error_response(e)


@app.route('/v1/models', methods=['GET'])
@require_api_key
def list_openai_models():
    """Listar modelos en formato compatible con OpenAI (desde Zen si es posible)."""
    import time
    try:
        models_list = []
        if client and getattr(client, 'zen_status', {}).get('models'):
            for mid in client.zen_status['models']:
                models_list.append({
                    "id": f"opencode/{mid}" if not str(mid).startswith("opencode/") else mid,
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": "opencode",
                })
        if not models_list:
            for mid in (
                "deepseek-v4-flash-free",
                "minimax-m2.5-free",
                "qwen3.6-plus-free",
                "nemotron-3-super-free",
                "big-pickle",
            ):
                models_list.append({
                    "id": f"opencode/{mid}",
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": "opencode",
                })
        return jsonify({
            "object": "list",
            "data": models_list
        })
    except Exception as e:
        return jsonify({
            "error": {
                "message": str(e),
                "type": "server_error"
            }
        }), 500


# Error handlers
@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        'error': 'Rate limit exceeded',
        'message': str(e.description)
    }), 429

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {e}")
    return jsonify({
        'error': 'Internal server error',
        'message': 'Something went wrong'
    }), 500

if __name__ == '__main__':
    # Crear directorio de logs si no existe
    os.makedirs('logs', exist_ok=True)
    
    logger.info(f"Iniciando OpenCode Free API Server...")
    logger.info(f"Puerto: {config.PORT}")
    logger.info(f"Debug: {config.DEBUG}")
    logger.info(f"Modelo por defecto: {config.DEFAULT_MODEL}")
    logger.info(f"Rate limit: {config.RATE_LIMIT_PER_MINUTE} requests/minute")
    
    app.run(
        host='0.0.0.0', 
        port=config.PORT, 
        debug=config.DEBUG,
        threaded=True
    )