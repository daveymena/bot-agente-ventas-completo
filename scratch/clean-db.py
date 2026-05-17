import psycopg2

conn = psycopg2.connect('postgres://postgres:6715320Dvd@79.143.187.160:5432/tecnovariedades-db?sslmode=disable')
cur = conn.cursor()

TABLES_TO_CLEAN = [
    "messages",
    "conversations",
    "activity_events",
    "payment_links",
    "follow_ups",
    "leads",
    "notifications",
    "payment_transactions",
    "niche_searches",
    "whatsapp_auth",
]

print("=== LIMPIEZA DE BASE DE DATOS ===")
print()

for table in TABLES_TO_CLEAN:
    cur.execute(f'SELECT COUNT(*) FROM "{table}"')
    before = cur.fetchone()[0]
    cur.execute(f'TRUNCATE TABLE "{table}" RESTART IDENTITY CASCADE')
    conn.commit()
    print(f"OK - {table}: {before} registros eliminados -> 0")

print()
print("=== TABLAS PRESERVADAS ===")
PRESERVED = ["settings", "agents", "products", "product_categories", "tenants", "users", "subscriptions"]
for table in PRESERVED:
    cur.execute(f'SELECT COUNT(*) FROM "{table}"')
    count = cur.fetchone()[0]
    print(f"OK - {table}: {count} registros (intacto)")

conn.close()
print()
print("Limpieza completada exitosamente.")
