import os

search_dir = r"c:\Users\ADMIN\Videos\Agent-Sales-Bot"
query = "sk_"

print("Buscando '" + query + "' en " + search_dir + "...")
found = False

for root, dirs, files in os.walk(search_dir):
    # Evitar directorios pesados
    if any(p in root for p in [".git", "node_modules", "dist", "build", ".baileys-auth"]):
        continue
    for file in files:
        if file.endswith(('.py', '.ts', '.tsx', '.js', '.json', '.env', '.sh', '.md', '.txt')):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    for line_no, line in enumerate(f, 1):
                        if query in line and not "sk-lmab-" in line and not "sk_tu_api_key" in line and not "test_opencode_api" in file:
                            print(f"¡Encontrado! En {file_path} (Línea {line_no}): {line.strip()[:100]}")
                            found = True
            except Exception as e:
                pass

if not found:
    print("No se encontraron otras referencias a claves 'sk_' en los archivos del bot.")
