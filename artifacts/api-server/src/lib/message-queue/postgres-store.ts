import type { QueueStore, QueuedMessage } from './index';
import { randomUUID } from 'node:crypto';

/** PostgreSQL outbox for combined, gateway, and horizontally scaled worker roles.
 * Baileys sessions stay singleton; workers claim rows with leases and fencing tokens.
 * Requires a direct/session-pooled PostgreSQL connection (not transaction pooling).
 */
export class PostgresQueueStore implements QueueStore {
  private recoveryLeader = false;
  private recoveryElectionTimer?: NodeJS.Timeout;

  constructor(private client: { query: (sql: string, values?: any[]) => Promise<any> }) {}

  async initialize(role: string): Promise<void> {
    // Gateway owns the singleton WhatsApp session. Workers share a lock class
    // because their job claims are row-atomic; combined owns both exclusively.
    const locks: Array<{ id: number; shared: boolean }> = role === "worker"
      ? [{ id: 2, shared: true }]
      : role === "gateway" ? [{ id: 1, shared: false }]
      : [{ id: 1, shared: false }, { id: 2, shared: false }, { id: 3, shared: false }];
    const acquiredLocks: typeof locks = [];
    for (const lock of locks) {
      const fn = lock.shared ? "pg_try_advisory_lock_shared" : "pg_try_advisory_lock";
      const { rows } = await this.client.query(`SELECT ${fn}(19870623, $1) AS acquired`, [lock.id]);
      if (!rows[0]?.acquired) {
        for (const acquired of acquiredLocks) {
          const unlock = acquired.shared ? "pg_advisory_unlock_shared" : "pg_advisory_unlock";
          await this.client.query(`SELECT ${unlock}(19870623, $1)`, [acquired.id]).catch(() => {});
        }
        throw new Error(`Otro runtime VentasPro impide adquirir el lock ${lock.id}; no se inicia el rol ${role}.`);
      }
      acquiredLocks.push(lock);
    }
    if (role === "worker") {
      await this.tryBecomeRecoveryLeader();
      this.recoveryElectionTimer = setInterval(() => {
        if (!this.recoveryLeader) void this.tryBecomeRecoveryLeader().catch(() => {});
      }, 30_000);
      this.recoveryElectionTimer.unref?.();
    } else {
      this.recoveryLeader = role === "combined";
    }
    if (role === "worker") {
      // Gateway performs schema setup before it accepts traffic. A worker
      // starting against an older outbox must fail clearly, not race DDL.
      await this.client.query(`SELECT tenant_id, conversation_key, claimed_by, claimed_until, claim_version
        FROM whatsapp_message_outbox LIMIT 0`);
    } else {
      await this.client.query(`CREATE TABLE IF NOT EXISTS whatsapp_message_outbox (
        id text PRIMARY KEY, payload jsonb NOT NULL, finished boolean NOT NULL,
        created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
        tenant_id text, conversation_key text, claimed_by text, claimed_until timestamptz,
        claim_version bigint NOT NULL DEFAULT 0
      )`);
      await this.client.query(`ALTER TABLE whatsapp_message_outbox
        ADD COLUMN IF NOT EXISTS tenant_id text,
        ADD COLUMN IF NOT EXISTS conversation_key text,
        ADD COLUMN IF NOT EXISTS claimed_by text,
        ADD COLUMN IF NOT EXISTS claimed_until timestamptz,
        ADD COLUMN IF NOT EXISTS claim_version bigint NOT NULL DEFAULT 0`);
      await this.client.query(`UPDATE whatsapp_message_outbox SET
        tenant_id = payload->>'tenantId',
        conversation_key = CASE WHEN payload->>'conversationId' IS NOT NULL THEN 'c:' || (payload->>'conversationId')
          ELSE 'p:' || COALESCE(NULLIF(payload->>'phone', ''), NULLIF(payload->>'from', ''), id) END
        WHERE tenant_id IS NULL OR conversation_key IS NULL`);
      await this.client.query('CREATE INDEX IF NOT EXISTS whatsapp_outbox_finished_created ON whatsapp_message_outbox (finished, created_at)');
      await this.client.query('CREATE INDEX IF NOT EXISTS whatsapp_outbox_claimable ON whatsapp_message_outbox (finished, claimed_until, created_at)');
      await this.client.query('CREATE INDEX IF NOT EXISTS whatsapp_outbox_conversation_claim ON whatsapp_message_outbox (tenant_id, conversation_key, claimed_until)');
      await this.client.query('CREATE INDEX IF NOT EXISTS whatsapp_outbox_tenant_active ON whatsapp_message_outbox (tenant_id, claimed_until) WHERE NOT finished');
      await this.client.query(`CREATE TABLE IF NOT EXISTS whatsapp_delivery_receipts (
        delivery_id text PRIMARY KEY, status text NOT NULL,
        lease_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz
      )`);
      await this.client.query('CREATE INDEX IF NOT EXISTS whatsapp_delivery_receipts_retention ON whatsapp_delivery_receipts (status, sent_at, updated_at)');
    }
  }

  isRecoveryLeader(): boolean { return this.recoveryLeader; }

  private async tryBecomeRecoveryLeader(): Promise<void> {
    const { rows } = await this.client.query('SELECT pg_try_advisory_lock(19870623, 3) AS acquired');
    this.recoveryLeader = !!rows[0]?.acquired;
  }

  async load(): Promise<QueuedMessage[]> {
    const { rows } = await this.client.query(`SELECT payload FROM whatsapp_message_outbox
      WHERE NOT finished OR created_at > now() - interval '1 hour' ORDER BY created_at, id`);
    return rows.map((r: any) => r.payload);
  }

  async loadPending(): Promise<QueuedMessage[]> {
    const { rows } = await this.client.query(`SELECT payload FROM whatsapp_message_outbox
      WHERE NOT finished ORDER BY created_at, id LIMIT 100`);
    return rows.map((r: any) => r.payload);
  }

  async claimNext(workerId: string, leaseMs: number): Promise<QueuedMessage | null> {
    // Serializa la selección breve, para que los workers no reclamen al mismo
    // tiempo varios jobs al ver el mismo cupo libre global o por negocio.
    const lock = await this.client.query('SELECT pg_try_advisory_lock(19870623, 4) AS acquired');
    if (!lock.rows[0]?.acquired) return null;
    try {
    const { rows } = await this.client.query(`
      WITH candidato AS (
        SELECT q.id
        FROM whatsapp_message_outbox q
        WHERE NOT q.finished
          AND q.tenant_id IS NOT NULL AND q.conversation_key IS NOT NULL
          AND (q.claimed_until IS NULL OR q.claimed_until < now())
          AND COALESCE((q.payload->>'noAntesDe')::bigint, 0) <= (extract(epoch from now()) * 1000)::bigint
          AND (SELECT count(*) FROM whatsapp_message_outbox activo
            WHERE activo.tenant_id = q.tenant_id AND NOT activo.finished
              AND activo.claimed_until > now()) < LEAST($3::int, COALESCE((
                SELECT CASE WHEN t.is_admin THEN 4 ELSE CASE lower(t.plan)
                  WHEN 'premium' THEN 2
                  WHEN 'professional' THEN 2
                  WHEN 'pro' THEN 2
                  WHEN 'enterprise' THEN 4
                  ELSE 1
                END END
                FROM tenants t WHERE t.id::text = q.tenant_id
              ), 1))
          AND (SELECT count(*) FROM whatsapp_message_outbox activo_global
            WHERE NOT activo_global.finished AND activo_global.claimed_until > now()) < $4::int
          AND NOT EXISTS (
            SELECT 1 FROM whatsapp_message_outbox ocupado
            WHERE ocupado.tenant_id = q.tenant_id
              AND ocupado.conversation_key = q.conversation_key
              AND NOT ocupado.finished
              AND ocupado.claimed_until > now()
          )
        ORDER BY q.created_at, q.id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE whatsapp_message_outbox q
      SET claimed_by = $1,
          claimed_until = now() + ($2::bigint * interval '1 millisecond'),
          claim_version = q.claim_version + 1,
          updated_at = now(),
          payload = jsonb_set(q.payload, '{processing}', 'true'::jsonb, true)
      FROM candidato c
      WHERE q.id = c.id
      RETURNING q.payload, q.claim_version`, [
        workerId,
        leaseMs,
        Math.min(16, Math.max(1, Math.floor(Number(process.env.AGENT_MAX_EN_PARALELO_TENANT) || 4))),
        Math.min(128, Math.max(1, Math.floor(Number(process.env.AGENT_GLOBAL_CONCURRENCIA) || Number(process.env.AGENT_CONCURRENCIA) || 4))),
      ]);
    if (!rows[0]) return null;
    return { ...rows[0].payload, claimVersion: Number(rows[0].claim_version) };
    } finally {
      await this.client.query('SELECT pg_advisory_unlock(19870623, 4)').catch(() => {});
    }
  }

  async renewClaim(messageId: string, workerId: string, claimVersion: number, leaseMs: number): Promise<boolean> {
    const result = await this.client.query(`UPDATE whatsapp_message_outbox
      SET claimed_until = now() + ($3::bigint * interval '1 millisecond'), updated_at = now()
      WHERE id = $1 AND claimed_by = $2 AND claim_version = $4 AND NOT finished`, [messageId, workerId, leaseMs, claimVersion]);
    return result.rowCount === 1;
  }

  async save(messages: QueuedMessage[]): Promise<void> {
    await this.client.query(`INSERT INTO whatsapp_message_outbox
      (id, payload, finished, created_at, tenant_id, conversation_key)
      SELECT x->>'id', x, (x->>'processed')::boolean OR (x->>'retryCount')::int >= 3,
             (x->>'createdAt')::timestamptz, x->>'tenantId',
             CASE WHEN x->>'conversationId' IS NOT NULL THEN 'c:' || (x->>'conversationId')
                  ELSE 'p:' || COALESCE(NULLIF(x->>'phone', ''), NULLIF(x->>'from', ''), x->>'id') END
      FROM jsonb_array_elements($1::jsonb) AS x
      ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload,
        tenant_id = EXCLUDED.tenant_id, conversation_key = EXCLUDED.conversation_key,
        finished = EXCLUDED.finished,
        claimed_by = CASE WHEN COALESCE((EXCLUDED.payload->>'processing')::boolean, false)
          THEN whatsapp_message_outbox.claimed_by ELSE NULL END,
        claimed_until = CASE WHEN COALESCE((EXCLUDED.payload->>'processing')::boolean, false)
          THEN whatsapp_message_outbox.claimed_until ELSE NULL END,
        updated_at = now()
      WHERE whatsapp_message_outbox.claim_version = COALESCE((EXCLUDED.payload->>'claimVersion')::bigint, 0)`, [JSON.stringify(messages)]);
  }

  async cleanup(before: Date): Promise<void> {
    // Failed jobs retained seven days for diagnosis; successful payloads one hour.
    await this.client.query(`DELETE FROM whatsapp_message_outbox WHERE finished AND
      (((payload->>'processed')::boolean AND created_at < $1) OR created_at < now() - interval '7 days')`, [before]);
    await this.client.query(`DELETE FROM whatsapp_delivery_receipts
      WHERE (status = 'sent' AND sent_at < now() - interval '14 days')
         OR (status = 'failed' AND updated_at < now() - interval '7 days')
         OR (status = 'sending' AND lease_until < now() - interval '7 days')`);
  }
}

export async function initializeMessagePersistence(): Promise<void> {
  const production = process.env.NODE_ENV === "production";
  const role = process.env.VENTASPRO_PROCESS_ROLE || "combined";
  const splitRole = role === "gateway" || role === "worker";
  // En producción, aceptar mensajes con una cola volátil convierte un
  // reinicio en mensajes perdidos. El modo en memoria queda para desarrollo;
  // PostgreSQL y el lock de runtime son obligatorios en despliegues reales.
  if (!production && !splitRole && process.env.WHATSAPP_DURABLE_QUEUE !== "true") return;
  const database = await import('@workspace/db');
  await database.ensureDbReady();
  const pool = database.pool;
  if (!pool) {
    if (production || splitRole) throw new Error('Los roles gateway/worker requieren cola durable PostgreSQL.');
    return; // SQLite remains a local development mode.
  }
  const { getMessageQueue } = await import('./index');
  const client = await pool.connect();
  // Losing the ownership connection releases its lock. Stop the old runtime
  // before it can continue sending alongside a replacement process.
  client.on('error', () => process.kill(process.pid, 'SIGTERM'));
  try {
    const store = new PostgresQueueStore(client);
    await store.initialize(role);
    await getMessageQueue().attachStore(store);
  } catch (error) {
    client.release(true);
    throw error;
  }
}
