import socket
import requests

ip = "79.143.187.160"
ports = [80, 443, 3000, 3001, 3002, 4096, 5000, 8000, 8080, 9000]

print("=== Escaneando puertos abiertos en " + ip + " ===")

for port in ports:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(2.0)
    result = s.connect_ex((ip, port))
    if result == 0:
        print(f" Port {port}: ABIERTO")
        # Intentar consultar la salud si está abierto
        try:
            protocol = "https" if port == 443 else "http"
            url = f"{protocol}://{ip}:{port}"
            r = requests.get(url + "/health", timeout=3)
            print(f"   -> [Health] Status: {r.status_code} | Resp: {r.text[:80].strip()}")
        except Exception as e:
            print(f"   -> [Health] No respondio HTTP: {str(e)[:60]}")
    else:
        print(f" Port {port}: Cerrado/Filtrado")
    s.close()
