/**
 * Acceso a la base de datos (SQLite vía libsql, sin binarios que compilar).
 *
 * Se eligió SQL explícito sobre un ORM: las consultas de búsqueda (FTS5,
 * filtros por color, similitud por hash) y el libro de créditos se leen mejor
 * como SQL que como cadenas de métodos, y un solo esquema evita la triple
 * duplicación que arrastra lib/db (sqlite-schema / schema / pg-schema).
 */
import { createClient, type Client, type InValue, type ResultSet, type Row } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";
import { config } from "../config";
import { runMigrations } from "./migrate";

let client: Client | null = null;

export function db(): Client {
  if (!client) throw new Error("La base de datos no está inicializada: llamá initDb() primero.");
  return client;
}

export async function initDb(opts: { path?: string; memory?: boolean } = {}): Promise<Client> {
  if (client) return client;
  const url = opts.memory ? ":memory:" : `file:${opts.path || config.dbPath}`;
  if (!opts.memory) fs.mkdirSync(path.dirname(opts.path || config.dbPath), { recursive: true });
  client = createClient({ url });
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute("PRAGMA busy_timeout = 5000");
  await runMigrations(client);
  return client;
}

/** Solo para pruebas: cierra y olvida la conexión. */
export async function closeDb() {
  if (client) { client.close(); client = null; }
}

// ── Ayudas de consulta ───────────────────────────────────────────────────────

export type Params = InValue[] | Record<string, InValue>;

export async function run(sql: string, args: Params = []): Promise<ResultSet> {
  return db().execute({ sql, args });
}

export async function all<T = Row>(sql: string, args: Params = []): Promise<T[]> {
  const r = await db().execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function get<T = Row>(sql: string, args: Params = []): Promise<T | undefined> {
  const r = await db().execute({ sql, args });
  return r.rows[0] as unknown as T | undefined;
}

export async function insert(sql: string, args: Params = []): Promise<number> {
  const r = await db().execute({ sql, args });
  return Number(r.lastInsertRowid ?? 0);
}

/** Varias sentencias en una transacción (write). */
export async function tx<T>(fn: (t: { run: typeof run; all: typeof all; get: typeof get; insert: typeof insert }) => Promise<T>): Promise<T> {
  const t = await db().transaction("write");
  const api = {
    run: async (sql: string, args: Params = []) => t.execute({ sql, args }),
    all: async <R = Row>(sql: string, args: Params = []) => (await t.execute({ sql, args })).rows as unknown as R[],
    get: async <R = Row>(sql: string, args: Params = []) => (await t.execute({ sql, args })).rows[0] as unknown as R | undefined,
    insert: async (sql: string, args: Params = []) => Number((await t.execute({ sql, args })).lastInsertRowid ?? 0),
  };
  try {
    const out = await fn(api as any);
    await t.commit();
    return out;
  } catch (e) {
    try { await t.rollback(); } catch { /* ya cerrada */ }
    throw e;
  }
}

export function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null || v === "") return fallback;
  if (typeof v !== "string") return v as T;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

export const nowIso = () => new Date().toISOString();
