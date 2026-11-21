/**
 * Instance-scoped realtime via Socket.IO rooms + Postgres LISTEN/NOTIFY.
 * CDC: provision installs AFTER ROW triggers on public tables (see sql/realtime_notify_template.sql).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { internalConnFromInstanceRow, getMetaPool, isMetaReady } = require('./db');

const REALTIME_TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  'sql',
  'realtime_notify_template.sql'
);

/** @type {import('socket.io').Server | null} */
let ioRef = null;

/** @type {Map<string, import('pg').Client>} */
const listeners = new Map();

function setIo(io) {
  ioRef = io;
}

function roomName(instanceId) {
  return `instance:${instanceId}`;
}

function emitInstanceEvent(instanceId, event) {
  if (!ioRef || !instanceId) return;
  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    instanceId,
    timestamp: new Date().toISOString(),
    severity: 'low',
    source: 'database',
    ...event,
  };
  ioRef.to(roomName(instanceId)).emit('db_change', payload);
  ioRef.to(roomName(instanceId)).emit('realtime_event', payload);
}

/**
 * Explicit Socket.IO emit + optional NOTIFY.
 * Prefer DB triggers for row CDC (avoids duplicate events on Studio/REST writes).
 * Use this for non-row / fallback events when triggers are absent.
 */
async function notifyChange(pool, instanceId, event, opts = {}) {
  const viaNotify = opts.viaNotify === true;
  if (!viaNotify) {
    emitInstanceEvent(instanceId, event);
  }
  if (!pool || !instanceId || !viaNotify) return;
  try {
    await pool.query(`SELECT pg_notify('graphcore_changes', $1)`, [
      JSON.stringify({
        instanceId,
        type: event.type,
        table: event.table,
        details: event.details,
        data: event.data || null,
        at: new Date().toISOString(),
      }),
    ]);
  } catch (err) {
    emitInstanceEvent(instanceId, event);
    if (process.env.DEBUG_REALTIME) {
      console.warn('[realtime] NOTIFY failed:', err.message);
    }
  }
}

/** Best-effort: install / refresh trigger CDC on an already-provisioned DB. */
async function ensureRealtimeTriggers(pool) {
  if (!pool) return;
  try {
    const sql = fs.readFileSync(REALTIME_TEMPLATE_PATH, 'utf8');
    await pool.query(sql);
  } catch (err) {
    // Older DBs may lack privileges for event triggers — attach function may still work
    try {
      await pool.query(`SELECT public.graphcore_attach_realtime_triggers()`);
    } catch (err2) {
      if (process.env.DEBUG_REALTIME) {
        console.warn('[realtime] ensureTriggers:', err.message, err2.message);
      }
    }
  }
}

async function ensureListener(instanceId, connectionString) {
  if (!instanceId || !connectionString || listeners.has(instanceId)) return;

  const client = new Client({ connectionString });
  try {
    await client.connect();
    try {
      await ensureRealtimeTriggers(client);
    } catch {
      /* non-fatal */
    }
    await client.query('LISTEN graphcore_changes');
    client.on('notification', (msg) => {
      if (msg.channel !== 'graphcore_changes' || !msg.payload) return;
      try {
        const data = JSON.parse(msg.payload);
        // Only re-broadcast if payload instance matches (or missing — trigger payloads omit it)
        if (data.instanceId && data.instanceId !== instanceId) return;
        const type = String(data.type || 'info').toLowerCase();
        emitInstanceEvent(instanceId, {
          type,
          table: data.table,
          details: data.details || 'Database change',
          data: data.data,
          user: data.user,
          source: data.source || 'database',
        });
      } catch {
        /* ignore bad payload */
      }
    });
    client.on('error', (err) => {
      console.warn(`[realtime] listener ${instanceId}:`, err.message);
      listeners.delete(instanceId);
      client.end().catch(() => {});
    });
    listeners.set(instanceId, client);
    console.log(`[realtime] LISTEN started for ${instanceId}`);
  } catch (err) {
    console.warn(`[realtime] could not LISTEN ${instanceId}:`, err.message);
    await client.end().catch(() => {});
  }
}

async function startListenerForInstanceRow(row) {
  const conn = internalConnFromInstanceRow(row);
  if (conn) await ensureListener(row.id, conn);
}

/** Warm listeners for ready instances (best-effort on boot). */
async function warmListeners() {
  if (!isMetaReady()) return;
  try {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM instances WHERE status = 'ready' AND connection_string IS NOT NULL LIMIT 50`
    );
    for (const row of rows) {
      await startListenerForInstanceRow(row);
    }
  } catch (err) {
    console.warn('[realtime] warmListeners:', err.message);
  }
}

module.exports = {
  setIo,
  roomName,
  emitInstanceEvent,
  notifyChange,
  ensureRealtimeTriggers,
  ensureListener,
  startListenerForInstanceRow,
  warmListeners,
};
