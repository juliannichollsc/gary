@echo off
REM ============================================================
REM  RESET del Chrome de automatizacion (CDP). Cierra el Chrome saturado y lo
REM  reabre LIVIANO (sin restaurar pestanas) -> websocket estable + paralelo.
REM  Perfil dedicado: las sesiones (LinkedIn/Gmail/getonbrd) PERSISTEN aunque
REM  reabra limpio. NO toca tu navegador personal.
REM  Tu navegador personal queda intacto; este Chrome es solo para automatizar.
REM ============================================================
taskkill /IM chrome.exe /F >nul 2>&1
timeout /t 3 >nul
set DIR=%USERPROFILE%\chrome-automation-profile
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9333 ^
  --remote-allow-origins=* ^
  --user-data-dir="%DIR%" ^
  --disable-background-timer-throttling ^
  --disable-backgrounding-occluded-windows ^
  --disable-renderer-backgrounding ^
  --no-first-run --no-default-browser-check
echo Chrome de automatizacion reseteado y listo en 127.0.0.1:9333 (liviano).
