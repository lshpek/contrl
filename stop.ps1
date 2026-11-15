$ErrorActionPreference = "SilentlyContinue"
Push-Location $PSScriptRoot
try {
$pidsFile = Join-Path $PSScriptRoot ".botvex_pids.json"

if (Test-Path $pidsFile) {
    $pids = Get-Content $pidsFile | ConvertFrom-Json
    foreach ($prop in $pids.PSObject.Properties) {
        $procId = [int]$prop.Value
        if ($procId -gt 0) {
            Stop-Process -Id $procId -Force
            Write-Host "[BOTVEX] Stopped $($prop.Name) (PID $procId)" -ForegroundColor Yellow
        }
    }
    Remove-Item $pidsFile -Force
} else {
    Write-Host "[BOTVEX] .botvex_pids.json not found." -ForegroundColor DarkGray
}
} finally {
    Pop-Location
}
