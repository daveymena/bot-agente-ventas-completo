import requests
import json

API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"

urls_to_test = [
    "https://opencode.tecnovariedades.easypanel.host",
    "https://ia.tecnovariedades.easypanel.host",
    "https://opencode-api.tecnovariedades.easypanel.host",
    "https://sistema-ia.tecnovariedades.easypanel.host",
    "https://puente-ia.tecnovariedades.easypanel.host",
    "https://puete-ia.tecnovariedades.easypanel.host",
    "https://tecnovariedades.easypanel.host"
]

print("=== Escaneando Subdominios tecnovariedades.easypanel.host ===")
print("Clave a probar: " + API_KEY[:10] + "..." + API_KEY[-10:])

found = False

for base_url in urls_to_test:
    print("\nProband: " + base_url)
    
    # 1. Probar Health
    health_url = base_url + "/health"
    try:
        r = requests.get(health_url, timeout=3)
        print("   -> [Health] Status: " + str(r.status_code) + " | Resp: " + r.text[:80].replace("\n", ""))
    except Exception as e:
        print("   -> [Health] Fallo conexion: " + str(e)[:100])
        
    # 2. Probar Chat
    chat_url = base_url + "/api/chat"
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "message": "Hola, responde unicamente con la palabra EXITOSO si puedes oir esto.",
        "model": "opencode/deepseek-v4-flash-free"
    }
    
    try:
        r = requests.post(chat_url, headers=headers, json=payload, timeout=5)
        print("   -> [Chat] Status: " + str(r.status_code))
        if r.status_code in [200, 201]:
            print("   *** ENCONTRADO Y AUTENTICADO CON EXITO! ***")
            print("   Respuesta del modelo: " + json.dumps(r.json(), indent=2))
            found = True
            break
        else:
            print("   -> [Chat] Resp: " + r.text[:100].replace("\n", ""))
    except Exception as e:
        print("   -> [Chat] Fallo conexion: " + str(e)[:100])

if not found:
    print("\nNo se encontro la API activa en estos subdominios.")
