/**
 * Instance-scoped realtime via Socket.IO rooms + optional Postgres LISTEN/NOTIFY.
 */

const { Client } = require('pg');
const { internalConnFromInstanceRow, getMetaPool, isMetaReady } = require('./db');

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

async function notifyChange(pool, instanceId, event) {
  emitInstanceEvent(instanceId, event);
  if (!pool || !instanceId) return;
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
    // Channel may not exist / role lack notify — emission already sent via Socket.IO
    if (process.env.DEBUG_REALTIME) {
      console.warn('[realtime] NOTIFY failed:', err.message);
    }
  }
}

async function ensureListener(instanceId, connectionString) {
  if (!instanceId || !connectionString || listeners.has(instanceId)) return;

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query('LISTEN graphcore_changes');
    client.on('notification', (msg) => {
      if (msg.channel !== 'graphcore_changes' || !msg.payload) return;
      try {
        const data = JSON.parse(msg.payload);
        // Only re-broadcast if payload instance matches (or missing)
        if (data.instanceId && data.instanceId !== instanceId) return;
        emitInstanceEvent(instanceId, {
          type: data.type || 'info',
          table: data.table,
          details: data.details || 'Database change',
          data: data.data,
          user: data.user,
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
  ensureListener,
  startListenerForInstanceRow,
  warmListeners,
};
