import os

puente_dir = r"c:\Users\ADMIN\Videos\Agent-Sales-Bot\OpenCode-puete-ia"
print("=== Listando archivos en: " + puente_dir + " ===")

try:
    for root, dirs, files in os.walk(puente_dir):
        # Evitar carpetas de Git o temporales gigantes
        if ".git" in root or "__pycache__" in root or "node_modules" in root:
            continue
        for file in files:
            rel_path = os.path.relpath(os.path.join(root, file), puente_dir)
            print(f"[FILE] {rel_path} ({os.path.getsize(os.path.join(root, file))} bytes)")
except Exception as e:
    print("Error: " + str(e))
