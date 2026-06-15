<#
.SYNOPSIS
  Chista host agent (availability) — registers this Windows desktop/server with
  Chista and sends heartbeats so it shows up Online/available in the catalog.

.NOTES
  Auth is a Chista registration token (Access -> Authentication -> Registration
  tokens, or the "Install agent" panel under Infrastructure -> Servers).
  Reachability (a reverse tunnel for hosts behind NAT) is a separate component.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File chista-agent.ps1 `
    -ChistaUrl "https://chista.example.com" -Token "cra_xxx" -EnableRdp
#>
param(
  [Parameter(Mandatory = $true)][string]$ChistaUrl,
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Hostname = $env:COMPUTERNAME,
  [string]$Address = '',
  [ValidateSet('RDP', 'VNC', 'SSH')][string]$ConnectionType = 'RDP',
  [int]$IntervalSeconds = 30,
  [switch]$EnableRdp,
  [switch]$Tunnel
)

$ErrorActionPreference = 'Stop'
$AgentVersion = '1.0.0'
$ChistaUrl = $ChistaUrl.TrimEnd('/')

# Best-effort: discover a routable IPv4 if the caller didn't pass one.
if (-not $Address) {
  $Address = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -First 1).IPAddress
}

# Optionally make the desktop RDP-ready (enable RDP + open the firewall).
if ($EnableRdp) {
  try {
    Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name 'fDenyTSConnections' -Value 0
    Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -ErrorAction SilentlyContinue
    Write-Host 'Remote Desktop enabled.'
  } catch {
    Write-Warning "Could not enable Remote Desktop: $_"
  }
}

$headers = @{ 'x-registration-token' = $Token; 'content-type' = 'application/json' }

function Send-Register {
  $body = @{
    hostname       = $Hostname
    address        = $Address
    connectionType = $ConnectionType
    os             = 'windows'
    version        = $AgentVersion
  } | ConvertTo-Json
  return Invoke-RestMethod -Uri "$ChistaUrl/agent/server/register" -Method Post -Headers $headers -Body $body
}

function Send-Heartbeat {
  $body = @{ hostname = $Hostname; version = $AgentVersion } | ConvertTo-Json
  Invoke-RestMethod -Uri "$ChistaUrl/agent/server/heartbeat" -Method Post -Headers $headers -Body $body | Out-Null
}

Write-Host "Registering '$Hostname' ($Address) with Chista at $ChistaUrl ..."
$reg = Send-Register
Write-Host "Registered (serverId=$($reg.serverId), zone=$($reg.zoneId)). Heartbeating every $IntervalSeconds s."

# Optional reverse tunnel (WireGuard) — makes a host behind NAT reachable.
if ($Tunnel) {
  try {
    $body = @{ hostname = $Hostname } | ConvertTo-Json
    $t = Invoke-RestMethod -Uri "$ChistaUrl/agent/server/tunnel" -Method Post -Headers $headers -Body $body
    $conf = Join-Path $env:ProgramData 'Chista\chista-tunnel.conf'
    $t.config | Out-File -FilePath $conf -Encoding ascii -Force
    $wg = Join-Path $env:ProgramFiles 'WireGuard\wireguard.exe'
    if (Test-Path $wg) {
      & $wg /installtunnelservice $conf
      Write-Host "Tunnel up at $($t.tunnelIp) (WireGuard)."
    } else {
      Write-Warning "WireGuard for Windows is not installed. Tunnel config written to $conf — install WireGuard and import it."
    }
  } catch {
    Write-Warning "Tunnel setup failed: $_"
  }
}

while ($true) {
  try {
    Send-Heartbeat
  } catch {
    Write-Warning "Heartbeat failed: $_"
    try { Send-Register | Out-Null } catch { Write-Warning "Re-register failed: $_" }
  }
  Start-Sleep -Seconds $IntervalSeconds
}
