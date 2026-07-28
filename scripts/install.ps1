#Requires -Version 5.1
<#
.SYNOPSIS
  Asha installer and lifecycle helper for Windows.

.DESCRIPTION
  Prepares a local or public-domain Asha deployment on Windows with Docker
  Desktop. The script is idempotent: existing .env secrets are preserved.

.EXAMPLE
  .\scripts\install.ps1 install -InstallPrerequisites

.EXAMPLE
  .\scripts\install.ps1 install -Domain asha.local -Yes

.EXAMPLE
  .\scripts\install.ps1 status
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Action = '',

  [string]$Domain = '',

  [string]$Email = '',

  [ValidateSet('live', 'mock')]
  [string]$Mode = 'live',

  [switch]$Yes,

  [switch]$InstallPrerequisites
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:Version = '1.0.0'
$script:DefaultDomain = 'asha.local'
$script:RepoRoot = ''
$script:EnvFile = ''
$script:DockerExe = ''
$script:ComposeFileArgs = @()
$script:DomainName = ''
$script:AppMode = $Mode

function Write-Info([string]$Message) {
  Write-Host "  [*] $Message" -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
  Write-Host "  [+] $Message" -ForegroundColor Green
}

function Write-WarningMessage([string]$Message) {
  Write-Host "  [!] $Message" -ForegroundColor Yellow
}

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host ">> $Message" -ForegroundColor Yellow
}

function Show-Banner {
  Write-Host ''
  Write-Host '==============================================================================' -ForegroundColor DarkGray
  Write-Host @'

                            ######  ######
                        ####      ##      ####
                      ###    ##########    ###
                     ##    ####      ####    ##
                    ##    ##    ####    ##    ##
                    ##    ##   ##  ##   ##    ##
                    ##    ##    ####    ##    ##
                     ##    ####      ####    ##
                      ###    ##########    ###
                        ####      ##      ####
                            ######  ######

         _    ____  _   _    _
        / \  / ___|| | | |  / \
       / _ \ \___ \| |_| | / _ \
      / ___ \ ___) |  _  |/ ___ \
     /_/   \_\____/|_| |_/_/   \_\

'@ -ForegroundColor Yellow
  Write-Host '              C O N T A I N E R   S T R E A M I N G' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '==============================================================================' -ForegroundColor DarkGray
  Write-Host "  Naiemi Group  -  VDI / DaaS Platform                Windows Installer v$($script:Version)"
  Write-Host ''
}

function Find-AshaRoot([string]$StartPath) {
  if ([string]::IsNullOrWhiteSpace($StartPath)) {
    return $null
  }

  $current = [System.IO.DirectoryInfo](Get-Item -LiteralPath $StartPath)
  while ($null -ne $current) {
    $compose = Join-Path $current.FullName 'docker-compose.yml'
    $apps = Join-Path $current.FullName 'apps'
    if ((Test-Path -LiteralPath $compose -PathType Leaf) -and
        (Test-Path -LiteralPath $apps -PathType Container)) {
      return $current.FullName
    }
    $current = $current.Parent
  }

  return $null
}

function Initialize-RepositoryContext {
  $root = Find-AshaRoot -StartPath $PSScriptRoot
  if (-not $root) {
    $root = Find-AshaRoot -StartPath (Get-Location).Path
  }
  if (-not $root) {
    throw 'Asha checkout not found. Clone the repository, cd into it, then run scripts\install.ps1.'
  }

  $script:RepoRoot = $root
  $script:EnvFile = Join-Path $root '.env'
  Set-Location -LiteralPath $root
}

function Get-DockerExecutable {
  $command = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe'),
    (Join-Path $env:ProgramFiles 'Docker\Docker\resources\docker.exe')
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return $null
}

function Install-DockerDesktop {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw 'winget is unavailable. Install Docker Desktop manually from https://www.docker.com/products/docker-desktop/.'
  }

  Write-Step 'Installing Docker Desktop'
  & $winget.Source install --id Docker.DockerDesktop --exact `
    --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop installation failed (winget exit code $LASTEXITCODE)."
  }
}

function Test-DockerReady {
  if (-not $script:DockerExe) {
    return $false
  }

  & $script:DockerExe info *> $null
  return $LASTEXITCODE -eq 0
}

function Ensure-Docker {
  Write-Step 'Docker Desktop + Compose'
  $script:DockerExe = Get-DockerExecutable

  if (-not $script:DockerExe) {
    if (-not $InstallPrerequisites) {
      throw 'Docker Desktop is not installed. Install it, or re-run with -InstallPrerequisites.'
    }
    Install-DockerDesktop
    $script:DockerExe = Get-DockerExecutable
  }

  if (-not $script:DockerExe) {
    throw 'Docker was installed but docker.exe is not visible yet. Restart Windows, then re-run this command.'
  }

  if (-not (Test-DockerReady)) {
    $desktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path -LiteralPath $desktop -PathType Leaf) {
      Write-Info 'Starting Docker Desktop...'
      Start-Process -FilePath $desktop | Out-Null
    }

    for ($attempt = 1; $attempt -le 60; $attempt++) {
      if (Test-DockerReady) {
        break
      }
      if (($attempt % 5) -eq 0) {
        Write-Info "Waiting for the Linux container engine... ($($attempt * 3)s)"
      }
      Start-Sleep -Seconds 3
    }
  }

  if (-not (Test-DockerReady)) {
    throw 'Docker Desktop is installed but its Linux container engine is unavailable. Start Docker Desktop and verify WSL 2 is enabled.'
  }

  & $script:DockerExe compose version *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose v2 is required.'
  }

  $dockerVersion = (& $script:DockerExe --version)
  $composeVersion = (& $script:DockerExe compose version)
  Write-Success $dockerVersion
  Write-Success $composeVersion
}

function Invoke-Compose {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $allArguments = @('compose') + $script:ComposeFileArgs + $Arguments
  & $script:DockerExe @allArguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose failed (exit code $LASTEXITCODE): $($Arguments -join ' ')"
  }
}

function Get-EnvValue([string]$Key) {
  if (-not (Test-Path -LiteralPath $script:EnvFile -PathType Leaf)) {
    return ''
  }

  $prefix = "$Key="
  foreach ($line in [System.IO.File]::ReadAllLines($script:EnvFile)) {
    if ($line.StartsWith($prefix, [System.StringComparison]::Ordinal)) {
      return $line.Substring($prefix.Length)
    }
  }
  return ''
}

function Set-EnvValue([string]$Key, [string]$Value) {
  $lines = [System.Collections.Generic.List[string]]::new()
  if (Test-Path -LiteralPath $script:EnvFile -PathType Leaf) {
    $lines.AddRange([string[]][System.IO.File]::ReadAllLines($script:EnvFile))
  }

  $prefix = "$Key="
  $replaced = $false
  for ($index = 0; $index -lt $lines.Count; $index++) {
    if (-not $replaced -and
        $lines[$index].StartsWith($prefix, [System.StringComparison]::Ordinal)) {
      $lines[$index] = "$Key=$Value"
      $replaced = $true
    }
  }
  if (-not $replaced) {
    $lines.Add("$Key=$Value")
  }

  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllLines($script:EnvFile, $lines, $utf8WithoutBom)
}

function New-RandomHex([int]$ByteCount = 24) {
  $bytes = [byte[]]::new($ByteCount)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

function Set-SecretWhenDefault([string]$Key, [string]$Placeholder, [int]$ByteCount) {
  $current = Get-EnvValue -Key $Key
  if ([string]::IsNullOrWhiteSpace($current) -or $current -eq $Placeholder) {
    Set-EnvValue -Key $Key -Value (New-RandomHex -ByteCount $ByteCount)
  }
}

function Test-LocalDomain([string]$DomainName) {
  if ($DomainName -eq 'localhost' -or
      $DomainName.EndsWith('.local', [System.StringComparison]::OrdinalIgnoreCase) -or
      $DomainName.EndsWith('.localhost', [System.StringComparison]::OrdinalIgnoreCase) -or
      -not $DomainName.Contains('.')) {
    return $true
  }

  $parsedAddress = $null
  return [System.Net.IPAddress]::TryParse($DomainName, [ref]$parsedAddress)
}

function Read-Value([string]$Prompt, [string]$DefaultValue) {
  if ($Yes) {
    return $DefaultValue
  }

  $reply = Read-Host "$Prompt [$DefaultValue]"
  if ([string]::IsNullOrWhiteSpace($reply)) {
    return $DefaultValue
  }
  return $reply.Trim()
}

function Resolve-Domain([switch]$Prompt) {
  $value = $Domain
  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = Get-EnvValue -Key 'ASHA_BASE_DOMAIN'
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = $script:DefaultDomain
  }
  if ($Prompt) {
    $value = Read-Value -Prompt 'Domain (FQDN or *.local)' -DefaultValue $value
  }

  $script:DomainName = $value.Trim().ToLowerInvariant()
}

function Initialize-Environment {
  Write-Step 'Configuration'
  if (-not (Test-Path -LiteralPath $script:EnvFile -PathType Leaf)) {
    $example = Join-Path $script:RepoRoot '.env.example'
    if (-not (Test-Path -LiteralPath $example -PathType Leaf)) {
      throw '.env.example is missing.'
    }
    Copy-Item -LiteralPath $example -Destination $script:EnvFile
    Write-Info 'Created .env from .env.example.'
  }
  else {
    Write-Info 'Existing .env found; existing secrets will be preserved.'
  }

  Set-SecretWhenDefault 'POSTGRES_PASSWORD' 'asha_dev_change_me' 24
  Set-SecretWhenDefault 'JWT_ACCESS_SECRET' 'dev-access-secret-change-me-please-32++chars' 24
  Set-SecretWhenDefault 'JWT_REFRESH_SECRET' 'dev-refresh-secret-change-me-please-32++chars' 24
  Set-SecretWhenDefault 'SESSION_TOKEN_SECRET' 'dev-session-token-secret-change-me-32++chars' 24
  Set-SecretWhenDefault 'SECRET_SEAL_KEY' '0123456789abcdef0123456789abcdef' 32
  Set-SecretWhenDefault 'GUAC_CRYPT_SECRET' 'MySuperSecretKeyForParamsToken12' 16
  Set-SecretWhenDefault 'ASHA_AGENT_ENROLLMENT_TOKEN' 'dev-enrollment-token-change-me' 16

  $postgresUser = Get-EnvValue -Key 'POSTGRES_USER'
  $postgresDb = Get-EnvValue -Key 'POSTGRES_DB'
  $postgresPassword = Get-EnvValue -Key 'POSTGRES_PASSWORD'
  if ([string]::IsNullOrWhiteSpace($postgresUser)) { $postgresUser = 'asha' }
  if ([string]::IsNullOrWhiteSpace($postgresDb)) { $postgresDb = 'asha' }

  Set-EnvValue 'POSTGRES_USER' $postgresUser
  Set-EnvValue 'POSTGRES_DB' $postgresDb
  Set-EnvValue 'DATABASE_URL' "postgresql://${postgresUser}:${postgresPassword}@localhost:5432/${postgresDb}?schema=public"
  Set-EnvValue 'ASHA_BASE_DOMAIN' $script:DomainName
  Set-EnvValue 'ASHA_BASE_DOMAIN_ALT' $script:DomainName
  Set-EnvValue 'ASHA_PUBLIC_URL' "https://$($script:DomainName)"
  Set-EnvValue 'ASHA_TRAEFIK_DOMAIN' $script:DomainName
  Set-EnvValue 'CORS_ORIGIN' "https://$($script:DomainName),http://localhost:3000"
  Set-EnvValue 'NEXT_PUBLIC_API_URL' "https://$($script:DomainName)/api/v1"
  Set-EnvValue 'NEXT_PUBLIC_WS_URL' ''
  Set-EnvValue 'NEXT_PUBLIC_API_MODE' $script:AppMode

  $tlsEmail = $Email
  if ([string]::IsNullOrWhiteSpace($tlsEmail)) {
    $tlsEmail = Get-EnvValue -Key 'ACME_EMAIL'
  }
  if ([string]::IsNullOrWhiteSpace($tlsEmail)) {
    $tlsEmail = "admin@$($script:DomainName)"
  }
  if (-not (Test-LocalDomain $script:DomainName)) {
    $tlsEmail = Read-Value -Prompt "Let's Encrypt email" -DefaultValue $tlsEmail
  }
  Set-EnvValue 'ACME_EMAIL' $tlsEmail

  if ([string]::IsNullOrWhiteSpace((Get-EnvValue -Key 'ASHA_SEED_ADMIN_PASSWORD'))) {
    if (Test-LocalDomain $script:DomainName) {
      Set-EnvValue 'ASHA_SEED_ADMIN_PASSWORD' 'AshaAdmin!2026'
    }
    else {
      Set-EnvValue 'ASHA_SEED_ADMIN_PASSWORD' (New-RandomHex -ByteCount 18)
    }
  }

  Write-Success "Configured .env for $($script:DomainName) in $($script:AppMode) mode."
}

function Write-ProductionOverride {
  $path = Join-Path $script:RepoRoot 'docker-compose.prod.yml'
  $content = @'
# GENERATED by scripts/install.ps1 for a public-domain deployment.
name: asha
services:
  traefik:
    command:
      - --providers.docker=true
      - --providers.docker.exposedByDefault=false
      - --providers.docker.network=asha-edge
      - --providers.file.directory=/etc/traefik/dynamic
      - --providers.file.watch=true
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --api.dashboard=true
      - --certificatesresolvers.le.acme.tlschallenge=true
      - --certificatesresolvers.le.acme.email=${ACME_EMAIL:-admin@asha.local}
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
  web:
    labels:
      - traefik.http.routers.web.tls.certresolver=le
  api:
    labels:
      - traefik.http.routers.api.tls.certresolver=le
  connection-proxy:
    labels:
      - traefik.http.routers.proxy.tls.certresolver=le
'@
  $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8WithoutBom)
  Write-Success 'Created docker-compose.prod.yml for automatic Let''s Encrypt TLS.'
}

function Select-ComposeFiles {
  $base = Join-Path $script:RepoRoot 'docker-compose.yml'
  $script:ComposeFileArgs = @('-f', $base)
  if (-not (Test-LocalDomain $script:DomainName)) {
    Write-ProductionOverride
    $script:ComposeFileArgs += @('-f', (Join-Path $script:RepoRoot 'docker-compose.prod.yml'))
  }
}

function Test-Administrator {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-HostsEntry {
  if (-not (Test-LocalDomain $script:DomainName)) {
    return
  }

  $hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
  $escapedDomain = [System.Text.RegularExpressions.Regex]::Escape($script:DomainName)
  $hostsContent = [System.IO.File]::ReadAllText($hostsPath)
  if ($hostsContent -match "(?im)^\s*(?:127\.0\.0\.1|::1)\s+.*\b${escapedDomain}\b") {
    Write-Success "$($script:DomainName) is already mapped in the Windows hosts file."
    return
  }

  if (-not (Test-Administrator)) {
    Write-WarningMessage "An elevated PowerShell is required to edit $hostsPath."
    Write-WarningMessage "Add this line manually: 127.0.0.1 $($script:DomainName)"
    return
  }

  [System.IO.File]::AppendAllText(
    $hostsPath,
    "$([Environment]::NewLine)127.0.0.1 $($script:DomainName)$([Environment]::NewLine)",
    [System.Text.Encoding]::ASCII
  )
  & ipconfig.exe /flushdns *> $null
  Write-Success "Mapped $($script:DomainName) to 127.0.0.1."
}

function Test-Ports {
  Write-Step 'Port pre-flight'
  $busyPorts = @()
  foreach ($port in @(80, 443)) {
    try {
      $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop |
        Select-Object -First 1
      if ($listener) {
        $busyPorts += $port
      }
    }
    catch {
      # No listener or Get-NetTCPConnection unavailable.
    }
  }

  if ($busyPorts.Count -gt 0) {
    Write-WarningMessage "Ports already in use: $($busyPorts -join ', '). This is expected when Asha is already running."
  }
  else {
    Write-Success 'Ports 80 and 443 are available.'
  }
}

function Deploy-Asha {
  Write-Step 'Building and starting Asha'
  Invoke-Compose -Arguments @(
    'up', '-d', '--build',
    'traefik', 'postgres', 'redis', 'db-migrate', 'api', 'web', 'agent'
  )
  Write-Success 'Core services started.'

  try {
    Invoke-Compose -Arguments @('up', '-d', '--build', 'guacd', 'connection-proxy')
    Write-Success 'RDP/VNC bridge started.'
  }
  catch {
    Write-WarningMessage 'guacd/connection-proxy failed to start. KasmVNC remains available.'
    Write-WarningMessage $_.Exception.Message
  }
}

function Wait-Asha {
  Write-Step 'Waiting for Asha'
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) {
    Write-WarningMessage "curl.exe is unavailable; verify https://$($script:DomainName) manually."
    return
  }

  for ($attempt = 1; $attempt -le 60; $attempt++) {
    $code = & $curl.Source -k -s -o NUL -w '%{http_code}' `
      --resolve "$($script:DomainName):443:127.0.0.1" `
      --max-time 5 "https://$($script:DomainName)/"
    if ($code -match '^[23]\d\d$') {
      Write-Success "Asha is responding (HTTP $code)."
      return
    }
    if (($attempt % 5) -eq 0) {
      Write-Info "Waiting... ($($attempt * 3)s, last HTTP status: $code)"
    }
    Start-Sleep -Seconds 3
  }

  Write-WarningMessage "Asha did not answer within 180 seconds. Run .\scripts\install.ps1 logs."
}

function Show-Credentials {
  Resolve-Domain
  $password = Get-EnvValue -Key 'ASHA_SEED_ADMIN_PASSWORD'
  if ([string]::IsNullOrWhiteSpace($password)) {
    $password = 'AshaAdmin!2026'
  }

  Write-Host ''
  Write-Host '  Asha is live' -ForegroundColor Yellow
  Write-Host "  Open:      https://$($script:DomainName)"
  Write-Host "  API docs:  https://$($script:DomainName)/api/docs"
  Write-Host '  Email:     admin@asha.local'
  Write-Host "  Password:  $password"
  Write-Host ''
  Write-WarningMessage 'Change the admin password after first sign-in.'
}

function Initialize-ExistingDeployment {
  Ensure-Docker
  Resolve-Domain
  Select-ComposeFiles
}

function Install-Asha {
  Show-Banner
  Ensure-Docker
  Resolve-Domain -Prompt
  Initialize-Environment
  Select-ComposeFiles
  Ensure-HostsEntry
  Test-Ports
  Deploy-Asha
  Wait-Asha
  Show-Credentials
}

function Show-Status {
  Show-Banner
  Initialize-ExistingDeployment
  Write-Step 'Containers'
  Invoke-Compose -Arguments @('ps', '--all')
  Write-Host ''
  Write-Info "URL: https://$($script:DomainName)"
}

function Update-Asha {
  Show-Banner
  Initialize-ExistingDeployment
  if (Test-Path -LiteralPath (Join-Path $script:RepoRoot '.git') -PathType Container) {
    Write-Step 'Pulling the latest source'
    & git.exe -C $script:RepoRoot pull --ff-only
    if ($LASTEXITCODE -ne 0) {
      throw "git pull failed (exit code $LASTEXITCODE)."
    }
  }
  Deploy-Asha
  Wait-Asha
}

function Uninstall-Asha {
  Show-Banner
  Initialize-ExistingDeployment
  Write-WarningMessage 'This stops Asha and deletes its PostgreSQL and Redis Docker volumes.'
  $confirmed = $Yes
  if (-not $confirmed) {
    $reply = Read-Host 'Remove Asha and all local data? [y/N]'
    $confirmed = $reply -match '^(?i:y|yes)$'
  }
  if (-not $confirmed) {
    Write-Info 'Cancelled; nothing was removed.'
    return
  }

  Invoke-Compose -Arguments @('down', '-v', '--remove-orphans')
  Write-Success 'Asha containers and data volumes were removed. The source tree was kept.'
}

function Show-Help {
  @"
Asha Windows installer v$($script:Version)

USAGE
  .\scripts\install.ps1 [command] [options]

COMMANDS
  install              Configure, build, migrate, seed, and start Asha.
  status               Show containers and health.
  start|stop|restart   Control the stack.
  logs                 Follow the last 120 log lines.
  credentials          Show the local admin login.
  update               git pull --ff-only, rebuild, and restart.
  uninstall            Stop Asha and delete its Docker data volumes.
  menu                 Open the interactive menu.
  help                 Show this help.

OPTIONS
  -Domain <fqdn>        Default: asha.local
  -Email <address>      Let's Encrypt registration email for public domains.
  -Mode <live|mock>     Default: live
  -InstallPrerequisites Install Docker Desktop with winget when missing.
  -Yes                  Accept defaults and skip confirmations.

EXAMPLES
  .\scripts\install.ps1 install -InstallPrerequisites
  .\scripts\install.ps1 install -Domain asha.local -Yes
  .\scripts\install.ps1 status
"@
}

function Invoke-Action([string]$RequestedAction) {
  switch ($RequestedAction.ToLowerInvariant()) {
    'install' { Install-Asha }
    'status' { Show-Status }
    'start' {
      Initialize-ExistingDeployment
      Invoke-Compose -Arguments @('up', '-d')
      Write-Success 'Asha started.'
    }
    'stop' {
      Initialize-ExistingDeployment
      Invoke-Compose -Arguments @('stop')
      Write-Success 'Asha stopped.'
    }
    'restart' {
      Initialize-ExistingDeployment
      Invoke-Compose -Arguments @('restart')
      Write-Success 'Asha restarted.'
    }
    'logs' {
      Initialize-ExistingDeployment
      Invoke-Compose -Arguments @('logs', '-f', '--tail=120')
    }
    'credentials' { Show-Credentials }
    'update' { Update-Asha }
    'uninstall' { Uninstall-Asha }
    'help' { Show-Help }
    default { throw "Unknown command '$RequestedAction'. Run .\scripts\install.ps1 help." }
  }
}

function Show-Menu {
  while ($true) {
    Show-Banner
    Write-Host '  [1] Install Asha'
    Write-Host '  [2] Status'
    Write-Host '  [3] Start'
    Write-Host '  [4] Stop'
    Write-Host '  [5] Restart'
    Write-Host '  [6] Logs'
    Write-Host '  [7] Credentials'
    Write-Host '  [8] Update'
    Write-Host '  [9] Uninstall'
    Write-Host '  [Q] Quit'
    Write-Host ''

    $choice = (Read-Host 'Selection').Trim().ToLowerInvariant()
    if ($choice -eq 'q' -or $choice -eq '') {
      return
    }

    $selectedAction = switch ($choice) {
      '1' { 'install' }
      '2' { 'status' }
      '3' { 'start' }
      '4' { 'stop' }
      '5' { 'restart' }
      '6' { 'logs' }
      '7' { 'credentials' }
      '8' { 'update' }
      '9' { 'uninstall' }
      default { '' }
    }

    if (-not $selectedAction) {
      Write-WarningMessage "Unknown selection: $choice"
    }
    else {
      try {
        Invoke-Action $selectedAction
      }
      catch {
        Write-Host "  [x] $($_.Exception.Message)" -ForegroundColor Red
      }
    }
    [void](Read-Host 'Press Enter to return to the menu')
  }
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
  throw 'This installer is for Windows. On Ubuntu/Debian use scripts/install.sh.'
}

Initialize-RepositoryContext

if ([string]::IsNullOrWhiteSpace($Action)) {
  if ($Yes) {
    Invoke-Action 'install'
  }
  else {
    Show-Menu
  }
}
elseif ($Action.ToLowerInvariant() -eq 'menu') {
  Show-Menu
}
else {
  Invoke-Action $Action
}
