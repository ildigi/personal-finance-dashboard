<#
.SYNOPSIS
    Cerca segreti in tutto il repository e nella sua history Git.
.DESCRIPTION
    Usa gitleaks con la configurazione del progetto (.gitleaks.toml).
    Esce con codice diverso da 0 se trova qualcosa.
#>
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command gitleaks -ErrorAction SilentlyContinue)) {
    Write-Error 'gitleaks non trovato. Installa con: winget install Gitleaks.Gitleaks'
}

Push-Location $repo
try {
    Write-Host '== History Git ==' -ForegroundColor Cyan
    gitleaks git --config .gitleaks.toml --redact --no-banner
    $historyExit = $LASTEXITCODE

    Write-Host '== File di lavoro (anche non committati) ==' -ForegroundColor Cyan
    gitleaks dir . --config .gitleaks.toml --redact --no-banner
    $dirExit = $LASTEXITCODE

    if ($historyExit -ne 0 -or $dirExit -ne 0) {
        Write-Host 'ATTENZIONE: possibili segreti trovati.' -ForegroundColor Red
        exit 1
    }
    Write-Host 'Nessun segreto trovato.' -ForegroundColor Green
}
finally {
    Pop-Location
}
