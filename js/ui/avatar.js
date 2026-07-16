/*
 * Avatar system (Update 12): every athlete, recruit, and coach in the game
 * is a little person, not an emoji. Avatars are simple SVG busts — skin
 * tone, hair color, hair style, and (for men) beard style — rendered
 * deterministically from identity, so the same person always wears the
 * same face on every screen, forever, without storing anything.
 *
 * Appearance aligns with who the person is:
 *   - gender decides the silhouette and hair-style set (women never get
 *     beards; men never get ponytails/buns),
 *   - heritage (country of origin, or surname for US-born athletes)
 *     weights the skin-tone distribution so a Kenyan recruit or an
 *     athlete named Okafor reads correctly, and hair color follows skin,
 *   - coaches wear a blazer and tie; athletes wear their racing singlet.
 *
 * A player-created coach carries an explicit `appearance` object (built
 * in the creation wizard); everyone else derives theirs from a hash.
 */
(function () {
  const UI = window.XCD.ui;

  // Light → dark. Indexes are what appearance objects store.
  const SKIN_TONES = ['#F7D9C4', '#F0C8A6', '#E3B58A', '#D19E6A', '#B97F4E', '#9C6438', '#7C4A26', '#5D3319'];
  // Blonde → black, then gray for the veteran coaches.
  const HAIR_COLORS = ['#E7CE8C', '#CBA45D', '#B0562B', '#8B5A2B', '#6E4526', '#4B3120', '#1F1B18', '#9C9C9C'];
  const HAIR_STYLE_COUNT = 8;
  const BEARD_STYLE_COUNT = 8;
  const SUIT_COLORS = ['#3A4149', '#2E3A4E', '#4A3F35', '#37424A', '#252C36', '#503A3A'];
  const JERSEY_COLORS = ['#3d8bfd', '#e5534b', '#34c98e', '#e8b339', '#9b6ef3', '#eb7a34', '#2ab7c9', '#d4507a'];

  /* Deterministic 32-bit hash of a string (FNV-1a). */
  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  // n independent-ish values in [0,1) from one hash.
  function rolls(seed, n) {
    const out = [];
    let h = seed;
    for (let i = 0; i < n; i++) {
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
      h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
      h ^= h >>> 15;
      out.push((h >>> 0) / 0x100000000);
    }
    return out;
  }

  function pickWeighted(weights, r) {
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    const target = r * total;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (target < acc) return i;
    }
    return weights.length - 1;
  }

  /* Skin-tone weights (indexes 0-7, light → dark) per heritage group. */
  const SKIN_WEIGHTS = {
    eastafrican: [0, 0, 0, 1, 4, 10, 12, 8],
    african:     [0, 0, 1, 2, 5, 10, 10, 6],
    hispanic:    [2, 6, 10, 10, 6, 2, 0, 0],
    eastasian:   [4, 10, 8, 3, 0, 0, 0, 0],
    nordic:      [12, 10, 4, 1, 0, 0, 0, 0],
    anglo:       [10, 10, 5, 2, 1, 1, 0.5, 0.3],
    mixed:       [7, 8, 5, 3, 3, 3.5, 3, 2]
  };

  /*
   * Derive a deterministic appearance for any person-shaped object:
   * a live Athlete/Recruit/Coach, a registry record, or just
   * { name, gender }. An explicit `appearance` on the object wins.
   */
  UI.appearanceFor = function (person, opts = {}) {
    if (!person) return { gender: 'M', skin: 2, hair: 5, hairStyle: 2, beard: 0 };
    if (person.appearance && person.appearance.skin !== undefined) {
      return Object.assign({ gender: person.gender || 'M' }, person.appearance);
    }
    const D = window.XCD.data;
    const first = person.firstName || String(person.name || '').split(' ')[0] || '';
    const last = person.lastName || String(person.name || '').split(' ').slice(1).join(' ') || '';
    let gender = person.gender;
    if (gender !== 'M' && gender !== 'W') {
      gender = (D.FIRST_NAMES_W || []).includes(first) ? 'W' : 'M';
      // International women's pools too — a Faith Chebet is a woman.
      if (gender === 'M' && D.NAME_POOLS) {
        for (const pool of Object.values(D.NAME_POOLS)) {
          if (pool.W.includes(first)) { gender = 'W'; break; }
        }
      }
    }
    const heritage = D.heritageOf ? D.heritageOf(last, person.country) : 'mixed';
    // Seed from the NAME, not the entity id: historical records (alumni,
    // Hall of Fame, coach registry) don't carry live ids, and a person must
    // wear the same face on their profile before and after retirement.
    const seed = hashStr(first + '|' + last + '|' + gender);
    const [r1, r2, r3, r4, r5] = rolls(seed, 5);

    const skin = pickWeighted(SKIN_WEIGHTS[heritage] || SKIN_WEIGHTS.mixed, r1);
    // Hair follows heritage and skin: East Asian, African, and Hispanic
    // heritage means dark hair; light-skinned northern Europeans span the
    // blonde-to-brown range. Older coaches gray out.
    let hair;
    if ((person.age || 0) >= 58 && r5 < 0.75) hair = 7;
    else if (heritage === 'eastasian' || heritage === 'eastafrican' || heritage === 'african') hair = r2 < 0.85 ? 6 : 5;
    else if (heritage === 'hispanic') hair = pickWeighted([0, 0, 0.5, 1.5, 3, 5, 5, 0], r2);
    else if (skin >= 5) hair = r2 < 0.85 ? 6 : 5;
    else if (skin >= 3) hair = pickWeighted([0, 0.5, 1, 2, 4, 6, 6, 0], r2);
    else hair = pickWeighted([3, 3, 2, 4, 4, 3, 2, 0], r2);

    const hairStyle = Math.floor(r3 * HAIR_STYLE_COUNT);
    // ~half of men are clean-shaven; the rest span stubble to full beard.
    const beard = gender === 'M' ? (r4 < 0.48 ? 0 : 1 + Math.floor((r4 - 0.48) / 0.52 * (BEARD_STYLE_COUNT - 1))) : 0;

    return { gender, skin, hair, hairStyle, beard, _seed: seed };
  };

  /* ---------------- Hair geometry ---------------- */
  // Head: ellipse at (32,25), rx 10.5, ry 11.5. Shoulders start y≈40.
  function hairBack(app, color) {
    const s = app.hairStyle;
    if (app.gender === 'W') {
      if (s === 1) return `<path fill="${color}" d="M20 21 C20 12 26 9 32 9 C38 9 44 12 44 21 L44 34 C44 37 41 38 39 37.5 L39 24 L25 24 L25 37.5 C23 38 20 37 20 34 Z"/>`; // bob
      if (s === 2) return `<path fill="${color}" d="M20 21 C20 11.5 26 8.5 32 8.5 C38 8.5 44 11.5 44 21 L44.5 42 C44.5 45 40 45.5 39 43 L38.5 24 L25.5 24 L25 43 C24 45.5 19.5 45 19.5 42 Z"/>`; // shoulder
      if (s === 4) return `<path fill="${color}" d="M40 14 C48 16 49 30 44 44 C42.5 48 38.5 47 39.5 43 C42.5 33 42 22 38 18 Z"/>`; // ponytail tail
      if (s === 6 || s === 7) return `<path fill="${color}" d="M19.5 21 C19.5 11 26 8 32 8 C38 8 44.5 11 44.5 21 L45.5 48 C45.5 51.5 40.5 52 39.5 48.5 L39 24 L25 24 L24.5 48.5 C23.5 52 18.5 51.5 18.5 48 Z"/>`; // long / braids
    } else if (s === 7) {
      return `<path fill="${color}" d="M20.5 21 C20.5 11.5 26 8.5 32 8.5 C38 8.5 43.5 11.5 43.5 21 L44 38 C44 41 40.5 41.5 40 38.5 L39.5 24 L24.5 24 L24 38.5 C23.5 41.5 20 41 20 38 Z"/>`; // long flow
    }
    return '';
  }

  function hairFront(app, color) {
    // The head is an ellipse at (32,25) with its crown at y≈13.5 — every
    // front-hair path starts around y≈11 so the hair hugs the skull rather
    // than floating above it.
    const s = app.hairStyle;
    if (app.gender === 'W') {
      // Every women's style shares a soft crown; variants add shape on top.
      const crown = `<path fill="${color}" d="M21 25 C20.6 13.5 26.5 10.5 32 10.5 C37.5 10.5 43.4 13.5 43 25 C41.5 17.8 37.5 15.8 32 15.8 C26.5 15.8 22.5 17.8 21 25 Z"/>`;
      if (s === 0) return `<path fill="${color}" d="M21 24 C20.4 13 27 10 32 10 C37 10 43.6 13 43 24 C40 17 36 15.4 32 15.8 C27 16.3 23 18 21 24 Z"/>`; // pixie
      if (s === 3) return `<circle fill="${color}" cx="32" cy="16.5" r="11.8"/><path fill="${color}" d="M20.5 19 C20.5 25 21.5 28 23 30 L23 21 Z M43.5 19 C43.5 25 42.5 28 41 30 L41 21 Z"/>`; // curly
      if (s === 5) return crown + `<circle fill="${color}" cx="32" cy="9.5" r="4.6"/>`; // bun
      if (s === 7) return crown + `<path stroke="${color}" stroke-width="1.6" fill="none" d="M24.5 24 L24 46 M28 25 L27.5 47 M36 25 L36.5 47 M39.5 24 L40 46"/>`; // braids
      return crown;
    }
    // Men
    if (s === 0) return ''; // bald
    if (s === 1) return `<path fill="${color}" opacity="0.45" d="M21.7 23 C22 14.8 26.5 11.5 32 11.5 C37.5 11.5 42 14.8 42.3 23 C40.2 17 36.8 15.2 32 15.2 C27.2 15.2 23.8 17 21.7 23 Z"/>`; // buzz
    if (s === 2) return `<path fill="${color}" d="M21.7 23 C22 14.4 26.5 11.3 32 11.3 C37.5 11.3 42 14.4 42.3 23 C40.2 16.8 36.8 15 32 15 C27.2 15 23.8 16.8 21.7 23 Z"/>`; // short
    if (s === 3) return `<path fill="${color}" d="M21.5 24.5 C21.3 13.6 26.5 10.7 32 10.7 C37.5 10.7 42.7 13.6 42.5 24.5 C41 17.4 37.3 15.3 32 15.3 C26.7 15.3 23 17.4 21.5 24.5 Z"/>`; // crew
    if (s === 4) return `<path fill="${color}" d="M21.5 23.5 C21.5 13.4 27 10.7 32 10.7 C38 10.7 42.7 13.3 42.7 19.5 C37.6 16.5 29.6 16.2 25.5 18.5 C23.5 19.8 22 21.4 21.5 23.5 Z"/>`; // side part
    if (s === 5) return `<circle fill="${color}" cx="32" cy="15.5" r="11.8"/><path fill="${color}" d="M20.5 18 C20.5 23 21.5 26 23 28 L23 19 Z M43.5 18 C43.5 23 42.5 26 41 28 L41 19 Z"/>`; // curly / afro
    if (s === 6) return `<path fill="${color}" d="M21.3 24 C21 13 27 10.4 32 10.4 C37 10.4 43 13 42.7 24 C41.8 20 40.3 18.5 39.3 19.6 C37.8 17 35.8 16.4 34.3 17.4 C32.3 15.4 29.7 15.4 28.2 17.4 C26.2 16.4 24.2 17.6 23.7 19.6 C22.7 18.6 21.9 20.5 21.3 24 Z"/>`; // messy
    if (s === 7) return `<path fill="${color}" d="M21.2 23 C20.8 12.4 26.5 10 32 10 C37.5 10 43.2 12.4 42.8 23 C41 17.2 37.5 15.4 32 15.4 C26.5 15.4 23 17.2 21.2 23 Z"/>`; // long (front)
    return '';
  }

  function beardPath(app, color) {
    if (app.gender !== 'M' || !app.beard) return '';
    const b = app.beard;
    if (b === 1) return `<path fill="${color}" opacity="0.4" d="M22.5 25 C22.5 33.5 26 37.5 32 37.5 C38 37.5 41.5 33.5 41.5 25 C41.5 31 38 33.2 32 33.2 C26 33.2 22.5 31 22.5 25 Z"/>`; // stubble
    if (b === 2) return `<path fill="${color}" d="M26.5 30.2 C28.5 29 30 29.6 32 29.6 C34 29.6 35.5 29 37.5 30.2 C35.5 31.8 33.8 31.4 32 31.4 C30.2 31.4 28.5 31.8 26.5 30.2 Z"/>`; // mustache
    if (b === 3) return `<path fill="${color}" d="M28.5 33 C30.5 34 33.5 34 35.5 33 C35.5 36.5 34 38 32 38 C30 38 28.5 36.5 28.5 33 Z"/>`; // goatee
    if (b === 4) return `<path fill="${color}" d="M22.5 24 C22.5 33.5 26.5 37.8 32 37.8 C37.5 37.8 41.5 33.5 41.5 24 C41.5 31.5 38 34 32 34 C26 34 22.5 31.5 22.5 24 Z"/>`; // short beard
    if (b === 5) return `<path fill="${color}" d="M22 23.5 C22 34.5 26 39.5 32 39.5 C38 39.5 42 34.5 42 23.5 C42 30.5 38.5 32.8 32 32.8 C25.5 32.8 22 30.5 22 23.5 Z M26.8 30 C28.8 29 30.2 29.6 32 29.6 C33.8 29.6 35.2 29 37.2 30 C35.2 31.5 33.6 31.2 32 31.2 C30.4 31.2 28.8 31.5 26.8 30 Z"/>`; // full beard + mustache
    if (b === 6) return `<path fill="${color}" d="M21.8 22.5 C21.8 36 25.5 42 32 42 C38.5 42 42.2 36 42.2 22.5 C42.2 30 38.5 32.4 32 32.4 C25.5 32.4 21.8 30 21.8 22.5 Z M26.6 29.8 C28.6 28.8 30.2 29.4 32 29.4 C33.8 29.4 35.4 28.8 37.4 29.8 C35.4 31.4 33.6 31 32 31 C30.4 31 28.6 31.4 26.6 29.8 Z"/>`; // thick beard
    return `<path fill="${color}" d="M21.5 22 C21 37.5 25 45 32 45 C39 45 43 37.5 42.5 22 C42.5 30 38.5 32.2 32 32.2 C25.5 32.2 21.5 30 21.5 22 Z M26.4 29.6 C28.4 28.6 30.2 29.2 32 29.2 C33.8 29.2 35.6 28.6 37.6 29.6 C35.6 31.2 33.6 30.8 32 30.8 C30.4 30.8 28.4 31.2 26.4 29.6 Z"/>`; // bushy
  }

  function outfitSvg(app, kind, seed) {
    if (kind === 'suit') {
      const suit = SUIT_COLORS[(seed >>> 6) % SUIT_COLORS.length];
      return `
        <path fill="${suit}" d="M8.5 64 C10 47 19 40.5 32 40.5 C45 40.5 54 47 55.5 64 Z"/>
        <path fill="#F4F6F8" d="M32 41 L26.2 45.5 L32 57 L37.8 45.5 Z"/>
        <path fill="#9aa7b8" d="M32 45 L30.4 47.6 L32 55.5 L33.6 47.6 Z"/>
        <path fill="${shade(suit, -18)}" d="M26.2 42 L32 41 L28.5 49.5 L23.5 44.5 Z M37.8 42 L32 41 L35.5 49.5 L40.5 44.5 Z"/>`;
    }
    // Racing singlet: skin shoulders with a colored tank over them.
    const jersey = app.jersey || JERSEY_COLORS[(seed >>> 9) % JERSEY_COLORS.length];
    const skin = SKIN_TONES[app.skin];
    return `
      <path fill="${skin}" d="M10 64 C11.5 48 20 41 32 41 C44 41 52.5 48 54 64 Z"/>
      <path fill="${jersey}" d="M13.5 64 C14.5 51 21 44.5 26 43.5 L28 47.5 L32 45.5 L36 47.5 L38 43.5 C43 44.5 49.5 51 50.5 64 Z"/>`;
  }

  // Lighten/darken a #rrggbb color by `amt`.
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, v + amt));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /*
   * Render an appearance as an SVG bust.
   *   opts.outfit  'jersey' (default) | 'suit'
   *   opts.size    pixel size (default 24)
   *   opts.round   circular crop with a subtle backdrop (default true)
   */
  UI.avatarSvg = function (app, opts = {}) {
    const size = opts.size || 24;
    const outfit = opts.outfit || 'jersey';
    const skin = SKIN_TONES[Math.max(0, Math.min(SKIN_TONES.length - 1, app.skin || 0))];
    const hairC = HAIR_COLORS[Math.max(0, Math.min(HAIR_COLORS.length - 1, app.hair || 0))];
    const seed = app._seed !== undefined ? app._seed : hashStr(JSON.stringify([app.skin, app.hair, app.hairStyle, app.beard]));
    const round = opts.round !== false;
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"
      style="display:inline-block; vertical-align:middle; flex:none; ${round ? 'border-radius:50%; background:var(--bg-hover, #232b37);' : ''}">
      ${hairBack(app, hairC)}
      <rect x="27.5" y="31" width="9" height="10" rx="3" fill="${shade(skin, -14)}"/>
      <ellipse cx="32" cy="25" rx="10.5" ry="11.5" fill="${skin}"/>
      <ellipse cx="21.7" cy="25.5" rx="1.8" ry="2.6" fill="${skin}"/>
      <ellipse cx="42.3" cy="25.5" rx="1.8" ry="2.6" fill="${skin}"/>
      ${beardPath(app, hairC)}
      ${hairFront(app, hairC)}
      ${outfitSvg(app, outfit, seed)}
    </svg>`;
  };

  /*
   * The one-call helper used across the UI: derive (or read) the person's
   * appearance and render it. `person` may be a live entity, a historical
   * record, or { name, gender }.
   */
  UI.avatar = function (person, opts = {}) {
    const app = UI.appearanceFor(person, opts);
    const outfit = opts.outfit || ((person && (person.role === 'Head' || person.role === 'Assistant' ||
      person.coachAccolades || person.careerRecord)) ? 'suit' : 'jersey');
    return UI.avatarSvg(app, Object.assign({}, opts, { outfit }));
  };

  UI.AVATAR = {
    SKIN_TONES, HAIR_COLORS, HAIR_STYLE_COUNT, BEARD_STYLE_COUNT,
    hashStr
  };
})();
