import os

home_dir = r"c:\Users\ADMIN"
key_to_find = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"

print(f"=== Buscando el archivo de configuracion del CLI con la clave ===")
print(f"Buscando '{key_to_find[:10]}...' en carpetas de configuracion de {home_dir}...")

folders_to_search = [
    os.path.join(home_dir, "AppData", "Roaming"),
    os.path.join(home_dir, "AppData", "Local"),
    home_dir
]

found = False

for base_dir in folders_to_search:
    if not os.path.exists(base_dir):
        continue
    print(f"Buscando en: {base_dir}")
    try:
        # Escaneo no recursivo profundo para evitar lentitud
        for item in os.listdir(base_dir):
            item_path = os.path.join(base_dir, item)
            
            # Si es un archivo en la raiz
            if os.path.isfile(item_path) and item.endswith(('.json', '.config', '.txt', '.yaml', '.yml')):
                try:
                    with open(item_path, 'r', encoding='utf-8', errors='ignore') as f:
                        if key_to_find in f.read():
                            print(f"  🎉 ENCONTRADO EN ARCHIVO: {item_path}")
                            found = True
                except:
                    pass
            
            # Si es un directorio de configuracion tipico
            elif os.path.isdir(item_path) and any(x in item.lower() for x in ["opencode", "cli", "config", "node", "npm"]):
                # Escanear recursivamente esta subcarpeta
                for root, dirs, files in os.walk(item_path):
                    # Omitir cache pesado
                    if "EBWebView" in root or "node_modules" in root or "Cache" in root:
                        continue
                    for file in files:
                        if file.endswith(('.json', '.config', '.txt', '.yaml', '.yml', 'rc')):
                            file_path = os.path.join(root, file)
                            try:
                                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                    if key_to_find in f.read():
                                        print(f"  🎉 ENCONTRADO EN ARCHIVO: {file_path}")
                                        found = True
                            except:
                                pass
    except Exception as e:
        print(f"Error escaneando {base_dir}: {str(e)}")

if not found:
    print("La clave no esta guardada en archivos planos en estos directorios comunes.")
