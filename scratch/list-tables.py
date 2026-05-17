import psycopg2

conn = psycopg2.connect('postgres://postgres:6715320Dvd@79.143.187.160:5432/tecnovariedades-db?sslmode=disable')
cur = conn.cursor()

cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
tables = [row[0] for row in cur.fetchall()]

for table in tables:
    cur.execute(f"SELECT COUNT(*) FROM \"{table}\"")
    count = cur.fetchone()[0]
    print(f"{table}: {count} registros")

conn.close()
