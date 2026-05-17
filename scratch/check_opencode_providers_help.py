import subprocess

print("=== Consultando Ayuda de opencode providers ===")
try:
    res = subprocess.run(["opencode.cmd", "providers", "--help"], capture_output=True, text=True, timeout=5, shell=True)
    print("--- [opencode.cmd providers --help] ---")
    print(res.stdout)
except Exception as e:
    print("Error: " + str(e))

try:
    res = subprocess.run(["opencode.cmd", "providers", "add", "--help"], capture_output=True, text=True, timeout=5, shell=True)
    print("--- [opencode.cmd providers add --help] ---")
    print(res.stdout)
except Exception as e:
    print("Error add --help: " + str(e))
