/*
 * Game icon set (Emoji Update). Every emoji the game used to print is drawn
 * here as an original, colorful illustrated SVG made for Cross Country
 * Dynasty: same object (a trophy is still a trophy, a bullseye is still a
 * bullseye), new art in the game's own palette.
 *
 * All icons live in one hidden <svg> sprite (injected once per page) as
 * <symbol id="gi-…">, so an icon on screen is just a tiny
 * <svg><use href="#gi-trophy"/></svg>. Shared gradients sit in the sprite's
 * <defs>; every icon is drawn on a 32×32 grid with a soft ink outline so it
 * reads on both the dark and the light theme.
 *
 *   XCD.icons.svg('trophy')         → inline markup for one icon
 *   XCD.icons.svg('🏆')             → same, looked up by the emoji it replaces
 *   XCD.icons.sprite()              → the full sprite markup
 *   XCD.icons.list                  → [{ id, emoji, label }]
 */
(function (root) {
  const XCD = root.XCD = root.XCD || {};

  /* ------------------------------ helpers ------------------------------ */
  const O = '#1b2433';                          // ink outline
  const SKIN = '#f0bb88';
  const N = 'stroke="none"';
  const hl = (op = 0.45) => `fill="#fff" stroke="none" opacity="${op}"`;
  const H = hl();
  const SH = 'fill="#000" stroke="none" opacity=".16"';
  const f = (n) => +n.toFixed(2);

  // A stroke with an ink outline under it (limbs, handles, tubes, poles).
  function dbl(d, color, w = 2, extra = '') {
    return `<path d="${d}" fill="none" stroke="${O}" stroke-width="${f(w + 2.2)}"/>` +
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ${extra}/>`;
  }
  function starPts(cx, cy, R, r, n = 5, rot = -90) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (rot + i * 180 / n) * Math.PI / 180;
      const rr = i % 2 ? r : R;
      pts.push([f(cx + rr * Math.cos(a)), f(cy + rr * Math.sin(a))]);
    }
    return pts;
  }
  const starD = (cx, cy, R, r, n, rot) => 'M' + starPts(cx, cy, R, r, n, rot).map((p) => p.join(' ')).join('L') + 'z';
  // A faceted star: lit upper-left facets, shaded lower-right ones.
  function starIcon(cx, cy, R, r, fill) {
    const p = starPts(cx, cy, R, r);
    const c = `${cx} ${cy}`;
    const tri = (a, b, attrs) => `<path d="M${p[a].join(' ')}L${p[b].join(' ')}L${c}z" ${attrs}/>`;
    return `<path d="${starD(cx, cy, R, r)}" fill="${fill}"/>` +
      tri(0, 9, hl(0.5)) + tri(8, 9, hl(0.28)) + tri(0, 1, hl(0.18)) +
      tri(3, 4, SH) + tri(4, 5, SH);
  }
  // Union of shapes with a single outer outline (clouds, tree canopies).
  function blob(shapes, fill) {
    return shapes.map((s) => `<${s} fill="${fill}" stroke-width="2.4"/>`).join('') +
      shapes.map((s) => `<${s} fill="${fill}" ${N}/>`).join('');
  }
  // A rounded "key" tile for UI controls (fast-forward, refresh, arrows…).
  function key(grad, inner) {
    return `<rect x="2.5" y="2.5" width="27" height="27" rx="6.5" fill="@${grad}"/>` +
      `<rect x="5" y="4.4" width="22" height="8" rx="4" ${hl(0.22)}/>` + inner;
  }
  // A horizontal band whose top and bottom edges wave like cloth.
  function waveD(x, y, w, h, amp = 1.5, halves = 2) {
    const s = w / halves;
    const top = Array(halves).fill(`c${f(s * 0.34)} ${-amp} ${f(s * 0.66)} ${amp} ${f(s)} 0`).join('');
    const bot = Array(halves).fill(`c${f(-s * 0.34)} ${amp} ${f(-s * 0.66)} ${-amp} ${f(-s)} 0`).join('');
    return `M${x} ${y}${top}v${h}${bot}z`;
  }
  // Round faces wear the program's blue sweatband — the house style.
  function face(grad, inner) {
    return `<circle cx="16" cy="16" r="13.5" fill="@${grad}"/>` +
      `<g clip-path="url(#gi-c-face)" ${N}><rect y="6" width="32" height="3" fill="#3d8bfd"/><rect y="6" width="32" height="1" fill="#9cc8ff"/></g>` +
      `<path d="M2.6 6h26.8M2.5 9h27" stroke="${O}" stroke-width=".6" opacity=".5" clip-path="url(#gi-c-face)"/>` +
      `<circle cx="16" cy="16" r="13.5" fill="none"/>` +
      `<ellipse cx="10" cy="12.4" rx="3.6" ry="2" transform="rotate(-30 10 12.4)" ${hl(0.3)}/>` + inner;
  }
  function gearD(cx, cy, R, r, n) {
    const pts = [];
    const step = Math.PI * 2 / n;
    for (let i = 0; i < n; i++) {
      const a = i * step;
      [[r, a - step * 0.5], [r, a - step * 0.3], [R, a - step * 0.2], [R, a + step * 0.2], [r, a + step * 0.3]]
        .forEach(([rr, aa]) => pts.push(`${f(cx + rr * Math.cos(aa))} ${f(cy + rr * Math.sin(aa))}`));
    }
    return 'M' + pts.join('L') + 'z';
  }
  function rays(cx, cy, r1, r2, n, color, w = 2.2, rot = 0) {
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = (rot + i * 360 / n) * Math.PI / 180;
      d += `M${f(cx + r1 * Math.cos(a))} ${f(cy + r1 * Math.sin(a))}L${f(cx + r2 * Math.cos(a))} ${f(cy + r2 * Math.sin(a))}`;
    }
    return dbl(d, color, w);
  }
  const sparkle = (x, y, s, fill = '#fff6a8') =>
    `<path d="M${x} ${f(y - s)}Q${x} ${y} ${f(x + s)} ${y}Q${x} ${y} ${x} ${f(y + s)}Q${x} ${y} ${f(x - s)} ${y}Q${x} ${y} ${x} ${f(y - s)}z" fill="${fill}" stroke="#e8a90c" stroke-width=".6"/>`;
  const ticketD = 'M5 10h22a2 2 0 0 1 2 2v2.6a2.4 2.4 0 0 0 0 4.8V22a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.6a2.4 2.4 0 0 0 0-4.8V12a2 2 0 0 1 2-2z';
  const heartD = 'M16 28C9 23 3 18 3 11.5 3 7.4 6 4.5 9.6 4.5c2.8 0 5 1.6 6.4 4 1.4-2.4 3.6-4 6.4-4C26 4.5 29 7.4 29 11.5 29 18 23 23 16 28z';
  const cloudShapes = (dx = 0, dy = 0) => [
    `circle cx="${10 + dx}" cy="${14 + dy}" r="5"`, `circle cx="${17 + dx}" cy="${10.5 + dy}" r="6.5"`,
    `circle cx="${23.5 + dx}" cy="${14.5 + dy}" r="4.6"`, `rect x="${5 + dx}" y="${13 + dy}" width="${23.4}" height="6.6" rx="3.3"`
  ];
  function medal(grad, numeral, numColor) {
    return `<path d="M7.5 2h6l4.5 11h-6z" fill="@blue"/><path d="M24.5 2h-6L14 13h6z" fill="@red"/>` +
      `<circle cx="16" cy="20.5" r="9" fill="@${grad}"/>` +
      `<circle cx="16" cy="20.5" r="6.5" fill="none" stroke="${numColor}" stroke-width="1" opacity=".55"/>` +
      `<path d="${numeral}" fill="none" stroke="${numColor}" stroke-width="2"/>` +
      `<path d="M10.4 18.6a6.2 6.2 0 0 1 4-4.6" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>`;
  }
  function cube(top, left, right, extra = '') {
    return `<path d="M16 3.5l11.5 5.8L16 15 4.5 9.3z" fill="${top}"/>` +
      `<path d="M4.5 9.3L16 15v13.5L4.5 22.8z" fill="${left}"/>` +
      `<path d="M27.5 9.3v13.5L16 28.5V15z" fill="${right}"/>` + extra;
  }
  function hand(transform = '') {
    return `<g transform="${transform}">` +
      `<rect x="4.6" y="14.4" width="3.8" height="9.6" rx="1.9" fill="@skin" transform="rotate(-38 6.5 19)"/>` +
      `<path d="M9.4 14h15.4v7.4c0 4.6-3.4 8.1-7.8 8.1-3.6 0-6.2-2.1-7.2-5.3z" fill="@skin"/>` +
      `<rect x="9.4" y="5.6" width="3.8" height="14" rx="1.9" fill="@skin"/>` +
      `<rect x="13.5" y="3" width="3.8" height="16" rx="1.9" fill="@skin"/>` +
      `<rect x="17.6" y="4.2" width="3.8" height="15" rx="1.9" fill="@skin"/>` +
      `<rect x="21.6" y="7.8" width="3.3" height="12" rx="1.65" fill="@skin"/>` +
      `<path d="M9.6 17.2h15v4.2c0 4.4-3.2 7.8-7.6 7.8-3.4 0-6-2-7-5z" fill="@skin" ${N}/>` +
      `<path d="M13.8 23.6c1.8 1 4.4 1 6.2-.4" fill="none" stroke="#d6925a" stroke-width=".9"/>` +
      `<rect x="14.2" y="4.2" width="1.2" height="5" rx=".6" ${hl(0.4)}/></g>`;
  }
  const silhouette = (cx, cy, r, bodyD, grad) =>
    `<path d="${bodyD}" fill="@${grad}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="@${grad}"/>`;

  /* ----------------------------- gradients ----------------------------- */
  const LIN = {
    gold: ['#ffeaa0', '#f6bd2f', '#c98608'], silver: ['#ffffff', '#cfd7e2', '#8f9bab'],
    bronze: ['#ffd0a1', '#d98a48', '#9c5520'], red: ['#ff8f86', '#ea4a40', '#b5241d'],
    blue: ['#9cc8ff', '#3d8bfd', '#1f5bc7'], green: ['#8ff0c4', '#34c98e', '#14875a'],
    orange: ['#ffc98a', '#ff8a2a', '#d0560f'], yellow: ['#fff6a8', '#ffd43a', '#e8a90c'],
    purple: ['#d8c2ff', '#9b6ef3', '#6239c4'], teal: ['#a2f1f8', '#2ab7c9', '#127c8c'],
    pink: ['#ffb3cb', '#ec5f8f', '#b62d5c'], wood: ['#e0a874', '#b5733e', '#7c4a22'],
    paper: ['#ffffff', '#f1f4f8', '#cdd5e0'], steel: ['#eef2f7', '#a9b5c4', '#6b788a'],
    dark: ['#6d7a8e', '#424c5b', '#262e39'], sky: ['#d6eeff', '#86c4f7', '#4f96dd'],
    skin: ['#fbdcbc', '#f0bb88', '#d6925a'], grass: ['#c4f08c', '#7acb47', '#3f8f2a'],
    ice: ['#f4fbff', '#c4e8fa', '#86c6ea'], flame: ['#ff5a2a', '#ff8a2a', '#ffc23a'],
    cream: ['#fff8e6', '#f1ddb0', '#d4b57a'], brick: ['#f49a74', '#cf5a33', '#93361b'],
    stone: ['#fbf8f1', '#ddd5c5', '#aaa08c'], rock: ['#c3ccd8', '#8592a5', '#56606f'],
    money: ['#d4f7c9', '#6fcf6a', '#2f8a3a'], fur: ['#ffffff', '#e9edf2', '#c3cbd6'],
    silh: ['#b4cbf0', '#7493ca', '#4a659c'], silh2: ['#d0d8e4', '#97a4b8', '#66738a'],
    manila: ['#ffe6a8', '#f4bf55', '#d0901f'], cloud: ['#ffffff', '#e5ebf3', '#b3bfcf'],
    dawn: ['#ffd27f', '#ff8e5e', '#d9507a'], chalk: ['#5c9a78', '#367556', '#1f4d36'],
    lung: ['#ffc2cd', '#f2849a', '#c44a64'], lizard: ['#dcf2a6', '#a2d05e', '#5f9a32'],
    wolf: ['#e2e7ef', '#a3afc0', '#66738a'], straw: ['#fbe7a2', '#e6bd55', '#b8862a'],
    sand: ['#ffe9a8', '#f2c75a', '#d29a2a'], asphalt: ['#8a95a6', '#5a6576', '#3a4250']
  };
  const RAD = {
    rface: ['#fff8c4', '#ffd84a', '#f0a01a'], rhot: ['#ffc2a6', '#ff6a4a', '#c8281c'],
    rcold: ['#e4f5ff', '#7cc2f2', '#2f74c2'], rred: ['#ffb3ab', '#ea4a40', '#9c1d18'],
    rorange: ['#ffd9a8', '#ff8a2a', '#c04f0c'], rgreen: ['#b5f7d6', '#34c98e', '#11704a'],
    rblue: ['#cfe5ff', '#4d96fa', '#1c4fa8'], ryellow: ['#fffbd6', '#ffd94a', '#f0a61a'],
    rocean: ['#bfe3ff', '#3f97ea', '#1a5aa8']
  };
  const stops = (cs) => cs.map((c, i) => `<stop offset="${f(i / (cs.length - 1))}" stop-color="${c}"/>`).join('');
  const DEFS =
    Object.entries(LIN).map(([k, cs]) => `<linearGradient id="gi-g-${k}" x1="0" y1="0" x2="0" y2="1">${stops(cs)}</linearGradient>`).join('') +
    Object.entries(RAD).map(([k, cs]) => `<radialGradient id="gi-g-${k}" cx=".36" cy=".32" r=".78">${stops(cs)}</radialGradient>`).join('') +
    `<clipPath id="gi-c-face"><circle cx="16" cy="16" r="13.5"/></clipPath>` +
    `<clipPath id="gi-c-flag"><path d="${waveD(8, 4.5, 20, 13.5, 1.5)}"/></clipPath>` +
    `<clipPath id="gi-c-us"><path d="${waveD(3, 8, 26, 16, 1.4)}"/></clipPath>` +
    `<clipPath id="gi-c-shirt"><path d="M10.5 3h2.8c.5 2.6 1.4 4.2 2.7 4.2s2.2-1.6 2.7-4.2h2.8c.2 3.6 1.4 6.6 4 8.4V28c0 .8-.7 1.5-1.5 1.5H8c-.8 0-1.5-.7-1.5-1.5V11.4c2.6-1.8 3.8-4.8 4-8.4z"/></clipPath>` +
    `<clipPath id="gi-c-key"><rect x="2.5" y="2.5" width="27" height="27" rx="6.5"/></clipPath>` +
    `<clipPath id="gi-c-globe"><circle cx="16" cy="16" r="13"/></clipPath>` +
    `<clipPath id="gi-c-hl"><path d="M0 0H16L13.4 12.6 17.4 16.4 14 21.4 16 32H0z"/></clipPath>` +
    `<clipPath id="gi-c-hr"><path d="M32 0H16L13.4 12.6 17.4 16.4 14 21.4 16 32H32z"/></clipPath>`;

  /* ------------------------------- icons ------------------------------- */
  // [id, emoji it replaces, label, drawing]
  const ICONS = [
    /* ---- trophies, medals, stars ---- */
    ['trophy', '🏆', 'Trophy',
      dbl('M9 7.5H5.2c0 4.6 2 7.6 6.2 8.2', '#f6bd2f', 1.8) + dbl('M23 7.5h3.8c0 4.6-2 7.6-6.2 8.2', '#f6bd2f', 1.8) +
      `<path d="M8 4h16v5.5c0 5.8-3.6 9.5-8 9.5s-8-3.7-8-9.5z" fill="@gold"/>` +
      `<path d="M14 18.6h4l.8 3.6h-5.6z" fill="@gold"/><rect x="11" y="22" width="10" height="2.6" rx="1" fill="@gold"/>` +
      `<rect x="8.5" y="24.6" width="15" height="5" rx="1.2" fill="@wood"/><rect x="12.5" y="26" width="7" height="2.2" rx=".5" fill="@gold" ${N}/>` +
      `<path d="${starD(16, 10.4, 3.6, 1.6)}" fill="#fff3c4" ${N} opacity=".95"/>` +
      `<path d="M10.4 6h2.2v4c0 2.8.9 4.8 2.2 6.2-2.8-.8-4.4-3.4-4.4-6.6z" ${H}/>`],
    ['star', '⭐', 'Star', starIcon(16, 17, 13.5, 6, '@gold')],
    ['star-glow', '🌟', 'Glowing star',
      `<circle cx="16" cy="16.5" r="13.5" fill="#ffd43a" ${N} opacity=".22"/>` +
      rays(16, 16.5, 12, 14.8, 8, '#ffd43a', 1.6, 22.5).replace(/^<path[^>]*\/>/, '') + starIcon(16, 17, 11, 4.9, '@gold') +
      sparkle(27, 5, 2.4) + sparkle(5, 26.5, 1.8)],
    ['medal-gold', '🥇', 'Gold medal', medal('gold', 'M14.4 17.8l2.3-1.6v8.6', '#9a6400')],
    ['medal-silver', '🥈', 'Silver medal', medal('silver', 'M13.6 17.8c.5-1.3 1.5-2 2.7-2 1.5 0 2.5 1 2.5 2.3 0 2.5-5.2 3.9-5.2 6.7h5.4', '#5f6b7d')],
    ['medal', '🏅', 'Sports medal',
      `<path d="M10 2h12l-2.6 11h-6.8z" fill="@red"/><path d="M14.6 2h2.8l-.6 11h-1.6z" fill="#fff" ${N}/>` +
      `<circle cx="16" cy="20.5" r="9" fill="@gold"/><circle cx="16" cy="20.5" r="6.5" fill="none" stroke="#c98608" stroke-width="1"/>` +
      `<path d="${starD(16, 20.8, 4.4, 1.9)}" fill="#fff3c4" stroke="#c98608" stroke-width=".8"/>` +
      `<path d="M10.4 18.6a6.2 6.2 0 0 1 4-4.6" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>`],
    ['medal-honor', '🎖', 'Military medal',
      `<path d="M8 2h16v9.2l-8 4.4-8-4.4z" fill="@blue"/>` +
      `<path d="M12.4 2h2v12.4l-2-1.1zM17.6 2h2v11.3l-2 1.1z" fill="#fff" ${N}/><path d="M14.4 2h3.2v13.6l-1.6.9-1.6-.9z" fill="#ea4a40" ${N}/>` +
      `<path d="M8 2h16v9.2l-8 4.4-8-4.4z" fill="none"/>` +
      `<circle cx="16" cy="15.4" r="1.7" fill="@gold"/>` + starIcon(16, 22.8, 8.6, 3.9, '@bronze')],
    ['crown', '👑', 'Crown',
      `<path d="M4.5 11.5l5.8 5.2L16 7.5l5.7 9.2 5.8-5.2-2.2 12.5H6.7z" fill="@gold"/>` +
      `<rect x="6.4" y="22.6" width="19.2" height="5" rx="1.2" fill="@gold"/>` +
      `<circle cx="4.5" cy="10.5" r="1.9" fill="@gold"/><circle cx="16" cy="6" r="2.1" fill="@gold"/><circle cx="27.5" cy="10.5" r="1.9" fill="@gold"/>` +
      `<circle cx="16" cy="25.1" r="1.4" fill="@red"/><circle cx="10.6" cy="25.1" r="1.1" fill="@blue"/><circle cx="21.4" cy="25.1" r="1.1" fill="@blue"/>` +
      `<path d="M16 14.6l2 2.6-2 2.6-2-2.6z" fill="@red"/><path d="M8 13.4l1.8 1.6-1 6.4H7.6z" ${hl(0.4)}/>`],

    /* ---- racing ---- */
    ['finish-flag', '🏁', 'Checkered flag',
      `<path d="${waveD(8, 4.5, 20, 13.5, 1.5)}" fill="#fff"/>` +
      `<g clip-path="url(#gi-c-flag)" fill="#262e39" ${N}>` +
      [0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3].map((c) => ((r + c) % 2 === 0 ?
        `<rect x="${8 + c * 5}" y="${f(1.2 + r * 4.2)}" width="5" height="4.2"/>` : '')).join('')).join('') + '</g>' +
      `<path d="${waveD(8, 4.5, 20, 13.5, 1.5)}" fill="none"/>` +
      `<rect x="5.2" y="3" width="2.6" height="26.5" rx="1.3" fill="@steel"/><circle cx="6.5" cy="3" r="1.7" fill="@gold"/>`],
    ['flag-us', '🇺🇸', 'USA flag',
      `<path d="${waveD(3, 8, 26, 16, 1.4)}" fill="#fff"/><g clip-path="url(#gi-c-us)" ${N}>` +
      [0, 2, 4, 6].map((i) => `<path d="${waveD(3, f(8 + i * 16 / 7), 26, f(16 / 7), 1.4)}" fill="@red"/>`).join('') +
      `<path d="${waveD(3, 8, 13, f(16 * 4 / 7), 1.4, 1)}" fill="@blue"/>` +
      [5.4, 8.6, 11.8].map((x, c) => [10.2, 12.6, 15].map((y) => `<circle cx="${x}" cy="${f(y + (c === 1 ? 0.5 : 0))}" r=".75" fill="#fff"/>`).join('')).join('') +
      `</g><path d="${waveD(3, 8, 26, 16, 1.4)}" fill="none"/>`],
    ['flag-no', '🇳🇴', 'Norway flag',
      `<path d="${waveD(3, 8, 26, 16, 1.4)}" fill="@red"/><g clip-path="url(#gi-c-us)" ${N}>` +
      `<rect x="9" y="0" width="5.2" height="32" fill="#fff"/><path d="${waveD(3, 13.4, 26, 5.2, 1.4)}" fill="#fff"/>` +
      `<rect x="10.4" y="0" width="2.4" height="32" fill="@blue"/><path d="${waveD(3, 14.8, 26, 2.4, 1.4)}" fill="@blue"/>` +
      `</g><path d="${waveD(3, 8, 26, 16, 1.4)}" fill="none"/>`],
    ['flag-red', '🚩', 'Red flag',
      dbl('M8 3.5v26', '#a9b5c4', 1.8) + `<path d="M9 4c5 .8 10.6 3 18 7.6-7.4 2.4-13 4-18 4.6z" fill="@red"/>` +
      `<path d="M9.6 5.4c3.4.8 7 2.2 11 4.4-3.6.4-7.2.8-11 .8z" ${hl(0.3)}/>`],
    ['target', '🎯', 'Bullseye',
      `<circle cx="15" cy="17" r="12.5" fill="@red"/><circle cx="15" cy="17" r="9.3" fill="@paper" ${N}/>` +
      `<circle cx="15" cy="17" r="6.2" fill="@red" ${N}/><circle cx="15" cy="17" r="3.2" fill="@paper" ${N}/>` +
      `<circle cx="15" cy="17" r="1.5" fill="#b5241d" ${N}/>` +
      `<path d="M6 12.6a10 10 0 0 1 6-5.6" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6"/>` +
      dbl('M15 17L26.4 5.6', '#b5733e', 1.5) +
      `<path d="M25.2 6.8l-.4-3.8 2.4-1.6.3 3 3 .3-1.6 2.4z" fill="@blue"/><path d="M15 17l3.4-1.2-2.2-2.2z" fill="@steel"/>`],
    ['runner', '🏃', 'Runner',
      `<path d="M2.5 10h5M1.5 14h4.5M3 18h3" stroke="#93a0b4" stroke-width="1.4"/>` +
      dbl('M15 18.5l-3.6 4.8H7', SKIN, 3) + dbl('M18.4 11.6l-4 2.6-3.4-1.8', SKIN, 2.6) +
      dbl('M19.2 10.2L15.4 18.4', '#3d8bfd', 4.4) + `<circle cx="15.2" cy="18.6" r="2.8" fill="@red"/>` +
      dbl('M15.4 18.6l5.4 2.4-1.2 6.4', SKIN, 3) + dbl('M18.8 11.4l3.4 4 4.2-1.4', SKIN, 2.6) +
      `<ellipse cx="6.6" cy="23.4" rx="2.2" ry="1.4" fill="@orange"/><ellipse cx="20" cy="28" rx="2.4" ry="1.4" fill="@orange"/>` +
      `<circle cx="21.6" cy="6.4" r="3.3" fill="@skin"/><path d="M18.4 5.8c.2-1.9 1.6-3.2 3.3-3.2s3.1 1.1 3.3 2.7c-1.5-.5-3.1-.2-4.3.6z" fill="#4b3120"/>`],
    ['shoe', '👟', 'Running shoe',
      `<path d="M3.5 21.5c-.3-3.4.3-7.4 1.6-10.2.4-.8 1.3-1.1 2.1-.8l3.2 1.4c1 .4 2.1.1 2.7-.7l1.7-2.4c.5-.7 1.5-.8 2.1-.2 2.1 2 4.3 4 7 5.2 2.4 1 4.8 1.6 6 3.4.6.9.8 2.2.6 3.4z" fill="@blue"/>` +
      dbl('M8.5 19.6c3.6-3.6 7.4-5.6 12.4-6.2', '#ff8a2a', 1.8) +
      `<path d="M15.4 10.6l-2.2 2.8M17.6 12.4l-2.2 2.8M20 14l-2 2.6" stroke="#fff" stroke-width="1.2"/>` +
      `<path d="M2.6 22.2c0-.9.7-1.6 1.6-1.6h24.6c1.2 0 1.9 1.1 1.5 2.2l-.5 1.4c-.3.8-1 1.3-1.9 1.3H4.6c-1.1 0-2-.9-2-2z" fill="@paper"/>` +
      `<path d="M4 24.2h25" stroke="#ff8a2a" stroke-width="1.1"/><path d="M5.6 12.6c-.6 2-1 4-1 6" stroke="#fff" stroke-width="1.2" opacity=".55"/>`],
    ['singlet', '🎽', 'Running singlet',
      `<path d="M10.5 3h2.8c.5 2.6 1.4 4.2 2.7 4.2s2.2-1.6 2.7-4.2h2.8c.2 3.6 1.4 6.6 4 8.4V28c0 .8-.7 1.5-1.5 1.5H8c-.8 0-1.5-.7-1.5-1.5V11.4c2.6-1.8 3.8-4.8 4-8.4z" fill="@blue"/>` +
      `<path d="M9.6 3.4L13.4 3 26 22v6z" fill="@yellow" ${N} clip-path="url(#gi-c-shirt)"/>` +
      `<path d="M10.5 3h2.8c.5 2.6 1.4 4.2 2.7 4.2s2.2-1.6 2.7-4.2h2.8c.2 3.6 1.4 6.6 4 8.4V28c0 .8-.7 1.5-1.5 1.5H8c-.8 0-1.5-.7-1.5-1.5V11.4c2.6-1.8 3.8-4.8 4-8.4z" fill="none"/>` +
      `<path d="M8.4 13c1.6-1.2 2.6-3 3.2-5.2" stroke="#fff" stroke-width="1.3" opacity=".5"/>`],
    ['stopwatch', '⏱', 'Stopwatch',
      `<rect x="13.6" y="1.8" width="4.8" height="2.8" rx="1" fill="@steel"/><rect x="15" y="4.4" width="2" height="2.6" fill="@steel"/>` +
      `<path d="M23.8 7.2l1.9-1.9 2.4 2.4-1.9 1.9z" fill="@steel"/>` +
      `<circle cx="16" cy="18" r="11.5" fill="@orange"/><circle cx="16" cy="18" r="8.8" fill="@paper"/>` +
      `<path d="M16 10.4v1.8M16 23.8v1.8M8.4 18h1.8M21.8 18h1.8" stroke="#6b788a" stroke-width="1.2"/>` +
      `<path d="M16 18l4.2-4.8" stroke="#ea4a40" stroke-width="1.6"/><circle cx="16" cy="18" r="1.4" fill="#ea4a40"/>` +
      `<path d="M7.6 13.6a9.6 9.6 0 0 1 5-5" fill="none" stroke="#fff" stroke-width="1.4" opacity=".6"/>`],
    ['ticket', '🎟', 'Tickets',
      `<g transform="rotate(-20 16 16)"><path d="${ticketD}" fill="@yellow" transform="translate(0 -2.6)"/></g>` +
      `<g transform="rotate(-6 16 18)"><path d="${ticketD}" fill="@orange" transform="translate(0 2.2)"/>` +
      `<path d="M9.6 13.4v12" stroke="#fff" stroke-width="1.1" stroke-dasharray="1.3 1.4"/>` +
      `<path d="${starD(19.4, 19.4, 4, 1.8)}" fill="#fff" ${N}/></g>`],

    /* ---- school & program ---- */
    ['institution', '🏛', 'Institution',
      `<path d="M3 11.5L16 3.5l13 8z" fill="@stone"/><rect x="4" y="11.5" width="24" height="3" fill="@stone"/>` +
      [6, 11.6, 17.2, 22.8].map((x) => `<rect x="${x}" y="14.5" width="3.2" height="10" fill="@stone"/><rect x="${f(x + 1.9)}" y="15" width="1" height="9" ${SH}/>`).join('') +
      `<rect x="3.5" y="24.5" width="25" height="2.4" fill="@stone"/><rect x="2" y="26.9" width="28" height="2.6" rx=".6" fill="@stone"/>` +
      `<circle cx="16" cy="8.7" r="1.7" fill="@gold"/>`],
    ['school', '🏫', 'School',
      `<rect x="3" y="14" width="9.5" height="15" fill="@brick"/><rect x="19.5" y="14" width="9.5" height="15" fill="@brick"/>` +
      `<rect x="2.4" y="12.6" width="10.6" height="2.4" rx=".6" fill="@red"/><rect x="19" y="12.6" width="10.6" height="2.4" rx=".6" fill="@red"/>` +
      `<rect x="12" y="8" width="8" height="21" fill="@brick"/><path d="M10.8 8.6L16 3.2l5.2 5.4z" fill="@red"/>` +
      `<circle cx="16" cy="12.6" r="2.3" fill="@cream"/><path d="M16 11.4v1.2l.9.6" stroke="${O}" stroke-width=".7"/>` +
      `<path d="M13.6 29v-4.6a2.4 2.4 0 0 1 4.8 0V29z" fill="@wood"/>` +
      [[4.6, 17.4], [8.4, 17.4], [4.6, 22.6], [8.4, 22.6], [21, 17.4], [24.8, 17.4], [21, 22.6], [24.8, 22.6]]
        .map(([x, y]) => `<rect x="${x}" y="${y}" width="2.6" height="3" rx=".4" fill="@sky" stroke-width=".8"/>`).join('')],
    ['house', '🏠', 'Home',
      `<rect x="21" y="5.5" width="3.6" height="7" fill="@brick"/><rect x="6.5" y="14" width="19" height="14.5" rx="1" fill="@cream"/>` +
      `<path d="M3 16.2L16 4.5l13 11.7c.5.5.2 1.3-.5 1.3H3.5c-.7 0-1-.8-.5-1.3z" fill="@red"/>` +
      `<path d="M6.6 15.4L16 7l2 1.8L8.4 17H6.4z" ${hl(0.3)}/>` +
      `<rect x="13.5" y="20" width="5" height="8.5" rx="1" fill="@wood"/><circle cx="17.3" cy="24.4" r=".6" fill="#ffd43a" ${N}/>` +
      `<rect x="8.4" y="19.4" width="3.8" height="3.8" rx=".6" fill="@sky"/><rect x="19.8" y="19.4" width="3.8" height="3.8" rx=".6" fill="@sky"/>`],
    ['stadium', '🏟', 'Stadium',
      // Floodlight towers behind the bowl.
      dbl('M4.5 15V5.4M27.5 15V5.4', '#a9b5c4', 1.2) +
      `<rect x="1.8" y="2" width="5.4" height="3.6" rx=".8" fill="@yellow"/><rect x="24.8" y="2" width="5.4" height="3.6" rx=".8" fill="@yellow"/>` +
      `<path d="M2.6 3.8h3.8M25.6 3.8h3.8" stroke="#e8a90c" stroke-width=".8"/>` +
      // Outer wall with depth, then the seating bowl from the rim inward.
      `<path d="M1.5 17.5v4c0 5 6.5 8.8 14.5 8.8s14.5-3.8 14.5-8.8v-4z" fill="@steel"/>` +
      `<path d="M1.5 21.5c0 5 6.5 8.8 14.5 8.8s14.5-3.8 14.5-8.8" fill="none" stroke="#6b788a" stroke-width=".7" transform="translate(0 -2.4)"/>` +
      `<path d="M13.4 30.2v-2.6a2.6 2.6 0 0 1 5.2 0v2.6z" fill="@dark"/>` +
      `<path d="M6 25.4v-2.2M9.4 27v-2.2M22.6 27v-2.2M26 25.4v-2.2" stroke="#6b788a" stroke-width="1"/>` +
      `<ellipse cx="16" cy="17.5" rx="14.5" ry="8.6" fill="@steel"/>` +
      `<ellipse cx="16" cy="17.6" rx="12.8" ry="7.3" fill="@blue"/>` +
      `<g fill="none" stroke="#fff" stroke-width=".55" opacity=".45"><ellipse cx="16" cy="17.8" rx="11.6" ry="6.5"/><ellipse cx="16" cy="18" rx="10.6" ry="5.8"/></g>` +
      `<ellipse cx="16" cy="18.4" rx="9.4" ry="4.9" fill="#d9603b" stroke-width="1"/>` +
      `<ellipse cx="16" cy="18.4" rx="8.4" ry="4.2" fill="none" stroke="#fff" stroke-width=".5" opacity=".8"/>` +
      `<ellipse cx="16" cy="18.5" rx="6.8" ry="3.2" fill="@grass" stroke-width=".8"/>` +
      `<path d="M16 15.3v6.4" stroke="#fff" stroke-width=".6" opacity=".7"/>` +
      // Pennants on the rim.
      `<path d="M9 10.2V6.4l3 1.2-3 1.2M23 10.2V6.4l-3 1.2 3 1.2" fill="@red" stroke-width=".8"/>` +
      `<path d="M4.4 14.6c2.8-3.2 6.8-4.8 11.6-4.8" fill="none" stroke="#fff" stroke-width="1" opacity=".6"/>`],
    ['grad-cap', '🎓', 'Graduation cap',
      `<path d="M8.4 14.5v6c0 2 3.4 3.8 7.6 3.8s7.6-1.8 7.6-3.8v-6l-7.6 3.4z" fill="@dark"/>` +
      `<path d="M16 5L30 11.5 16 18 2 11.5z" fill="@dark"/><path d="M16 6.6l10.6 4.9-2.6 1.2L16 9z" ${hl(0.25)}/>` +
      dbl('M16 11.5l9 3.4v6', '#f6bd2f', 1.2) + `<path d="M24 20.4h2l.8 4.4h-3.6z" fill="@gold"/><circle cx="16" cy="11.5" r="1.3" fill="@gold"/>`],
    ['teacher', '🧑‍🏫', 'Coach at the board',
      `<rect x="10" y="3" width="19.5" height="14.5" rx="1.2" fill="@wood"/><rect x="11.6" y="4.6" width="16.3" height="11.3" rx=".6" fill="@chalk"/>` +
      `<path d="M14 8.4c1.4-1.4 2.8 1.4 4.2 0s2.8 1.4 4.2 0M14 12.2h6.4M22.4 12.2l2.6-1.6" fill="none" stroke="#fff" stroke-width="1" opacity=".85"/>` +
      dbl('M12.4 22l5-9.4', '#e0a874', 1) +
      `<path d="M2 30c0-5 2.6-8.6 6-8.6s6 3.6 6 8.6z" fill="@purple"/><circle cx="8" cy="16.4" r="3.6" fill="@skin"/>` +
      `<path d="M4.4 16c0-2.4 1.6-3.8 3.6-3.8s3.6 1.4 3.6 3.6c-1.6-.8-4.8-.8-7.2.2z" fill="#4b3120"/>`],
    ['cap', '🧢', 'Coach cap',
      `<path d="M8 20.5c0-8 4.6-13.5 11-13.5s11 5.5 11 13.5z" fill="@blue"/>` +
      `<path d="M19 7c-2.6 3-3.6 8-3.6 13.5M19 7c2.6 3 3.6 8 3.6 13.5" fill="none" stroke="#1f5bc7" stroke-width="1"/>` +
      `<path d="M10 20c-4.6 0-7.6.8-8.4 2.2-.5 1 .4 2 2.4 2h14.6l.4-4.2z" fill="@blue"/><path d="M3.4 22.6c2-1 5-1.4 8-1.4" stroke="#fff" stroke-width="1" opacity=".5"/>` +
      `<circle cx="19" cy="7" r="1.4" fill="@blue"/><path d="${starD(13.4, 15, 2.6, 1.15)}" fill="#fff" ${N}/>` +
      `<path d="M11 17c.4-4 2.4-7 5.2-8.4-1.4 2.4-2.2 5.2-2.4 8.4z" ${hl(0.35)}/>`],
    ['tie', '👔', 'Shirt & tie',
      `<path d="M4 9.5L10 4h12l6 5.5-2.6 4-1.4-1V29H8V12.5l-1.4 1z" fill="@paper"/>` +
      `<path d="M14.4 8.4h3.2l-.7 2.8h-1.8z" fill="@blue"/><path d="M15.1 11.2h1.8l2.6 11.8-3.5 4.4-3.5-4.4z" fill="@blue"/>` +
      `<path d="M13.8 17l4.8-2.6M13.2 21.2l6-3.4" stroke="#fff" stroke-width=".9" opacity=".5"/>` +
      `<path d="M10 4l6 4.4-3.6 3.4L9 6.2zM22 4l-6 4.4 3.6 3.4L23 6.2z" fill="@paper"/>`],
    ['briefcase', '💼', 'Briefcase',
      dbl('M12 10V7.5c0-1 .8-1.6 1.6-1.6h4.8c.9 0 1.6.6 1.6 1.6V10', '#7c4a22', 1.6) +
      `<rect x="3" y="10" width="26" height="17.5" rx="2.6" fill="@wood"/><path d="M3 16.4h26" stroke="${O}" stroke-width="1"/>` +
      `<rect x="13.6" y="14.4" width="4.8" height="4" rx=".8" fill="@gold"/><rect x="5" y="11.6" width="22" height="2.6" rx="1.3" ${hl(0.2)}/>`],

    /* ---- charts & data ---- */
    ['chart-up', '📈', 'Rising chart',
      `<rect x="3" y="4" width="26" height="24" rx="3.4" fill="@paper"/><path d="M7 8.5v15.5h19" fill="none" stroke="#a9b5c4" stroke-width="1.3"/>` +
      dbl('M7.5 21.5l5-5.6 4.5 3.4 7.2-8.6', '#34c98e', 2.2) + `<path d="M20.6 9.2h5.6v5.6z" fill="@green"/>`],
    ['chart-down', '📉', 'Falling chart',
      `<rect x="3" y="4" width="26" height="24" rx="3.4" fill="@paper"/><path d="M7 8.5v15.5h19" fill="none" stroke="#a9b5c4" stroke-width="1.3"/>` +
      dbl('M7.5 10.5l5 5.6 4.5-3.4 7.2 8.6', '#ea4a40', 2.2) + `<path d="M20.6 22.8h5.6v-5.6z" fill="@red"/>`],
    ['chart-bars', '📊', 'Bar chart',
      `<rect x="3" y="4" width="26" height="24" rx="3.4" fill="@paper"/>` +
      `<rect x="7.5" y="16" width="4.2" height="8" rx=".6" fill="@blue"/><rect x="13.9" y="9" width="4.2" height="15" rx=".6" fill="@green"/>` +
      `<rect x="20.3" y="12.6" width="4.2" height="11.4" rx=".6" fill="@orange"/><path d="M6 24.2h20" stroke="#6b788a" stroke-width="1.3"/>`],
    ['signal', '📶', 'Signal bars',
      key('blue', [[7.6, 20, 4.4], [12.4, 16.4, 8], [17.2, 12.6, 11.8], [22, 8.6, 15.8]]
        .map(([x, y, h]) => `<rect x="${x}" y="${y}" width="3" height="${h}" rx=".7" fill="#fff" ${N}/>`).join(''))],
    ['clipboard', '📋', 'Clipboard',
      `<rect x="5" y="4" width="22" height="26" rx="2.5" fill="@wood"/><rect x="8" y="7.6" width="16" height="19.6" rx="1" fill="@paper"/>` +
      `<rect x="11" y="2.4" width="10" height="5.6" rx="1.6" fill="@steel"/><circle cx="16" cy="4.6" r="1" fill="${O}" ${N}/>` +
      `<path d="M10.6 12.4l1 1 1.8-2M10.6 17.2l1 1 1.8-2" fill="none" stroke="#34c98e" stroke-width="1.3"/>` +
      `<path d="M15 12.2h6.4M15 17h6.4M11 21.8h10.4" stroke="#a9b5c4" stroke-width="1.4"/>`],
    ['newspaper', '📰', 'Newspaper',
      `<path d="M7 9H4.6c-.9 0-1.6.7-1.6 1.6V26a2 2 0 0 0 4 0z" fill="#dfe5ee"/>` +
      `<rect x="7" y="4" width="22" height="24" rx="1.6" fill="@paper"/><rect x="10" y="7.2" width="16" height="3.6" rx=".6" fill="#424c5b" ${N}/>` +
      `<rect x="10" y="13" width="7" height="6.6" rx=".6" fill="@sky" stroke-width=".8"/>` +
      `<path d="M19.4 13.6h6.6M19.4 16.2h6.6M19.4 18.8h6.6M10 22.6h16M10 25.2h11" stroke="#a9b5c4" stroke-width="1.2"/>`],
    ['calendar', '📅', 'Calendar',
      `<rect x="4" y="5.5" width="24" height="23" rx="3" fill="@paper"/><path d="M4 8.5a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3V12H4z" fill="@red"/>` +
      `<rect x="9" y="3" width="2.6" height="5" rx="1.3" fill="@steel"/><rect x="20.4" y="3" width="2.6" height="5" rx="1.3" fill="@steel"/>` +
      [6.6, 11.9, 17.2, 22.5].map((x) => [14.6, 19.2, 23.8].map((y) =>
        `<rect x="${x}" y="${y}" width="3" height="3" rx=".6" fill="${x === 17.2 && y === 19.2 ? '#3d8bfd' : '#cbd3df'}" ${N}/>`).join('')).join('')],
    ['calendar-spiral', '🗓', 'Spiral calendar',
      `<rect x="4" y="5.5" width="24" height="23" rx="3" fill="@paper"/><path d="M4 8.5a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3V11H4z" fill="@blue"/>` +
      [8, 11.2, 14.4, 17.6, 20.8, 24].map((x) => `<rect x="${f(x - 0.7)}" y="2.6" width="1.4" height="5.4" rx=".7" fill="@steel" stroke-width=".9"/>`).join('') +
      `<path d="M6.5 15.4h19M6.5 19.6h19M6.5 23.8h19M11.6 12.6v13.6M16.4 12.6v13.6M21.2 12.6v13.6" stroke="#cbd3df" stroke-width="1"/>` +
      `<circle cx="18.8" cy="17.5" r="2.4" fill="none" stroke="#ea4a40" stroke-width="1.3"/>`],
    ['card-index', '🗂', 'Card dividers',
      [[4, 20, 'blue'], [9, 13, 'green'], [14, 6, 'manila']].map(([y, t, g]) =>
        `<path d="M4 ${y + 3}a1.5 1.5 0 0 1 1.5-1.5H${t}l1-2h6l1 2H26.5A1.5 1.5 0 0 1 28 ${y + 3}V28.5H4z" fill="@${g}"/>`).join('') +
      `<path d="M7 22.4h11M7 25.2h7" stroke="#b07a18" stroke-width="1.1"/>`],
    ['folder-open', '📂', 'Open folder',
      `<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h7l2.5 2.5h11A1.5 1.5 0 0 1 26.5 10v18.5H4.5A1.5 1.5 0 0 1 3 27z" fill="#d89a2e"/>` +
      `<path d="M6.4 9.6h17.4v6H6.4z" fill="#fff"/><path d="M8.6 11.8h10" stroke="#a9b5c4" stroke-width="1"/>` +
      `<path d="M6.5 13.5h23.2c.7 0 1.2.7 1 1.4l-3.4 12c-.2.7-.8 1.1-1.5 1.1H4.2c-.8 0-1.4-.8-1.2-1.6z" fill="@manila"/>`],
    ['scroll', '📜', 'Scroll',
      `<rect x="7" y="6" width="18" height="21" fill="@cream"/>` +
      `<rect x="4.5" y="3" width="23" height="5" rx="2.5" fill="@cream"/><rect x="4.5" y="25" width="23" height="5" rx="2.5" fill="@cream"/>` +
      `<path d="M10 11.5h12M10 14.5h12M10 17.5h12M10 20.5h8" stroke="#b5733e" stroke-width="1.1"/>` +
      `<rect x="6" y="4" width="20" height="1.4" rx=".7" ${hl(0.5)}/>`],
    ['book-open', '📖', 'Open book',
      `<path d="M2 8v19c5.6-.4 10.6.6 14 2.4 3.4-1.8 8.4-2.8 14-2.4V8" fill="@red"/>` +
      `<path d="M16 9.4C13 7 8.4 6 3.5 6.4v18.8c4.9-.4 9.5.6 12.5 2.8z" fill="@paper"/><path d="M16 9.4c3-2.4 7.6-3.4 12.5-3v18.8c-4.9-.4-9.5.6-12.5 2.8z" fill="@paper"/>` +
      `<path d="M6 10.6c2.6-.1 5 .3 7.4 1.4M6 14c2.6-.1 5 .3 7.4 1.4M6 17.4c2.6-.1 5 .3 7.4 1.4M26 10.6c-2.6-.1-5 .3-7.4 1.4M26 14c-2.6-.1-5 .3-7.4 1.4M26 17.4c-2.6-.1-5 .3-7.4 1.4" fill="none" stroke="#a9b5c4" stroke-width="1"/>`],
    ['books', '📚', 'Books',
      `<rect x="4" y="22" width="24" height="6.5" rx="1.2" fill="@blue"/><rect x="24" y="23.2" width="2.8" height="4.1" fill="#fff" ${N}/>` +
      `<g transform="rotate(-4 16 18)"><rect x="5.5" y="15" width="21" height="6.5" rx="1.2" fill="@green"/><rect x="22.6" y="16.2" width="2.8" height="4.1" fill="#fff" ${N}/></g>` +
      `<g transform="rotate(3 16 11)"><rect x="4" y="8" width="22" height="6.5" rx="1.2" fill="@red"/><rect x="22" y="9.2" width="2.8" height="4.1" fill="#fff" ${N}/></g>` +
      `<path d="M8 22v6.5M8.6 15.2l.4 6.4M7.4 8.2l-.2 6.4" stroke="#f6bd2f" stroke-width="1.2"/>`],
    ['ruler', '📏', 'Ruler',
      `<g transform="rotate(-40 16 16)"><rect x="2" y="11.5" width="28" height="9" rx="1.2" fill="@yellow"/>` +
      `<path d="${Array.from({ length: 11 }, (_, i) => `M${f(4.5 + i * 2.3)} 11.5v${i % 5 === 0 ? 4.4 : 2.6}`).join('')}" stroke="#8a5a00" stroke-width=".9"/></g>`],

    /* ---- communication ---- */
    ['phone', '📞', 'Phone',
      // A retro handset: long gently bowed handle, shallow flared cups. Drawn
      // upright, then turned so the earpiece sits top-left.
      `<g transform="translate(14.6 16) rotate(-45) scale(.92) translate(-13 -16)">` +
      `<path d="M10.4 2.6L17.6 1.8Q19.8 1.6 19.8 3.8V8.6Q19.8 10.8 17.6 10.6L13.6 10.2C12 13.8 12 18.2 13.6 21.8L17.6 21.4Q19.8 21.2 19.8 23.4V28.2Q19.8 30.4 17.6 30.2L10.4 29.4Q7.6 29 7.2 26C5.8 20 5.8 12 7.2 6Q7.6 3 10.4 2.6z" fill="@red"/>` +
      `<rect x="18.4" y="1.2" width="3.2" height="10" rx="1.6" fill="#c8302a"/><rect x="18.4" y="20.8" width="3.2" height="10" rx="1.6" fill="#c8302a"/>` +
      `<path d="M20 3.8v5M20 23.2v5" stroke="#7a1512" stroke-width="1.1" stroke-dasharray=".1 1.65"/>` +
      `<path d="M8.6 7.6C7.6 12.6 7.6 19.4 8.6 24.4" fill="none" stroke="#fff" stroke-width="1.5" opacity=".55"/>` +
      `<path d="M11 4l5.4-.8M11 28l5.4.8" stroke="#fff" stroke-width="1" opacity=".45"/>` +
      `</g><path d="M21.6 3.2c3 .5 5.4 2.9 6 6M20.8 7c1.5.3 2.6 1.4 2.9 2.9" fill="none" stroke="#ffd43a" stroke-width="1.6"/>`],
    ['megaphone', '📣', 'Megaphone',
      `<path d="M10.5 19.5l1.8 6.5h3.4l-1.4-5.5" fill="@dark"/>` +
      `<path d="M4.5 12.5h5L22 5.5v21L9.5 19.5h-5c-.8 0-1.5-.7-1.5-1.5v-4c0-.8.7-1.5 1.5-1.5z" fill="@red"/>` +
      `<ellipse cx="22" cy="16" rx="2.4" ry="10.5" fill="@paper"/><path d="M10 13.4l11-6.2" stroke="#fff" stroke-width="1.2" opacity=".5"/>` +
      `<path d="M26.2 11.6c1.3 1.2 1.9 2.7 1.9 4.4s-.6 3.2-1.9 4.4M28.6 9.4c1.6 1.8 2.4 4 2.4 6.6" fill="none" stroke="#ffd43a" stroke-width="1.5"/>`],
    ['mic', '🎙', 'Studio mic',
      dbl('M8.5 13v1.5a7.5 7.5 0 0 0 15 0V13', '#a9b5c4', 1.8) + dbl('M16 22v5', '#a9b5c4', 1.8) +
      `<rect x="10" y="27" width="12" height="3" rx="1.5" fill="@dark"/><rect x="11.5" y="2.5" width="9" height="16" rx="4.5" fill="@steel"/>` +
      `<path d="M12 6.6h8M11.7 9.6h8.6M11.7 12.6h8.6" stroke="#6b788a" stroke-width=".9"/>` +
      `<rect x="11.6" y="14.6" width="8.8" height="1.8" fill="@gold" ${N}/><rect x="12.8" y="4" width="1.6" height="9" rx=".8" ${hl(0.6)}/>`],
    ['speech', '💬', 'Speech bubble',
      `<path d="M5 5h22a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H14l-6 5v-5H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="@paper"/>` +
      `<circle cx="10.5" cy="14" r="1.6" fill="#93a0b4" ${N}/><circle cx="16" cy="14" r="1.6" fill="#93a0b4" ${N}/><circle cx="21.5" cy="14" r="1.6" fill="#93a0b4" ${N}/>`],
    ['inbox', '📥', 'Inbox tray',
      `<path d="M3 18.5L6.5 12h19l3.5 6.5V27a1.5 1.5 0 0 1-1.5 1.5h-23A1.5 1.5 0 0 1 3 27z" fill="@steel"/>` +
      `<path d="M6.5 12h19l3.5 6.5H21.5c-.6 2-2.8 3.2-5.5 3.2s-4.9-1.2-5.5-3.2H3z" fill="#5d6a7e"/>` +
      `<path d="M13.4 2.5h5.2v6.6h3.9L16 15.6 9.5 9.1h3.9z" fill="@blue"/>` +
      `<path d="M3 18.5h7.5c.6 2 2.8 3.2 5.5 3.2s4.9-1.2 5.5-3.2H29V27a1.5 1.5 0 0 1-1.5 1.5h-23A1.5 1.5 0 0 1 3 27z" fill="@steel"/>`],
    ['outbox', '📤', 'Outbox tray',
      `<path d="M3 18.5L6.5 12h19l3.5 6.5V27a1.5 1.5 0 0 1-1.5 1.5h-23A1.5 1.5 0 0 1 3 27z" fill="@steel"/>` +
      `<path d="M6.5 12h19l3.5 6.5H21.5c-.6 2-2.8 3.2-5.5 3.2s-4.9-1.2-5.5-3.2H3z" fill="#5d6a7e"/>` +
      `<path d="M16 1.8l6.5 6.5h-3.9V16h-5.2V8.3H9.5z" fill="@green"/>` +
      `<path d="M3 18.5h7.5c.6 2 2.8 3.2 5.5 3.2s4.9-1.2 5.5-3.2H29V27a1.5 1.5 0 0 1-1.5 1.5h-23A1.5 1.5 0 0 1 3 27z" fill="@steel"/>`],
    ['satellite', '📡', 'Satellite dish',
      dbl('M14 18l-4 10.5M14 18l5 10.5', '#a9b5c4', 1.4) + `<rect x="7" y="27.6" width="14" height="2.4" rx="1" fill="@dark"/>` +
      `<g transform="rotate(-35 14 14)"><path d="M3 14a11 11 0 0 0 22 0z" fill="@paper"/><path d="M14 14V5" stroke="${O}" stroke-width="1.2"/><circle cx="14" cy="4.4" r="1.6" fill="@red"/></g>` +
      `<path d="M21.6 4.2c2.6.4 4.8 2.4 5.4 5.2M20.8 1.4c4 .6 7.4 3.8 8.4 8" fill="none" stroke="#76baf5" stroke-width="1.4"/>`],
    ['tv', '📺', 'Television',
      dbl('M12 8.5L8.5 3.5M20 8.5l3.5-5', '#a9b5c4', 1.1) +
      `<rect x="3" y="8.5" width="26" height="18" rx="3.4" fill="@wood"/><rect x="5.6" y="11" width="16" height="13" rx="2.6" fill="@sky"/>` +
      `<path d="M8 15.4l4-3M8 19l7.4-5.6" stroke="#fff" stroke-width="1.2" opacity=".6"/>` +
      `<circle cx="25.4" cy="14" r="1.6" fill="@steel"/><circle cx="25.4" cy="19.6" r="1.6" fill="@steel"/>` +
      `<path d="M8 26.5l-1.6 3M24 26.5l1.6 3" stroke="${O}" stroke-width="1.8"/>`],
    ['desktop', '🖥', 'Computer',
      `<path d="M13 22h6l1 4.5h-8z" fill="@steel"/><rect x="9" y="26" width="14" height="3" rx="1.2" fill="@steel"/>` +
      `<rect x="2.5" y="4" width="27" height="18.5" rx="2.4" fill="@dark"/><rect x="4.6" y="6" width="22.8" height="14.4" rx="1" fill="@sky" ${N}/>` +
      `<path d="M7 12l5-4M7 16.4l9.4-7.6" stroke="#fff" stroke-width="1.3" opacity=".55"/>`],
    ['floppy', '💾', 'Save disk',
      `<path d="M5 3.5h18.5l5 5V27a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 27V5A1.5 1.5 0 0 1 5 3.5z" fill="@purple"/>` +
      `<rect x="9" y="3.5" width="13" height="8.6" rx=".6" fill="@steel"/><rect x="17.6" y="5.2" width="2.6" height="5.2" rx=".4" fill="#5d6a7e" ${N}/>` +
      `<rect x="7" y="16.5" width="18" height="12" rx="1" fill="@paper"/><path d="M9.6 20h12.8M9.6 23.4h12.8" stroke="#a9b5c4" stroke-width="1.1"/>`],

    /* ---- UI keys ---- */
    ['fast-forward', '⏩', 'Fast forward', key('blue', `<path d="M8 10.5v11l7.5-5.5zM16 10.5v11l7.5-5.5z" fill="#fff" ${N}/>`)],
    ['skip', '⏭', 'Skip ahead', key('blue', `<path d="M7.4 10.5v11l7-5.5zM14.4 10.5v11l7-5.5z" fill="#fff" ${N}/><rect x="21.8" y="10.5" width="2.8" height="11" rx=".7" fill="#fff" ${N}/>`)],
    ['pause', '⏸', 'Pause', key('blue', `<rect x="10" y="9.5" width="4.2" height="13" rx="1" fill="#fff" ${N}/><rect x="17.8" y="9.5" width="4.2" height="13" rx="1" fill="#fff" ${N}/>`)],
    ['refresh', '🔄', 'Refresh',
      key('blue', `<path d="M9.4 14.4a7 7 0 0 1 12.2-3.6M22.6 17.6a7 7 0 0 1-12.2 3.6" fill="none" stroke="#fff" stroke-width="2.4"/>` +
        `<path d="M23.8 7.4l.2 5.6-5.4-1.4zM8.2 24.6L8 19l5.4 1.4z" fill="#fff" ${N}/>`)],
    ['repeat', '🔁', 'Repeat',
      key('blue', `<path d="M8.6 18.6V15a3 3 0 0 1 3-3h9.4M23.4 13.4V17a3 3 0 0 1-3 3H11" fill="none" stroke="#fff" stroke-width="2.4"/>` +
        `<path d="M20.4 8.2l4.4 3.8-4.4 3.8zM11.6 16.2L7.2 20l4.4 3.8z" fill="#fff" ${N}/>`)],
    ['arrow-up', '⬆', 'Up', key('blue', `<path d="M16 7.2l8 8.4h-5V25h-6v-9.4H8z" fill="#fff" ${N}/>`)],
    ['arrow-down', '⬇', 'Down', key('blue', `<path d="M16 24.8l8-8.4h-5V7h-6v9.4H8z" fill="#fff" ${N}/>`)],
    ['check', '✅', 'Done', key('green', `<path d="M9 16.5l4.6 4.6L23.5 11" fill="none" stroke="#fff" stroke-width="3.4"/>`)],
    ['triangle-down', '🔻', 'Down triangle',
      `<path d="M5 8h22c.9 0 1.4 1 .9 1.7L16.9 26.4c-.4.6-1.4.6-1.8 0L4.1 9.7C3.6 9 4.1 8 5 8z" fill="@red"/><path d="M6.6 10h7.6L16 13z" ${hl(0.4)}/>`],
    ['dot-orange', '🟠', 'Orange dot', `<circle cx="16" cy="16" r="12" fill="@rorange"/><ellipse cx="12" cy="11" rx="4" ry="2.4" transform="rotate(-30 12 11)" ${hl(0.4)}/>`],
    ['dot-green', '🟢', 'Green dot', `<circle cx="16" cy="16" r="12" fill="@rgreen"/><ellipse cx="12" cy="11" rx="4" ry="2.4" transform="rotate(-30 12 11)" ${hl(0.4)}/>`],
    ['slider', '🎚', 'Slider',
      `<path d="M6 6h4M6 11h4M6 16h4M6 21h4M6 26h4M22 6h4M22 11h4M22 16h4M22 21h4M22 26h4" stroke="#93a0b4" stroke-width="1.2"/>` +
      `<rect x="14.4" y="3" width="3.2" height="26" rx="1.6" fill="#424c5b"/><rect x="14.4" y="19" width="3.2" height="10" rx="1.6" fill="@blue"/>` +
      `<rect x="9.5" y="13.6" width="13" height="6.6" rx="2" fill="@steel"/><path d="M11.6 16.9h8.8" stroke="#6b788a" stroke-width="1"/>`],
    ['gear', '⚙', 'Settings gear',
      `<path d="${gearD(16, 16, 13.2, 10.2, 8)}M20.4 16a4.4 4.4 0 1 0-8.8 0a4.4 4.4 0 1 0 8.8 0z" fill="@steel" fill-rule="evenodd"/>` +
      `<path d="M8.6 11.4a8 8 0 0 1 4.4-4" fill="none" stroke="#fff" stroke-width="1.4" opacity=".6"/>`],
    ['question', '❔', 'Question mark',
      dbl('M11.5 11c0-3 2-5 4.6-5s4.6 1.9 4.6 4.6c0 3.6-4.7 4.4-4.7 8.2', '#e6ebf2', 3.4) + `<circle cx="16" cy="25" r="2.3" fill="@paper"/>`],
    ['exclaim', '❗', 'Exclamation',
      `<path d="M13 4.5h6l-1.2 15.4h-3.6z" fill="@red"/><circle cx="16" cy="25.2" r="2.7" fill="@red"/><path d="M14.4 6h1.6l-.3 9h-.9z" ${hl(0.5)}/>`],
    ['warning', '⚠', 'Warning',
      `<path d="M16 3.5c.8 0 1.5.4 1.9 1.1l11 19.5c.8 1.4-.2 3.1-1.9 3.1H5c-1.6 0-2.7-1.7-1.9-3.1l11-19.5c.4-.7 1.1-1.1 1.9-1.1z" fill="@yellow"/>` +
      `<path d="M16 11v7.5" stroke="${O}" stroke-width="3"/><circle cx="16" cy="22.5" r="1.7" fill="${O}" ${N}/>`],
    ['siren', '🚨', 'Siren',
      rays(16, 15, 10.4, 13.6, 5, '#ffd43a', 1.6, -180) +
      `<path d="M8 22v-7a8 8 0 0 1 16 0v7z" fill="@red"/><path d="M11 20v-5a5 5 0 0 1 3-4.6" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6"/>` +
      `<rect x="5.5" y="21.5" width="21" height="6.5" rx="1.6" fill="@steel"/>`],
    ['lock', '🔒', 'Locked',
      dbl('M10.5 14v-3.6a5.5 5.5 0 0 1 11 0V14', '#c4ccd8', 2.6) +
      `<rect x="6" y="13.5" width="20" height="15.5" rx="3.4" fill="@gold"/>` +
      `<circle cx="16" cy="19.6" r="2.1" fill="#6b4300" ${N}/><path d="M15 20.4h2l.6 4.4h-3.2z" fill="#6b4300" ${N}/><rect x="8" y="15.4" width="1.8" height="11" rx=".9" ${hl(0.45)}/>`],
    ['unlock', '🔓', 'Unlocked',
      dbl('M21.5 14V8.6a5.5 5.5 0 0 0-11 0V10', '#c4ccd8', 2.6) +
      `<rect x="6" y="13.5" width="20" height="15.5" rx="3.4" fill="@gold"/>` +
      `<circle cx="16" cy="19.6" r="2.1" fill="#6b4300" ${N}/><path d="M15 20.4h2l.6 4.4h-3.2z" fill="#6b4300" ${N}/><rect x="8" y="15.4" width="1.8" height="11" rx=".9" ${hl(0.45)}/>`],
    ['magnifier', '🔎', 'Magnifier',
      dbl('M19.5 19.5L27.5 27.5', '#b5733e', 3.4) + `<circle cx="13" cy="13" r="8.8" fill="@steel"/><circle cx="13" cy="13" r="6.4" fill="@ice"/>` +
      `<path d="M9 11.6a4.6 4.6 0 0 1 3.4-3.4" fill="none" stroke="#fff" stroke-width="1.6"/>`],
    ['pin-round', '📍', 'Map pin',
      `<ellipse cx="16" cy="29" rx="4" ry="1.2" ${SH}/>` + dbl('M16 16v12.5', '#c4ccd8', 1.5) +
      `<circle cx="16" cy="10.5" r="7.6" fill="@rred"/><ellipse cx="13.4" cy="7.8" rx="2.6" ry="1.7" transform="rotate(-35 13.4 7.8)" ${H}/>`],
    ['pushpin', '📌', 'Pushpin',
      `<g transform="rotate(32 16 16)">` + dbl('M16 19.6v10', '#c4ccd8', 1.4) +
      `<path d="M10.5 4.5h11l-2.4 4v5.5l4.4 3.2c.4.3.2 1-.3 1H8.8c-.5 0-.7-.7-.3-1l4.4-3.2V8.5z" fill="@red"/>` +
      `<rect x="13.8" y="6" width="1.4" height="8" rx=".7" ${hl(0.5)}/></g>`],
    ['trash', '🗑', 'Trash',
      dbl('M12.5 6.5V5c0-.8.7-1.5 1.5-1.5h4c.8 0 1.5.7 1.5 1.5v1.5', '#a9b5c4', 1.3) +
      `<path d="M7.5 9.5h17l-1.6 18c-.1.9-.8 1.5-1.7 1.5H10.8c-.9 0-1.6-.6-1.7-1.5z" fill="@steel"/>` +
      `<path d="M12.5 13l.5 12.5M16 13v12.5M19.5 13l-.5 12.5" stroke="#6b788a" stroke-width="1.2"/>` +
      `<rect x="5" y="6.5" width="22" height="3.4" rx="1.4" fill="@steel"/>`],
    ['broom', '🧹', 'Broom',
      `<g transform="rotate(35 16 16)"><rect x="14.8" y="0" width="2.4" height="17" rx="1.2" fill="@wood"/>` +
      `<path d="M12.8 19h6.4l3.8 10.6c.2.6-.2 1-.8 1H9.8c-.6 0-1-.4-.8-1z" fill="@straw"/>` +
      `<path d="M14 21.4l-1.6 8M16 21.4v8.4M18 21.4l1.6 8" stroke="#b8862a" stroke-width=".9"/>` +
      `<rect x="12.4" y="16.2" width="7.2" height="3.2" rx="1" fill="@red"/></g>`],
    ['cart', '🛒', 'Shop cart',
      dbl('M2.5 5h3.4l3.4 15.5h15', '#a9b5c4', 1.6) + `<path d="M7 8h21.5l-2.6 10H9.2z" fill="@blue"/>` +
      `<path d="M12.4 8.4l.6 9.4M17 8.4v9.4M21.6 8.4l-.6 9.4M8 12.8h19.6" stroke="#fff" stroke-width=".9" opacity=".6"/>` +
      `<circle cx="11.5" cy="25.5" r="2.4" fill="@dark"/><circle cx="22.5" cy="25.5" r="2.4" fill="@dark"/>`],

    /* ---- training, health & body ---- */
    ['bolt', '⚡', 'Lightning',
      `<path d="M19 2L6.5 18h8.2l-2.4 12L25.5 13.5h-8.4z" fill="@yellow"/><path d="M17.4 4.6L9.6 15.4h3z" ${H}/>`],
    ['fire', '🔥', 'Fire',
      `<path d="M16 2c1 4.5 6 6.8 7.8 11.6 1.2 3 .9 6.3-.8 9-1.8 2.9-4.6 5.4-7 5.4-4.2 0-8.6-3.4-9-8.6-.2-3.2 1.2-6 3-8 .2 2.2 1 3.8 2.6 4.6-.6-5.6 1.6-10.4 3.4-14z" fill="@flame"/>` +
      `<path d="M16 14c.6 2.4 3.6 3.8 3.8 7 .1 2.6-1.8 4.6-3.8 4.6s-4-1.6-4-4.2c0-2 1.2-3.4 2.4-4.2.1 1 .6 1.8 1.4 2.2-.4-2 .1-3.8.2-5.4z" fill="@yellow"/>` +
      `<path d="M10.2 18.6c.2 2.4 1.4 4.4 3 5.6" stroke="#fff" stroke-width="1.2" opacity=".45"/>`],
    ['bed', '🛌', 'Rest',
      `<rect x="2.5" y="9" width="3.2" height="19.5" rx="1" fill="@wood"/><rect x="26.5" y="17" width="3" height="11.5" rx="1" fill="@wood"/>` +
      `<rect x="4.5" y="19" width="23" height="5" rx="1" fill="@paper"/><ellipse cx="9" cy="17.4" rx="3.6" ry="2.2" fill="@paper"/>` +
      `<circle cx="10" cy="14.6" r="2.8" fill="@skin"/><path d="M12.5 16.5c3.4-2 10-2.6 14.5-.6.6.3.9.9.9 1.5V21H12.5z" fill="@blue"/>` +
      `<path d="M15 5.5h3.4L15 9h3.4M20.4 2h2.4l-2.4 2.6h2.4" fill="none" stroke="#76baf5" stroke-width="1.3"/>`],
    ['bandage', '🩹', 'Bandage',
      `<g transform="rotate(-40 16 16)"><rect x="2" y="11" width="28" height="10" rx="5" fill="@skin"/>` +
      `<rect x="11" y="11" width="10" height="10" fill="#fbe9d4"/>` +
      [[13, 13.5], [16, 13.5], [19, 13.5], [13, 16], [16, 16], [19, 16], [13, 18.5], [16, 18.5], [19, 18.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".55" fill="#d6a370" ${N}/>`).join('') +
      `<circle cx="5.6" cy="16" r=".7" fill="#d6925a" ${N}/><circle cx="26.4" cy="16" r=".7" fill="#d6925a" ${N}/><rect x="4" y="12.4" width="6" height="1.6" rx=".8" ${hl(0.4)}/></g>`],
    ['crutch', '🩼', 'Crutch',
      `<g transform="rotate(25 16 16)">` + dbl('M11.6 5l3.6 17M20.4 5L16.8 22', '#c4ccd8', 1.6) + dbl('M16 22v7', '#c4ccd8', 1.8) +
      `<rect x="9.6" y="2" width="12.8" height="3.4" rx="1.7" fill="@blue"/><rect x="11.8" y="12" width="8.4" height="2.6" rx="1.3" fill="@blue"/>` +
      `<rect x="14.4" y="28" width="3.2" height="2.8" rx="1" fill="@dark"/></g>`],
    ['stethoscope', '🩺', 'Stethoscope',
      dbl('M9 3.5v5c0 3.6 2.2 6.2 5 6.6M19 3.5v5c0 3.6-2.2 6.2-5 6.6', '#a9b5c4', 1.4) +
      dbl('M14 15v4.5c0 4.6 3 7.5 7 7.5 3.4 0 5-2.4 5-5.2v-2.4', '#3d8bfd', 2) +
      `<circle cx="9" cy="3.2" r="1.4" fill="@dark"/><circle cx="19" cy="3.2" r="1.4" fill="@dark"/>` +
      `<circle cx="26" cy="16" r="3.6" fill="@steel"/><circle cx="26" cy="16" r="1.7" fill="@sky" ${N}/>`],
    ['lungs', '🫁', 'Lungs',
      `<path d="M14 10c-1-1.4-3-1.6-4.6-.6C6 11.6 4 17 3.6 22.4c-.2 3 1.4 5.6 4.4 5.6 2.4 0 4.6-1 5.4-3.2.6-1.6.6-4 .6-6z" fill="@lung"/>` +
      `<path d="M18 10c1-1.4 3-1.6 4.6-.6C26 11.6 28 17 28.4 22.4c.2 3-1.4 5.6-4.4 5.6-2.4 0-4.6-1-5.4-3.2-.6-1.6-.6-4-.6-6z" fill="@lung"/>` +
      `<path d="M7 16.6c.6-1.8 1.6-3.4 2.8-4.4M25 16.6c-.6-1.8-1.6-3.4-2.8-4.4" stroke="#fff" stroke-width="1.2" opacity=".5"/>` +
      dbl('M16 3v9.5M16 12.5l-3.4 3.4M16 12.5l3.4 3.4', '#e6ebf2', 1.8)],
    ['thermometer', '🌡', 'Thermometer',
      `<rect x="12.4" y="2.5" width="7.2" height="21" rx="3.6" fill="@paper"/><circle cx="16" cy="24.6" r="5.2" fill="@rred"/>` +
      `<rect x="14.7" y="9" width="2.6" height="15" rx="1.3" fill="#ea4a40" ${N}/>` +
      `<path d="M21 7h2.4M21 10.5h1.6M21 14h2.4M21 17.5h1.6" stroke="#93a0b4" stroke-width="1.1"/>`],
    ['battery', '🔋', 'Full battery',
      `<rect x="2.5" y="9" width="24" height="14" rx="2.6" fill="@steel"/><rect x="26.5" y="12.6" width="3" height="6.8" rx="1" fill="@steel"/>` +
      `<rect x="5" y="11.5" width="19" height="9" rx="1.2" fill="@green"/><path d="M9.8 11.5v9M14.5 11.5v9M19.2 11.5v9" stroke="#14875a" stroke-width="1"/>` +
      `<rect x="6" y="12.4" width="17" height="2" rx="1" ${hl(0.4)}/>`],
    ['battery-low', '🪫', 'Low battery',
      `<rect x="2.5" y="9" width="24" height="14" rx="2.6" fill="@steel"/><rect x="26.5" y="12.6" width="3" height="6.8" rx="1" fill="@steel"/>` +
      `<rect x="5" y="11.5" width="19" height="9" rx="1.2" fill="#424c5b"/><rect x="5" y="11.5" width="4.6" height="9" rx="1.2" fill="@red"/>`],
    ['lifter', '🏋', 'Weight room',
      dbl('M3 6.5h26', '#a9b5c4', 1.4) + `<rect x="2.4" y="2.6" width="3.2" height="7.8" rx=".8" fill="@red"/><rect x="26.4" y="2.6" width="3.2" height="7.8" rx=".8" fill="@red"/>` +
      dbl('M12.4 15.2L10 6.5', SKIN, 2.4) + dbl('M19.6 15.2L22 6.5', SKIN, 2.4) +
      dbl('M14 22.5l-3.4 3.4.8 3.6', SKIN, 2.8) + dbl('M18 22.5l3.4 3.4-.8 3.6', SKIN, 2.8) +
      `<path d="M12 14.5c0-.8.7-1.5 1.5-1.5h5c.8 0 1.5.7 1.5 1.5V22c0 .8-.7 1.5-1.5 1.5h-5c-.8 0-1.5-.7-1.5-1.5z" fill="@blue"/>` +
      `<circle cx="16" cy="10.4" r="2.8" fill="@skin"/>`],
    ['sleep', '😴', 'Sleeping face',
      face('rface', `<path d="M9.5 15.6c1.2 1.2 3.2 1.2 4.4 0M18.1 15.6c1.2 1.2 3.2 1.2 4.4 0" fill="none" stroke-width="1.4"/><ellipse cx="16" cy="22" rx="1.8" ry="2.1" fill="#7a3b1c"/>`) +
      `<path d="M23 1h4.4L23 5.4h4.4" fill="none" stroke="#76baf5" stroke-width="1.5"/>`],
    ['yawn', '🥱', 'Yawning face',
      face('rface', `<path d="M9.2 14.8h4.4M18.4 14.8h4.4M9.4 12.4l3.8.6M22.6 12.4l-3.8.6" fill="none" stroke-width="1.3"/>` +
        `<ellipse cx="16" cy="21.6" rx="4" ry="4.6" fill="#7a3b1c"/><ellipse cx="16" cy="24.4" rx="2.6" ry="1.4" fill="#f07a92" ${N}/>`)],
    ['grimace', '😬', 'Grimacing face',
      face('rface', `<ellipse cx="11.6" cy="14.6" rx="1.4" ry="1.8" fill="${O}"/><ellipse cx="20.4" cy="14.6" rx="1.4" ry="1.8" fill="${O}"/>` +
        `<rect x="8.5" y="18.6" width="15" height="6" rx="3" fill="#fff"/><path d="M8.5 21.6h15M12.2 18.8v5.6M16 18.8v5.6M19.8 18.8v5.6" stroke-width=".9"/>`)],
    ['hot', '🥵', 'Overheated face',
      face('rhot', `<path d="M9.4 13.4l3.6 1.6-3.6 1.4M22.6 13.4L19 15l3.6 1.4" fill="none" stroke-width="1.4"/>` +
        `<path d="M10.5 19.4c2 2.4 9 2.4 11 0-.6 3.4-2.8 5.6-5.5 5.6s-4.9-2.2-5.5-5.6z" fill="#7a1c1c"/><path d="M13.8 23.2c.4 2.6 1.2 4 2.2 4s1.8-1.4 2.2-4z" fill="#ff9fb3"/>`) +
      `<path d="M27 9.6c-1 1.6-1.6 2.6-1.6 3.4a1.6 1.6 0 0 0 3.2 0c0-.8-.6-1.8-1.6-3.4z" fill="@sky"/>`],
    ['cold', '🥶', 'Frozen face',
      face('rcold', `<path d="M9 9.2l1 3 1-3zM14.4 9.2l1 3.6 1-3.6zM20.4 9.2l1 2.8 1-2.8z" fill="#f4fbff" stroke-width=".7"/>` +
        `<ellipse cx="11.6" cy="15.4" rx="1.4" ry="1.8" fill="${O}"/><ellipse cx="20.4" cy="15.4" rx="1.4" ry="1.8" fill="${O}"/>` +
        `<rect x="9" y="19.4" width="14" height="5" rx="2.5" fill="#fff"/><path d="M9 21.9h14M12.5 19.6v4.6M16 19.6v4.6M19.5 19.6v4.6" stroke-width=".8"/>`)],
    ['worried', '😟', 'Worried face',
      face('rface', `<path d="M9 12.6l3.8-1.6M23 12.6l-3.8-1.6" fill="none" stroke-width="1.3"/>` +
        `<ellipse cx="11.8" cy="15.8" rx="1.4" ry="1.8" fill="${O}"/><ellipse cx="20.2" cy="15.8" rx="1.4" ry="1.8" fill="${O}"/>` +
        `<path d="M11.5 23.4c2.4-2.6 6.6-2.6 9 0" fill="none" stroke-width="1.5"/>`)],
    ['skull', '💀', 'Skull',
      `<path d="M16 3C9.6 3 5 7.6 5 13.4c0 3.6 1.6 6.4 4 8V26a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 23 26v-4.6c2.4-1.6 4-4.4 4-8C27 7.6 22.4 3 16 3z" fill="@fur"/>` +
      `<ellipse cx="11.6" cy="14" rx="3" ry="3.4" fill="#424c5b"/><ellipse cx="20.4" cy="14" rx="3" ry="3.4" fill="#424c5b"/>` +
      `<path d="M16 17.6l-1.6 3h3.2z" fill="#424c5b"/><path d="M13 23v4.4M16 23v4.4M19 23v4.4" stroke="#8f9bab" stroke-width="1"/>`],
    ['heart-broken', '💔', 'Broken heart',
      `<g clip-path="url(#gi-c-hl)" transform="rotate(-6 10 20) translate(-.8 0)"><path d="${heartD}" fill="@red"/><path d="M16 8.5L13.4 12.6 17.4 16.4 14 21.4 16 28" fill="none"/></g>` +
      `<g clip-path="url(#gi-c-hr)" transform="rotate(6 22 20) translate(.8 0)"><path d="${heartD}" fill="@red"/><path d="M16 8.5L13.4 12.6 17.4 16.4 14 21.4 16 28" fill="none"/></g>` +
      `<path d="M6.2 9.6c.8-1.6 2.2-2.6 3.8-2.8" stroke="#fff" stroke-width="1.6" opacity=".6"/>`],
    ['hand', '✋', 'Raised hand', hand()],
    ['wave', '👋', 'Waving hand',
      hand('rotate(-22 16 20) translate(1 1)') +
      `<path d="M3.4 6.4c-.8 1.6-.9 3.4-.2 5M6 4.6c-.6 1-.7 2.2-.2 3.2M27.6 3.6c1.4 1 2.2 2.6 2.4 4.4" fill="none" stroke="#93a0b4" stroke-width="1.3"/>`],
    ['handshake', '🤝', 'Handshake',
      `<path d="M1.5 13.5l6-2.4 3.4 8.4-6 2.8z" fill="@blue"/><path d="M30.5 13.5l-6-2.4-3.4 8.4 6 2.8z" fill="@orange"/>` +
      `<path d="M8 11.8c2-1 4.8-1.6 7-1.2l3.5-1c1.4-.4 2.8 0 3.8.9l1.6 1.6 2.4 6.8-3.4 2.2c-.8 2.4-3.2 3.4-5.2 2.6-1.4 1.2-3.4 1.2-4.6.2-1.4.6-3 .2-3.8-1L8.4 19.6z" fill="@skin"/>` +
      `<path d="M12.4 17.6l2.6 2.6M15 16l3 3M17.6 14.8l3 3" fill="none" stroke="#c9824c" stroke-width="1"/>` +
      `<path d="M15.2 10.4c-1.6 1.2-2.4 2.6-2.2 3.8 1.6.2 3-.6 4.6-1.8" fill="@skin"/>`],
    ['hug', '🫂', 'Hug',
      silhouette(11, 9.6, 4.2, 'M2.5 29c0-7 3.6-12.4 8.5-12.4 3 0 5.4 2 7 5z', 'silh2') +
      silhouette(20.6, 10, 4.4, 'M10 29c.6-7 4.4-12 10.6-12S30 22 30 29z', 'silh') +
      dbl('M6.6 22.4c4.4 2.2 9.8 2.4 14.4.6', '#97a4b8', 2.4)],
    ['people', '👥', 'Group',
      silhouette(21, 9.6, 4.6, 'M13 26c0-6 3.6-10 8-10s8 4 8 10z', 'silh2') +
      silhouette(12, 12, 5, 'M3 29.5c0-6.4 4-10.6 9-10.6s9 4.2 9 10.6z', 'silh')],

    /* ---- travel & places ---- */
    ['luggage', '🧳', 'Luggage',
      dbl('M12 9.5V6.6c0-.9.7-1.6 1.6-1.6h4.8c.9 0 1.6.7 1.6 1.6v2.9', '#5d6a7e', 1.7) +
      `<rect x="4" y="9" width="24" height="19" rx="3" fill="@orange"/><rect x="9" y="9" width="2.4" height="19" fill="@wood"/><rect x="20.6" y="9" width="2.4" height="19" fill="@wood"/>` +
      `<circle cx="16" cy="16.4" r="2.6" fill="@blue"/><rect x="13.4" y="21" width="5.2" height="3.2" rx=".6" fill="@yellow" transform="rotate(-8 16 22.6)"/>` +
      `<rect x="5.4" y="10.4" width="2.4" height="9" rx="1.2" ${hl(0.35)}/>`],
    ['map', '🗺', 'Map',
      `<path d="M3 8l8-3 10 3 8-3v19l-8 3-10-3-8 3z" fill="@ice"/>` +
      `<path d="M5 12.4c2-1 4-.4 5 1s3 1 3.4 3-1.6 3-3.4 3.6-4 .2-5-1z" fill="@grass" ${N}/><path d="M18 9.6c2.4.2 4.4 1.4 6.6.4 1.4.4 2 2 1.4 3.4-1.4 2.6-4.2 1.4-6 3-1.6 1.2-3.2.4-3.4-1.4-.2-2.2-.4-4.2 1.4-5.4z" fill="@grass" ${N}/>` +
      `<path d="M11 5l10 3v19l-10-3z" ${SH}/>` +
      `<path d="M7 21.4c3-3 6 1 9-3s5.4-3.8 7.6-1.6" fill="none" stroke="#ea4a40" stroke-width="1.3" stroke-dasharray="1.6 1.4"/>` +
      `<path d="M23.2 20l2.6 2.6M25.8 20l-2.6 2.6" stroke="#ea4a40" stroke-width="1.4"/>` +
      `<path d="M11 5v19M21 8v19" stroke-width=".9"/><path d="M3 8l8-3 10 3 8-3v19l-8 3-10-3-8 3z" fill="none"/>`],
    ['bus', '🚌', 'Team bus',
      `<rect x="2.5" y="7" width="27" height="17.5" rx="3.5" fill="@yellow"/>` +
      `<rect x="5" y="9.5" width="17" height="6" rx="1" fill="@sky"/><path d="M9.2 9.5v6M13.4 9.5v6M17.6 9.5v6" stroke-width="1"/>` +
      `<rect x="23.6" y="9.5" width="3.6" height="11.5" rx="1" fill="@sky"/><path d="M2.6 18.6h20.6" stroke="#d0560f" stroke-width="1.6"/>` +
      `<rect x="27.4" y="20.2" width="1.8" height="2" rx=".4" fill="#fff6a8"/>` +
      `<circle cx="9" cy="24.5" r="3.2" fill="@dark"/><circle cx="9" cy="24.5" r="1.2" fill="@steel" ${N}/>` +
      `<circle cx="23" cy="24.5" r="3.2" fill="@dark"/><circle cx="23" cy="24.5" r="1.2" fill="@steel" ${N}/>`],
    ['plane', '✈', 'Airplane',
      `<g transform="rotate(45 16 16)"><path d="M16 2c1.2 0 2 1.4 2 3v6.5l11 6.5v3l-11-3.5V24l3.5 2.6V29L16 27.5 10.5 29v-2.4L14 24v-6.5L3 21v-3l11-6.5V5c0-1.6.8-3 2-3z" fill="@paper"/>` +
      `<path d="M29 18v3l-4-1.3v-4.1zM3 18v3l4-1.3v-4.1z" fill="@blue" stroke-width=".8"/><rect x="15.2" y="4" width="1.6" height="5" rx=".8" fill="@sky" ${N}/></g>`],
    ['rocket', '🚀', 'Rocket',
      `<g transform="rotate(45 16 16)"><path d="M12 23.5h8l-1.4 3.6L16 31l-2.6-3.9z" fill="@flame"/>` +
      `<path d="M10.6 16.5l-4.4 4.4V26l4.4-3zM21.4 16.5l4.4 4.4V26l-4.4-3z" fill="@red"/>` +
      `<path d="M16 1.5c4 3 6 8 6 14v8.5H10v-8.5c0-6 2-11 6-14z" fill="@paper"/><path d="M16 1.5c2.5 1.9 4.2 4.6 5.1 7.8H10.9c.9-3.2 2.6-5.9 5.1-7.8z" fill="@red"/>` +
      `<circle cx="16" cy="14" r="2.8" fill="@sky"/><path d="M16 19.4v4.6" stroke="#b5241d" stroke-width="2"/></g>`],
    ['ambulance', '🚑', 'Ambulance',
      `<path d="M2 9a2 2 0 0 1 2-2h16v17H4a2 2 0 0 1-2-2z" fill="@paper"/>` +
      `<path d="M20 11h5.2c.7 0 1.3.4 1.6 1l2.6 5c.2.3.2.6.2.9V22a2 2 0 0 1-2 2H20z" fill="@paper"/>` +
      `<path d="M21.6 12.6h3.2l2 4h-5.2z" fill="@sky"/><path d="M2.2 19.4h27.4" stroke="#ea4a40" stroke-width="1.6"/>` +
      `<path d="M9.4 10.4h3.2v2.6h2.6v3.2h-2.6v2.6H9.4v-2.6H6.8V13h2.6z" fill="@red" stroke-width=".8"/>` +
      `<rect x="13" y="4.6" width="4" height="2.4" rx=".8" fill="@blue"/>` +
      `<circle cx="8" cy="24.4" r="3" fill="@dark"/><circle cx="24" cy="24.4" r="3" fill="@dark"/>`],
    ['road', '🛣', 'Highway',
      `<rect x="2.5" y="2.5" width="27" height="27" rx="6.5" fill="@grass"/>` +
      `<g clip-path="url(#gi-c-key)" ${N}><rect x="0" y="0" width="32" height="11" fill="@sky"/><path d="M14 10h4l10 22H4z" fill="@asphalt"/>` +
      `<path d="M14.2 10L5.4 32M17.8 10l8.8 22" stroke="#ffd43a" stroke-width="1"/><path d="M16 11v2.2M16 15.4v3M16 21.2v4.2M16 28.4v4" stroke="#fff" stroke-width="1.3"/></g>` +
      `<rect x="2.5" y="2.5" width="27" height="27" rx="6.5" fill="none"/>`],
    ['crane', '🏗', 'Construction',
      `<path d="M9.5 5L11 1.5 12.5 5z" fill="@yellow"/><rect x="9" y="7.5" width="4" height="20" fill="@yellow"/>` +
      `<path d="M9 9.5l4 3-4 3 4 3-4 3 4 3" fill="none" stroke="#b8862a" stroke-width=".9"/>` +
      `<rect x="3" y="5" width="26" height="3" fill="@yellow"/><path d="M13 8l2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3" fill="none" stroke="#b8862a" stroke-width=".8"/>` +
      `<rect x="3.4" y="8" width="4.4" height="3.6" fill="@dark"/><path d="M24 8v9.6" stroke-width="1"/>` +
      `<rect x="20" y="17.6" width="8" height="5.4" rx=".6" fill="@orange"/><rect x="6" y="27" width="10" height="2.6" rx=".8" fill="@dark"/>`],
    ['door', '🚪', 'Door',
      `<rect x="6" y="2.5" width="20" height="27" rx="1.4" fill="#7c4a22"/><rect x="8.2" y="4.6" width="15.6" height="24.9" rx=".6" fill="@wood"/>` +
      `<rect x="10.4" y="7" width="11.2" height="8" rx=".8" fill="none" stroke="#7c4a22" stroke-width="1"/><rect x="10.4" y="17.6" width="11.2" height="9" rx=".8" fill="none" stroke="#7c4a22" stroke-width="1"/>` +
      `<circle cx="20.6" cy="16.4" r="1.4" fill="@gold"/>`],
    ['chair', '🪑', 'Chair',
      dbl('M10.6 17l-1 11.5M22.4 17l1 11.5', '#b5733e', 1.8) + dbl('M10.4 17V4.5M21.6 17V4.5', '#b5733e', 1.8) +
      `<rect x="10" y="5" width="12" height="3.2" rx="1" fill="@wood"/><rect x="10" y="10.4" width="12" height="2.6" rx="1" fill="@wood"/>` +
      `<path d="M7.5 15.5h17l1.6 3H6z" fill="@wood"/>`],
    ['globe', '🌐', 'Globe',
      `<circle cx="16" cy="16" r="13" fill="@rblue"/>` +
      `<g fill="none" stroke="#fff" stroke-width=".9" opacity=".75"><ellipse cx="16" cy="16" rx="5.6" ry="13"/><path d="M16 3v26M3 16h26M4.8 9.5h22.4M4.8 22.5h22.4"/></g>` +
      `<circle cx="16" cy="16" r="13" fill="none"/>`],
    ['earth-americas', '🌎', 'Earth (Americas)',
      `<circle cx="16" cy="16" r="13" fill="@rocean"/><g clip-path="url(#gi-c-globe)" fill="@grass" stroke-width=".8">` +
      `<path d="M7 6c2.8-1.4 6.4-1.2 8.6.4.8 1.8-.4 3.4-2 3.8-1.6.6-1.8 2.2-1.2 3.8.4 1.4-.4 2.2-1.8 1.8-1.8-.6-3 .2-3.8 1.6C5 16.4 3 14 3.4 11.4 3.8 9.2 5 7 7 6z"/>` +
      `<path d="M15.6 18.4c1.8-.6 4 .2 5 2 .8 2 .2 4-.8 5.8-1 1.8-1.8 3.4-2.6 4.6-.8-1-1.4-2.6-1.6-4.4-.2-1.6-1-2.8-1.4-4.4-.2-1.8.2-3 1.4-3.6z"/></g>` +
      `<circle cx="16" cy="16" r="13" fill="none"/><ellipse cx="10.4" cy="9" rx="4" ry="2.2" transform="rotate(-35 10.4 9)" ${hl(0.3)}/>`],
    ['earth-africa', '🌍', 'Earth (Europe & Africa)',
      `<circle cx="16" cy="16" r="13" fill="@rocean"/><g clip-path="url(#gi-c-globe)" fill="@grass" stroke-width=".8">` +
      `<path d="M12.4 4.6c1.8-.8 4.8-.6 6.6.4 1.6.8 1.4 2.6-.2 3-1.6.4-1.6 1.8-3.2 2-1.8.2-2.6-.8-4.2-.6-1.4.2-2.2-.6-1.6-1.8.6-1.2 1.6-2.2 2.6-3z"/>` +
      `<path d="M10.8 12.4c2.2-.8 5.6-.8 7.8.2 1.8.8 2.8 2.6 2.6 4.4-.2 1.6-1.6 2.2-2 3.6-.6 2-.6 4.4-2.2 6.2-.8.8-2.2.6-2.6-.4-.6-1.8-.4-3.8-1.6-5.4-.8-1.4-2.6-1.6-3-3.2-.4-1.8-.6-4.2 1-5.4z"/>` +
      `<path d="M24 20.6c1-.4 2 .4 1.8 1.6-.2 1.4-.8 2.6-1.8 3-.6-1.4-.8-3.2 0-4.6z"/></g>` +
      `<circle cx="16" cy="16" r="13" fill="none"/><ellipse cx="10.4" cy="9" rx="4" ry="2.2" transform="rotate(-35 10.4 9)" ${hl(0.3)}/>`],

    /* ---- weather & nature ---- */
    ['sun', '☀', 'Sun', rays(16, 16, 10, 14, 8, '#ff9f1c', 2.2) + `<circle cx="16" cy="16" r="7.6" fill="@ryellow"/><path d="M12 13.4a4.6 4.6 0 0 1 2.6-2.6" fill="none" stroke="#fff" stroke-width="1.5" opacity=".7"/>`],
    ['moon', '🌙', 'Moon',
      `<path d="M12.86 5.19A12 12 0 1 0 26.81 19.14A10 10 0 0 1 12.86 5.19z" fill="@yellow"/>` +
      `<circle cx="10" cy="19" r="1.6" fill="#e8a90c" ${N} opacity=".6"/><circle cx="14.6" cy="24" r="1.1" fill="#e8a90c" ${N} opacity=".6"/>` +
      sparkle(25.4, 6, 2.2) + sparkle(29, 12, 1.4)],
    ['sunrise', '🌅', 'Sunrise',
      `<rect x="2.5" y="2.5" width="27" height="27" rx="6.5" fill="@dawn"/>` +
      `<g clip-path="url(#gi-c-key)" ${N}><circle cx="16" cy="20" r="7" fill="@ryellow"/>` +
      `<rect x="0" y="20" width="32" height="12" fill="@blue"/><path d="M9.6 23h12.8M12.4 25.6h7.2M14.4 28h3.2" stroke="#ffd43a" stroke-width="1.2"/></g>` +
      `<rect x="2.5" y="2.5" width="27" height="27" rx="6.5" fill="none"/>`],
    ['rain', '🌧', 'Rain',
      blob(cloudShapes(0, -3.4), '@cloud') +
      [[10.5, 21], [16.5, 23.4], [22.5, 21]].map(([x, y]) => `<path d="M${x} ${y}c-1.3 2.1-2.1 3.5-2.1 4.7a2.1 2.1 0 0 0 4.2 0c0-1.2-.8-2.6-2.1-4.7z" fill="@blue"/>`).join('')],
    ['snowflake', '❄', 'Snowflake',
      (() => {
        const arm = 'M16 16V3M16 7.4l-3.2-3M16 7.4l3.2-3M16 11.6l-2.6-2.4M16 11.6l2.6-2.4';
        const rot = [0, 60, 120, 180, 240, 300];
        return rot.map((r) => `<path d="${arm}" transform="rotate(${r} 16 16)" fill="none" stroke="${O}" stroke-width="4"/>`).join('') +
          rot.map((r) => `<path d="${arm}" transform="rotate(${r} 16 16)" fill="none" stroke="#cfeeff" stroke-width="2"/>`).join('') +
          `<circle cx="16" cy="16" r="2.2" fill="#fff" ${N}/>`;
      })()],
    ['wind', '💨', 'Dash',
      blob(['circle cx="20" cy="17" r="4.6"', 'circle cx="25" cy="13.6" r="4.2"', 'circle cx="26.2" cy="19.6" r="3.6"'], '@cloud') +
      dbl('M2.5 12h13', '#e6ebf2', 1.6) + dbl('M6 17h8.6', '#e6ebf2', 1.6) + dbl('M2.5 22h14', '#e6ebf2', 1.6)],
    ['mountain', '⛰', 'Mountain',
      `<path d="M1.5 28L12 5.5l5 7.4 4-5.4L30.5 28z" fill="@rock"/><path d="M21 7.5L30.5 28h-6.4zM12 5.5l5 7.4-5.6 15.1H8.6z" ${SH}/>` +
      `<path d="M12 5.5L8.8 12.3l2-1.1 1.5 1.5 1.6-1.7 1.9 1.2z" fill="#fff" stroke-width=".8"/><path d="M21 7.5l-2.3 3.1 1.2-.4 1.1 1 1.2-1 1.2.4z" fill="#fff" stroke-width=".8"/>` +
      `<path d="M1.5 28h29" stroke-width="1.2"/>`],
    ['seedling', '🌱', 'Seedling',
      `<ellipse cx="16" cy="27" rx="10" ry="3" fill="@wood"/>` + dbl('M16 26c0-4 0-7.6-.6-11', '#5fa83a', 1.6) +
      `<path d="M15.6 16C11.8 16.6 7 14.6 5.4 9.6c4.6-1.6 9.4.6 10.2 6.4z" fill="@grass"/><path d="M16.2 13.4c1-4.8 5.2-8 11-7.4-.6 5.4-5.4 8.4-11 7.4z" fill="@grass"/>` +
      `<path d="M14.8 15.2C11.6 13.6 9.6 12 7.8 10.4M17 12.6c2.6-1.6 5.6-3.6 8.4-5.4" stroke="#3f8f2a" stroke-width=".9" fill="none"/>`],
    ['tree', '🌳', 'Tree',
      `<ellipse cx="16" cy="29" rx="7" ry="1.4" ${SH}/><rect x="14" y="17" width="4" height="12" rx="1" fill="@wood"/>` +
      blob(['circle cx="16" cy="9" r="6.5"', 'circle cx="9.6" cy="13.4" r="5"', 'circle cx="22.4" cy="13.4" r="5"', 'circle cx="13" cy="17" r="4.4"', 'circle cx="19" cy="17" r="4.4"'], '@grass') +
      `<circle cx="12.4" cy="7.6" r="2" ${hl(0.3)}/>`],
    ['rock', '🪨', 'Rock',
      `<path d="M4 24l2.4-9 6-6.5 7.6-1.5 6.6 4 2.4 8.5-2.4 5.5H6.4z" fill="@rock"/>` +
      `<path d="M12.4 8.5l3 7.5 4.6-8.6zM6.4 15l9 1-3-7.5z" ${hl(0.3)}/><path d="M15.4 16l13.2 3.5-2.4 5.5z" ${SH}/>` +
      `<path d="M15.4 16L20 7.4M15.4 16l-9 8" stroke-width=".8" opacity=".6"/>`],
    ['ice', '🧊', 'Ice cube',
      cube('#f4fbff', 'url(#gi-g-ice)', '#9fd2ee',
        `<path d="M7 10.6l8.6 4.4M8 13.4v6" stroke="#fff" stroke-width="1.2" opacity=".9"/>`)],
    ['bricks', '🧱', 'Bricks',
      `<rect x="3" y="6" width="26" height="20.4" rx="1" fill="#d9cbb4"/>` +
      [[6.4, [[3.6, 12], [16.2, 12.2]]], [13.2, [[3.6, 5.6], [9.8, 12.4], [22.8, 5.6]]], [20, [[3.6, 12], [16.2, 12.2]]]]
        .map(([y, bs]) => bs.map(([x, w]) => `<rect x="${x}" y="${y}" width="${w}" height="5.8" rx=".7" fill="@brick" stroke-width=".9"/>`).join('')).join('')],

    /* ---- animals ---- */
    ['goat', '🐐', 'GOAT',
      dbl('M12.6 8C11 5.6 11.4 3.2 13.8 2', '#d9c49a', 2) + dbl('M19.4 8c1.6-2.4 1.2-4.8-1.2-6', '#d9c49a', 2) +
      `<path d="M10.6 11.2C7.6 10.4 4.6 11 3 12.6c1.8 1.8 4.8 2.2 7.8 1.4zM21.4 11.2c3-.8 6-.2 7.6 1.4-1.8 1.8-4.8 2.2-7.8 1.4z" fill="@fur"/>` +
      `<path d="M14 24.8c.2 2.6.8 4.2 2 5.2 1.2-1 1.8-2.6 2-5.2" fill="#e6ebf2"/>` +
      `<path d="M10 10.6C10 7.8 12.6 6 16 6s6 1.8 6 4.6v6c0 3.6-1.4 7-3.2 8.6-.8.7-1.8 1-2.8 1s-2-.3-2.8-1C11.4 23.6 10 20.2 10 16.6z" fill="@fur"/>` +
      `<ellipse cx="16" cy="22" rx="3.2" ry="2.6" fill="#f5c9c4" stroke-width=".8"/><circle cx="14.8" cy="22" r=".6" fill="#8a4b4b" ${N}/><circle cx="17.2" cy="22" r=".6" fill="#8a4b4b" ${N}/>` +
      `<ellipse cx="12.9" cy="14.2" rx="1.6" ry="1.2" fill="#f2b84a" stroke-width=".8"/><rect x="12.1" y="13.9" width="1.6" height=".6" fill="${O}" ${N}/>` +
      `<ellipse cx="19.1" cy="14.2" rx="1.6" ry="1.2" fill="#f2b84a" stroke-width=".8"/><rect x="18.3" y="13.9" width="1.6" height=".6" fill="${O}" ${N}/>`],
    ['wolf', '🐺', 'Wolf',
      `<path d="M6 4l5 6h10l5-6 1 10c0 2-1 3.6-2.4 4.6L21 22l-2 5h-6l-2-5-3.6-3.4C6 17.6 5 16 5 14z" fill="@wolf"/>` +
      `<path d="M7.4 7.4l2.4 3-1.8 1.4zM24.6 7.4l-2.4 3 1.8 1.4z" fill="#f2a5b4" ${N}/>` +
      `<path d="M12.5 17.5c1-1 2.2-1.4 3.5-1.4s2.5.4 3.5 1.4L18.6 25h-5.2z" fill="@paper"/>` +
      `<path d="M14.4 18.6h3.2L16 20.6z" fill="${O}"/>` +
      `<path d="M10.4 14.4l3 .6-2.6 1.2zM21.6 14.4l-3 .6 2.6 1.2z" fill="#f2b84a" stroke-width=".8"/>`],
    ['turtle', '🐢', 'Turtle',
      `<ellipse cx="9" cy="23" rx="2.4" ry="3" fill="@lizard"/><ellipse cx="21" cy="23" rx="2.4" ry="3" fill="@lizard"/>` +
      `<path d="M4 20l-2.4 1.6 2.6.6z" fill="@lizard"/><circle cx="26.4" cy="17" r="3.6" fill="@lizard"/>` +
      `<path d="M3.5 21c0-6.6 4.8-11 11-11s11 4.4 11 11z" fill="@green"/><rect x="3" y="20.2" width="23" height="2" rx="1" fill="#d8c78a"/>` +
      `<path d="M10.8 14.6l3.7-1.8 3.7 1.8v3.6l-3.7 1.8-3.7-1.8z" fill="#7acb47" stroke="#14875a" stroke-width=".9"/>` +
      `<path d="M10.8 18.2l-4.4 2M18.2 18.2l4.4 2M14.5 12.8V10M10.8 14.6L7 12.6M18.2 14.6l3.8-2" stroke="#14875a" stroke-width=".9"/>` +
      `<circle cx="27.6" cy="16" r=".8" fill="${O}" ${N}/>`],
    ['robot', '🤖', 'Robot',
      `<path d="M16 9V4.6" stroke-width="1.6"/><circle cx="16" cy="3.6" r="1.8" fill="@red"/>` +
      `<rect x="2.6" y="14" width="3" height="7" rx="1" fill="@blue"/><rect x="26.4" y="14" width="3" height="7" rx="1" fill="@blue"/>` +
      `<rect x="5" y="9" width="22" height="17.5" rx="4" fill="@steel"/>` +
      `<circle cx="11.4" cy="16.4" r="2.8" fill="@teal"/><circle cx="20.6" cy="16.4" r="2.8" fill="@teal"/>` +
      `<circle cx="10.6" cy="15.6" r=".9" fill="#fff" ${N}/><circle cx="19.8" cy="15.6" r=".9" fill="#fff" ${N}/>` +
      `<rect x="11" y="21.4" width="10" height="2.6" rx="1" fill="#424c5b"/><path d="M13.5 21.4V24M16 21.4V24M18.5 21.4V24" stroke="#a9b5c4" stroke-width=".7"/>`],

    /* ---- money ---- */
    ['money-bag', '💰', 'Money bag',
      `<path d="M11 10c-4 3-7 8-7 12.5C4 27 8 29 16 29s12-2 12-6.5C28 18 25 13 21 10z" fill="@cream"/>` +
      `<path d="M12 9c-1-2-.2-4.4 1.4-5 1 .8 1.8.8 2.6 0s1.6-.8 2.6 0c1.6.6 2.4 3 1.4 5z" fill="@cream"/>` +
      `<rect x="10.6" y="8.6" width="10.8" height="2.4" rx="1.2" fill="@gold"/>` +
      `<path d="M19.5 16.5c-.6-1.2-2-1.8-3.5-1.8-2 0-3.4 1-3.4 2.4 0 3.4 7.2 1.8 7.2 5.4 0 1.4-1.6 2.5-3.8 2.5-1.6 0-3-.7-3.6-1.9M16 13v13.5" fill="none" stroke="#2f8a3a" stroke-width="1.8"/>`],
    ['money-wings', '💸', 'Money with wings',
      `<g transform="rotate(-10 16 16)"><path d="M9 13.5C6 10.6 3 10.4 1.6 11.6c.2 2 2 3.8 4.4 4.4-1.6.4-2.8 1.4-2.8 2.6 1.6.6 3.8.2 5.8-1.6z" fill="@paper"/>` +
      `<path d="M23 13.5c3-2.9 6-3.1 7.4-1.9-.2 2-2 3.8-4.4 4.4 1.6.4 2.8 1.4 2.8 2.6-1.6.6-3.8.2-5.8-1.6z" fill="@paper"/>` +
      `<rect x="8" y="10.5" width="16" height="11" rx="1.4" fill="@money"/><rect x="9.8" y="12.2" width="12.4" height="7.6" rx=".8" fill="none" stroke="#2f8a3a" stroke-width=".8"/>` +
      `<circle cx="16" cy="16" r="2.6" fill="#e6f8e0" stroke="#2f8a3a" stroke-width=".8"/></g>`],
    ['dollar', '💵', 'Dollar bill',
      `<rect x="4" y="7" width="26" height="14" rx="1.6" fill="#4fae52" transform="rotate(-8 17 14)"/>` +
      `<rect x="2.5" y="11" width="26" height="14" rx="1.6" fill="@money"/><rect x="4.6" y="13" width="21.8" height="10" rx="1" fill="none" stroke="#2f8a3a" stroke-width=".9"/>` +
      `<ellipse cx="15.5" cy="18" rx="3.4" ry="4" fill="#e6f8e0" stroke="#2f8a3a" stroke-width=".9"/>` +
      `<path d="M17 16.4c-.3-.6-1-1-1.6-1-.9 0-1.6.5-1.6 1.1 0 1.6 3.4.8 3.4 2.6 0 .7-.8 1.2-1.8 1.2-.8 0-1.4-.4-1.7-.9M15.5 14.6v6.8" fill="none" stroke="#2f8a3a" stroke-width="1"/>` +
      `<circle cx="7.4" cy="15.6" r="1" fill="#2f8a3a" ${N}/><circle cx="23.6" cy="20.4" r="1" fill="#2f8a3a" ${N}/>`],

    /* ---- objects & tools ---- */
    ['dice', '🎲', 'Dice',
      cube('#ff8f86', 'url(#gi-g-red)', '#b5241d',
        `<ellipse cx="16" cy="9.3" rx="1.9" ry="1" fill="#fff" ${N}/>` +
        `<circle cx="8" cy="14.4" r="1.3" fill="#fff" ${N}/><circle cx="12.6" cy="22.6" r="1.3" fill="#fff" ${N}/>` +
        `<circle cx="24.8" cy="13.2" r="1.2" fill="#fff" ${N}/><circle cx="21.75" cy="18.9" r="1.2" fill="#fff" ${N}/><circle cx="18.7" cy="24.6" r="1.2" fill="#fff" ${N}/>`)],
    ['party', '🎉', 'Party popper',
      dbl('M14.6 16.4c-.4-4.4 1.6-7.4 5.4-8.4', '#ec5f8f', 1.3) + dbl('M17 19c3.2-1.2 6.4-.4 8.4-3.4', '#3d8bfd', 1.3) +
      `<path d="M3 29.5l5.4-15.4 10 10z" fill="@yellow"/><path d="M5 24.4l3 3M6.6 19.8l5.8 5.8" stroke="#ff8a2a" stroke-width="1.6"/>` +
      `<ellipse cx="13.4" cy="19.1" rx="7.1" ry="1.8" transform="rotate(45 13.4 19.1)" fill="#e8a90c"/>` +
      `<rect x="20.4" y="3.4" width="2.4" height="2.4" fill="@red" transform="rotate(20 21.6 4.6)" stroke-width=".8"/>` +
      `<circle cx="27" cy="11" r="1.5" fill="@blue" stroke-width=".8"/><path d="M12.6 4.4l2.4.6-1.6 1.8z" fill="@green" stroke-width=".8"/>` +
      `<rect x="25" y="20.6" width="2.6" height="1.8" fill="@purple" transform="rotate(-25 26.3 21.5)" stroke-width=".8"/><circle cx="28.4" cy="4" r="1.2" fill="@yellow" stroke-width=".8"/>`],
    ['palette', '🎨', 'Palette',
      `<path d="M16 3C8.6 3 3 8.4 3 15.2 3 21.8 8.4 29 15.4 29c2.1 0 3.1-1.2 3.1-2.6 0-1.8-1.8-2.4-1.8-4 0-1.3 1-2.2 2.4-2.2h3.6C26.6 20.2 29 17 29 13.2 29 7.4 23.2 3 16 3z" fill="@cream"/>` +
      `<circle cx="9" cy="13.2" r="2.4" fill="@red"/><circle cx="12" cy="7.8" r="2.2" fill="@yellow"/><circle cx="18" cy="6.8" r="2.2" fill="@green"/>` +
      `<circle cx="23.4" cy="9.8" r="2.2" fill="@blue"/><circle cx="9.6" cy="20.4" r="2.2" fill="@purple"/>`],
    ['puzzle', '🧩', 'Puzzle piece',
      `<path d="M6 10a2 2 0 0 1 2-2h4.4a3.3 3.3 0 1 1 6.2 0H23a2 2 0 0 1 2 2v4.4a3.3 3.3 0 1 1 0 6.2V25a2 2 0 0 1-2 2H18.6a3.3 3.3 0 1 0-6.2 0H8a2 2 0 0 1-2-2v-4.4a3.3 3.3 0 1 0 0-6.2z" fill="@purple" transform="translate(-1.6 .8)"/>` +
      `<path d="M6 10.4c0-.6.5-1.2 1.2-1.2h3.6" stroke="#fff" stroke-width="1.3" opacity=".55" transform="translate(-1.6 .8)"/>`],
    ['bulb', '💡', 'Idea',
      `<path d="M16 2.5c-5.3 0-9.2 4-9.2 9 0 3.4 1.8 5.6 3.4 7.4 1 1.1 1.6 2.4 1.6 3.6h8.4c0-1.2.6-2.5 1.6-3.6 1.6-1.8 3.4-4 3.4-7.4 0-5-3.9-9-9.2-9z" fill="@ryellow"/>` +
      `<path d="M13.6 22.5v-5l1.2-2.6 1.2 2.6 1.2-2.6 1.2 2.6v5" fill="none" stroke="#d0560f" stroke-width="1.1"/>` +
      `<rect x="12" y="22.5" width="8" height="5.4" rx="1.2" fill="@steel"/><path d="M12 24.3h8M12 26.1h8" stroke="#6b788a" stroke-width=".8"/>` +
      `<path d="M14 27.9h4l-.6 1.6h-2.8z" fill="#5d6a7e"/><path d="M10 10.6a6.2 6.2 0 0 1 4-5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".7"/>`],
    ['telescope', '🔭', 'Telescope',
      dbl('M15.5 18.5L9.4 29.5M15.5 18.5L16 29.5M15.5 18.5l7 11', '#a9b5c4', 1.3) +
      `<g transform="rotate(-28 16 14)"><rect x="1.6" y="12" width="3.4" height="4" rx=".8" fill="@steel"/><rect x="4.4" y="10.5" width="18.6" height="7" rx="1.4" fill="@blue"/>` +
      `<rect x="12" y="10.5" width="1.6" height="7" fill="@gold" stroke-width=".8"/><rect x="22.4" y="9.4" width="4.6" height="9.2" rx="1.2" fill="@steel"/>` +
      `<rect x="6" y="11.6" width="14" height="1.4" rx=".7" ${hl(0.4)}/></g><circle cx="15.5" cy="18.5" r="1.6" fill="@steel"/>`],
    ['swords', '⚔', 'Crossed swords',
      [45, -45].map((r) => `<g transform="rotate(${r} 16 16)"><path d="M14.8 21V6L16 2.5 17.2 6v15z" fill="@steel"/><path d="M16 5v15.5" stroke="#6b788a" stroke-width=".7"/>` +
        `<rect x="10.8" y="20.6" width="10.4" height="2.4" rx="1.2" fill="@gold"/><rect x="15" y="23" width="2" height="4.6" fill="@wood"/><circle cx="16" cy="28.6" r="1.6" fill="@gold"/></g>`).join('')],
    ['scales', '⚖', 'Balance',
      dbl('M16 4v22', '#f6bd2f', 1.8) + dbl('M5.5 8h21', '#f6bd2f', 1.6) +
      `<path d="M5.5 8L2.6 17M5.5 8l2.9 9M26.5 8l-2.9 9M26.5 8l2.9 9" stroke="#a9b5c4" stroke-width=".9"/>` +
      `<path d="M1.6 17h7.8c0 2.4-1.8 4-3.9 4s-3.9-1.6-3.9-4zM22.6 17h7.8c0 2.4-1.8 4-3.9 4s-3.9-1.6-3.9-4z" fill="@gold"/>` +
      `<path d="M10 28.5c0-2 2.6-3 6-3s6 1 6 3z" fill="@gold"/><circle cx="16" cy="4" r="1.7" fill="@gold"/>`],
    ['scissors', '✂', 'Scissors',
      dbl('M16.8 18.2l3.6 4.4', '#ea4a40', 2.2) + dbl('M15.2 18.2l-3.6 4.4', '#ea4a40', 2.2) +
      `<circle cx="22" cy="25.4" r="3.6" fill="none" stroke="${O}" stroke-width="4.6"/><circle cx="22" cy="25.4" r="3.6" fill="none" stroke="#ea4a40" stroke-width="2.4"/>` +
      `<circle cx="10" cy="25.4" r="3.6" fill="none" stroke="${O}" stroke-width="4.6"/><circle cx="10" cy="25.4" r="3.6" fill="none" stroke="#ea4a40" stroke-width="2.4"/>` +
      `<path d="M8.6 2.4L18.8 17.2l-3.6 2.2z" fill="@steel"/><path d="M23.4 2.4L13.2 17.2l3.6 2.2z" fill="@steel"/><circle cx="16" cy="16.7" r="1.3" fill="@gold"/>`],
    ['hammer', '🔨', 'Hammer',
      `<g transform="rotate(40 16 16)"><rect x="14.6" y="10" width="2.8" height="20" rx="1.4" fill="@wood"/>` +
      `<path d="M7 5.5h14.5l3 1.6v3.8l-3 1.6H7a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" fill="@steel"/><rect x="7.4" y="6.6" width="13" height="1.4" rx=".7" ${hl(0.5)}/></g>`],
    ['writing', '✍', 'Signing',
      `<rect x="2.5" y="18" width="22" height="11" rx="1.6" fill="@paper"/>` +
      `<path d="M5.5 25c1.6-2.6 2.6-2.6 3 0s1.6 2.4 3-.4 2-2.4 2.6.2 1.4 1.4 2.6.2" fill="none" stroke="#3d8bfd" stroke-width="1.4"/>` +
      `<g transform="rotate(38 21 13)"><rect x="18.6" y="0" width="5" height="15" rx="2.5" fill="@purple"/><rect x="18.6" y="10.6" width="5" height="1.6" fill="@gold" ${N}/>` +
      `<path d="M18.6 15h5l-2.5 6.5z" fill="@gold"/><rect x="19.6" y="1.6" width="1.2" height="8" rx=".6" ${hl(0.45)}/></g>`],
    ['skis', '🎿', 'Skis',
      dbl('M5.4 9.6l9 17.4', '#a9b5c4', 1.1) + `<circle cx="13.6" cy="25.4" r="1.5" fill="@dark"/><path d="M4.4 7.6l2.2 4" stroke="${O}" stroke-width="2.6"/>` +
      `<g transform="rotate(-40 16 16)"><path d="M2 11.6h25.4c1.6 0 2.6-1.6 3.2-2.8.4 1.8.2 4.6-2.4 5.6H2a1.4 1.4 0 0 1 0-2.8z" fill="@red"/>` +
      `<path d="M2 17.6h25.4c1.6 0 2.6-1.6 3.2-2.8.4 1.8.2 4.6-2.4 5.6H2a1.4 1.4 0 0 1 0-2.8z" fill="@red"/>` +
      `<rect x="12.4" y="10.8" width="4.4" height="4.4" rx=".7" fill="@dark"/><rect x="12.4" y="16.8" width="4.4" height="4.4" rx=".7" fill="@dark"/>` +
      `<path d="M3 12.4h18M3 18.4h18" stroke="#fff" stroke-width=".8" opacity=".55"/></g>`],
    ['bow', '🏹', 'Bow & arrow',
      `<g transform="rotate(-40 16 16)">` + dbl('M11 3.5c8 3.6 8 21.4 0 25', '#b5733e', 2) +
      `<path d="M11 3.5v25" stroke="#e6ebf2" stroke-width=".8"/>` + dbl('M4 16h21', '#e0a874', 1.1) +
      `<path d="M24.6 13.4l4.8 2.6-4.8 2.6z" fill="@steel"/><path d="M2 13.4l3.6 2.6H2.6zM2 18.6l3.6-2.6H2.6z" fill="@red" stroke-width=".8"/></g>`],
    ['hourglass', '⏳', 'Hourglass',
      `<path d="M9 5.5h14c0 5-3.2 7.6-5.2 10.5 2 2.9 5.2 5.5 5.2 10.5H9c0-5 3.2-7.6 5.2-10.5C12.2 13.1 9 10.5 9 5.5z" fill="@ice"/>` +
      `<path d="M11.6 10h8.8c-.8 1.6-2.4 3-3.6 4.6h-1.6c-1.2-1.6-2.8-3-3.6-4.6z" fill="@sand" ${N}/><path d="M16 14.6v7" stroke="#d29a2a" stroke-width=".9"/>` +
      `<path d="M10.6 25c.6-2.2 2.8-3.6 5.4-3.6s4.8 1.4 5.4 3.6z" fill="@sand" ${N}/>` +
      `<rect x="6.5" y="3" width="19" height="3" rx="1.2" fill="@wood"/><rect x="6.5" y="26" width="19" height="3" rx="1.2" fill="@wood"/>` +
      `<path d="M11 7.6c.4 2.2 1.4 3.8 2.6 5.2" stroke="#fff" stroke-width="1.2" opacity=".8"/>`],
    ['clock', '🕰', 'Mantel clock',
      `<rect x="4" y="26" width="24" height="3" rx="1" fill="#7c4a22"/><path d="M6.5 26V14.5a9.5 9.5 0 0 1 19 0V26z" fill="@wood"/>` +
      `<circle cx="16" cy="14.5" r="6.8" fill="@cream"/><path d="M16 8.6v1.4M16 19v1.4M10.1 14.5h1.4M20.5 14.5h1.4" stroke="#7c4a22" stroke-width="1"/>` +
      `<path d="M16 14.5V10.4M16 14.5l3 1.6" stroke-width="1.4"/><rect x="13" y="22" width="6" height="3" rx=".8" fill="#7c4a22"/>`]
  ];

  /* ------------------------------ registry ----------------------------- */
  const BY_ID = {};
  const BY_EMOJI = {};
  const strip = (e) => String(e).replace(/️/g, '');
  const list = ICONS.map(([id, emoji, label, body]) => {
    BY_ID[id] = body;
    BY_EMOJI[strip(emoji)] = id;
    return { id, emoji, label };
  });
  const resolve = (name) => (BY_ID[name] ? name : BY_EMOJI[strip(name)] || null);
  const fillTokens = (s) => s.replace(/@([a-z0-9]+)/g, 'url(#gi-g-$1)');

  let spriteCache = null;
  function sprite() {
    if (spriteCache) return spriteCache;
    const symbols = ICONS.map(([id, , , body]) =>
      `<symbol id="gi-${id}" viewBox="0 0 32 32"><g stroke="${O}" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round">${fillTokens(body)}</g></symbol>`).join('');
    spriteCache = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">` +
      `<defs>${DEFS}</defs>${symbols}</svg>`;
    return spriteCache;
  }

  // Put the sprite in the page once (browsers only).
  function mount(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.getElementById('gi-sprite')) return;
    const host = doc.createElement('div');
    host.id = 'gi-sprite';
    host.innerHTML = sprite();
    (doc.body || doc.documentElement).insertBefore(host, (doc.body || doc.documentElement).firstChild);
  }

  // Inline markup for one icon. opts: { size (px or CSS length), cls, title }
  function svg(name, opts = {}) {
    const id = resolve(name);
    if (!id) return '';
    const size = opts.size != null ? (typeof opts.size === 'number' ? opts.size + 'px' : opts.size) : null;
    const style = size ? ` style="width:${size};height:${size}"` : '';
    const label = opts.title ? ` role="img" aria-label="${opts.title}"><title>${opts.title}</title` : ' aria-hidden="true"';
    return `<svg class="gi${opts.cls ? ' ' + opts.cls : ''}" viewBox="0 0 32 32"${style}${label}><use href="#gi-${id}"/></svg>`;
  }

  /* ------------------------------ painter ------------------------------ *
   * Emoji reach the screen from everywhere: screen templates, engine news
   * and inbox text, and strings already written into players' saves. Rather
   * than chase every string, the painter swaps each known emoji for its icon
   * as the DOM is drawn. Text-only places (dropdown options, tooltips, screen
   * reader labels, SVG chart text) can't hold an icon, so the emoji is simply
   * dropped there and the words stay.
   */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alternation = ICONS.map(([, emoji]) => strip(emoji))
    .sort((a, b) => b.length - a.length)
    .map((e) => Array.from(e).map(escRe).join('\\uFE0F?') + '\\uFE0F?')
    .join('|');
  const RE_TEST = new RegExp(`(?:${alternation})`, 'u');
  const RE_SPLIT = new RegExp(`(${alternation})`, 'u');
  const RE_STRIP = new RegExp(`\\s*(?:${alternation})\\s*`, 'gu');
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
  const TEXT_ONLY = new Set(['OPTION', 'OPTGROUP', 'TITLE']);
  const ATTRS = ['title', 'aria-label', 'placeholder', 'label'];

  // Remove emoji from plain text, keeping single spaces between the words.
  function stripEmoji(text) {
    return text.replace(RE_STRIP, (m, off, all) => {
      const atEdge = off === 0 || off + m.length === all.length;
      return atEdge || !/\s/.test(m) ? '' : ' ';
    });
  }

  function iconNode(doc, id) {
    const el = doc.createElementNS(SVG_NS, 'svg');
    el.setAttribute('class', 'gi');
    el.setAttribute('viewBox', '0 0 32 32');
    el.setAttribute('aria-hidden', 'true');
    const use = doc.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#gi-' + id);
    el.appendChild(use);
    return el;
  }

  function paintText(node) {
    const parent = node.parentNode;
    if (!parent || !RE_TEST.test(node.data)) return;
    if (SKIP.has(parent.nodeName)) return;
    if (TEXT_ONLY.has(parent.nodeName) || parent.namespaceURI === SVG_NS) {
      node.data = stripEmoji(node.data);
      return;
    }
    const doc = node.ownerDocument;
    const frag = doc.createDocumentFragment();
    node.data.split(RE_SPLIT).forEach((part, i) => {
      if (!part) return;
      if (i % 2) frag.appendChild(iconNode(doc, BY_EMOJI[strip(part)]));
      else frag.appendChild(doc.createTextNode(part));
    });
    parent.replaceChild(frag, node);
  }

  function paintAttrs(el) {
    ATTRS.forEach((a) => {
      const v = el.getAttribute(a);
      if (v && RE_TEST.test(v)) el.setAttribute(a, stripEmoji(v));
    });
  }

  // Swap every known emoji under (and including) a node.
  function paint(root) {
    if (!root) return;
    if (root.nodeType === 3) { paintText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      if (SKIP.has(root.nodeName)) return;
      paintAttrs(root);
    }
    root.querySelectorAll('[title],[aria-label],[placeholder],optgroup[label]').forEach(paintAttrs);
    if (!RE_TEST.test(root.textContent || '')) return;
    const doc = root.ownerDocument || root;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    const hits = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (RE_TEST.test(n.data)) hits.push(n);
    hits.forEach(paintText);
  }

  let observer = null;
  function start(doc) {
    doc = doc || document;
    mount(doc);
    if (doc.title && RE_TEST.test(doc.title)) doc.title = stripEmoji(doc.title);
    paint(doc.body);
    if (observer || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === 'childList') m.addedNodes.forEach(paint);
        else if (m.type === 'characterData') paintText(m.target);
        else if (m.type === 'attributes') paintAttrs(m.target);
      });
    });
    observer.observe(doc.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  XCD.icons = { list, svg, sprite, mount, resolve, has: (n) => !!resolve(n), paint, start, stripEmoji };
  if (XCD.ui) XCD.ui.icon = svg;
  if (typeof module !== 'undefined' && module.exports) module.exports = XCD.icons;

  // In the game: paint the page now and keep painting as screens render.
  if (typeof document !== 'undefined' && document.documentElement) {
    if (document.body) start(document);
    else document.addEventListener('DOMContentLoaded', () => start(document));
  }
})(typeof window !== 'undefined' ? window : globalThis);
