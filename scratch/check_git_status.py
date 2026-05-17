import subprocess

ia_dir = r"c:\Users\ADMIN\Desktop\ia"
print("=== Verificando Git en: " + ia_dir + " ===")

try:
    # 1. Obtener status
    res = subprocess.run(["git", "status"], capture_output=True, text=True, cwd=ia_dir)
    print("--- [git status] ---")
    print(res.stdout)
    print(res.stderr)
    
    # 2. Obtener remotes
    res_remote = subprocess.run(["git", "remote", "-v"], capture_output=True, text=True, cwd=ia_dir)
    print("--- [git remote -v] ---")
    print(res_remote.stdout)
except Exception as e:
    print("Error: " + str(e))
