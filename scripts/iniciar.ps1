# Liga a Ponte Social inteira nesta máquina: Docker (Postgres, Redis, Evolution), túnel público,
# backend e painel. Use pelo iniciar.bat na raiz do projeto.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$envArq = Join-Path $raiz 'backend\.env'
$logs = Join-Path $raiz 'scripts\logs'
New-Item -ItemType Directory -Force $logs | Out-Null

function Passo($texto) { Write-Host "`n>> $texto" -ForegroundColor Cyan }
function Falha($texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; Read-Host 'Enter para fechar'; exit 1 }
function Responde($url) {
    try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url).StatusCode -eq 200 } catch { $false }
}
function Achar($nome, $padroes) {
    $cmd = Get-Command $nome -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in $padroes) { if (Test-Path $p) { return $p } }
    return $null
}

if (-not (Test-Path $envArq)) { Falha "não achei $envArq" }

# 1. Docker
Passo 'Docker'
$docker = Achar 'docker' @("$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe")
if (-not $docker) { Falha 'Docker não instalado.' }
& $docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Abrindo o Docker Desktop (pode levar 1-2 min)...'
    Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
    $limite = (Get-Date).AddMinutes(4)
    do {
        Start-Sleep 5
        & $docker info *> $null
    } until ($LASTEXITCODE -eq 0 -or (Get-Date) -gt $limite)
    if ($LASTEXITCODE -ne 0) { Falha 'o Docker não ligou em 4 minutos. Abra o Docker Desktop e rode de novo.' }
}

Passo 'Postgres, Redis e Evolution'
& $docker compose --env-file $envArq -f (Join-Path $raiz 'docker\docker-compose.yml') up -d
if ($LASTEXITCODE -ne 0) { Falha 'docker compose falhou (veja a mensagem acima).' }

# 2. Túnel público (links que o celular abre, como o .ics da agenda)
Passo 'Túnel público'
function Gravar-PublicoUrl($valor) {
    # Troca a linha PUBLICO_URL do .env (UTF-8 sem BOM, como o resto do arquivo)
    $linhas = [System.Collections.Generic.List[string]]([IO.File]::ReadAllLines($envArq))
    $nova = "PUBLICO_URL=$valor"
    $i = $linhas.FindIndex([Predicate[string]]{ param($l) $l -like 'PUBLICO_URL=*' })
    if ($i -ge 0) { $linhas[$i] = $nova } else { $linhas.Add($nova) }
    [IO.File]::WriteAllLines($envArq, $linhas, (New-Object System.Text.UTF8Encoding $false))
}
$url = $null
$cloudflared = Achar 'cloudflared' @("${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe", "$env:ProgramFiles\cloudflared\cloudflared.exe")
if (-not $cloudflared) {
    Write-Host 'cloudflared não instalado: seguindo sem túnel.' -ForegroundColor Yellow
} else {
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
    $logTunel = Join-Path $logs 'tunel.log'
    Remove-Item $logTunel -ErrorAction SilentlyContinue
    $proc = Start-Process $cloudflared -ArgumentList 'tunnel', '--url', 'http://localhost:8000' `
        -RedirectStandardError $logTunel -RedirectStandardOutput (Join-Path $logs 'tunel.out.log') `
        -WindowStyle Hidden -PassThru
    Set-Content (Join-Path $logs 'tunel.pid') $proc.Id
    $limite = (Get-Date).AddSeconds(60)
    while (-not $url -and (Get-Date) -lt $limite) {
        Start-Sleep 2
        if (Test-Path $logTunel) {
            $m = Select-String -Path $logTunel -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
            if ($m) { $url = $m.Matches[0].Value }
        }
    }
    if (-not $url) { Write-Host 'O túnel não deu endereço em 60 s: seguindo sem ele.' -ForegroundColor Yellow }
}
if ($url) {
    Gravar-PublicoUrl "$url/api/v1"
    Write-Host "Endereço público: $url"
} else {
    # Sem túnel, apaga o endereço antigo: o bot deixa de mandar o link do iPhone em vez de mandar um link morto
    Gravar-PublicoUrl ''
}

# 3. Backend e painel (janela própria: fechar a janela desliga os dois)
Passo 'Backend e painel'
# Se já estavam ligados, desliga e liga de novo: o .env só é lido quando o backend começa
# (o recarregamento automático do uvicorn não percebe mudanças no .env)
& (Join-Path $PSScriptRoot 'parar_servidores.ps1')
$python = Join-Path $raiz '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { Falha "não achei o Python do projeto em $python" }
$env:PYTHONIOENCODING = 'utf-8'
Start-Process $python -ArgumentList 'run_dev.py' -WorkingDirectory $raiz
$limite = (Get-Date).AddSeconds(90)
while (-not ((Responde 'http://127.0.0.1:8000/docs') -and (Responde 'http://localhost:5173/')) -and (Get-Date) -lt $limite) { Start-Sleep 2 }
if (-not (Responde 'http://127.0.0.1:8000/docs')) { Falha 'o backend não respondeu (veja a janela do run_dev).' }

# O endereço novo do túnel leva alguns segundos para valer na internet: confere antes de dizer que está pronto
$publicoOk = $false
if ($url) {
    $limite = (Get-Date).AddSeconds(60)
    while (-not ($publicoOk = Responde "$url/docs") -and (Get-Date) -lt $limite) { Start-Sleep 3 }
}

Passo 'Pronto'
Write-Host 'Painel:    http://localhost:5173'
Write-Host 'Backend:   http://localhost:8000/docs'
Write-Host 'Evolution: http://localhost:8080'
if ($publicoOk) {
    Write-Host "Público:   $url  (link da agenda do iPhone ativo)" -ForegroundColor Green
} elseif ($url) {
    Write-Host "Público:   $url  ainda não abriu de fora; se o link do iPhone falhar, rode o iniciar de novo." -ForegroundColor Yellow
} else {
    Write-Host 'Público:   sem túnel (o bot não manda o link da agenda do iPhone).' -ForegroundColor Yellow
}
Write-Host 'Para desligar: parar.bat (ou feche a janela do run_dev).'
Start-Process 'http://localhost:5173'
Start-Sleep 8
