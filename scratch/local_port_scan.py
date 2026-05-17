import socket
import requests
import json

API_KEY = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"
ports = [5000, 8000, 8080, 3000, 3001, 3002, 4096, 5001, 8001]

print("=== Escaneando puertos abiertos locales en tu PC ===")

for port in ports:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.0)
    result = s.connect_ex(("127.0.0.1", port))
    if result == 0:
        print(f"\nPort {port}: ABIERTO")
        # Probar endpoints de chat
        endpoints = ["/api/chat", "/v1/chat/completions", "/v1/chat", "/api/v1/chat"]
        for ep in endpoints:
            url = f"http://localhost:{port}{ep}"
            headers = {
                "X-API-Key": API_KEY,
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "message": "Hola",
                "messages": [{"role": "user", "content": "Hola"}],
                "model": "opencode/deepseek-v4-flash-free"
            }
            try:
                r = requests.post(url, headers=headers, json=payload, timeout=3)
                print(f"   -> [{ep}] Status: {r.status_code}")
                if r.status_code in [200, 201]:
                    print(f"   🎉 ¡EXITOSO! Servidor local responde en {url} 🎉")
                    print("   Respuesta: " + json.dumps(r.json(), indent=2))
                else:
                    print(f"   Resp: {r.text[:100]}")
            except Exception as e:
                pass
    s.close()
