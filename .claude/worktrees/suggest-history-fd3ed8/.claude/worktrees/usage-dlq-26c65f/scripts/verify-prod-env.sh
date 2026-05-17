#!/usr/bin/env bash
# scripts/verify-prod-env.sh
#
# Pre-merge guard: confirms every required env var is present and
# non-empty on the target Vercel environment. Catches the "stored
# as empty string" bug that bit P12.
#
# Usage:
#   ./scripts/verify-prod-env.sh              # checks production
#   ./scripts/verify-prod-env.sh preview      # checks preview
#
# Exits non-zero if any required var is missing, empty, malformed,
# or (for the Supabase JWTs) carries the wrong role claim.
#
# This script is documented as a manual pre-merge step; it is NOT run
# in CI yet because it requires Vercel auth.

set -euo pipefail

ENV="${1:-production}"
TMP_FILE=".env.${ENV}.verify.tmp"

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

echo "→ Pulling ${ENV} env from Vercel..."
vercel env pull "$TMP_FILE" --environment="$ENV" --yes > /dev/null

REQUIRED_KEYS=(
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "ANTHROPIC_API_KEY"
  "RALLY_USAGE_HASH_SALT"
  "RALLY_ENCRYPTION_KEY"
)

FAIL=0

read_value() {
  local key="$1"
  grep "^${key}=" "$TMP_FILE" | cut -d= -f2- | sed 's/^"//;s/"$//'
}

check_nonempty() {
  local key="$1"
  local min_len="$2"
  local value
  value="$(read_value "$key")"

  if [ -z "$value" ]; then
    echo "  ✗ ${key}: EMPTY"
    FAIL=1
    return
  fi

  if [ "${#value}" -lt "$min_len" ]; then
    echo "  ✗ ${key}: length ${#value}, expected >= ${min_len}"
    FAIL=1
    return
  fi

  echo "  ✓ ${key} (length ${#value})"
}

check_jwt_role() {
  local key="$1"
  local expected_role="$2"
  local value
  value="$(read_value "$key")"

  if [ -z "$value" ]; then
    echo "  ✗ ${key}: EMPTY (cannot decode)"
    FAIL=1
    return
  fi

  # Pad the base64 payload to a multiple of 4 so `base64 -d` doesn't choke.
  local payload_b64
  payload_b64="$(echo "$value" | cut -d. -f2)"
  while [ $(( ${#payload_b64} % 4 )) -ne 0 ]; do
    payload_b64="${payload_b64}="
  done

  local payload
  payload="$(echo "$payload_b64" | base64 -d 2>/dev/null || echo "")"

  if echo "$payload" | grep -q "\"role\":\"${expected_role}\""; then
    echo "  ✓ ${key} role=${expected_role}"
  else
    echo "  ✗ ${key}: expected role=${expected_role}, decode failed or wrong role"
    FAIL=1
  fi
}

check_supabase_url() {
  local value
  value="$(read_value "NEXT_PUBLIC_SUPABASE_URL")"
  if [[ "$value" =~ ^https://[a-z0-9]+\.supabase\.co$ ]]; then
    echo "  ✓ NEXT_PUBLIC_SUPABASE_URL shape ok"
  else
    echo "  ✗ NEXT_PUBLIC_SUPABASE_URL: bad shape (got '${value}')"
    FAIL=1
  fi
}

echo ""
echo "Required keys present and non-empty:"
for key in "${REQUIRED_KEYS[@]}"; do
  check_nonempty "$key" 16
done

echo ""
echo "JWT role checks:"
check_jwt_role "NEXT_PUBLIC_SUPABASE_ANON_KEY" "anon"
check_jwt_role "SUPABASE_SERVICE_ROLE_KEY" "service_role"

echo ""
echo "Shape checks:"
check_supabase_url

echo ""
if [ "$FAIL" -eq 1 ]; then
  echo "✗ Env verification FAILED for environment: ${ENV}"
  exit 1
fi

echo "✓ Env verification passed for environment: ${ENV}"
