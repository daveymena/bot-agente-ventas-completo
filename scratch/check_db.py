import sqlite3

db_path = r"c:\Users\ADMIN\Desktop\ia\data\auth.db"

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Ver columnas de api_keys
    cursor.execute("PRAGMA table_info(api_keys);")
    columns = cursor.fetchall()
    print("Columnas de api_keys:")
    for col in columns:
        print(f" - {col[1]} ({col[2]})")
        
    # Consultar datos de todas las columnas dinámicamente
    cursor.execute("SELECT * FROM api_keys;")
    rows = cursor.fetchall()
    print("\n--- REGISTROS EN api_keys ---")
    for r in rows:
        print(r)
        
    conn.close()
except Exception as e:
    print("Error: " + str(e))
