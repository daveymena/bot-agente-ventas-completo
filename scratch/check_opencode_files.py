import os

base_dir = r"C:\Users\ADMIN\AppData\Roaming\opencode"
print("=== Archivos en la raiz de " + base_dir + " ===")

if os.path.exists(base_dir):
    try:
        for item in os.listdir(base_dir):
            full_path = os.path.join(base_dir, item)
            if os.path.isfile(full_path):
                print(f"[FILE] {item} ({os.path.getsize(full_path)} bytes)")
            else:
                print(f"[DIR]  {item}/")
    except Exception as e:
        print("Error: " + str(e))
else:
    print("La carpeta no existe.")
