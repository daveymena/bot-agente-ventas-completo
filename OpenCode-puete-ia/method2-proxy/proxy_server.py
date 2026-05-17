#!/usr/bin/env python3
"""
Proxy Server para OpenCode
Expone los modelos gratuitos de OpenCode como una API compatible con OpenAI
"""

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import requests
import json
import time
import uuid
from typing import Dict, Any, Generator
import argparse
import logging

app = Flask(__name__)
CORS(app)

# Configuración
OPENCODE_SERVER_URL = "http://localhost:4096"
DEFAULT_MODEL = "deepseek/deepseek-v4-flash"

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class OpenCodeProxy:
    """Proxy que traduce peticiones OpenAI a OpenCode"""
    
    def __init__(self, opencode_url: str):
        self.opencode_url = opencode_url.rstrip('/')
        self.session = requests.Session()
    
    def chat_completion(
        self, 
        messages: list, 
        model: str = DEFAULT_MODEL,
        stream: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Traduce chat completion de OpenAI a OpenCode
        
        Args:
            messages: Lista de mensajes en formato OpenAI
            model: Modelo a usar
            stream: Si True, retorna streaming
            **kwargs: Parámetros adicionales
            
        Returns:
            Respuesta en formato OpenAI
        """
        # Convertir mensajes de OpenAI a formato OpenCode
        last_message = messages[-1]["content"] if messages else ""
        
        # Construir contexto de mensajes anteriores
        context = "\n".join([
            f"{msg['role']}: {msg['content']}" 
            for msg in messages[:-1]
        ]) if len(messages) > 1 else None
        
        payload = {
            "message": last_message,
            "stream": stream
        }
        
        if context:
            payload["context"] = context
        
        try:
            response = self.session.post(
                f"{self.opencode_url}/api/chat",
                json=payload,
                stream=stream,
                timeout=None if stream else 30
            )
            response.raise_for_status()
            
            if stream:
                return self._create_streaming_response(response, model)
            else:
                return self._create_completion_response(response.json(), model)
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error en petición a OpenCode: {e}")
            return self._create_error_response(str(e))
    
    def _create_completion_response(
        self, 
        opencode_response: Dict[str, Any], 
        model: str
    ) -> Dict[str, Any]:
        """Crea respuesta en formato OpenAI"""
        content = opencode_response.get("response", 
                                       opencode_response.get("message", ""))
        
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0
            }
        }
    
    def _create_streaming_response(
        self, 
        response, 
        model: str
    ) -> Generator[str, None, None]:
        """Crea respuesta streaming en formato OpenAI"""
        chunk_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
        
        for line in response.iter_lines():
            if line:
                try:
                    data = json.loads(line.decode('utf-8'))
                    content = data.get('chunk', data.get('message', ''))
                    
                    chunk = {
                        "id": chunk_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model,
                        "choices": [{
                            "index": 0,
                            "delta": {
                                "content": content
                            },
                            "finish_reason": None
                        }]
                    }
                    
                    yield f"data: {json.dumps(chunk)}\n\n"
                    
                except json.JSONDecodeError:
                    # Texto plano
                    content = line.decode('utf-8')
                    chunk = {
                        "id": chunk_id,
                        "object": "chat.completion.chunk",
                        "created": int(time.time()),
                        "model": model,
                        "choices": [{
                            "index": 0,
                            "delta": {"content": content},
                            "finish_reason": None
                        }]
                    }
                    yield f"data: {json.dumps(chunk)}\n\n"
        
        # Chunk final
        final_chunk = {
            "id": chunk_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {},
                "finish_reason": "stop"
            }]
        }
        yield f"data: {json.dumps(final_chunk)}\n\n"
        yield "data: [DONE]\n\n"
    
    def _create_error_response(self, error_message: str) -> Dict[str, Any]:
        """Crea respuesta de error en formato OpenAI"""
        return {
            "error": {
                "message": error_message,
                "type": "opencode_error",
                "code": "internal_error"
            }
        }


# Instancia global del proxy
proxy = OpenCodeProxy(OPENCODE_SERVER_URL)


@app.route('/v1/chat/completions', methods=['POST'])
def chat_completions():
    """Endpoint compatible con OpenAI Chat Completions"""
    try:
        data = request.json
        messages = data.get('messages', [])
        model = data.get('model', DEFAULT_MODEL)
        stream = data.get('stream', False)
        
        logger.info(f"Chat completion request - Model: {model}, Stream: {stream}")
        
        if stream:
            response = proxy.chat_completion(messages, model, stream=True)
            return Response(
                stream_with_context(response),
                mimetype='text/event-stream'
            )
        else:
            response = proxy.chat_completion(messages, model, stream=False)
            return jsonify(response)
            
    except Exception as e:
        logger.error(f"Error en /v1/chat/completions: {e}")
        return jsonify({
            "error": {
                "message": str(e),
                "type": "internal_error"
            }
        }), 500


@app.route('/v1/completions', methods=['POST'])
def completions():
    """Endpoint compatible con OpenAI Completions (legacy)"""
    try:
        data = request.json
        prompt = data.get('prompt', '')
        model = data.get('model', DEFAULT_MODEL)
        
        # Convertir a formato chat
        messages = [{"role": "user", "content": prompt}]
        
        response = proxy.chat_completion(messages, model, stream=False)
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error en /v1/completions: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/v1/models', methods=['GET'])
def list_models():
    """Lista modelos disponibles"""
    return jsonify({
        "object": "list",
        "data": [
            {
                "id": "deepseek-v4-flash",
                "object": "model",
                "created": int(time.time()),
                "owned_by": "opencode-zen",
                "permission": [],
                "root": "deepseek-v4-flash",
                "parent": None
            },
            {
                "id": DEFAULT_MODEL,
                "object": "model",
                "created": int(time.time()),
                "owned_by": "opencode-zen",
                "permission": [],
                "root": DEFAULT_MODEL,
                "parent": None
            }
        ]
    })


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    try:
        # Verificar conexión con OpenCode
        response = requests.get(
            f"{OPENCODE_SERVER_URL}/api/status",
            timeout=5
        )
        opencode_status = "healthy" if response.ok else "unhealthy"
    except:
        opencode_status = "unreachable"
    
    return jsonify({
        "status": "healthy",
        "opencode_server": opencode_status,
        "opencode_url": OPENCODE_SERVER_URL
    })


@app.route('/', methods=['GET'])
def index():
    """Página de inicio"""
    return jsonify({
        "name": "OpenCode Proxy Server",
        "version": "1.0.0",
        "description": "Proxy para usar modelos gratuitos de OpenCode con API compatible OpenAI",
        "endpoints": {
            "chat_completions": "/v1/chat/completions",
            "completions": "/v1/completions",
            "models": "/v1/models",
            "health": "/health"
        },
        "opencode_server": OPENCODE_SERVER_URL
    })


def main():
    parser = argparse.ArgumentParser(description='OpenCode Proxy Server')
    parser.add_argument('--port', type=int, default=8000, help='Puerto del servidor')
    parser.add_argument('--host', default='0.0.0.0', help='Host del servidor')
    parser.add_argument('--opencode-url', default=OPENCODE_SERVER_URL, 
                       help='URL del servidor OpenCode')
    
    args = parser.parse_args()
    
    global OPENCODE_SERVER_URL, proxy
    OPENCODE_SERVER_URL = args.opencode_url
    proxy = OpenCodeProxy(OPENCODE_SERVER_URL)
    
    logger.info(f"🚀 Iniciando OpenCode Proxy Server")
    logger.info(f"   Puerto: {args.port}")
    logger.info(f"   OpenCode Server: {OPENCODE_SERVER_URL}")
    logger.info(f"   Endpoints: http://{args.host}:{args.port}/v1/chat/completions")
    
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == '__main__':
    main()
