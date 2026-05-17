import requests
import json

API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"
base_url = "https://tecnovariedades-sistema-ia.er7iaf.easypanel.host"

print("=== Probando Servidor de Produccion ===")
print("URL: " + base_url)
print("Key: " + API_KEY[:10] + "..." + API_KEY[-10:])

# 1. Probar Health
try:
    r_health = requests.get(base_url + "/health", timeout=10)
    print("Health Status: " + str(r_health.status_code))
    print("Health Body: " + r_health.text[:200])
except Exception as e:
    print("Error en health: " + str(e))

# 2. Probar Chat
try:
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "message": "Hola, dime 'FUNCIONA' y nada mas.",
        "model": "opencode/deepseek-v4-flash-free"
    }
    r_chat = requests.post(base_url + "/api/chat", headers=headers, json=payload, timeout=15)
    print("Chat Status: " + str(r_chat.status_code))
    print("Chat Body: " + json.dumps(r_chat.json(), indent=2))
except Exception as e:
    print("Error en chat: " + str(e))
