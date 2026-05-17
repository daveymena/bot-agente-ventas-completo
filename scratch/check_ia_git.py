import subprocess
import os

ia_dir = r"c:\Users\ADMIN\Desktop\ia"

def run_git(args):
    try:
        res = subprocess.run(
            ["git"] + args,
            cwd=ia_dir,
            capture_output=True,
            text=True,
            check=True
        )
        return res.stdout.strip()
    except subprocess.CalledProcessError as e:
        return f"Error: {e.stderr.strip()}"
    except Exception as e:
        return f"Error inesperado: {str(e)}"

print("=== Consultando Repositorio Git de la API ===")
print("Directorio: " + ia_dir)

remotes = run_git(["remote", "-v"])
print("\nRemotos de Git:")
print(remotes)

status = run_git(["status", "--short"])
print("\nArchivos Modificados Localmente:")
print(status if status else "Ninguno (repositorio limpio)")

branch = run_git(["rev-parse", "--abbrev-ref", "HEAD"])
print("\nRama actual:")
print(branch)
