/**
 * Minimal PostgREST-compatible query param → SQL mapper.
 * Supports: select, order, limit, offset, and eq/neq/gt/gte/lt/lte/like/ilike/is/in filters.
 */

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function parseSelect(select) {
  if (!select || select === '*') return '*';
  const cols = String(select)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (!cols.length) return '*';
  return cols.map(quoteIdent).join(', ');
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
 * @returns {{ whereSql: string, params: any[], limit: number, offset: number, selectSql: string, orderSql: string }}
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
      // in.(1,2,3) or in.(a,b)
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

  return {
    selectSql: parseSelect(query.select),
    orderSql: parseOrder(query.order),
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    limit,
    offset,
  };
}

module.exports = {
  quoteIdent,
  buildFromQuery,
  parseSelect,
  parseOrder,
};
