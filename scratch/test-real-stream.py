import subprocess
import sys

def test_stream():
    cmd = ["opencode", "run", "--model", "opencode/deepseek-v4-flash-free", "Escribe un poema de 2 lineas sobre programar."]
    print("Iniciando proceso...")
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        bufsize=0,  # Sin buffering para capturar al instante
        shell=True
    )
    
    print("Esperando tokens (Streaming en tiempo real):")
    # Leer caracter por caracter
    while True:
        char = process.stdout.read(1)
        if not char and process.poll() is not None:
            break
        if char:
            sys.stdout.write(char)
            sys.stdout.flush()
            
    print("\nProceso terminado.")

if __name__ == "__main__":
    test_stream()
