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
command), or **Access → Authentication → Registration tokens → mint**.

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
