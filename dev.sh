#!/usr/bin/env bash

# Start the Laravel website/backend first, then Electron once its local API is
# reachable. Run this script from any directory: paths are relative to itself.
set -Eeuo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_ROOT="$(cd "$APP_ROOT/../trackerslens-site" && pwd)"
SITE_URL="http://127.0.0.1:8000"
SITE_PID=""
APP_PID=""

cleanup() {
  trap - EXIT INT TERM
  for pid in "$APP_PID" "$SITE_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}

trap cleanup EXIT INT TERM

for command in npm php curl; do
  command -v "$command" >/dev/null || { echo "Comando richiesto non trovato: $command" >&2; exit 1; }
done

(
  cd "$SITE_ROOT"
  npm run build
  exec php artisan serve --host=127.0.0.1 --port=8000
) &
SITE_PID=$!

echo "Attendo il sito/backend su ${SITE_URL}..."
for _ in {1..60}; do
  if curl --silent --fail "$SITE_URL/up" >/dev/null; then
    break
  fi
  if ! kill -0 "$SITE_PID" 2>/dev/null; then
    echo "Il sito/backend si è arrestato durante l'avvio." >&2
    exit 1
  fi
  sleep 1
done

if ! curl --silent --fail "$SITE_URL/up" >/dev/null; then
  echo "Il sito/backend non risponde entro 60 secondi: $SITE_URL" >&2
  exit 1
fi

echo "Sito/backend pronto. Avvio Trackers Lens..."
(
  cd "$APP_ROOT"
  exec npm run dev
) &
APP_PID=$!

wait "$APP_PID"
