import os

appdata_roaming = os.environ.get('APPDATA', r"c:\Users\ADMIN\AppData\Roaming")
appdata_local = os.environ.get('LOCALAPPDATA', r"c:\Users\ADMIN\AppData\Local")

print("=== Buscando carpetas de OpenCode en AppData ===")

dirs_to_check = [appdata_roaming, appdata_local]

for base_dir in dirs_to_check:
    print(f"\nBuscando en: {base_dir}")
    if os.path.exists(base_dir):
        found = False
        for item in os.listdir(base_dir):
            if "opencode" in item.lower():
                found = True
                full_path = os.path.join(base_dir, item)
                print(f"  [Carpeta Encontrada] {full_path}")
                # Listar archivos
                try:
                    for root, subdirs, files in os.walk(full_path):
                        for file in files:
                            print(f"    - {os.path.relpath(os.path.join(root, file), full_path)}")
                except Exception as e:
                    print("    Error listando: " + str(e))
        if not found:
            print("  No se encontraron carpetas con 'opencode'.")
