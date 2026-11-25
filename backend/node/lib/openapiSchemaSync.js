/**
 * Sync public table DDL from a PostgREST OpenAPI (Swagger 2) document
 * into a tenant Postgres — pgAdmin-style schema structures without data.
 */

const DEFAULT_BASE = process.env.RETAILEX_SCHEMA_BASE || 'https://api.retailex.app';

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(name))) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function mapPgType(prop = {}) {
  const fmt = String(prop.format || '').trim();
  const typ = String(prop.type || 'string').toLowerCase();

  const known = new Set([
    'text',
    'uuid',
    'json',
    'jsonb',
    'date',
    'boolean',
    'numeric',
    'real',
    'double precision',
    'integer',
    'bigint',
    'smallint',
    'bytea',
    'inet',
    'cidr',
    'money',
    'xml',
    'citext',
    'ltree',
  ]);

  if (fmt === 'character varying' || fmt === 'character' || fmt === 'varchar') {
    return 'text';
  }
  if (fmt === 'timestamp with time zone') return 'timestamptz';
  if (fmt === 'timestamp without time zone') return 'timestamp';
  if (fmt === 'time with time zone') return 'timetz';
  if (fmt === 'time without time zone') return 'time';
  if (fmt === 'USER-DEFINED') return 'text';
  if (fmt === 'ARRAY') return 'text[]';
  if (known.has(fmt)) return fmt;
  if (fmt.endsWith('[]')) return 'text[]';

  if (typ === 'integer' || typ === 'int') {
    if (fmt === 'int64' || fmt === 'int8') return 'bigint';
    if (fmt === 'int16' || fmt === 'int2') return 'smallint';
    return 'integer';
  }
  if (typ === 'number') return fmt === 'float' || fmt === 'double' ? 'double precision' : 'numeric';
  if (typ === 'boolean') return 'boolean';
  if (typ === 'array') return 'jsonb';
  if (typ === 'object') return 'jsonb';
  return 'text';
}

function isPrimary(prop = {}) {
  const d = String(prop.description || '');
  return /<pk\s*\/>/i.test(d) || /primary\s+key/i.test(d);
}

function isForeign(prop = {}) {
  const d = String(prop.description || '');
  const m = d.match(/Foreign Key to [`']?([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)[`']?/i);
  if (m) return { table: m[1], column: m[2] };
  return null;
}

function shouldSkipDefinition(name) {
  if (!name || typeof name !== 'string') return true;
  if (name.startsWith('v_')) return true; // views — no CREATE TABLE
  if (name.startsWith('_graphcore')) return true;
  if (name.startsWith('pg_')) return true;
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return true;
  return false;
}

function parseOpenApiDefinitions(doc) {
  const defs = doc?.definitions || doc?.components?.schemas || {};
  const tables = [];
  for (const [name, schema] of Object.entries(defs)) {
    if (shouldSkipDefinition(name)) continue;
    const props = schema?.properties || {};
    const required = new Set(schema?.required || []);
    const columns = [];
    const pk = [];
    for (const [colName, prop] of Object.entries(props)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(colName)) continue;
      const fk = isForeign(prop);
      const primary = isPrimary(prop);
      if (primary) pk.push(colName);
      columns.push({
        name: colName,
        type: mapPgType(prop),
        nullable: !required.has(colName) && !primary,
        is_primary: primary,
        is_foreign_key: Boolean(fk),
        referenced_table: fk?.table,
        referenced_column: fk?.column,
      });
    }
    if (!columns.length) continue;
    tables.push({ name, columns, primaryKeys: pk });
  }
  tables.sort((a, b) => a.name.localeCompare(b.name));
  return tables;
}

async function fetchOpenApi(tenantCode, base = DEFAULT_BASE) {
  const code = String(tenantCode || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  if (!code) throw Object.assign(new Error('tenant code required'), { status: 400 });
  const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(code)}/`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90000);
  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/openapi+json, application/json' },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw Object.assign(
      new Error(`OpenAPI fetch failed (${res.status}) for ${code}`),
      { status: 502, code: 'openapi_fetch_failed' }
    );
  }
  return res.json();
}

function buildCreateTableSql(table) {
  const cols = table.columns.map((c) => {
    const nullSql = c.nullable ? '' : ' NOT NULL';
    return `  ${quoteIdent(c.name)} ${c.type}${nullSql}`;
  });
  if (table.primaryKeys?.length) {
    cols.push(
      `  PRIMARY KEY (${table.primaryKeys.map(quoteIdent).join(', ')})`
    );
  }
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (\n${cols.join(',\n')}\n)`;
}

function buildAddColumnSql(tableName, column) {
  const nullSql = column.nullable ? '' : ' NOT NULL';
  // ADD COLUMN IF NOT EXISTS cannot combine NOT NULL without default on nonempty tables;
  // these tenant DBs are empty/new so prefer nullable add then leave as-is.
  return `ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN IF NOT EXISTS ${quoteIdent(column.name)} ${column.type}`;
}

/**
 * Apply missing tables/columns into pool from OpenAPI definitions.
 * Does not create FK constraints (order-safe); columns are enough for Studio listing.
 */
async function applyOpenApiSchema(pool, doc, { dryRun = false } = {}) {
  const tables = parseOpenApiDefinitions(doc);
  const existingRes = await pool.query(`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const existing = new Set(existingRes.rows.map((r) => r.name));

  const colRes = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const existingCols = new Set(
    colRes.rows.map((r) => `${r.table_name}.${r.column_name}`)
  );

  let created = 0;
  let altered = 0;
  let skipped = 0;
  const errors = [];

  for (const table of tables) {
    try {
      if (!existing.has(table.name)) {
        const sql = buildCreateTableSql(table);
        if (!dryRun) await pool.query(sql);
        created += 1;
        existing.add(table.name);
        for (const c of table.columns) {
          existingCols.add(`${table.name}.${c.name}`);
        }
        continue;
      }
      for (const c of table.columns) {
        const key = `${table.name}.${c.name}`;
        if (existingCols.has(key)) {
          skipped += 1;
          continue;
        }
        const sql = buildAddColumnSql(table.name, c);
        if (!dryRun) await pool.query(sql);
        altered += 1;
        existingCols.add(key);
      }
    } catch (err) {
      errors.push({ table: table.name, message: err.message });
    }
  }

  return {
    tablesInSource: tables.length,
    created,
    altered,
    skippedColumns: skipped,
    errors,
  };
}

async function syncSchemaFromRetailEx(pool, tenantCode, opts = {}) {
  const doc = await fetchOpenApi(tenantCode, opts.base);
  const result = await applyOpenApiSchema(pool, doc, opts);
  return { tenantCode, ...result };
}

module.exports = {
  DEFAULT_BASE,
  parseOpenApiDefinitions,
  fetchOpenApi,
  applyOpenApiSchema,
  syncSchemaFromRetailEx,
  mapPgType,
  quoteIdent,
};
