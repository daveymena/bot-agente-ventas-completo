import os
import json

home_dir = r"c:\Users\ADMIN"
opencode_dir = os.path.join(home_dir, ".opencode")

print("=== Buscando configuraciones locales de OpenCode ===")
print("Carpeta: " + opencode_dir)

if os.path.exists(opencode_dir):
    print("La carpeta .opencode existe.")
    try:
        for root, dirs, files in os.walk(opencode_dir):
            for file in files:
                file_path = os.path.join(root, file)
                print(f"\nArchivo encontrado: {file_path}")
                # Si es un JSON, leer sus claves básicas
                if file.endswith('.json'):
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            # Imprimir claves sin valores sensibles (como tokens completos) para seguridad
                            safe_data = {}
                            for k, v in data.items():
                                if isinstance(v, dict):
                                    safe_data[k] = list(v.keys())
                                elif isinstance(v, list):
                                    safe_data[k] = f"Lista de {len(v)} elementos"
                                else:
                                    # Ocultar claves secretas
                                    val_str = str(v)
                                    if "sk_" in val_str or len(val_str) > 30:
                                        safe_data[k] = val_str[:8] + "..."
                                    else:
                                        safe_data[k] = v
                            print("Estructura de datos (Segura):")
                            print(json.dumps(safe_data, indent=2))
                    except Exception as e:
                        print("Error leyendo JSON: " + str(e))
    except Exception as e:
        print("Error escaneando carpeta: " + str(e))
else:
    print("La carpeta .opencode no se encuentra en el directorio home del usuario.")
