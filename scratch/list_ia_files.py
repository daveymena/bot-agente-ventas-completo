import os

ia_dir = r"c:\Users\ADMIN\Desktop\ia"
print("=== Listando archivos en: " + ia_dir + " ===")
try:
    for item in os.listdir(ia_dir):
        item_path = os.path.join(ia_dir, item)
        if os.path.isdir(item_path):
            print(f"[DIR]  {item}")
        else:
            print(f"[FILE] {item} ({os.path.getsize(item_path)} bytes)")
except Exception as e:
    print("Error: " + str(e))
