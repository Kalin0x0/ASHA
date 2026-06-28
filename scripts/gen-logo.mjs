// Generates the Asha emblem (gold-on-anthracite: bezelled badge + monitor +
// shield + isometric cube, flanked by perspective window-panels) as SVG.
// No rasterizer is available in CI, so the brand mark is authored as vector.
// Emits the rounded-badge logo and a full-bleed maskable PWA variant.
import { writeFileSync, mkdirSync } from 'node:fs';

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// Bilinear interpolation inside a quad [TL, TR, BR, BL]; u: left→right, v: top→bottom.
const quad = (c, u, v) => lerp(lerp(c[0], c[1], u), lerp(c[3], c[2], u), v);
const f = (n) => Math.round(n * 10) / 10;
const mirror = ([x, y]) => [1200 - x, y];
// Mirror a quad across x=600, preserving TL/TR/BR/BL winding.
const mirrorQuad = (c) => [mirror(c[1]), mirror(c[0]), mirror(c[3]), mirror(c[2])];

// A window-panel: dark parallelogram with a gold border and a perspective grid
// of lit "windows" mapped into the quad so they recede correctly.
function panel(c, cols, rows) {
  const d = `M${f(c[0][0])},${f(c[0][1])} L${f(c[1][0])},${f(c[1][1])} L${f(c[2][0])},${f(c[2][1])} L${f(c[3][0])},${f(c[3][1])} Z`;
  let s = `    <path d="${d}" fill="#0c0c15" stroke="url(#gold)" stroke-width="5" stroke-linejoin="round"/>\n`;
  const w = 14;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const u = 0.16 + (col + 0.5) * (0.68 / cols);
      const v = 0.12 + (r + 0.5) * (0.76 / rows);
      const [x, y] = quad(c, u, v);
      s += `    <rect x="${f(x - w / 2)}" y="${f(y - w / 2)}" width="${w}" height="${w}" rx="2" fill="url(#win)"/>\n`;
    }
  }
  return s;
}

// Left-side panels (inner sits near the shield, outer recedes further out).
const L_INNER = [[396, 520], [476, 502], [476, 706], [396, 682]];
const L_OUTER = [[304, 546], [388, 518], [388, 694], [304, 660]];

const PANELS =
  panel(L_INNER, 3, 5) +
  panel(L_OUTER, 2, 4) +
  panel(mirrorQuad(L_INNER), 3, 5) +
  panel(mirrorQuad(L_OUTER), 2, 4);

// Heater shield with rounded top corners, tapering to a point.
const SHIELD =
  'M508,432 L692,432 Q708,432 708,450 L708,566 ' +
  'C708,676 664,748 600,796 C536,748 492,676 492,566 ' +
  'L492,450 Q492,432 508,432 Z';

// Inset shield for the inner gold rule (≈16px inset, drawn explicitly so no
// transform-origin scaling is needed — keeps standalone renderers consistent).
const SHIELD_INNER =
  'M520,452 L680,452 Q692,452 692,466 L692,566 ' +
  'C692,664 654,730 600,772 C546,730 508,664 508,566 ' +
  'L508,466 Q508,452 520,452 Z';

// Isometric cube inside the shield.
const T = [600, 486], R = [676, 528], FC = [600, 570], Lf = [524, 528];
const BL = [524, 612], BC = [600, 656], BR = [676, 612];
const poly = (pts) => pts.map((p) => `${p[0]},${p[1]}`).join(' ');

const MONITOR = `
    <rect x="318" y="378" width="564" height="408" rx="44" fill="none" stroke="url(#gold)" stroke-width="22" stroke-linejoin="round"/>
    <path d="M566,786 L634,786 L652,858 L548,858 Z" fill="url(#gold)"/>
    <rect x="486" y="856" width="228" height="30" rx="15" fill="url(#gold)"/>`;

const MARK = `
  <!-- monitor -->
  <g filter="url(#soft)">${MONITOR}
  </g>

  <!-- window panels (behind the shield) -->
  <g filter="url(#soft)">
${PANELS}  </g>

  <!-- shield: bold gold frame (outer thick + inner thin rule) -->
  <g filter="url(#cast)">
    <path d="${SHIELD}" fill="#0e0e1a" stroke="url(#gold)" stroke-width="26" stroke-linejoin="round"/>
    <path d="${SHIELD_INNER}" fill="none" stroke="url(#goldSoft)" stroke-width="6" stroke-linejoin="round" opacity="0.55"/>
  </g>

  <!-- isometric cube -->
  <g stroke="#6f5512" stroke-width="3" stroke-linejoin="round">
    <polygon points="${poly([T, R, FC, Lf])}" fill="url(#cubeTop)"/>
    <polygon points="${poly([Lf, FC, BC, BL])}" fill="url(#cubeL)"/>
    <polygon points="${poly([FC, R, BR, BC])}" fill="url(#cubeR)"/>
  </g>`;

const DEFS = `
  <defs>
    <radialGradient id="face" cx="50%" cy="34%" r="80%">
      <stop offset="0%" stop-color="#23232f"/>
      <stop offset="55%" stop-color="#15151d"/>
      <stop offset="100%" stop-color="#080810"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="300" x2="0" y2="900" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fbe7a6"/>
      <stop offset="32%" stop-color="#e7c65d"/>
      <stop offset="62%" stop-color="#c79a33"/>
      <stop offset="100%" stop-color="#90671a"/>
    </linearGradient>
    <linearGradient id="goldBezel" x1="0" y1="80" x2="0" y2="1120" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fcedb4"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#7e5b16"/>
    </linearGradient>
    <linearGradient id="goldSoft" x1="0" y1="400" x2="0" y2="820" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fff3c8"/>
      <stop offset="100%" stop-color="#caa64b"/>
    </linearGradient>
    <linearGradient id="win" x1="0" y1="0" x2="0" y2="1" >
      <stop offset="0%" stop-color="#fbe39a"/>
      <stop offset="100%" stop-color="#c79a33"/>
    </linearGradient>
    <linearGradient id="cubeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fdeeb0"/><stop offset="100%" stop-color="#e9cb68"/></linearGradient>
    <linearGradient id="cubeL" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d8ad3f"/><stop offset="100%" stop-color="#a87f25"/></linearGradient>
    <linearGradient id="cubeR" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b88a2b"/><stop offset="100%" stop-color="#835f17"/></linearGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.35"/></filter>
    <filter id="cast" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#000" flood-opacity="0.5"/></filter>
  </defs>`;

function svg({ maskable }) {
  const badge = maskable
    ? '  <rect width="1200" height="1200" fill="url(#face)"/>'
    : `  <rect x="80" y="80" width="1040" height="1040" rx="236" fill="url(#face)" stroke="url(#goldBezel)" stroke-width="16"/>
  <rect x="118" y="118" width="964" height="964" rx="206" fill="none" stroke="#d4af37" stroke-width="4" opacity="0.45"/>`;
  const label = maskable ? 'Asha' : 'Asha logo';
  return `<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${DEFS}
${badge}
${MARK}
</svg>
`;
}

mkdirSync(new URL('../docs/brand/', import.meta.url), { recursive: true });
const logo = svg({ maskable: false });
writeFileSync(new URL('../apps/web/public/asha-logo.svg', import.meta.url), logo);
writeFileSync(new URL('../apps/web/public/icon-maskable.svg', import.meta.url), svg({ maskable: true }));
writeFileSync(new URL('../docs/brand/asha-logo.svg', import.meta.url), logo);
console.log('wrote asha-logo.svg, icon-maskable.svg, docs/brand/asha-logo.svg');
