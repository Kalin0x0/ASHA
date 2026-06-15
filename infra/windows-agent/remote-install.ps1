<#
.SYNOPSIS
  Remotely install the Chista host agent on one or more Windows desktops/servers
  BY IP/HOSTNAME, using PowerShell Remoting (WinRM) — no need to RDP into each box.

.DESCRIPTION
  Run this from any Windows machine that can reach the targets. It copies the
  agent + installer to each target and runs the install (a boot Scheduled Task),
  so the host auto-registers with Chista and reports availability.

  RDP is a remote-DESKTOP protocol, not an install channel — remote install over
  the network goes through WinRM. (VMware/Parallels-style installs instead go
  through the hypervisor's guest channel and only apply to VMs that hypervisor
  manages; for Chista-provisioned VMs, bake the agent into the golden template.)

.PREREQUISITES
  - WinRM enabled on each target:  winrm quickconfig   (or  Enable-PSRemoting -Force )
  - Admin credentials on the targets.
  - For workgroup hosts addressed by IP, trust them on THIS machine, e.g.:
      Set-Item WSMan:\localhost\Client\TrustedHosts -Value '10.0.0.5,10.0.0.6' -Force
    (and use -UseSSL for encrypted transport where configured).

.EXAMPLE
  $cred = Get-Credential                          # admin on the targets
  ./remote-install.ps1 -ComputerName 10.0.0.5,10.0.0.6 `
    -ChistaUrl "https://chista.example.com" -Token "cra_xxxx" -Credential $cred -EnableRdp
#>
param(
  [Parameter(Mandatory = $true)][string[]]$ComputerName,
  [Parameter(Mandatory = $true)][string]$ChistaUrl,
  [Parameter(Mandatory = $true)][string]$Token,
  [Parameter(Mandatory = $true)][System.Management.Automation.PSCredential]$Credential,
  [switch]$EnableRdp,
  [switch]$UseSSL
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$agentSrc = Join-Path $here 'chista-agent.ps1'
$installSrc = Join-Path $here 'install.ps1'
if (-not (Test-Path $agentSrc) -or -not (Test-Path $installSrc)) {
  throw "chista-agent.ps1 / install.ps1 not found next to this script ($here)."
}

foreach ($target in $ComputerName) {
  Write-Host "==> $target" -ForegroundColor Cyan
  $session = $null
  try {
    $opt = if ($UseSSL) { @{ UseSSL = $true } } else { @{} }
    $session = New-PSSession -ComputerName $target -Credential $Credential @opt

    $remoteDir = 'C:\ProgramData\Chista'
    Invoke-Command -Session $session -ScriptBlock {
      param($d) New-Item -ItemType Directory -Force -Path $d | Out-Null
    } -ArgumentList $remoteDir

    Copy-Item -ToSession $session -Path $agentSrc   -Destination "$remoteDir\chista-agent.ps1" -Force
    Copy-Item -ToSession $session -Path $installSrc -Destination "$remoteDir\install.ps1"      -Force

    Invoke-Command -Session $session -ScriptBlock {
      param($d, $url, $tok, $rdp)
      $a = @{ ChistaUrl = $url; Token = $tok }
      if ($rdp) { $a['EnableRdp'] = $true }
      & "$d\install.ps1" @a
    } -ArgumentList $remoteDir, $ChistaUrl, $Token, [bool]$EnableRdp

    Write-Host "    installed." -ForegroundColor Green
  } catch {
    Write-Warning "    failed on ${target}: $_"
  } finally {
    if ($session) { Remove-PSSession $session }
  }
}
