/**
 * Postgres (Supabase free tier) document store.
 *
 * Activated when DATABASE_URL is set. Every Firestore "collection" becomes rows in one
 * JSONB table, so all existing repositories, services and queries keep working unchanged:
 *
 *   community_manager.documents(collection, id, data jsonb, updated_at)
 *
 * Firestore Timestamp values are stored as {"__ts": <millis>} and restored as Timestamp
 * objects on read, so session/OAuth code that calls .toMillis() keeps working.
 */
import pg from 'pg';
import { Timestamp } from '@google-cloud/firestore';
import type { QueryOptions } from './base.repository.js';
import { logger } from '../logging/logger.js';

const SCHEMA = process.env.DATABASE_SCHEMA || 'community_manager';
const T_DOCS = `"${SCHEMA}".documents`;
const T_LEASE = `"${SCHEMA}".runtime_leases`;

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

export function isPostgresEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
}

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!.trim();
    pool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.DB_POOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
    pool.on('error', (err) => logger.warn(`[Postgres] Idle client error: ${err.message}`));
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const p = getPool();
      await p.query(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA}"`);
      await p.query(`CREATE TABLE IF NOT EXISTS ${T_DOCS} (
        collection text NOT NULL,
        id text NOT NULL,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      )`);
      await p.query(`CREATE INDEX IF NOT EXISTS documents_data_gin ON ${T_DOCS} USING gin (data jsonb_path_ops)`);
      await p.query(`CREATE INDEX IF NOT EXISTS documents_community ON ${T_DOCS} (collection, (data->>'communityId'))`);
      await p.query(`CREATE INDEX IF NOT EXISTS documents_guild ON ${T_DOCS} (collection, (data->>'guildId'))`);
      await p.query(`CREATE TABLE IF NOT EXISTS ${T_LEASE} (
        name text PRIMARY KEY,
        holder text NOT NULL,
        priority int NOT NULL,
        expires_at timestamptz NOT NULL
      )`);
      logger.info(`[Postgres] Document store ready (schema "${SCHEMA}").`);
    })().catch((err) => {
      ready = null; // retry on next call
      throw err;
    });
  }
  return ready;
}

async function q<R extends pg.QueryResultRow = any>(sql: string, params: any[] = []) {
  await ensureSchema();
  return getPool().query<R>(sql, params);
}

// ---------- value encoding ----------

function encode(value: any): any {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Timestamp) return { __ts: value.toMillis() };
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : encode(v)));
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function' && typeof value.seconds === 'number') return { __ts: value.toMillis() };
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = encode(v);
    }
    return out;
  }
  return value;
}

function decode(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '__ts' && typeof value.__ts === 'number') {
    return Timestamp.fromMillis(value.__ts);
  }
  const out: any = {};
  for (const k of keys) out[k] = decode(value[k]);
  return out;
}

/** Applies Firestore-style updates, including "a.b.c" dotted field paths. */
function applyUpdates(target: any, updates: Record<string, any>): any {
  const result = { ...target };
  for (const [key, val] of Object.entries(updates)) {
    if (!key.includes('.')) {
      result[key] = val;
      continue;
    }
    const parts = key.split('.');
    let node = result;
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] && typeof node[parts[i]] === 'object' ? { ...node[parts[i]] } : {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = val;
  }
  return result;
}

function deepMerge(base: any, patch: any): any {
  if (!base || typeof base !== 'object' || Array.isArray(base)) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v as any).__ts && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
      ? deepMerge(out[k], v)
      : v;
  }
  return out;
}

// ---------- query building ----------

function buildWhere(collection: string, options?: QueryOptions): { sql: string; params: any[] } {
  const params: any[] = [collection];
  const clauses: string[] = ['collection = $1'];
  for (const f of options?.where || []) {
    let value: any = f.value;
    const path = String(f.field).split('.');
    if (value instanceof Timestamp || (value && typeof value.toMillis === 'function')) {
      path.push('__ts');
      value = value.toMillis();
    }
    const pathLit = `'{${path.map((p) => p.replace(/[{}",\\']/g, '')).join(',')}}'`;
    const col = `(data #> ${pathLit})`;
    switch (f.operator) {
      case '==':
        params.push(JSON.stringify(encode(value)));
        clauses.push(`${col} = $${params.length}::jsonb`);
        break;
      case '!=':
        params.push(JSON.stringify(encode(value)));
        clauses.push(`${col} IS NOT NULL AND ${col} <> $${params.length}::jsonb`);
        break;
      case '<': case '<=': case '>': case '>=':
        params.push(JSON.stringify(encode(value)));
        clauses.push(`jsonb_typeof(${col}) = jsonb_typeof($${params.length}::jsonb) AND ${col} ${f.operator} $${params.length}::jsonb`);
        break;
      case 'array-contains':
        params.push(JSON.stringify([encode(value)]));
        clauses.push(`jsonb_typeof(${col}) = 'array' AND ${col} @> $${params.length}::jsonb`);
        break;
      case 'in': {
        const list = Array.isArray(value) ? value : [value];
        if (list.length === 0) { clauses.push('false'); break; }
        params.push(list.map((v) => JSON.stringify(encode(v))));
        clauses.push(`${col} = ANY($${params.length}::jsonb[])`);
        break;
      }
      default:
        throw new Error(`Unsupported query operator: ${f.operator}`);
    }
  }
  return { sql: clauses.join(' AND '), params };
}

// ---------- public document API ----------

export const postgresStore = {
  async getById(collection: string, id: string): Promise<any | null> {
    const r = await q('SELECT data FROM ' + T_DOCS + ' WHERE collection = $1 AND id = $2', [collection, id]);
    if (!r.rows[0]) return null;
    const data = decode(r.rows[0].data);
    for (const k of Object.keys(data)) if (data[k] === null) delete data[k];
    return { ...data, id };
  },

  async list(collection: string, options?: QueryOptions): Promise<any[]> {
    const { sql, params } = buildWhere(collection, options);
    let text = `SELECT id, data FROM ${T_DOCS} WHERE ${sql}`;
    if (options?.orderBy) {
      const path = String(options.orderBy).split('.').map((p) => p.replace(/[{}",\\']/g, '')).join(',');
      text += ` ORDER BY (data #> '{${path}}') ${options.orderDirection === 'desc' ? 'DESC NULLS LAST' : 'ASC NULLS LAST'}`;
    }
    if (typeof options?.limit === 'number') { params.push(options.limit); text += ` LIMIT $${params.length}`; }
    if (typeof options?.offset === 'number') { params.push(options.offset); text += ` OFFSET $${params.length}`; }
    const r = await q(text, params);
    return r.rows.map((row) => ({ ...decode(row.data), id: row.id }));
  },

  async count(collection: string, options?: QueryOptions): Promise<number> {
    const { sql, params } = buildWhere(collection, options);
    const r = await q(`SELECT count(*)::int AS n FROM ${T_DOCS} WHERE ${sql}`, params);
    return r.rows[0]?.n ?? 0;
  },

  /** Firestore set(): replaces the whole document. */
  async set(collection: string, id: string, data: any): Promise<any> {
    const enc = encode({ ...data, id });
    await q(
      `INSERT INTO ${T_DOCS} (collection, id, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [collection, id, JSON.stringify(enc)],
    );
    return { ...data, id };
  },

  /** Firestore update(): fails if missing; supports dotted paths. Atomic. */
  async update(collection: string, id: string, updates: any): Promise<any> {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(`SELECT data FROM ${T_DOCS} WHERE collection = $1 AND id = $2 FOR UPDATE`, [collection, id]);
      if (!r.rows[0]) {
        await client.query('ROLLBACK');
        const err: any = new Error(`NOT_FOUND: Document ${id} not found in collection ${collection}`);
        err.code = 5;
        throw err;
      }
      const merged = applyUpdates(r.rows[0].data, encode(updates));
      await client.query(`UPDATE ${T_DOCS} SET data = $3::jsonb, updated_at = now() WHERE collection = $1 AND id = $2`, [collection, id, JSON.stringify(merged)]);
      await client.query('COMMIT');
      return { ...decode(merged), id };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
      throw err;
    } finally {
      client.release();
    }
  },

  /** Firestore set(..., { merge: true }). Atomic. */
  async upsert(collection: string, id: string, data: any): Promise<any> {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(`SELECT data FROM ${T_DOCS} WHERE collection = $1 AND id = $2 FOR UPDATE`, [collection, id]);
      const merged = deepMerge(r.rows[0]?.data || {}, encode({ ...data, id }));
      await client.query(
        `INSERT INTO ${T_DOCS} (collection, id, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [collection, id, JSON.stringify(merged)],
      );
      await client.query('COMMIT');
      return { ...decode(merged), id };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  },

  async delete(collection: string, id: string): Promise<boolean> {
    await q(`DELETE FROM ${T_DOCS} WHERE collection = $1 AND id = $2`, [collection, id]);
    return true;
  },

  async ping(): Promise<void> {
    await q('SELECT 1');
  },

  /**
   * Leadership lease: only one process may run the Discord bot and schedulers.
   * A higher-priority holder (the VM) takes over from a lower one (Cloud Run) immediately;
   * otherwise the lease changes hands only when it expires.
   */
  async tryAcquireLease(name: string, holder: string, priority: number, ttlSeconds: number): Promise<boolean> {
    const r = await q(
      `INSERT INTO ${T_LEASE} (name, holder, priority, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))
       ON CONFLICT (name) DO UPDATE
         SET holder = EXCLUDED.holder, priority = EXCLUDED.priority, expires_at = EXCLUDED.expires_at
         WHERE ${T_LEASE}.holder = EXCLUDED.holder
            OR ${T_LEASE}.expires_at < now()
            OR ${T_LEASE}.priority < EXCLUDED.priority
       RETURNING holder`,
      [name, holder, priority, ttlSeconds],
    );
    return r.rows[0]?.holder === holder;
  },

  async releaseLease(name: string, holder: string): Promise<void> {
    await q(`DELETE FROM ${T_LEASE} WHERE name = $1 AND holder = $2`, [name, holder]);
  },

  async getLease(name: string): Promise<{ holder: string; priority: number; expiresAt: string } | null> {
    const r = await q(`SELECT holder, priority, expires_at FROM ${T_LEASE} WHERE name = $1`, [name]);
    const row = r.rows[0];
    return row ? { holder: row.holder, priority: row.priority, expiresAt: new Date(row.expires_at).toISOString() } : null;
  },

  /** Old local-dev demo data (seeded communities and fake personas). Read-only listing. */
  async findDemoRecords(): Promise<{ collection: string; id: string }[]> {
    await ensureSchema();
    const r = await getPool().query(`
      WITH demo_comms AS (
        SELECT id FROM ${T_DOCS} WHERE collection = 'communities'
          AND (id = 'comm_default' OR id LIKE 'comm\\_dev\\_%' OR data->>'ownerUserId' = 'usr_owner_dev' OR data->>'guildId' = 'dev_guild_local')
      )
      SELECT collection, id FROM ${T_DOCS}
      WHERE (collection = 'communities' AND id IN (SELECT id FROM demo_comms))
         OR data->>'communityId' IN (SELECT id FROM demo_comms)
         OR data->>'discordUserId' = ANY($1) OR data->>'userId' = ANY($1) OR data->>'ownerUserId' = ANY($1)
         OR (collection = 'users' AND id = ANY($1))
      ORDER BY collection, id`, [['usr_owner_dev', 'usr_controller', 'usr_interviewer', 'usr_recruiter', 'usr_member', 'usr_applicant']]);
    return r.rows;
  },

  async deleteMany(rows: { collection: string; id: string }[]): Promise<number> {
    await ensureSchema();
    let n = 0;
    for (const x of rows) n += (await getPool().query(`DELETE FROM ${T_DOCS} WHERE collection = $1 AND id = $2`, [x.collection, x.id])).rowCount || 0;
    return n;
  },

  async close(): Promise<void> {
    if (pool) await pool.end();
    pool = null;
    ready = null;
  },
};

/** Connection pool use (for diagnostics). */
export function getPoolStats() {
  try { const p: any = getPool(); return { total: p.totalCount, idle: p.idleCount, waiting: p.waitingCount, max: p.options?.max }; } catch { return null; }
}
/** Round-trip time of a trivial query. */
export async function pingDb() {
  const t = Date.now();
  try { await getPool().query('SELECT 1'); return { ok: true, ms: Date.now() - t }; } catch (e: any) { return { ok: false, ms: Date.now() - t, error: e.message }; }
}
