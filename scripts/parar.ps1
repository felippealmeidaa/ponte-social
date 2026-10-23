# Desliga o que o iniciar.bat ligou: backend, painel, túnel e os contêineres do Docker.
$raiz = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $raiz 'scripts\logs'

Write-Host '>> Backend e painel'
& (Join-Path $PSScriptRoot 'parar_servidores.ps1')

Write-Host '>> Túnel'
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item (Join-Path $logs 'tunel.pid') -ErrorAction SilentlyContinue

Write-Host '>> Contêineres (os dados ficam guardados)'
$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
$envArq = Join-Path $raiz 'backend\.env'
if (-not (Test-Path $envArq)) { $envArq = Join-Path $raiz '.env' }
if (Test-Path $envArq) {
    & $docker compose --env-file $envArq -f (Join-Path $raiz 'docker\docker-compose.yml') stop
}

Write-Host "`nTudo desligado." -ForegroundColor Green
Start-Sleep 3
