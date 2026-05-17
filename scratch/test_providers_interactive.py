import subprocess
import time

print("=== Consultando ayuda de opencode providers login ===")
try:
    p = subprocess.Popen(
        ["opencode.cmd", "providers", "login", "--help"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        stdin=subprocess.PIPE,
        text=True,
        shell=True
    )
    time.sleep(2.0)
    p.terminate()
    stdout, stderr = p.communicate()
    print("--- [stdout] ---")
    print(stdout)
    print("--- [stderr] ---")
    print(stderr)
except Exception as e:
    print("Error: " + str(e))
