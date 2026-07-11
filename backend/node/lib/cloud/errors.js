function cloudError(status, message, code = 'cloud_error', details = null) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (details) err.details = details;
  return err;
}

function isRetryable(err) {
  const status = err?.status || err?.response?.status;
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') return true;
  return false;
}

async function withRetry(fn, { retries = 3, baseMs = 400 } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt === retries || !isRetryable(err)) throw err;
      const wait = baseMs * 2 ** attempt + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

module.exports = { cloudError, isRetryable, withRetry };
