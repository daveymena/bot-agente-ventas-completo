import requests
import json
import time

base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"
API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"

url = f"{base_url}/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

payload = {
    "model": "opencode/deepseek-v4-flash-free",
    "messages": [
        {"role": "system", "content": "Eres el asistente de Inteligencia Artificial exclusivo de Tecnovariedades. Debes responder de manera profesional y amigable."},
        {"role": "user", "content": "¡Hola! ¿Estás en línea? ¿Puedes decirme en un párrafo corto cuáles son los beneficios de usar IA en un sistema de ventas?"}
    ],
    "stream": False
}

print("=== Probando Conversacion con la API en Produccion ===")
print(f"URL: {url}")
print(f"Modelo: {payload['model']}")
print(f"Mensajes enviados: {len(payload['messages'])}")
print("-" * 60)

start_time = time.time()

try:
    print("Enviando peticion a la IA... (esperando respuesta)")
    response = requests.post(url, headers=headers, json=payload, timeout=40)
    elapsed = time.time() - start_time
    
    print(f"Codigo HTTP: {response.status_code}")
    print(f"Tiempo de respuesta: {elapsed:.2f} segundos")
    print("-" * 60)
    
    if response.status_code == 200:
        data = response.json()
        print("\n*** RESPUESTA EXITOSA DE LA IA ***\n")
        
        # Extraer la respuesta del formato estándar de OpenAI
        ia_reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        if not ia_reply and "response" in data:
            ia_reply = data["response"] # Fallback si devolvió el formato antiguo
            
        print("IA DICE:")
        print(ia_reply.strip())
        print("\n" + "-" * 60)
    else:
        print("\nError en la respuesta:")
        print(response.text[:500])
        
except Exception as e:
    print(f"\nError de conexion: {str(e)}")
