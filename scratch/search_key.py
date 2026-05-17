import os

search_dir = r"c:\Users\ADMIN\Desktop\ia"
query = "sk_y8Fg5"

print("Buscando '" + query + "' en " + search_dir + "...")
found_files = []

for root, dirs, files in os.walk(search_dir):
    # Omitir carpetas pesadas o binarias
    if any(p in root for p in [".git", "node_modules", "__pycache__", "logs", "data"]):
        continue
    for file in files:
        if file.endswith(('.py', '.json', '.env', '.sh', '.md', '.txt', '.html')):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                    if query in content:
                        print("¡Encontrado en!: " + file_path)
                        found_files.append(file_path)
            except Exception as e:
                pass

if not found_files:
    print("No se encontro la clave en ningun archivo de texto local de la carpeta 'ia'.")
