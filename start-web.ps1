# Arranca "Cifras y Letras" en WSL (Ubuntu) sobre el puerto 27182 y abre el navegador.
$port   = 27182
$distro = 'Ubuntu'
$dir    = '/home/salviati/cifras-y-letras'

Write-Host "Arrancando Cifras y Letras (puerto $port)..." -ForegroundColor Cyan

# Mata lo que ocupara el puerto (sin auto-matarse) y lanza el servidor en segundo plano.
$wslCmd = "fuser -k ${port}/tcp >/dev/null 2>&1; sleep 1; cd $dir && PORT=$port setsid nohup node server/index.js > /tmp/cyl.log 2>&1 < /dev/null & sleep 3; tail -n 1 /tmp/cyl.log"
wsl -d $distro -- bash -c $wslCmd

# IP de LAN = la de la interfaz con ruta por defecto (evita loopback y ZeroTier)
$ip = (Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
  Sort-Object RouteMetric |
  ForEach-Object { (Get-NetIPAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).IPAddress } |
  Where-Object { $_ } | Select-Object -First 1)
if (-not $ip) { $ip = 'localhost' }

$url = "http://${ip}:$port"
Write-Host ""
Write-Host "Web lista en:  $url" -ForegroundColor Green
Write-Host "(es la misma URL para los demas equipos de la LAN)" -ForegroundColor DarkGray
Write-Host "Puedes cerrar esta ventana; el servidor sigue en marcha." -ForegroundColor DarkGray
Start-Process $url
