import requests
import json

base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"

print("=== Registrando Usuario de Prueba en Produccion ===")
print("URL: " + base_url + "/api/auth/register")

payload = {
    "username": "davey_test",
    "password": "password_segura_123",
    "email": "davey_test@tecnovariedades.com"
}

try:
    # 1. Registrar usuario
    r = requests.post(base_url + "/api/auth/register", json=payload, timeout=20)
    print("HTTP Code: " + str(r.status_code))
    
    if r.status_code in [200, 201]:
        data = r.json()
        print("\n🎉 ¡Usuario registrado con éxito en producción! 🎉")
        print(json.dumps(data, indent=2))
        
        # Guardar la API Key generada
        new_api_key = data.get("api_key")
        
        # 2. Probar de inmediato el chat con la API Key obtenida
        print("\n=== Probando /api/chat con la Nueva API Key ===")
        chat_headers = {
            "X-API-Key": new_api_key,
            "Content-Type": "application/json"
        }
        chat_payload = {
            "message": "Hola, por favor responde únicamente con la frase: ¡CHAT COMPLETADO EXITOSAMENTE!",
            "model": "opencode/deepseek-v4-flash-free"
        }
        
        r_chat = requests.post(base_url + "/api/chat", headers=chat_headers, json=chat_payload, timeout=25)
        print("HTTP Code Chat: " + str(r_chat.status_code))
        print("Respuesta de la IA en Producción:")
        print(json.dumps(r_chat.json(), indent=2))
        
    else:
        print("Error al registrar: " + r.text)
except Exception as e:
    print("Error: " + str(e))
