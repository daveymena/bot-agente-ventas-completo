import requests
import time
import json

base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"
API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"

print("=== Monitoreando el Despliegue en EasyPanel ===")
print("Clave Zen: " + API_KEY[:10] + "..." + API_KEY[-10:])
print("Probaremos el NUEVO endpoint compatible con OpenAI:")
print(f"URL: {base_url}/v1/chat/completions")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

payload = {
    "model": "opencode/deepseek-v4-flash-free",
    "messages": [
        {"role": "user", "content": "Responde unicamente con la palabra: CONECTADO"}
    ]
}

max_attempts = 15
wait_seconds = 10

for attempt in range(1, max_attempts + 1):
    print(f"\nIntento {attempt}/{max_attempts} (esperando {wait_seconds}s)...")
    time.sleep(wait_seconds)
    
    try:
        r = requests.post(f"{base_url}/v1/chat/completions", headers=headers, json=payload, timeout=20)
        print("HTTP Status Code: " + str(r.status_code))
        
        if r.status_code == 200:
            print("\n==================================================")
            print("  SUCCESS: ¡EL NUEVO SERVIDOR ESTA ACTIVO! ")
            print("==================================================")
            try:
                data = r.json()
                print("Respuesta de la IA:")
                print(json.dumps(data, indent=2))
            except:
                print("Respuesta (texto plano):")
                print(r.text)
            break
        elif r.status_code == 404:
            print("El servidor viejo sigue activo (404 en el nuevo endpoint)...")
        else:
            print(f"El servidor respondio con error {r.status_code}: {r.text[:200]}")
            
    except Exception as e:
        print("Servidor en reconstruccion / inalcanzable temporalmente: " + str(e))

print("\n=== Monitoreo finalizado ===")
