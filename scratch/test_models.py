import requests

base_url = "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host"
API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"

# Probamos endpoints de listado de modelos
endpoints = [
    ("/v1/models", {"Authorization": f"Bearer {API_KEY}"}),
    ("/api/models", {"X-API-Key": API_KEY}),
    ("/models", {})
]

for ep, headers in endpoints:
    url = base_url + ep
    print("\n-----------------------------------------")
    print("Probando GET: " + url)
    try:
        r = requests.get(url, headers=headers, timeout=10)
        print("HTTP Code: " + str(r.status_code))
        print("Response: " + r.text[:300])
    except Exception as e:
        print("Error: " + str(e))
