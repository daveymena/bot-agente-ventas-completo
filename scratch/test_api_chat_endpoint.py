import requests
import json

API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"
base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

payload = {
    "message": "Hola",
    "model": "opencode/deepseek-v4-flash-free"
}

try:
    r = requests.post(base_url + "/api/chat", headers=headers, json=payload, timeout=20)
    print("HTTP Code: " + str(r.status_code))
    print("Response Headers: " + str(r.headers))
    print("Response Body: " + r.text)
except Exception as e:
    print("Error: " + str(e))
