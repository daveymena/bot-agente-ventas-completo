import subprocess

ia_dir = r"c:\Users\ADMIN\Desktop\ia"
print("=== Realizando Commit y Push a GitHub ===")

try:
    # 1. Hacer git add
    print("\nStaging files...")
    subprocess.run(["git", "add", "server.py", "Dockerfile"], cwd=ia_dir, check=True)
    print("Files staged successfully.")
    
    # 2. Hacer git commit
    print("\nCommitting changes...")
    msg = "feat: Add OpenAI compatibility and root execution for EasyPanel"
    subprocess.run(["git", "commit", "-m", msg], cwd=ia_dir, check=True)
    print("Changes committed successfully.")
    
    # 3. Hacer git push
    print("\nPushing to GitHub (origin main)...")
    res_push = subprocess.run(["git", "push", "origin", "main"], cwd=ia_dir, capture_output=True, text=True, timeout=30)
    print("--- [stdout] ---")
    print(res_push.stdout)
    print("--- [stderr] ---")
    print(res_push.stderr)
    
    if res_push.returncode == 0:
        print("\n🎉 ¡PUSH COMPLETADO CON EXITO! 🎉")
    else:
        print(f"\n❌ Error al hacer push. Código de salida: {res_push.returncode}")
        
except Exception as e:
    print("\n❌ Error durante el proceso de Git: " + str(e))
