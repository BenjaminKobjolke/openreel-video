param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('desktop', 'server')]
    [string]$Name,

    [Parameter(Mandatory = $true, Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Command
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$flagPath = Join-Path $repoRoot "_restart_$Name"

:supervisor while ($true) {
    if (Test-Path -LiteralPath $flagPath) {
        Remove-Item -LiteralPath $flagPath -Force
    }

    $process = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList @('/c', ($Command -join ' ')) `
        -NoNewWindow -PassThru

    while (-not $process.HasExited) {
        Start-Sleep -Seconds 1

        if (Test-Path -LiteralPath $flagPath) {
            # Console processes ignore a polite close, so stop the full process tree.
            & taskkill.exe /PID $process.Id /T /F | Out-Null
            Remove-Item -LiteralPath $flagPath -Force
            Write-Host "restarting $Name..."
            continue supervisor
        }
    }

    exit $process.ExitCode
}
