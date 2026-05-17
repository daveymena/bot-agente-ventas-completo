import sqlite3
import hashlib

db_path = r"c:\Users\ADMIN\Desktop\ia\data\auth.db"
target_key = "sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE"

print("=== Buscando Clave en Base de Datos Local ===")
print("Ruta DB: " + db_path)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. Buscar coincidencia exacta de hash
    target_hash = hashlib.sha256(target_key.encode()).hexdigest()
    cursor.execute("SELECT id, owner, name, is_active FROM api_keys WHERE key_hash = ?", (target_hash,))
    res = cursor.fetchone()
    
    if res:
        print(f"\nENCONTRADA! La clave esta en la base de datos local:")
        print(f"ID: {res[0]} | Dueno: {res[1]} | Nombre: {res[2]} | Activa: {res[3]}")
    else:
        print("\nLa clave NO esta en la base de datos local.")
        
    # 2. Listar todas las claves registradas
    print("\n--- Todas las Claves Registradas en Local ---")
    cursor.execute("SELECT id, key_prefix, owner, name, is_active FROM api_keys")
    rows = cursor.fetchall()
    if rows:
        for r in rows:
            print(f"ID: {r[0]} | Prefijo: {r[1]} | Dueno: {r[2]} | Nombre: {r[3]} | Activa: {r[4]}")
    else:
        print("No hay claves registradas en la base de datos local.")
        
    conn.close()
except Exception as e:
    print("Error: " + str(e))
