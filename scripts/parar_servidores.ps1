# Desliga backend (8000) e painel (5173), inclusive a janela do run_dev.py. Usado pelo iniciar e pelo parar.
foreach ($porta in 8000, 5173) {
    Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
# O run_dev.py fica vivo esperando os filhos, e o uvicorn --reload roda o servidor num processo filho
# ("multiprocessing-fork") que herda a porta: se o pai morre antes, o filho fica órfão segurando a 8000.
$pythons = @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe'")
$vivos = @($pythons | ForEach-Object { $_.ProcessId })
$nossos = @($pythons | Where-Object { $_.CommandLine -like '*run_dev.py*' -or $_.CommandLine -like '*uvicorn*app.main:app*' })
$idsNossos = @($nossos | ForEach-Object { $_.ProcessId })
$filhos = @($pythons | Where-Object {
    $_.CommandLine -like '*multiprocessing-fork*' -and ($idsNossos -contains $_.ParentProcessId -or $vivos -notcontains $_.ParentProcessId)
})
($nossos + $filhos) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# Espera as portas soltarem antes de ligar de novo
$limite = (Get-Date).AddSeconds(15)
while ((Get-NetTCPConnection -LocalPort 8000, 5173 -State Listen -ErrorAction SilentlyContinue) -and (Get-Date) -lt $limite) {
    Start-Sleep 1
}
