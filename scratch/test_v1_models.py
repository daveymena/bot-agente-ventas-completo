import requests

base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"
API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"

url = f"{base_url}/v1/models"
headers = {
    "Authorization": f"Bearer {API_KEY}"
}

print(f"Probando GET: {url}")
try:
    r = requests.get(url, headers=headers, timeout=10)
    print("HTTP Code: " + str(r.status_code))
    print("Response: " + r.text)
except Exception as e:
    print("Error: " + str(e))
