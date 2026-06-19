<#
.SYNOPSIS
  Install the Asha host agent as a Scheduled Task that starts at boot and
  keeps this Windows desktop/server registered + Online in Asha.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1 `
    -AshaUrl "https://asha.example.com" -Token "cra_xxx" -EnableRdp
#>
param(
  [Parameter(Mandatory = $true)][string]$AshaUrl,
  [Parameter(Mandatory = $true)][string]$Token,
  [switch]$EnableRdp,
  [switch]$Tunnel
)

$ErrorActionPreference = 'Stop'

$dir = Join-Path $env:ProgramData 'Asha'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$agent = Join-Path $dir 'asha-agent.ps1'
Copy-Item -Path (Join-Path $PSScriptRoot 'asha-agent.ps1') -Destination $agent -Force

$rdp = if ($EnableRdp) { ' -EnableRdp' } else { '' }
$tun = if ($Tunnel) { ' -Tunnel' } else { '' }
$argument = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agent`" -AshaUrl `"$AshaUrl`" -Token `"$Token`"$rdp$tun"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName 'AshaAgent' -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'AshaAgent'

Write-Host "Asha agent installed and started (Scheduled Task 'AshaAgent')."
Write-Host "Uninstall: Unregister-ScheduledTask -TaskName 'AshaAgent' -Confirm:`$false"
