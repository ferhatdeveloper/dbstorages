# Cloud — Install

1. Ensure meta Postgres is configured (`DATABASE_URL`) so `migrate.js` creates `cloud_*` tables on boot.
2. Set env (see [CONFIG.md](./CONFIG.md)):
   - `HETZNER_API_TOKEN` (optional default)
   - `CLOUD_SECRETS_KEY` (recommended in production)
3. Restart Node backend: `npm run start:node` or `npm --prefix backend/node start`
4. Open Studio: **/app/cloud/servers** (sidebar → Cloud Infrastructure)
5. Create a provider with slug `hetzner` (or `mock` for local) and optional API key
6. Provision a server — response is async; watch **Provisioning Jobs** / **Activity**

No extra npm packages required for the MVP queue (in-process). Redis/BullMQ optional later.
