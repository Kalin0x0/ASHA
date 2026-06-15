# Chista host agent (Windows) — availability

A tiny agent you install on a Windows desktop/server so Chista knows it exists
and whether it's online. It:

- **auto-registers** the host as a Chista *Server* (so it appears in
  Infrastructure → Servers and as a launchable Windows desktop), and
- **heartbeats** every 30 s so Chista shows it **● Online** (and flips it to
  Offline if the host goes away).
- optionally **enables Remote Desktop** (`-EnableRdp`) so the box is RDP-ready.

> This is the *availability* layer. Making a host **reachable** when it sits
> behind NAT/a firewall (a reverse tunnel) is a separate, follow-up component —
> today the RDP connection still goes directly to the host's address, so it must
> be routable from your users / the Chista proxy (LAN, VPN or public).

## 1. Get a registration token

In Chista: **Infrastructure → Servers → "Install agent"** (copy the ready-made
command **and download the scripts**), or **Access → Authentication →
Registration tokens → mint**.

> The scripts are also served for download from the admin panel at `/agent/*.ps1`
> (a copy lives in `apps/web/public/agent/`). If you change a script here, update
> that copy too.

## 2. Install on the Windows host (admin PowerShell)

```powershell
# from this folder, on the target machine:
powershell -ExecutionPolicy Bypass -File install.ps1 `
  -ChistaUrl "https://chista.example.com" -Token "cra_xxxxxxxx" -EnableRdp
```

That copies the agent to `%ProgramData%\Chista` and registers a Scheduled Task
(`ChistaAgent`) that runs at boot as SYSTEM and restarts on failure.

### Run once in the foreground (without installing)

```powershell
powershell -ExecutionPolicy Bypass -File chista-agent.ps1 `
  -ChistaUrl "https://chista.example.com" -Token "cra_xxxxxxxx"
```

## Install remotely, by IP (no RDP needed)

RDP is a remote *desktop* protocol, not an install channel. To deploy by IP over
the network, use **`remote-install.ps1`** (PowerShell Remoting / WinRM) from any
Windows admin box that can reach the targets — it pushes the agent to each host
and installs it:

```powershell
$cred = Get-Credential                              # admin on the targets
./remote-install.ps1 -ComputerName 10.0.0.5,10.0.0.6 `
  -ChistaUrl "https://chista.example.com" -Token "cra_xxxx" -Credential $cred -EnableRdp
```

Prerequisites on each target: WinRM enabled (`Enable-PSRemoting -Force`) and admin
creds. For **workgroup** hosts addressed by IP, trust them on the admin box first:

```powershell
Set-Item WSMan:\localhost\Client\TrustedHosts -Value '10.0.0.5,10.0.0.6' -Force
```

## VM-provisioned desktops (the VMware/Parallels-style path)

VMware Tools / Parallels Tools install through the **hypervisor's** guest channel,
which only applies to VMs that hypervisor manages. The equivalent for Chista-
provisioned VMs (vSphere / Proxmox / Hyper-V via the VM providers) is to **bake
the agent into the golden template** — install it once with `-EnableRdp` in the
template image, and every cloned desktop boots already registered and Online. No
per-host step needed.

## Parameters

| Param | Default | Notes |
| --- | --- | --- |
| `-ChistaUrl` | — | Your Chista base URL (API is reachable at `<url>/agent/server/*`). |
| `-Token` | — | A Chista registration token (`cra_…`). |
| `-Hostname` | `$env:COMPUTERNAME` | The server name shown in Chista. |
| `-Address` | first routable IPv4 | The address Chista/RDP connects to. |
| `-ConnectionType` | `RDP` | `RDP` \| `VNC` \| `SSH`. |
| `-IntervalSeconds` | `30` | Heartbeat interval. |
| `-EnableRdp` | off | Enable Remote Desktop + firewall rule. |

## Uninstall

```powershell
Unregister-ScheduledTask -TaskName 'ChistaAgent' -Confirm:$false
Remove-Item "$env:ProgramData\Chista" -Recurse -Force
```

## Endpoints used (auth: `x-registration-token` header)

- `POST /agent/server/register` → `{ hostname, address, connectionType, os, version }`
- `POST /agent/server/heartbeat` → `{ hostname, version }`
