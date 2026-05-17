import subprocess

print("=== Consultando Ayuda de OpenCode CLI ===")
try:
    res = subprocess.run(["opencode.cmd", "--help"], capture_output=True, text=True, timeout=5, shell=True)
    print("--- [opencode.cmd --help] ---")
    print(res.stdout)
    print(res.stderr)
except Exception as e:
    print("Error --help: " + str(e))

try:
    res = subprocess.run(["opencode.cmd", "help"], capture_output=True, text=True, timeout=5, shell=True)
    print("--- [opencode.cmd help] ---")
    print(res.stdout)
    print(res.stderr)
except Exception as e:
    print("Error help: " + str(e))
