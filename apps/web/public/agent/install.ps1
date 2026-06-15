<#
.SYNOPSIS
  Install the Chista host agent as a Scheduled Task that starts at boot and
  keeps this Windows desktop/server registered + Online in Chista.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1 `
    -ChistaUrl "https://chista.example.com" -Token "cra_xxx" -EnableRdp
#>
param(
  [Parameter(Mandatory = $true)][string]$ChistaUrl,
  [Parameter(Mandatory = $true)][string]$Token,
  [switch]$EnableRdp
)

$ErrorActionPreference = 'Stop'

$dir = Join-Path $env:ProgramData 'Chista'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$agent = Join-Path $dir 'chista-agent.ps1'
Copy-Item -Path (Join-Path $PSScriptRoot 'chista-agent.ps1') -Destination $agent -Force

$rdp = if ($EnableRdp) { ' -EnableRdp' } else { '' }
$argument = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agent`" -ChistaUrl `"$ChistaUrl`" -Token `"$Token`"$rdp"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName 'ChistaAgent' -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'ChistaAgent'

Write-Host "Chista agent installed and started (Scheduled Task 'ChistaAgent')."
Write-Host "Uninstall: Unregister-ScheduledTask -TaskName 'ChistaAgent' -Confirm:`$false"
