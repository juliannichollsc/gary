#!/usr/bin/env bash
# ============================================================
#  RESET del Chrome de automatizacion (CDP) — equivalente Linux de start-chrome-debug.cmd.
#  Cierra SOLO el Chrome de automatizacion (el que usa este perfil) y lo reabre liviano.
#  Perfil dedicado: las sesiones (LinkedIn/Gmail/getonbrd) PERSISTEN. NO toca tu navegador personal.
# ============================================================
PORT="${GARY_BROWSER_PORT:-9333}"
DIR="$HOME/chrome-automation-profile"
CHROME="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser)"
[ -z "$CHROME" ] && { echo "No encontre Chrome/Chromium en el PATH." >&2; exit 1; }

pkill -f -- "--user-data-dir=$DIR" 2>/dev/null && sleep 3
mkdir -p "$DIR"
nohup "$CHROME" \
  --remote-debugging-port="$PORT" \
  --remote-allow-origins='*' \
  --user-data-dir="$DIR" \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  --no-first-run --no-default-browser-check >/dev/null 2>&1 &
echo "Chrome de automatizacion reseteado y listo en 127.0.0.1:$PORT (liviano)."
