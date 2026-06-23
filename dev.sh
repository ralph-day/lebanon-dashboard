#!/usr/bin/env bash
# Local development launcher — runs the API server (with the dev auth bypass so
# you skip Google login) and the Vite client together. Vite proxies /api and
# /auth to the server, so just open the client URL it prints.
#
#   ./dev.sh
#
# Stop everything with Ctrl-C.
set -e
cd "$(dirname "$0")"

# Install deps on first run if missing.
[ -d server/node_modules ] || (echo "Installing server deps…" && npm install --prefix server)
[ -d client/node_modules ] || (echo "Installing client deps…" && npm install --prefix client)

# Start the API server with the local-only auth bypass. NODE_ENV=development is
# set on the command line so it wins over any value in server/.env (dotenv does
# not override already-set vars) — this enables the bypass and http cookies.
# Drive credentials: server/.env has no service-account JSON locally (it only
# lives in Railway), so load the gitignored key file if present. Never printed.
KEY_FILE="pipeline/.secrets/service-account.json"
if [ -z "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ] && [ -f "$KEY_FILE" ]; then
  export GOOGLE_SERVICE_ACCOUNT_JSON="$(cat "$KEY_FILE")"
  echo "Loaded Drive service-account key from $KEY_FILE"
elif [ -z "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]; then
  echo "WARNING: no Drive credentials found — the dashboard will load but data fetch will fail."
fi

echo "Starting API server on :3001 (auth bypass ON — local only)…"
# Run from server/ so dotenv picks up server/.env (it loads ./.env from cwd).
# Provide harmless dev fallbacks for the startup-required vars that only live in
# Railway (OAuth is bypassed locally, so client id/secret are never used; the
# session secret just needs any value). Shell-set vars win — dotenv won't
# override an already-set var — so this never weakens production.
( cd server && \
  SESSION_SECRET="${SESSION_SECRET:-dev-local-secret}" \
  GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-dev-unused}" \
  GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-dev-unused}" \
  NODE_ENV=development DEV_AUTH_BYPASS=1 node index.js ) &
SERVER_PID=$!

# Always kill the server when this script exits.
trap 'echo; echo "Stopping…"; kill $SERVER_PID 2>/dev/null' EXIT INT TERM

# Give the server a moment to boot, then start the client in the foreground.
sleep 2
echo "Starting client (Vite)…"
npm run dev --prefix client
