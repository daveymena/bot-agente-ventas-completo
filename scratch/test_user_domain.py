import requests
import json

API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"
base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"

print("=== Probando Conectividad con el Servidor De IA Remoto ===")
print("URL: " + base_url)
print("API Key: " + API_KEY[:10] + "..." + API_KEY[-10:])

# 1. Probar Endpoint de Salud
try:
    health_url = base_url + "/health"
    print("\n1. Verificando /health...")
    r = requests.get(health_url, timeout=10)
    print("   Status Code: " + str(r.status_code))
    print("   Respuesta: " + r.text[:200])
except Exception as e:
    print("   ❌ Error en health: " + str(e))

# 2. Probar Endpoint de Chat
try:
    chat_url = base_url + "/api/chat"
    print("\n2. Enviando prompt de prueba a /api/chat...")
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "message": "Hola, por favor responde diciendo unicamente la frase: CONEXION EXITOSA CON EL PROVEDOR DE IA.",
        "model": "opencode/deepseek-v4-flash-free"
    }
    r = requests.post(chat_url, headers=headers, json=payload, timeout=20)
    print("   Status Code: " + str(r.status_code))
    print("   Respuesta JSON:")
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print("   ❌ Error en chat: " + str(e))
