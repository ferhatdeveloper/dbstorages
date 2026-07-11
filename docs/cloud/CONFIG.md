# Cloud — Config

| Variable | Required | Description |
|----------|----------|-------------|
| `HETZNER_API_TOKEN` | No* | Default API token when provider row has no encrypted key |
| `CLOUD_SECRETS_KEY` | Prod recommended | AES key material for `api_key_enc` (falls back to `JWT_SECRET`) |
| `CLOUD_HTTP_TIMEOUT_MS` | No | Provider HTTP timeout (default 30000) |
| `JWT_SECRET` | Yes (platform) | Also used as secrets fallback |

\* Without a token, live `hetzner` calls return `provider_unconfigured`. Use `mock` slug for offline tests.

## Pricing / ek hizmet

- DB plans Pro **$34** / Scale **$50** / Max **$99** unchanged
- Backup addon **$10**/mo unchanged
- `vps` addon is **contactOnly** — surfaced on Pricing & Landing, links to Cloud UI

## Dokploy

Add the same vars in Dokploy env for the Node service. Restart after setting `HETZNER_API_TOKEN`.
