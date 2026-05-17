import requests
import json

API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"
base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"

# Lista de combinaciones de endpoint + headers + payload
tests = [
    # 1. Endpoint Flask estándar con X-API-Key
    {
        "name": "Flask /api/chat con header X-API-Key",
        "url": f"{base_url}/api/chat",
        "headers": {"X-API-Key": API_KEY, "Content-Type": "application/json"},
        "payload": {"message": "Hola, di OK.", "model": "opencode/deepseek-v4-flash-free"}
    },
    # 2. Endpoint Flask estándar con Authorization Bearer
    {
        "name": "Flask /api/chat con header Authorization Bearer",
        "url": f"{base_url}/api/chat",
        "headers": {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        "payload": {"message": "Hola, di OK.", "model": "opencode/deepseek-v4-flash-free"}
    },
    # 3. Endpoint OpenAI compatible con Authorization Bearer
    {
        "name": "OpenAI /v1/chat/completions con header Authorization Bearer",
        "url": f"{base_url}/v1/chat/completions",
        "headers": {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        "payload": {
            "model": "opencode/deepseek-v4-flash-free",
            "messages": [{"role": "user", "content": "Hola, di OK."}]
        }
    },
    # 4. Endpoint OpenAI compatible con X-API-Key
    {
        "name": "OpenAI /v1/chat/completions con header X-API-Key",
        "url": f"{base_url}/v1/chat/completions",
        "headers": {"X-API-Key": API_KEY, "Content-Type": "application/json"},
        "payload": {
            "model": "opencode/deepseek-v4-flash-free",
            "messages": [{"role": "user", "content": "Hola, di OK."}]
        }
    },
    # 5. Endpoint simplificado /chat con Authorization Bearer
    {
        "name": "Simplificado /chat con header Authorization Bearer",
        "url": f"{base_url}/chat",
        "headers": {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        "payload": {"message": "Hola, di OK.", "model": "opencode/deepseek-v4-flash-free"}
    }
]

print("=== Iniciando Matriz de Pruebas de Autenticación en Producción ===")

for t in tests:
    print("\n" + "="*70)
    print(f"Probando: {t['name']}")
    print(f"URL: {t['url']}")
    print(f"Headers: {list(t['headers'].keys())}")
    
    try:
        r = requests.post(t['url'], headers=t['headers'], json=t['payload'], timeout=15)
        print(f"Código HTTP: {r.status_code}")
        
        try:
            resp_json = r.json()
            print("Respuesta JSON del Servidor:")
            print(json.dumps(resp_json, indent=2))
        except:
            print("Respuesta no-JSON (Texto plano):")
            print(r.text[:300].strip())
            
    except Exception as e:
        print(f"Error de conexión: {str(e)}")
