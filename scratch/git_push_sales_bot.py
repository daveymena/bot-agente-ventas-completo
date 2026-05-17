import subprocess

project_dir = r"c:\Users\ADMIN\Videos\Agent-Sales-Bot"
print("=== Realizando Commit y Push de Agent-Sales-Bot a GitHub ===")

try:
    # 1. Hacer git add de los archivos específicos modificados
    files_to_add = [
        "artifacts/api-server/src/lib/agent.ts",
        "artifacts/api-server/src/routes/code-agent.ts",
        "lib/integrations-openai-ai-server/src/provider.ts"
    ]
    
    print("\nStaging files...")
    for f in files_to_add:
        subprocess.run(["git", "add", f], cwd=project_dir, check=True)
        print(f"Staged: {f}")
    
    # 2. Hacer git commit
    print("\nCommitting changes...")
    msg = "feat: add guaranteed product card injection and fix OpenCode fallback routing in Architect"
    subprocess.run(["git", "commit", "-m", msg], cwd=project_dir, check=True)
    print("Changes committed successfully.")
    
    # 3. Hacer git push
    print("\nPushing to GitHub (origin main)...")
    res_push = subprocess.run(["git", "push", "origin", "main"], cwd=project_dir, capture_output=True, text=True, timeout=40)
    print("--- [stdout] ---")
    print(res_push.stdout)
    print("--- [stderr] ---")
    print(res_push.stderr)
    
    if res_push.returncode == 0:
        print("\nPUSH COMPLETADO CON EXITO EN PRODUCCION")
    else:
        print(f"\nError al hacer push. Codigo de salida: {res_push.returncode}")
        
except Exception as e:
    print("\nError durante el proceso de Git: " + str(e))
