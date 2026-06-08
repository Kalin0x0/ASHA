/**
 * Mock workspace thumbnails. Each is a small SVG that resembles a screenshot
 * of the real workspace — browser chrome, terminal prompt, editor sidebar, etc.
 * In production the streaming viewer would capture a real PNG when the session
 * terminates; for mock mode these SVGs stand in so the UI feature is exercisable
 * without a live backend.
 */

function svg(w: number, h: number, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  // btoa is available in modern browsers + Node ≥16
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;
}

const W = 320;
const H = 160;

// ── Shared chrome helpers ────────────────────────────────────────────────────

function windowChrome(title: string, accentFill = '#242442'): string {
  return `
    <rect width="${W}" height="${H}" fill="#0e0e1a"/>
    <rect width="${W}" height="26" fill="${accentFill}"/>
    <circle cx="13" cy="13" r="4.5" fill="#d2685f"/>
    <circle cx="26" cy="13" r="4.5" fill="#e0a84a"/>
    <circle cx="39" cy="13" r="4.5" fill="#5fb88f"/>
    <text x="50" y="17" font-size="8" fill="#6b6b94" font-family="ui-sans-serif,sans-serif">${title}</text>`;
}

function line(x: number, y: number, w: number, h = 5, fill = '#1f1f38', rx = 2): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
}

// ── Browser (Firefox / Chrome) ───────────────────────────────────────────────

export const browserThumb = svg(W, H, `
  ${windowChrome('Firefox — Isolated Browser Session', '#18182c')}
  <!-- address bar -->
  <rect x="52" y="6" width="200" height="15" rx="7" fill="#0e0e1a"/>
  <rect x="62" y="10" width="130" height="5" rx="2" fill="#3a3a63"/>
  <!-- nav buttons -->
  <rect x="${W - 60}" y="8" width="12" height="10" rx="2" fill="#1f1f38"/>
  <rect x="${W - 44}" y="8" width="12" height="10" rx="2" fill="#1f1f38"/>
  <!-- page: hero banner -->
  <rect x="0" y="26" width="${W}" height="38" fill="#14141f"/>
  ${line(16, 36, 100, 9, '#6a8fc4', 3)}
  ${line(16, 50, 60, 6, '#3a3a63')}
  <!-- body text blocks -->
  ${line(16, 74, 250, 6)}
  ${line(16, 84, 200, 6)}
  ${line(16, 94, 230, 6)}
  ${line(16, 104, 180, 6)}
  <!-- image placeholder -->
  <rect x="200" y="66" width="104" height="70" rx="4" fill="#14141f"/>
  <rect x="216" y="80" width="72" height="6" rx="2" fill="#2d2d50"/>
  <rect x="216" y="90" width="56" height="6" rx="2" fill="#2d2d50"/>
  <!-- status bar -->
  <rect x="0" y="${H - 14}" width="${W}" height="14" fill="#18182c"/>
  ${line(8, H - 10, 60, 4, '#3a3a63')}
  ${line(W - 70, H - 10, 62, 4, '#3a3a63')}
`);

// ── Terminal ─────────────────────────────────────────────────────────────────

export const terminalThumb = svg(W, H, `
  ${windowChrome('Terminal — /home/user', '#141414')}
  <!-- terminal body -->
  <rect x="0" y="26" width="${W}" height="${H - 26}" fill="#0a0a10"/>
  <!-- prompt lines -->
  <text x="8" y="43" font-size="7.5" fill="#5fb88f" font-family="monospace">user@chista:~$</text>
  <text x="100" y="43" font-size="7.5" fill="#c4c4d6" font-family="monospace"> ls -la</text>
  <text x="8" y="55" font-size="7" fill="#6b6b94" font-family="monospace">total 48</text>
  <text x="8" y="65" font-size="7" fill="#6b6b94" font-family="monospace">drwxr-xr-x  5 user user 4096 Jun  8 11:22 .</text>
  <text x="8" y="75" font-size="7" fill="#6b6b94" font-family="monospace">drwxr-xr-x 18 root root 4096 Jun  8 09:00 ..</text>
  <text x="8" y="85" font-size="7" fill="#6a8fc4" font-family="monospace">drwxr-xr-x  3 user user 4096 Jun  7 14:38 Documents</text>
  <text x="8" y="95" font-size="7" fill="#6a8fc4" font-family="monospace">drwxr-xr-x  2 user user 4096 Jun  8 10:15 Downloads</text>
  <text x="8" y="107" font-size="7.5" fill="#5fb88f" font-family="monospace">user@chista:~$</text>
  <!-- blinking cursor -->
  <rect x="101" y="100" width="5" height="9" fill="#5fb88f" opacity="0.9"/>
`);

// ── VS Code ──────────────────────────────────────────────────────────────────

export const vscodeThumb = svg(W, H, `
  ${windowChrome('VS Code — Cloud Dev Environment', '#1e1e1e')}
  <rect x="0" y="26" width="${W}" height="${H - 26}" fill="#1e1e1e"/>
  <!-- activity bar -->
  <rect x="0" y="26" width="20" height="${H - 26}" fill="#181818"/>
  ${line(4, 32, 12, 12, '#5a5a8a', 2)}
  ${line(4, 50, 12, 12, '#3a3a63', 2)}
  ${line(4, 68, 12, 12, '#3a3a63', 2)}
  ${line(4, H - 30, 12, 12, '#3a3a63', 2)}
  <!-- sidebar file tree -->
  <rect x="20" y="26" width="60" height="${H - 26}" fill="#252526"/>
  ${line(28, 36, 8, 5, '#5fb88f')}
  ${line(38, 36, 30, 5, '#9a9ab8')}
  ${line(34, 46, 4, 5, '#3a3a63')}
  ${line(40, 46, 28, 5, '#6b6b94')}
  ${line(34, 55, 4, 5, '#3a3a63')}
  ${line(40, 55, 22, 5, '#6b6b94')}
  ${line(28, 65, 8, 5, '#e0c25c')}
  ${line(38, 65, 25, 5, '#9a9ab8')}
  ${line(34, 75, 4, 5, '#3a3a63')}
  ${line(40, 75, 32, 5, '#6b6b94')}
  <!-- editor area: code -->
  <rect x="80" y="26" width="${W - 80}" height="${H - 26}" fill="#1e1e1e"/>
  <!-- line numbers -->
  ${line(82, 38, 10, 4, '#3a3a63')}
  ${line(82, 48, 10, 4, '#3a3a63')}
  ${line(82, 58, 10, 4, '#3a3a63')}
  ${line(82, 68, 10, 4, '#3a3a63')}
  ${line(82, 78, 10, 4, '#3a3a63')}
  ${line(82, 88, 10, 4, '#3a3a63')}
  ${line(82, 98, 10, 4, '#3a3a63')}
  ${line(82, 108, 10, 4, '#3a3a63')}
  <!-- code tokens -->
  ${line(96, 38, 22, 4, '#569cd6')}  ${line(120, 38, 30, 4, '#4ec9b0')}  ${line(152, 38, 8, 4, '#d4d4d4')}
  ${line(96, 48, 12, 4, '#6b6b94')}
  ${line(100, 58, 18, 4, '#c586c0')}  ${line(120, 58, 24, 4, '#9cdcfe')}  ${line(146, 58, 6, 4, '#d4d4d4')}  ${line(154, 58, 20, 4, '#ce9178')}
  ${line(100, 68, 14, 4, '#c586c0')}  ${line(116, 68, 20, 4, '#9cdcfe')}  ${line(138, 68, 6, 4, '#d4d4d4')}  ${line(146, 68, 36, 4, '#4fc1ff')}
  ${line(96, 78, 8, 4, '#d4d4d4')}
  ${line(96, 88, 22, 4, '#569cd6')}  ${line(120, 88, 16, 4, '#4ec9b0')}
  ${line(100, 98, 14, 4, '#9cdcfe')}  ${line(116, 98, 50, 4, '#d4d4d4')}
  ${line(96, 108, 8, 4, '#d4d4d4')}
  <!-- status bar -->
  <rect x="80" y="${H - 14}" width="${W - 80}" height="14" fill="#007acc"/>
  ${line(84, H - 10, 40, 4, '#ffffff60')}
  ${line(W - 60, H - 10, 50, 4, '#ffffff60')}
`);

// ── Ubuntu Desktop ───────────────────────────────────────────────────────────

export const desktopThumb = svg(W, H, `
  <!-- desktop wallpaper -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a3e"/>
      <stop offset="100%" style="stop-color:#0e0e1a"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <!-- subtle grid -->
  <line x1="0" y1="40" x2="${W}" y2="40" stroke="#ffffff08" stroke-width="1"/>
  <line x1="0" y1="80" x2="${W}" y2="80" stroke="#ffffff08" stroke-width="1"/>
  <line x1="0" y1="120" x2="${W}" y2="120" stroke="#ffffff08" stroke-width="1"/>
  <!-- top panel -->
  <rect width="${W}" height="20" fill="#00000050"/>
  ${line(8, 7, 30, 6, '#c4c4d650', 2)}
  ${line(44, 7, 30, 6, '#c4c4d650', 2)}
  ${line(80, 7, 30, 6, '#c4c4d650', 2)}
  ${line(W - 70, 7, 16, 6, '#c4c4d650', 2)}
  ${line(W - 50, 7, 16, 6, '#c4c4d650', 2)}
  ${line(W - 30, 7, 22, 6, '#c4c4d650', 2)}
  <!-- app window -->
  <rect x="30" y="30" width="200" height="110" rx="6" fill="#1e1e2e" stroke="#3a3a6350" stroke-width="1"/>
  <rect x="30" y="30" width="200" height="22" rx="6" fill="#2a2a42"/>
  <rect x="30" y="43" width="200" height="9" fill="#2a2a42"/>
  <circle cx="44" cy="41" r="4" fill="#d2685f"/>
  <circle cx="56" cy="41" r="4" fill="#e0a84a"/>
  <circle cx="68" cy="41" r="4" fill="#5fb88f"/>
  ${line(90, 37, 80, 8, '#3a3a63', 3)}
  <!-- window content -->
  ${line(42, 62, 176, 7, '#2d2d50', 2)}
  ${line(42, 74, 140, 6, '#242442', 2)}
  ${line(42, 84, 160, 6, '#242442', 2)}
  ${line(42, 94, 120, 6, '#242442', 2)}
  ${line(42, 110, 60, 14, '#6a8fc430', 3)}
  ${line(108, 110, 60, 14, '#d4af3730', 3)}
  <!-- dock at bottom -->
  <rect x="60" y="${H - 22}" width="200" height="18" rx="9" fill="#00000060"/>
  ${[80, 104, 128, 152, 176, 200, 224].map((x, i) => `<rect x="${x}" y="${H - 19}" width="12" height="12" rx="3" fill="${['#d2685f', '#5fb88f', '#569cd6', '#e0a84a', '#b07fc4', '#4ec9b0', '#d4af37'][i]}40"/>`).join('')}
`);

// ── Kali Linux ───────────────────────────────────────────────────────────────

export const kaliThumb = svg(W, H, `
  <rect width="${W}" height="${H}" fill="#0d0d0d"/>
  <!-- Kali xfce panel top -->
  <rect width="${W}" height="22" fill="#1a0a1a"/>
  ${line(6, 7, 50, 8, '#6b2d8b50', 3)}
  ${line(62, 7, 30, 8, '#3a003a50', 3)}
  ${line(W - 90, 8, 20, 6, '#6b2d8b50', 2)}
  ${line(W - 66, 8, 20, 6, '#3a003a50', 2)}
  ${line(W - 42, 8, 34, 6, '#3a003a50', 2)}
  <!-- desktop icons -->
  <rect x="14" y="32" width="24" height="20" rx="3" fill="#6b2d8b30"/>
  ${line(14, 54, 24, 5, '#6b6b94', 2)}
  <rect x="14" y="64" width="24" height="20" rx="3" fill="#6b2d8b30"/>
  ${line(14, 86, 24, 5, '#6b6b94', 2)}
  <!-- terminal window -->
  <rect x="50" y="28" width="252" height="120" rx="5" fill="#0d0d0d" stroke="#6b2d8b40" stroke-width="1"/>
  <rect x="50" y="28" width="252" height="20" rx="5" fill="#1a0a1a"/>
  <rect x="50" y="40" width="252" height="8" fill="#1a0a1a"/>
  <circle cx="62" cy="38" r="4" fill="#d2685f80"/>
  <circle cx="74" cy="38" r="4" fill="#e0a84a80"/>
  <circle cx="86" cy="38" r="4" fill="#5fb88f80"/>
  <text x="100" y="41" font-size="7" fill="#6b2d8b" font-family="monospace">kali@kali:~</text>
  <text x="58" y="60" font-size="7" fill="#6b2d8b" font-family="monospace">┌──(kali㉿kali)-[~]</text>
  <text x="58" y="70" font-size="7" fill="#6b2d8b" font-family="monospace">└─$</text>
  <text x="76" y="70" font-size="7" fill="#c4c4d6" font-family="monospace"> nmap -sV 192.168.1.0/24</text>
  <text x="58" y="82" font-size="7" fill="#5fb88f" font-family="monospace">Starting Nmap 7.94SVN...</text>
  <text x="58" y="92" font-size="7" fill="#6b6b94" font-family="monospace">Nmap scan report for 192.168.1.1</text>
  <text x="58" y="102" font-size="7" fill="#6b6b94" font-family="monospace">Host is up (0.00054s latency)</text>
  <text x="58" y="112" font-size="7" fill="#6b6b94" font-family="monospace">PORT   STATE SERVICE  VERSION</text>
  <text x="58" y="122" font-size="7" fill="#5fb88f" font-family="monospace">22/tcp open  ssh      OpenSSH 8.9</text>
  <text x="58" y="132" font-size="7" fill="#5fb88f" font-family="monospace">80/tcp open  http     nginx 1.22</text>
  <!-- bottom panel -->
  <rect x="0" y="${H - 18}" width="${W}" height="18" fill="#1a0a1a"/>
  ${line(8, H - 12, 40, 5, '#6b2d8b50', 2)}
  ${line(W - 60, H - 12, 50, 5, '#6b2d8b50', 2)}
`);

// ── GIMP ─────────────────────────────────────────────────────────────────────

export const gimpThumb = svg(W, H, `
  <rect width="${W}" height="${H}" fill="#2b2b2b"/>
  <!-- menu bar -->
  <rect width="${W}" height="18" fill="#3c3c3c"/>
  ${line(6, 6, 25, 6, '#9a9ab8', 2)} ${line(34, 6, 25, 6, '#9a9ab8', 2)} ${line(62, 6, 25, 6, '#9a9ab8', 2)} ${line(90, 6, 40, 6, '#9a9ab8', 2)}
  <!-- toolbox left -->
  <rect x="0" y="18" width="52" height="${H - 18}" fill="#3c3c3c"/>
  ${[
    [4, 22], [30, 22], [4, 40], [30, 40],
    [4, 58], [30, 58], [4, 76], [30, 76],
    [4, 94], [30, 94], [4, 112], [30, 112],
  ].map(([x, y]) => `<rect x="${x}" y="${y}" width="18" height="15" rx="2" fill="#4a4a4a"/>`).join('')}
  <!-- canvas area -->
  <rect x="52" y="18" width="200" height="${H - 18}" fill="#808080"/>
  <rect x="62" y="26" width="180" height="${H - 38}" fill="#fff"/>
  <!-- image on canvas (colorful) -->
  <rect x="62" y="26" width="180" height="${H - 38}" fill="#f0e8d0"/>
  <circle cx="132" cy="${26 + (H - 38) / 2}" r="30" fill="#d4af37" opacity="0.6"/>
  <rect x="90" y="50" width="80" height="50" rx="4" fill="#6a8fc4" opacity="0.5"/>
  <!-- layers panel right -->
  <rect x="252" y="18" width="68" height="${H - 18}" fill="#3c3c3c"/>
  ${line(256, 24, 60, 5, '#9a9ab8', 2)}
  <rect x="256" y="34" width="60" height="12" rx="2" fill="#4a9a4a50"/>
  ${line(258, 37, 40, 5, '#9a9ab8', 2)}
  <rect x="256" y="50" width="60" height="12" rx="2" fill="#4a4a4a"/>
  ${line(258, 53, 40, 5, '#6b6b94', 2)}
  <rect x="256" y="66" width="60" height="12" rx="2" fill="#4a4a4a"/>
  ${line(258, 69, 40, 5, '#6b6b94', 2)}
`);

// ── LibreOffice ───────────────────────────────────────────────────────────────

export const libreofficeThumb = svg(W, H, `
  <rect width="${W}" height="${H}" fill="#f5f5f0"/>
  <!-- titlebar -->
  <rect width="${W}" height="20" fill="#2a5ba0"/>
  <circle cx="12" cy="10" r="4" fill="#d2685f80"/>
  <circle cx="24" cy="10" r="4" fill="#e0a84a80"/>
  <circle cx="36" cy="10" r="4" fill="#5fb88f80"/>
  ${line(48, 7, 60, 6, '#ffffff40', 2)}
  <!-- menu bar -->
  <rect x="0" y="20" width="${W}" height="16" fill="#f0f0ec"/>
  ${[8, 50, 80, 108, 136, 162, 190, 220].map((x) => line(x, 26, 28, 5, '#888888', 1)).join('')}
  <!-- toolbar -->
  <rect x="0" y="36" width="${W}" height="16" fill="#e8e8e4"/>
  ${Array.from({ length: 14 }, (_, i) => `<rect x="${6 + i * 21}" y="40" width="14" height="9" rx="1" fill="#cccccc"/>`).join('')}
  <!-- ruler -->
  <rect x="24" y="52" width="${W - 24}" height="10" fill="#e0e0dc"/>
  ${Array.from({ length: 18 }, (_, i) => line(24 + i * 16, 54, 1, 6, '#aaaaaa', 0)).join('')}
  <rect x="0" y="52" width="24" height="${H - 52}" fill="#e0e0dc"/>
  <!-- page content area -->
  <rect x="28" y="62" width="${W - 36}" height="${H - 70}" rx="1" fill="#ffffff" stroke="#cccccc" stroke-width="1"/>
  <!-- document text -->
  ${line(50, 72, 200, 7, '#333333', 1)}
  ${line(50, 84, 160, 5, '#555555', 1)}
  ${line(50, 94, 220, 5, '#888888', 1)}
  ${line(50, 103, 200, 5, '#888888', 1)}
  ${line(50, 112, 180, 5, '#888888', 1)}
  ${line(50, 121, 220, 5, '#888888', 1)}
  ${line(50, 130, 150, 5, '#888888', 1)}
  <!-- statusbar -->
  <rect x="0" y="${H - 14}" width="${W}" height="14" fill="#e0e0dc"/>
  ${line(6, H - 10, 60, 4, '#aaaaaa', 1)}
  ${line(W - 80, H - 10, 70, 4, '#aaaaaa', 1)}
`);

// ── Postman ───────────────────────────────────────────────────────────────────

export const postmanThumb = svg(W, H, `
  <rect width="${W}" height="${H}" fill="#1a1a24"/>
  <!-- header bar -->
  <rect width="${W}" height="28" fill="#141420"/>
  <circle cx="12" cy="14" r="4" fill="#d2685f80"/>
  <circle cx="24" cy="14" r="4" fill="#e0a84a80"/>
  <circle cx="36" cy="14" r="4" fill="#5fb88f80"/>
  ${line(50, 8, 40, 12, '#2d2d45', 4)}
  ${line(94, 8, 40, 12, '#2d2d45', 4)}
  <!-- sidebar -->
  <rect x="0" y="28" width="70" height="${H - 28}" fill="#141420"/>
  ${line(6, 36, 58, 6, '#e0a84a50', 2)}
  ${line(6, 48, 58, 5, '#3a3a56', 2)}
  ${line(6, 57, 58, 5, '#3a3a56', 2)}
  ${line(6, 66, 58, 5, '#3a3a56', 2)}
  ${line(6, 75, 58, 5, '#2d2d45', 2)}
  ${line(6, 84, 58, 5, '#3a3a56', 2)}
  ${line(6, 93, 58, 5, '#3a3a56', 2)}
  <!-- request builder -->
  <rect x="70" y="28" width="${W - 70}" height="${H - 28}" fill="#1e1e2e"/>
  <!-- method + url -->
  <rect x="76" y="34" width="32" height="14" rx="3" fill="#5fb88f30"/>
  ${line(78, 38, 28, 6, '#5fb88f', 2)}
  <rect x="112" y="34" width="150" height="14" rx="3" fill="#14141f"/>
  ${line(116, 38, 100, 6, '#9a9ab8', 2)}
  <rect x="266" y="34" width="42" height="14" rx="4" fill="#e0a84a"/>
  ${line(272, 38, 30, 6, '#141420', 2)}
  <!-- tabs -->
  ${line(76, 56, 32, 5, '#e0a84a', 2)}
  ${line(112, 56, 32, 5, '#3a3a56', 2)}
  ${line(148, 56, 40, 5, '#3a3a56', 2)}
  <rect x="70" y="62" width="${W - 70}" height="1" fill="#3a3a56"/>
  <!-- response body (JSON) -->
  ${line(76, 70, 16, 5, '#c586c0', 2)} ${line(94, 70, 40, 5, '#9cdcfe', 2)}
  ${line(82, 80, 12, 5, '#ce9178', 2)} ${line(96, 80, 8, 5, '#9a9ab8', 2)} ${line(106, 80, 50, 5, '#4ec9b0', 2)}
  ${line(82, 90, 16, 5, '#ce9178', 2)} ${line(100, 90, 8, 5, '#9a9ab8', 2)} ${line(110, 90, 30, 5, '#b5cea8', 2)}
  ${line(82, 100, 20, 5, '#ce9178', 2)} ${line(104, 100, 8, 5, '#9a9ab8', 2)} ${line(114, 100, 60, 5, '#ce9178', 2)}
  ${line(82, 110, 14, 5, '#ce9178', 2)} ${line(98, 110, 8, 5, '#9a9ab8', 2)} ${line(108, 110, 40, 5, '#4ec9b0', 2)}
  ${line(76, 120, 10, 5, '#c586c0', 2)}
  <!-- status badge -->
  <rect x="${W - 70}" y="70" width="56" height="12" rx="3" fill="#5fb88f20"/>
  ${line(W - 68, 74, 40, 5, '#5fb88f', 2)}
`);

/**
 * Map of workspace ID → pre-seeded thumbnail + relative "last used" time.
 * Only the most recognisable workspaces get a mock screenshot; the rest show
 * no thumbnail (feature is still functional, just no cached preview yet).
 */
export const MOCK_THUMBNAILS: Record<string, { dataUrl: string; capturedAt: string }> = {
  'ws-firefox': { dataUrl: browserThumb, capturedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString() },
  'ws-chrome': { dataUrl: browserThumb, capturedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  'ws-vscode': { dataUrl: vscodeThumb, capturedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString() },
  'ws-terminal': { dataUrl: terminalThumb, capturedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString() },
  'ws-kali': { dataUrl: kaliThumb, capturedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
  'ws-gimp': { dataUrl: gimpThumb, capturedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
  'ws-libreoffice': { dataUrl: libreofficeThumb, capturedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
  'ws-postman': { dataUrl: postmanThumb, capturedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
};
