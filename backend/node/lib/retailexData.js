/**
 * Read rows from RetailEX PostgREST using the tenant database name
 * (e.g. zetem → https://api.retailex.app/zetem/{table}).
 */

const DEFAULT_BASE = process.env.RETAILEX_SCHEMA_BASE || 'https://api.retailex.app';

function enabled() {
  return process.env.RETAILEX_DATA_PROXY !== '0';
}

function quoteIdentSafe(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(name || ''));
}

/**
 * @returns {{ rows: object[], total: number, source: 'retailex' }}
 */
async function fetchTableRows(databaseName, tableName, opts = {}) {
  if (!enabled()) {
    throw Object.assign(new Error('RetailEX data proxy disabled'), {
      status: 503,
      code: 'proxy_disabled',
    });
  }
  const db = String(databaseName || '').trim();
  const table = String(tableName || '').trim();
  if (!quoteIdentSafe(db) || !quoteIdentSafe(table)) {
    throw Object.assign(new Error('Invalid database or table name'), {
      status: 400,
      code: 'validation',
    });
  }

  const page = Math.max(1, parseInt(opts.page || 1, 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(opts.pageSize || 50, 10)));
  const offset = (page - 1) * pageSize;
  const sortBy = opts.sortBy;
  const sortOrder =
    String(opts.sortOrder || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const search = (opts.search || opts.q || '').trim();
  const columns = Array.isArray(opts.columns) ? opts.columns : [];

  const params = new URLSearchParams();
  params.set('limit', String(pageSize));
  params.set('offset', String(offset));
  if (sortBy && quoteIdentSafe(sortBy)) {
    params.set('order', `${sortBy}.${sortOrder}`);
  }
  if (search && columns.length) {
    const orParts = columns
      .filter((c) => quoteIdentSafe(c.name || c))
      .map((c) => {
        const name = c.name || c;
        const q = search.replace(/[,.()]/g, '');
        return `${name}.ilike.*${q}*`;
      });
    if (orParts.length) {
      params.set('or', `(${orParts.join(',')})`);
    }
  }

  const base = (opts.base || DEFAULT_BASE).replace(/\/+$/, '');
  const url = `${base}/${encodeURIComponent(db)}/${encodeURIComponent(table)}?${params}`;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 60000);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Prefer: 'count=exact',
      },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(
      new Error(
        `RetailEX ${db}/${table} failed (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`
      ),
      { status: res.status === 404 ? 404 : 502, code: 'retailex_fetch_failed' }
    );
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) {
    throw Object.assign(new Error('RetailEX returned non-array'), {
      status: 502,
      code: 'retailex_bad_payload',
    });
  }

  let total = rows.length;
  const range = res.headers.get('content-range') || res.headers.get('Content-Range');
  if (range) {
    // e.g. 0-49/1234 or */0
    const m = String(range).match(/\/(\d+|\*)\s*$/);
    if (m && m[1] !== '*') total = parseInt(m[1], 10);
  }

  return { rows, total, source: 'retailex', database: db, table };
}

module.exports = {
  enabled,
  fetchTableRows,
  DEFAULT_BASE,
};
