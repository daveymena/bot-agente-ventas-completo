import requests
import json

API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"
base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host/v1"

print("=== Probando Endpoint Compatible con OpenAI ===")
print("Base URL: " + base_url)
print("API Key: " + API_KEY[:10] + "..." + API_KEY[-10:])

# 1. Probar Completado de Chat estándar de OpenAI (/v1/chat/completions)
url = base_url + "/chat/completions"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

payload = {
    "model": "opencode/deepseek-v4-flash-free",
    "messages": [
        {"role": "user", "content": "Hola! Confirma si recibes esta peticion."}
    ],
    "temperature": 0.7
}

try:
    print(f"\nEnviando peticion POST a {url}...")
    r = requests.post(url, headers=headers, json=payload, timeout=20)
    print("Código de estado HTTP: " + str(r.status_code))
    print("Cabeceras recibidas: " + str(r.headers))
    
    # Intentar parsear respuesta JSON
    try:
        data = r.json()
        print("\n🎉 ¡Respuesta JSON parseada correctamente! 🎉")
        print(json.dumps(data, indent=2))
    except Exception as e:
        print("\n⚠️ No se pudo decodificar la respuesta como JSON:")
        print(r.text[:500])
except Exception as e:
    print("\n❌ Error en la peticion de red: " + str(e))
