#!/bin/bash
set -euo pipefail

BACKEND_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$BACKEND_DIR"

default_interface="$(route -n get default 2>/dev/null | awk '$1 == "interface:" { print $2; exit }' || true)"
lan_ip=""

for interface in "$default_interface" en0; do
  if [ -n "$interface" ]; then
    lan_ip="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
    if [ -n "$lan_ip" ]; then
      break
    fi
  fi
done

if [ -z "$lan_ip" ]; then
  echo "Could not find a LAN IPv4 address. Connect to Wi-Fi or Ethernet and try again." >&2
  exit 1
fi

python="$BACKEND_DIR/venv/bin/python"
if [ ! -x "$python" ]; then
  python="$(command -v python3 || true)"
fi

if [ -z "$python" ]; then
  echo "Python 3 was not found. Install backend requirements or create backend/venv first." >&2
  exit 1
fi

DJANGO_ALLOWED_HOSTS="${DJANGO_ALLOWED_HOSTS:-localhost,127.0.0.1},$lan_ip"
PORT="${PORT:-8000}"
export DJANGO_ALLOWED_HOSTS

echo "Starting backend at http://$lan_ip:$PORT"
echo "Stop the server with Ctrl+C."

exec "$python" -m daphne -b 0.0.0.0 -p "$PORT" backend.asgi:application
