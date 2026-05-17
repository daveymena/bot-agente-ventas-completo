import psycopg2

db_url = "postgres://postgres:6715320Dvd@79.143.187.160:5432/tecnovariedades-db?sslmode=disable"

print("=== Consultando Catálogo de Productos en la Base de Datos ===")

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    
    # Consultar productos activos
    cur.execute("SELECT id, name, price, currency, category, is_active FROM products WHERE is_active = true;")
    rows = cur.fetchall()
    
    print(f"\nProductos Activos Encontrados: {len(rows)}")
    print("-" * 70)
    for r in rows:
        print(f"ID: {r[0]} | Nombre: {r[1]} | Precio: {r[3]} {r[2]} | Categoría: {r[4]} | Activo: {r[5]}")
    print("-" * 70)
    
    cur.close()
    conn.close()
    
except Exception as e:
    print("Error consultando base de datos: " + str(e))
