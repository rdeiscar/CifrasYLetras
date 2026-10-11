@echo off
title Cifras y Letras
setlocal

rem ============================================================
rem  CIFRAS Y LETRAS - arranque facil
rem  Doble clic: arranca el servidor y abre el juego en el navegador.
rem  Mientras la ventana "Cifras y Letras - SERVICIO" este abierta,
rem  el servidor esta en marcha. Cierrala para APAGARLO.
rem ============================================================

rem --- Si el servidor ya responde, solo abre el navegador ---
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try{ $null=Invoke-WebRequest 'http://127.0.0.1:27182/api/health' -TimeoutSec 1 -UseBasicParsing; exit 0 }catch{ exit 1 }"
if %errorlevel%==0 goto listo

echo Arrancando el servidor...
start "Cifras y Letras - SERVICIO (cierra esta ventana para apagarlo)" /min wsl -d Ubuntu -- bash -c "cd /home/salviati/cifras-y-letras && HOST=0.0.0.0 PORT=27182 NODE_ENV=production exec node server/index.js"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ip=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Sort-Object RouteMetric | ForEach-Object{ (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).IPAddress } | Where-Object{ $_ } | Select-Object -First 1);" ^
  "for($i=0;$i -lt 60;$i++){ try{ $null=Invoke-WebRequest 'http://127.0.0.1:27182/api/health' -TimeoutSec 1 -UseBasicParsing; Write-Host ''; Write-Host 'Servidor listo.'; Write-Host 'Este PC : http://127.0.0.1:27182'; if($ip){ Write-Host ('Otros equipos: http://' + $ip + ':27182') }; Start-Process 'http://127.0.0.1:27182'; exit 0 }catch{ Start-Sleep -Milliseconds 500 } }; Write-Host 'No se pudo arrancar el servidor. Abre la ventana del servicio para ver el error.'"
exit /b 0

:listo
echo El servidor ya esta en marcha, abriendo el juego...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process 'http://127.0.0.1:27182'"
exit /b 0