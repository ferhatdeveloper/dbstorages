/**
 * Minimal PostgREST-compatible query param → SQL mapper.
 * Supports: select (incl. simple embed), order, limit, offset,
 * eq/neq/gt/gte/lt/lte/like/ilike/is/in filters.
 */

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

/**
 * Split select list on commas that are not inside (...).
 */
function splitSelectParts(select) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of String(select)) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * Parse select — plain columns + optional one-level embed:
 *   select=id,name,orders(id,total)
 */
function parseSelectDetailed(select) {
  if (!select || select === '*') {
    return { selectSql: '*', embeds: [] };
  }
  const embeds = [];
  const cols = [];
  const parts = splitSelectParts(select);
  for (const part of parts) {
    const m = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
    if (m) {
      const relation = m[1];
      const inner = m[2].trim();
      const embedCols =
        !inner || inner === '*'
          ? ['*']
          : splitSelectParts(inner);
      embeds.push({ relation, columns: embedCols });
      continue;
    }
    cols.push(quoteIdent(part));
  }
  return {
    selectSql: cols.length ? cols.join(', ') : '*',
    embeds,
  };
}

function parseSelect(select) {
  return parseSelectDetailed(select).selectSql;
}

function parseOrder(order) {
  if (!order) return '';
  const parts = String(order)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [col, dirRaw] = p.split('.');
      const dir = String(dirRaw || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      return `${quoteIdent(col)} ${dir}`;
    });
  return parts.length ? `ORDER BY ${parts.join(', ')}` : '';
}

const OPS = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
};

/**
 * @param {Record<string, string>} query express req.query
 */
function buildFromQuery(query = {}) {
  const reserved = new Set([
    'select',
    'order',
    'limit',
    'offset',
    'and',
    'or',
    'prefer',
  ]);
  const params = [];
  const clauses = [];

  for (const [key, raw] of Object.entries(query)) {
    if (reserved.has(key)) continue;
    if (raw == null || raw === '') continue;
    const value = Array.isArray(raw) ? raw[0] : String(raw);
    const dot = value.indexOf('.');
    if (dot < 0) continue;
    const op = value.slice(0, dot);
    const rhs = value.slice(dot + 1);

    if (op === 'is') {
      if (rhs.toLowerCase() === 'null') {
        clauses.push(`${quoteIdent(key)} IS NULL`);
      } else if (rhs.toLowerCase() === 'true') {
        clauses.push(`${quoteIdent(key)} IS TRUE`);
      } else if (rhs.toLowerCase() === 'false') {
        clauses.push(`${quoteIdent(key)} IS FALSE`);
      }
      continue;
    }

    if (op === 'in') {
      const inner = rhs.replace(/^\(/, '').replace(/\)$/, '');
      const items = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
      params.push(items);
      clauses.push(`${quoteIdent(key)} = ANY($${params.length}::text[])`);
      continue;
    }

    if (OPS[op]) {
      params.push(rhs);
      clauses.push(`${quoteIdent(key)} ${OPS[op]} $${params.length}`);
    }
  }

  const limit = Math.min(
    1000,
    Math.max(1, parseInt(query.limit || '100', 10) || 100)
  );
  const offset = Math.max(0, parseInt(query.offset || '0', 10) || 0);
  const detailed = parseSelectDetailed(query.select);

  return {
    selectSql: detailed.selectSql,
    embeds: detailed.embeds,
    orderSql: parseOrder(query.order),
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    limit,
    offset,
  };
}

/**
 * Resolve FK from parentTable → relation (or reverse) via information_schema.
 */
async function resolveEmbedFk(pool, parentTable, relation) {
  // Child has FK to parent: relation.col → parent.pk
  const forward = await pool.query(
    `SELECT
       kcu.column_name AS from_col,
       ccu.column_name AS to_col,
       'forward' AS dir
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND tc.table_name = $1
       AND ccu.table_name = $2
     LIMIT 1`,
    [relation, parentTable]
  );
  if (forward.rowCount) {
    return {
      childTable: relation,
      childCol: forward.rows[0].from_col,
      parentCol: forward.rows[0].to_col,
      many: true,
    };
  }
  // Parent has FK to relation (belongs-to)
  const reverse = await pool.query(
    `SELECT
       kcu.column_name AS from_col,
       ccu.column_name AS to_col
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND tc.table_name = $1
       AND ccu.table_name = $2
     LIMIT 1`,
    [parentTable, relation]
  );
  if (reverse.rowCount) {
    return {
      childTable: relation,
      childCol: reverse.rows[0].to_col,
      parentCol: reverse.rows[0].from_col,
      many: false,
    };
  }
  return null;
}

async function hydrateEmbeds(pool, parentTable, rows, embeds) {
  if (!embeds?.length || !rows?.length) return rows;
  const out = rows.map((r) => ({ ...r }));
  for (const emb of embeds) {
    const fk = await resolveEmbedFk(pool, parentTable, emb.relation);
    if (!fk) {
      for (const row of out) row[emb.relation] = null;
      continue;
    }
    const parentVals = [
      ...new Set(out.map((r) => r[fk.parentCol]).filter((v) => v != null)),
    ];
    if (!parentVals.length) {
      for (const row of out) row[emb.relation] = fk.many ? [] : null;
      continue;
    }
    const selectCols =
      emb.columns[0] === '*'
        ? '*'
        : emb.columns.map(quoteIdent).join(', ');
    const { rows: childRows } = await pool.query(
      `SELECT ${selectCols} FROM ${quoteIdent(fk.childTable)}
       WHERE ${quoteIdent(fk.childCol)} = ANY($1)`,
      [parentVals]
    );
    const byParent = new Map();
    for (const c of childRows) {
      const k = c[fk.childCol];
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k).push(c);
    }
    for (const row of out) {
      const list = byParent.get(row[fk.parentCol]) || [];
      row[emb.relation] = fk.many ? list : list[0] || null;
    }
  }
  return out;
}

/** Validate RPC function name (schema.fn or fn in public). */
function parseRpcName(name) {
  const parts = String(name || '').split('.');
  if (parts.length === 1) {
    return { schema: 'public', fn: parts[0] };
  }
  if (parts.length === 2) {
    return { schema: parts[0], fn: parts[1] };
  }
  throw new Error('Invalid RPC name');
}

module.exports = {
  quoteIdent,
  buildFromQuery,
  parseSelect,
  parseSelectDetailed,
  parseOrder,
  resolveEmbedFk,
  hydrateEmbeds,
  parseRpcName,
};
