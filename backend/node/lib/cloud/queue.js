/**
 * In-process async job queue for cloud provisioning.
 * Persists status in cloud_operations; never blocks HTTP on provider completion.
 * If REDIS_URL is set later, can swap for BullMQ without changing CloudService.
 */
const repo = require('./repository');

const queue = [];
let pumping = false;
const handlers = new Map();

function registerHandler(action, fn) {
  handlers.set(action, fn);
}

async function enqueue(operationId) {
  queue.push(operationId);
  setImmediate(pump);
  return operationId;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const opId = queue.shift();
      await runOne(opId);
    }
  } finally {
    pumping = false;
  }
}

async function runOne(operationId) {
  const op = await repo.getOperation(operationId);
  if (!op) return;
  if (op.status === 'completed' || op.status === 'failed') return;

  await repo.updateOperation(operationId, { status: 'running' });
  const handler = handlers.get(op.action);
  if (!handler) {
    await repo.updateOperation(operationId, {
      status: 'failed',
      error: `No handler for action: ${op.action}`,
    });
    return;
  }
  try {
    const result = await handler(op);
    await repo.updateOperation(operationId, {
      status: 'completed',
      result: result || {},
      resourceId: result?.resourceId || op.resource_id,
    });
  } catch (err) {
    const message = err?.message || String(err);
    // Avoid leaking secrets in error text
    const safe = message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
    await repo.updateOperation(operationId, {
      status: 'failed',
      error: safe,
    });
  }
}

function pendingCount() {
  return queue.length;
}

function resetForTests() {
  queue.length = 0;
  pumping = false;
}

module.exports = {
  registerHandler,
  enqueue,
  pump,
  pendingCount,
  resetForTests,
};
