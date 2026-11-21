# Cloud — Developer Guide

## Layout

```
backend/node/lib/cloud/
  index.js
  providerInterface.js   # CloudProvider contract
  factory.js             # slug → driver
  service.js             # CloudService
  repository.js
  queue.js
  secrets.js
  errors.js              # withRetry
  providers/
    hetzner.js           # ONLY Hetzner-specific code
    mock.js
backend/node/routes/cloud.js
src/pages/cloud/         # Studio UI
docs/cloud/              # This folder
```

## Rules

- Composition over inheritance; drivers implement the interface
- No Hetzner strings in controllers / CloudService / React (except user-selected slug in Providers UI)
- HTTP never waits for provider completion — always enqueue + poll
- Extend `migrate.js`; do not fork meta schema elsewhere

## Tests

```bash
npm --prefix backend/node test          # smoke + test-cloud
npm --prefix backend/node run test:cloud
npm test                                # root → backend tests
npm run build                           # Vite frontend
```

Mock Hetzner via `MockCloudProvider` or inject axios stub into `HetznerProvider({ client })`.

## TODO

- BullMQ when `REDIS_URL` present
- Richer firewall rule builder UI
- Metered VPS Stripe prices (currently contact / studio path)
