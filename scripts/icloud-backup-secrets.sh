#!/usr/bin/env bash
# GraphCore secrets → iCloud Drive (Backups/GraphCore)
set -euo pipefail

ICLOUD="${HOME}/Library/Mobile Documents/com~apple~CloudDocs/Backups/GraphCore"
SECRETS="${ICLOUD}/secrets"
SNAP="${ICLOUD}/env-snapshots"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$SECRETS" "$SNAP"
chmod 700 "$SECRETS" 2>/dev/null || true

# 1) Ensure nowpayments.env exists
if [[ ! -f "${SECRETS}/nowpayments.env" ]]; then
  cat > "${SECRETS}/nowpayments.env" <<'EOF'
NOWPAYMENTS_API_KEY=
NOWPAYMENTS_IPN_SECRET=
NOWPAYMENTS_PAY_CURRENCY=usdttrc20
NOWPAYMENTS_API_URL=https://api.nowpayments.io/v1
PUBLIC_API_URL=http://localhost:4001
EOF
  chmod 600 "${SECRETS}/nowpayments.env"
fi

# 2) Pull known payment keys from local backend .env into iCloud overlay (non-destructive fill)
LOCAL_ENV="${ROOT}/backend/node/.env"
if [[ -f "$LOCAL_ENV" ]]; then
  while IFS= read -r key; do
    val="$(grep -E "^${key}=" "$LOCAL_ENV" | tail -1 | cut -d= -f2- || true)"
    if [[ -n "${val}" ]]; then
      if grep -qE "^${key}=" "${SECRETS}/nowpayments.env"; then
        # only replace if currently empty
        cur="$(grep -E "^${key}=" "${SECRETS}/nowpayments.env" | tail -1 | cut -d= -f2- || true)"
        if [[ -z "${cur}" ]]; then
          sed -i.bak "s|^${key}=.*|${key}=${val}|" "${SECRETS}/nowpayments.env"
        fi
      else
        echo "${key}=${val}" >> "${SECRETS}/nowpayments.env"
      fi
    fi
  done <<'KEYS'
NOWPAYMENTS_API_KEY
NOWPAYMENTS_IPN_SECRET
NOWPAYMENTS_PAY_CURRENCY
NOWPAYMENTS_API_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
IYZICO_API_KEY
IYZICO_SECRET_KEY
PAYTR_MERCHANT_ID
PAYTR_MERCHANT_KEY
PAYTR_MERCHANT_SALT
KEYS
  rm -f "${SECRETS}/nowpayments.env.bak"
fi

# 3) Snapshot redacted local .env (no values longer than placeholders in git — full copy only in iCloud)
if [[ -f "$LOCAL_ENV" ]]; then
  cp "$LOCAL_ENV" "${SNAP}/backend-node.env.${STAMP}"
  chmod 600 "${SNAP}/backend-node.env.${STAMP}"
  # keep last 20 snapshots
  ls -1t "${SNAP}"/backend-node.env.* 2>/dev/null | tail -n +21 | xargs -I{} rm -f "{}" || true
fi

# 4) Mirror nowpayments into ~/.cursor/secrets as offline fallback (TCC engelleyebilir)
mkdir -p "${HOME}/.cursor/secrets" 2>/dev/null || true
if cp "${SECRETS}/nowpayments.env" "${HOME}/.cursor/secrets/graphcore-nowpayments.env" 2>/dev/null; then
  chmod 600 "${HOME}/.cursor/secrets/graphcore-nowpayments.env" 2>/dev/null || true
else
  echo "WARN: ~/.cursor/secrets kopyası atlandı (macOS izin / TCC)"
fi

echo "OK iCloud secrets → ${SECRETS}"
echo "OK snapshot → ${SNAP}/backend-node.env.${STAMP}"
