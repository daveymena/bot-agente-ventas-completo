import type { QueueStore, QueuedMessage } from './index';

/** A single active runtime owns Baileys sessions, schedulers and this outbox.
 * NOT a distributed worker queue. Refuse a second runtime instead of replying twice.
 * Requires a direct/session-pooled PostgreSQL connection (not transaction pooling).
 */
export class PostgresQueueStore implements QueueStore {
  constructor(private client: { query: (sql: string, values?: any[]) => Promise<any> }) {}

  async initialize(): Promise<void> {
    const { rows } = await this.client.query('SELECT pg_try_advisory_lock(19870623, 1) AS acquired');
    if (!rows[0]?.acquired) throw new Error('Otro runtime de VentasPro ya posee esta base. No dupliques sesiones Baileys ni programadores.');
    await this.client.query(`CREATE TABLE IF NOT EXISTS whatsapp_message_outbox (
      id text PRIMARY KEY, payload jsonb NOT NULL, finished boolean NOT NULL,
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.client.query('CREATE INDEX IF NOT EXISTS whatsapp_outbox_finished_created ON whatsapp_message_outbox (finished, created_at)');
  }

  async load(): Promise<QueuedMessage[]> {
    const { rows } = await this.client.query(`SELECT payload FROM whatsapp_message_outbox
      WHERE NOT finished OR created_at > now() - interval '1 hour' ORDER BY created_at, id`);
    return rows.map((r: any) => r.payload);
  }

  async save(messages: QueuedMessage[]): Promise<void> {
    await this.client.query(`INSERT INTO whatsapp_message_outbox (id, payload, finished, created_at)
      SELECT x->>'id', x, (x->>'processed')::boolean OR (x->>'retryCount')::int >= 3,
             (x->>'createdAt')::timestamptz
      FROM jsonb_array_elements($1::jsonb) AS x
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload,
        finished = EXCLUDED.finished, updated_at = now()`, [JSON.stringify(messages)]);
  }

  async cleanup(before: Date): Promise<void> {
    // Failed jobs retained seven days for diagnosis; successful payloads one hour.
    await this.client.query(`DELETE FROM whatsapp_message_outbox WHERE finished AND
      (((payload->>'processed')::boolean AND created_at < $1) OR created_at < now() - interval '7 days')`, [before]);
  }
}

export async function initializeMessagePersistence(): Promise<void> {
  if (process.env.WHATSAPP_DURABLE_QUEUE !== "true") return;
  const database = await import('@workspace/db');
  await database.ensureDbReady();
  const pool = database.pool;
  if (!pool) return; // SQLite remains a local development mode.
  const { getMessageQueue } = await import('./index');
  const client = await pool.connect();
  // Losing the ownership connection releases its lock. Stop the old runtime
  // before it can continue sending alongside a replacement process.
  client.on('error', () => process.kill(process.pid, 'SIGTERM'));
  try {
    const store = new PostgresQueueStore(client);
    await store.initialize();
    await getMessageQueue().attachStore(store);
  } catch (error) {
    client.release(true);
    throw error;
  }
}
