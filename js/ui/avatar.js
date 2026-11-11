/*
 * Avatar system (Update 12): every athlete, recruit, and coach in the game
 * is a little person, not an emoji. Avatars are illustrated SVG busts in the
 * same style as the game's icon set — skin tone, hair color, hair style,
 * a real face, and (for men) beard style — rendered
 * deterministically from identity, so the same person always wears the
 * same face on every screen, forever, without storing anything.
 *
 * Appearance aligns with who the person is:
 *   - gender decides the silhouette and hair-style set (women never get
 *     beards; men never get ponytails/buns),
 *   - heritage (country of origin, or surname for US-born athletes)
 *     weights the skin-tone distribution so a Kenyan recruit or an
 *     athlete named Okafor reads correctly, and hair color follows skin,
 *   - coaches wear a coaching polo (Update 13); athletes wear their
 *     racing singlet, with straps that go up and over the shoulders.
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
  // Outfit palettes are deliberately bright (Update 13): the UI background
  // is dark navy/charcoal (#0e1116–#2a3341), so no polo or singlet color may
  // sit in that range — a shirt that blends into the page reads as a bug.
  const POLO_COLORS = ['#e5534b', '#3d8bfd', '#34c98e', '#e8b339', '#9b6ef3', '#eb7a34', '#2ab7c9', '#d4507a', '#f2f5f8', '#8fd14f'];
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
      return Object.assign({ gender: person.gender || 'M', aged: (person.age || 0) >= 52 }, person.appearance);
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
    const [r1, r2, r3, r4, r5, r6] = rolls(seed, 6);

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

    // About one person in nine wears glasses; coaches past 52 show their years.
    return { gender, skin, hair, hairStyle, beard, glasses: r6 < 0.11, aged: (person.age || 0) >= 52, _seed: seed };
  };

  /* ---------------- Drawing ----------------
   * Avatars are drawn in the same illustrated style as the game's icon set
   * (js/ui/icons.js): flat, saturated shapes with a soft ink outline, a
   * touch of shading, and a real face — eyes, brows, nose and mouth — so a
   * person reads as a person at 20px and at 130px alike. The ink outline is
   * also what keeps hair visible against a matching skin tone and a dark
   * team kit visible against the backdrop.
   *
   * Geometry (64×64 grid): head = ellipse at (32,25), rx 10.5, ry 11.5;
   * shoulders start at y≈40.
   */
  const INK = '#1b2433';
  const OUT = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;
  const THIN = `stroke="${INK}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"`;

  // Everything that sits BEHIND the head and neck: long styles are drawn as
  // one full silhouette (the head and neck cover its middle), so hair never
  // hangs as detached strips beside the neck.
  function hairBack(app, color) {
    const s = app.hairStyle;
    const hi = shade(color, 26);
    if (app.gender === 'W') {
      if (s === 1) return `<path fill="${color}" ${OUT} d="M19.6 22 C19.2 11.5 26 8.6 32 8.6 C38 8.6 44.8 11.5 44.4 22 L44.6 34 C44.6 37.4 41.6 38.6 39.2 37.8 L24.8 37.8 C22.4 38.6 19.4 37.4 19.4 34 Z"/>`; // bob
      if (s === 2) return `<path fill="${color}" ${OUT} d="M19.4 22 C19 11.2 26 8.4 32 8.4 C38 8.4 45 11.2 44.6 22 L45.6 42.5 C45.8 45.6 42 46.6 40 44.6 L24 44.6 C22 46.6 18.2 45.6 18.4 42.5 Z"/>`; // shoulder length
      if (s === 4) return `<path fill="${color}" ${OUT} d="M39.5 13 C47.5 13.5 50.5 22 48.6 32 C47.6 37.4 46 42 44.6 45.2 C43.6 47.6 40.4 46.6 41 44 C42.6 37 43.4 30.5 42 24 Z"/>
        <path fill="none" stroke="${hi}" stroke-width="1" stroke-linecap="round" d="M45.6 21 C46.8 27 46.2 34 44.6 40"/>`; // ponytail
      if (s === 6) return `<path fill="${color}" ${OUT} d="M19.2 22 C18.8 10.8 26 8 32 8 C38 8 45.2 10.8 44.8 22 L46.6 49 C46.8 52.4 42.4 53.2 40.6 51 L23.4 51 C21.6 53.2 17.2 52.4 17.4 49 Z"/>`; // long
      if (s === 7) return `<path fill="${color}" ${OUT} d="M19.4 22 C19 11 26 8.2 32 8.2 C38 8.2 45 11 44.6 22 L44.4 30 L19.6 30 Z"/>
        <path fill="${color}" ${OUT} d="M18.2 28 C16.2 34 16.6 41 17.6 47.5 C18 50.4 22.2 50.4 22.4 47.5 C22.8 41 23 34.5 22.6 28 Z"/>
        <path fill="${color}" ${OUT} d="M45.8 28 C47.8 34 47.4 41 46.4 47.5 C46 50.4 41.8 50.4 41.6 47.5 C41.2 41 41 34.5 41.4 28 Z"/>
        <path fill="none" stroke="${shade(color, -30)}" stroke-width="0.9" stroke-linecap="round" d="M17.6 33 L22.6 35 M17.3 38 L22.6 40 M17.5 43 L22.4 45 M46.4 33 L41.4 35 M46.7 38 L41.4 40 M46.5 43 L41.6 45"/>`; // braids
    } else if (s === 7) {
      return `<path fill="${color}" ${OUT} d="M20 22 C19.6 11.4 26 8.6 32 8.6 C38 8.6 44.4 11.4 44 22 L44.8 38.5 C45 41.6 41.6 42.4 40 40.6 L24 40.6 C22.4 42.4 19 41.6 19.2 38.5 Z"/>`; // long flow
    }
    return '';
  }

  function hairFront(app, color) {
    // The crown of the head is at y≈13.5 — every front-hair shape starts
    // around y≈11 so the hair hugs the skull rather than floating above it,
    // and its lower edge is the hairline (never below y≈19 over the face).
    const s = app.hairStyle;
    const hi = shade(color, 28);
    const shine = (d) => `<path fill="none" stroke="${hi}" stroke-width="1.1" stroke-linecap="round" opacity="0.85" d="${d}"/>`;
    if (app.gender === 'W') {
      const crown = `<path fill="${color}" ${OUT} d="M21 25.4 C20.2 13.2 26.5 9.9 32 9.9 C37.5 9.9 43.8 13.2 43 25.4 C41.6 18.4 37.6 16.3 32 16.3 C26.4 16.3 22.4 18.4 21 25.4 Z"/>`;
      const gloss = shine('M25.4 13.6 C27.6 12 30.4 11.5 33 11.8');
      if (s === 0) return `<path fill="${color}" ${OUT} d="M21 24.6 C20.2 12.8 27 9.4 32 9.4 C37.2 9.4 43.8 12.6 43 24.6 C41.2 19.4 38.8 17 36 16.4 C31 15.4 25 16.6 21 24.6 Z"/>${gloss}`; // pixie
      if (s === 3) return `<path fill="${color}" ${OUT} d="M19.6 25 C16.2 21.6 16.8 16.4 19.8 14.2 C19.6 10.2 23.2 7.4 26.6 8.2 C28.6 5.6 33.2 5.2 35.6 7.6 C39.4 6.4 43.6 9 43.8 13 C47.4 15 48 21.4 44.4 25 C43.6 19.2 39.6 16.2 32 16.2 C24.4 16.2 20.4 19.2 19.6 25 Z"/>${shine('M24.6 11.6 C26.4 10 28.8 9.6 30.6 10.2')}`; // curly
      if (s === 5) return `<circle fill="${color}" ${OUT} cx="32" cy="8.6" r="4.4"/>${crown}${gloss}`; // bun
      return crown + gloss; // bob / shoulder / ponytail / long / braids share the crown
    }
    // Men
    if (s === 0) return ''; // bald
    if (s === 1) return `<path fill="${mix(color, SKIN_TONES[app.skin] || SKIN_TONES[2], 0.45)}" ${THIN} d="M21.6 23.4 C21.6 14.6 26.4 11.4 32 11.4 C37.6 11.4 42.4 14.6 42.4 23.4 C40.4 17.6 36.8 15.8 32 15.8 C27.2 15.8 23.6 17.6 21.6 23.4 Z"/>`; // buzz
    if (s === 2) return `<path fill="${color}" ${OUT} d="M21.4 23.6 C21.2 14 26.4 10.8 32 10.8 C37.6 10.8 42.8 14 42.6 23.6 C40.6 17.6 37 15.6 32 15.6 C27 15.6 23.4 17.6 21.4 23.6 Z"/>${shine('M26 13.4 C28 12.2 30.4 11.9 32.6 12.2')}`; // short
    if (s === 3) return `<path fill="${color}" ${OUT} d="M21.2 24.8 C20.6 13 26.4 9.8 32 9.8 C37.6 9.8 43.4 13 42.8 24.8 C41.4 18 37.4 15.8 32 15.8 C26.6 15.8 22.6 18 21.2 24.8 Z"/>${shine('M25.6 13 C27.8 11.4 30.6 10.9 33 11.2')}`; // crew
    if (s === 4) return `<path fill="${color}" ${OUT} d="M21.2 24 C20.8 13 26.8 9.8 32 9.8 C38.4 9.8 43.2 12.8 43 20.4 C38 16.8 30 16.4 25.6 18.8 C23.4 20 21.8 21.8 21.2 24 Z"/>${shine('M27 12.8 C30 11.4 34 11.4 37 12.6')}`; // side part
    if (s === 5) return `<path fill="${color}" ${OUT} d="M19.4 26 C15.6 22.4 16.2 16.6 19.4 14 C19.4 9.6 23.6 6.6 27.2 7.6 C29.4 4.6 34.6 4.6 36.8 7.6 C40.4 6.6 44.6 9.6 44.6 14 C47.8 16.6 48.4 22.4 44.6 26 C43.8 19.4 39.8 16 32 16 C24.2 16 20.2 19.4 19.4 26 Z"/>${shine('M24.4 11.4 C26.2 9.6 28.6 9.2 30.6 9.8')}`; // curly / afro
    if (s === 6) return `<path fill="${color}" ${OUT} d="M21 24.4 C19.8 16.4 22.4 12 25.2 11.6 C25.6 9 28.6 8 30.4 9.8 C32 7.6 35.4 8 36.2 10.4 C38.8 9.4 41.4 11.4 41 14 C43.6 15.6 43.8 20 43 24.4 C42.2 20.4 40.6 18.8 39.4 19.8 C38 17.2 36 16.6 34.4 17.6 C32.4 15.6 29.6 15.6 28 17.6 C26 16.6 24 17.8 23.6 19.8 C22.4 18.8 21.6 20.8 21 24.4 Z"/>`; // messy
    if (s === 7) return `<path fill="${color}" ${OUT} d="M20.8 24 C20 12.4 26.4 9.4 32 9.4 C37.6 9.4 44 12.4 43.2 24 C41.4 17.8 37.6 15.8 32 15.8 C26.4 15.8 22.6 17.8 20.8 24 Z"/>${shine('M25.6 13 C27.8 11.4 30.6 10.9 33 11.2')}`; // long (front)
    return '';
  }

  function beardPath(app, color) {
    if (app.gender !== 'M' || !app.beard) return '';
    const b = app.beard;
    const stache = (y) => `<path fill="${color}" ${THIN} d="M26.6 ${y} C28.4 ${y - 1.2} 30.2 ${y - 0.6} 32 ${y - 0.6} C33.8 ${y - 0.6} 35.6 ${y - 1.2} 37.4 ${y} C35.6 ${y + 1.7} 33.6 ${y + 1.3} 32 ${y + 1.3} C30.4 ${y + 1.3} 28.4 ${y + 1.7} 26.6 ${y} Z"/>`;
    if (b === 1) return `<path fill="${color}" opacity="0.30" d="M22 26.5 C22.4 33.2 26.2 36.4 32 36.4 C37.8 36.4 41.6 33.2 42 26.5 C41 30.8 37.6 32.6 32 32.6 C26.4 32.6 23 30.8 22 26.5 Z"/>`; // stubble (a shadow inside the jaw)
    if (b === 2) return stache(30.4); // mustache
    if (b === 3) return `<path fill="${color}" ${THIN} d="M28.4 33.4 C30.4 34.4 33.6 34.4 35.6 33.4 C35.8 36.8 34.2 38.6 32 38.6 C29.8 38.6 28.2 36.8 28.4 33.4 Z"/>`; // goatee
    if (b === 4) return `<path fill="${color}" ${OUT} d="M21.8 25.5 C22 34 26.4 38.2 32 38.2 C37.6 38.2 42 34 42.2 25.5 C41.4 31.6 37.8 34 32 34 C26.2 34 22.6 31.6 21.8 25.5 Z"/>`; // short beard
    if (b === 5) return `<path fill="${color}" ${OUT} d="M21.6 25 C21.6 35 26 40 32 40 C38 40 42.4 35 42.4 25 C41.8 31 38.4 33.4 32 33.4 C25.6 33.4 22.2 31 21.6 25 Z"/>${stache(30.2)}`; // full beard + mustache
    if (b === 6) return `<path fill="${color}" ${OUT} d="M21.4 24.5 C21.2 36.6 25.6 42.4 32 42.4 C38.4 42.4 42.8 36.6 42.6 24.5 C42 30.6 38.4 33 32 33 C25.6 33 22 30.6 21.4 24.5 Z"/>${stache(30)}`; // thick beard
    return `<path fill="${color}" ${OUT} d="M21.2 24 C20.6 38 25 45.4 32 45.4 C39 45.4 43.4 38 42.8 24 C42.2 30.6 38.6 32.8 32 32.8 C25.4 32.8 21.8 30.6 21.2 24 Z"/>${stache(29.8)}`; // bushy
  }

  // Eyes, brows, nose, mouth — and glasses for those who wear them.
  function faceSvg(app, skin, hairC) {
    const w = app.gender === 'W';
    const dark = shade(skin, -46);
    const brow = mix(hairC, INK, app.hair === 7 ? 0.25 : 0.45);
    const ey = 25.6;
    const eye = (x) => `<ellipse cx="${x}" cy="${ey}" rx="${w ? 1.5 : 1.4}" ry="${w ? 2 : 1.85}" fill="${INK}"/><circle cx="${x + 0.5}" cy="${ey - 0.75}" r="0.42" fill="#fff"/>`;
    const lash = w ? `<path fill="none" stroke="${INK}" stroke-width="0.8" stroke-linecap="round" d="M26.1 24.5 L25.2 23.8 M37.9 24.5 L38.8 23.8"/>` : '';
    // A full beard covers the mouth corner-to-corner, so the smile is drawn
    // lighter there to stay readable on dark hair.
    const covered = !w && app.beard >= 5;
    const mouth = `<path fill="none" stroke="${covered ? shade(skin, 10) : (w ? mix(dark, '#c2455a', 0.55) : dark)}" stroke-width="${w ? 1.25 : 1.1}" stroke-linecap="round" d="M29.2 ${covered ? 31.9 : 31.6} C30.6 ${covered ? 33 : 33.1} 33.4 ${covered ? 33 : 33.1} 34.8 ${covered ? 31.9 : 31.6}"/>`;
    const cheeks = `<ellipse cx="25.4" cy="29.2" rx="1.9" ry="1.2" fill="#e8607a" opacity="0.16"/><ellipse cx="38.6" cy="29.2" rx="1.9" ry="1.2" fill="#e8607a" opacity="0.16"/>`;
    const lines = app.aged ? `<path fill="none" stroke="${dark}" stroke-width="0.6" stroke-linecap="round" opacity="0.7" d="M24.6 28.2 C24.9 29.2 25.5 29.9 26.3 30.3 M39.4 28.2 C39.1 29.2 38.5 29.9 37.7 30.3"/>` : '';
    const glasses = app.glasses ? `<g fill="rgba(255,255,255,0.14)" stroke="${INK}" stroke-width="1"><rect x="24.6" y="23" width="6.2" height="5" rx="1.8"/><rect x="33.2" y="23" width="6.2" height="5" rx="1.8"/></g><path fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round" d="M30.8 25 C31.6 24.5 32.4 24.5 33.2 25 M24.6 25 L22.2 24.4 M39.4 25 L41.8 24.4"/>` : '';
    return `${cheeks}${lines}
      <path fill="none" stroke="${brow}" stroke-width="1.15" stroke-linecap="round" d="M26 ${w ? 22.2 : 22.4} C27 21.5 28.6 21.4 29.6 22 M34.4 22 C35.4 21.4 37 21.5 38 ${w ? 22.2 : 22.4}"/>
      ${eye(28)}${eye(36)}${lash}
      <path fill="none" stroke="${dark}" stroke-width="0.9" stroke-linecap="round" d="M31.4 28.6 C31.7 29.3 32.4 29.4 32.8 28.9"/>
      ${mouth}${glasses}`;
  }

  // A unique id per rendered SVG, so clipped uniform patterns never collide
  // when many avatars share a page.
  let _clipSeq = 0;

  /*
   * Uniform patterns (Update 13). Every athlete on a team shares one kit look,
   * drawn in the team's SECONDARY color and clipped to the torso so stripes
   * never spill onto skin. `torso` is the singlet path; `s` the accent color.
   */
  function patternSvg(pattern, torso, s, clipId) {
    if (!pattern || pattern === 'plain') return '';
    let inner = '';
    if (pattern === 'sidestripe') {
      inner = `<rect x="16" y="43" width="3.2" height="21" fill="${s}"/>
               <rect x="44.8" y="43" width="3.2" height="21" fill="${s}"/>`;
    } else if (pattern === 'pinstripe') {
      let stripes = '';
      for (let x = 19; x <= 45; x += 3.4) stripes += `<rect x="${x}" y="43" width="0.9" height="21" fill="${s}" opacity="0.85"/>`;
      inner = stripes;
    } else if (pattern === 'chestband') {
      inner = `<rect x="14" y="52.5" width="36" height="3.6" fill="${s}"/>`;
    } else if (pattern === 'yoke') {
      // A contrast shoulder yoke: the upper singlet is the accent color.
      inner = `<rect x="14" y="43" width="36" height="7.5" fill="${s}"/>`;
    }
    return `<clipPath id="${clipId}"><path d="${torso}"/></clipPath>
            <g clip-path="url(#${clipId})">${inner}</g>`;
  }

  function outfitSvg(app, kind, seed, opts) {
    if (kind === 'suit' || kind === 'polo') {
      // Coaching polo (Update 13): coaches dress in their program's colors —
      // a fitted polo with a real collar, a buttoned placket, and contrast
      // sleeve trim. The color pair comes from the team (opts.poloColors);
      // a coach with no team (creation preview) falls back to the picked one.
      let polo, trim;
      if (opts && opts.poloColors) {
        polo = opts.poloColors.primary;
        trim = opts.poloColors.secondary || shade(polo, -38);
      } else {
        polo = POLO_COLORS[app.polo !== undefined && app.polo !== null
          ? Math.max(0, Math.min(POLO_COLORS.length - 1, app.polo))
          : (seed >>> 6) % POLO_COLORS.length];
        trim = shade(polo, -38);
      }
      // Keep trim readable against the polo — if they're too close, darken.
      if (trim.toLowerCase() === polo.toLowerCase()) trim = shade(polo, -40);
      const skin = SKIN_TONES[app.skin] || SKIN_TONES[2];
      const btn = shade(trim, -18);
      return `
        <path fill="${polo}" ${OUT} d="M12.5 64 C12.6 52.5 16.5 44.6 24 42.5 C26.5 41.8 29 41.4 32 41.4 C35 41.4 37.5 41.8 40 42.5 C47.5 44.6 51.4 52.5 51.5 64 Z"/>
        <path fill="${trim}" d="M13.9 64 C14.2 55.5 15.4 49.8 17.4 45.9 C18.6 46.8 19.7 47.8 20.5 48.9 C19.3 52.7 18.6 57.8 18.5 64 Z"/>
        <path fill="${trim}" d="M50.1 64 C49.8 55.5 48.6 49.8 46.6 45.9 C45.4 46.8 44.3 47.8 43.5 48.9 C44.7 52.7 45.4 57.8 45.5 64 Z"/>
        <path fill="${skin}" d="M30.1 44.3 C30.6 43.8 31.2 43.4 32 43.1 C32.8 43.4 33.4 43.8 33.9 44.3 C33.6 45.4 33.4 46.4 33.1 47.2 L30.9 47.2 C30.6 46.4 30.4 45.4 30.1 44.3 Z"/>
        <path fill="${trim}" ${THIN} d="M25 42.2 C27.1 44.5 29.4 46.3 32 47.5 C34.6 46.3 36.9 44.5 39 42.2 C39.8 43.1 40.5 44.2 41 45.4 C38.6 48.2 35.6 50.3 32 51.5 C28.4 50.3 25.4 48.2 23 45.4 C23.5 44.2 24.2 43.1 25 42.2 Z"/>
        <rect x="31.25" y="47.4" width="1.5" height="9.4" rx="0.75" fill="${trim}"/>
        <circle cx="32" cy="50.4" r="0.95" fill="${btn}"/>
        <circle cx="32" cy="53.8" r="0.95" fill="${btn}"/>
        <path fill="#fff" opacity="0.14" d="M16 62 C16.6 54.5 18.6 49.4 22 46.6 C20.4 51 19.6 56 19.6 62 Z"/>`;
    }
    // Racing singlet (Update 13): the colored singlet goes up and over the
    // shoulders like a real race kit — straps follow the shoulder line, a
    // scoop neck with contrast trim, and the team's uniform pattern (plain /
    // side stripes / pinstripes / chest band / yoke).
    const uni = (opts && opts.uniform) || null;
    const primary = uni ? uni.primary : (app.jersey || JERSEY_COLORS[(seed >>> 9) % JERSEY_COLORS.length]);
    const secondary = uni ? uni.secondary : shade(primary, -30);
    const pattern = uni ? uni.pattern : 'plain';
    const skin = SKIN_TONES[app.skin] || SKIN_TONES[2];
    const torso = 'M17 64 C17.8 52 21.6 45.2 26.9 43.4 C28.3 46.2 30 47.6 32 47.6 C34 47.6 35.7 46.2 37.1 43.4 C42.4 45.2 46.2 52 47 64 Z';
    const clipId = 'xckit' + (_clipSeq++);
    return `
      <path fill="${skin}" ${OUT} d="M12.8 64 C13.9 50.5 20.3 43 32 43 C43.7 43 50.1 50.5 51.2 64 Z"/>
      <path fill="${primary}" d="${torso}"/>
      ${patternSvg(pattern, torso, secondary, clipId)}
      <path fill="${secondary}" d="M26.9 43.4 C28.3 46.2 30 47.6 32 47.6 C34 47.6 35.7 46.2 37.1 43.4 L38.3 44.5 C36.7 47.7 34.4 49.2 32 49.2 C29.6 49.2 27.3 47.7 25.7 44.5 Z"/>
      <path fill="none" ${THIN} d="${torso}"/>
      <path fill="#fff" opacity="0.14" d="M19.4 62 C20 54.6 22 49.6 25.2 46.6 C23.6 51 22.8 56 22.8 62 Z"/>`;
  }

  // Lighten/darken a #rrggbb color by `amt`.
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, v + amt));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  // Blend two #rrggbb colors: t = 0 → a, t = 1 → b.
  function mix(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
    return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  }

  /*
   * Render an appearance as an SVG bust.
   *   opts.outfit  'jersey' (default) | 'polo' ('suit' is a legacy alias)
   *   opts.size    pixel size (default 24)
   *   opts.round   circular crop with a soft backdrop (default true)
   */
  UI.avatarSvg = function (app, opts = {}) {
    const size = opts.size || 24;
    const outfit = opts.outfit || 'jersey';
    const clampIdx = (v, n) => Math.max(0, Math.min(n - 1, Math.round(Number(v) || 0)));
    // Out-of-range or missing values (an older save, a hand-edited one) fall
    // back to a valid look instead of an invisible or broken one.
    app = Object.assign({}, app, {
      gender: app.gender === 'W' ? 'W' : 'M',
      skin: clampIdx(app.skin, SKIN_TONES.length),
      hair: clampIdx(app.hair, HAIR_COLORS.length),
      hairStyle: clampIdx(app.hairStyle, HAIR_STYLE_COUNT),
      beard: app.gender === 'W' ? 0 : clampIdx(app.beard, BEARD_STYLE_COUNT)
    });
    const skin = SKIN_TONES[app.skin];
    const hairC = HAIR_COLORS[app.hair];
    const seed = app._seed !== undefined ? app._seed : hashStr(JSON.stringify([app.skin, app.hair, app.hairStyle, app.beard]));
    const round = opts.round !== false;
    // The neck: a trapezoid that flares from under the jaw down INTO the
    // shoulders, its base tucked below the outfit's neckline so head, neck,
    // and body read as one connected figure.
    const neck = `<path fill="${shade(skin, -18)}" ${THIN} d="M27.4 33 L36.6 33 L38 44 C38 46.2 26 46.2 26 44 Z"/>`;
    return `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"
      style="display:inline-block; vertical-align:middle; flex:none; ${round ? 'border-radius:50%; background:radial-gradient(circle at 50% 38%, #4c6187, #2b3854);' : ''}">
      ${hairBack(app, hairC)}
      ${neck}
      ${outfitSvg(app, outfit, seed, opts)}
      <ellipse cx="21.6" cy="26" rx="2" ry="2.8" fill="${shade(skin, -10)}" ${THIN}/>
      <ellipse cx="42.4" cy="26" rx="2" ry="2.8" fill="${shade(skin, -10)}" ${THIN}/>
      <ellipse cx="32" cy="25" rx="10.5" ry="11.5" fill="${skin}" ${OUT}/>
      <path fill="${shade(skin, -14)}" opacity="0.45" d="M22.2 28.6 C23.6 34 27.4 36.4 32 36.4 C36.6 36.4 40.4 34 41.8 28.6 C40 32.6 36.6 34.4 32 34.4 C27.4 34.4 24 32.6 22.2 28.6 Z"/>
      ${faceSvg(app, skin, hairC)}
      ${beardPath(app, hairC)}
      ${hairFront(app, hairC)}
    </svg>`;
  };

  /*
   * The team uniform an athlete wears (Update 13). Colors follow the athlete's
   * CURRENT school, so a transfer immediately inherits their new team's kit.
   * Returns { primary, secondary, pattern } or null (→ hashed fallback) for
   * historical records with no resolvable live school.
   */
  UI.uniformFor = function (person) {
    if (!person) return null;
    if (person.uniform && person.uniform.primary) return person.uniform;
    const game = (UI.state && UI.state.game) || null;
    const sid = person.schoolId;
    if (game && sid && game.getSchool) {
      const sch = game.getSchool(sid);
      if (sch) {
        if (sch.kit && sch.kit.primary) return sch.kit;
        if (window.XCD.data.kitFor) return window.XCD.data.kitFor(sch.name, { colors: sch.colors });
      }
    }
    return null;
  };

  /*
   * The polo color pair a coach wears (Update 13): their program's team
   * colors. A coach with no resolvable team (creation preview, free agent)
   * returns null so the picked/derived polo color is used instead.
   */
  UI.poloColorsFor = function (person) {
    const game = (UI.state && UI.state.game) || null;
    const sid = person && person.schoolId;
    if (game && sid && game.getSchool) {
      const sch = game.getSchool(sid);
      if (sch && Array.isArray(sch.colors) && sch.colors.length >= 2) {
        return { primary: sch.colors[0], secondary: sch.colors[1] || '#ffffff' };
      }
    }
    return null;
  };

  /*
   * The one-call helper used across the UI: derive (or read) the person's
   * appearance and render it. `person` may be a live entity, a historical
   * record, or { name, gender }.
   */
  UI.avatar = function (person, opts = {}) {
    const app = UI.appearanceFor(person, opts);
    const outfit = opts.outfit || ((person && (person.role === 'Head' || person.role === 'Assistant' ||
      person.coachAccolades || person.careerRecord)) ? 'polo' : 'jersey');
    const extra = {};
    if (outfit === 'jersey') { const u = UI.uniformFor(person); if (u) extra.uniform = u; }
    else { const pc = UI.poloColorsFor(person); if (pc) extra.poloColors = pc; }
    return UI.avatarSvg(app, Object.assign({}, opts, { outfit }, extra));
  };

  /*
   * Resolve the richest person object for an avatar: the live athlete or
   * coach when they still exist (so they wear today's kit), otherwise the
   * preserved alumni / Hall of Fame / registry record, otherwise a bare
   * { name, gender, schoolId } — the face is seeded from the name, so it
   * is the same person on every screen either way.
   */
  UI.resolvePerson = function (game, kind, id, name, extra = {}) {
    const g = game || (UI.state && UI.state.game);
    if (g) {
      if (kind === 'coach') {
        const live = id && g.getCoach && g.getCoach(id);
        if (live) return live;
        const H = g.history || {};
        const reg = (H.coachRegistry || []).find((r) => (id && r.coachId === id) || (!id && r.name === name)) ||
          (H.playerCareers || []).find((r) => r.name === name);
        if (reg) return reg;
      } else {
        const live = id && ((g.getAthlete && g.getAthlete(id)) || ((g.world && g.world.recruits) || {})[id]);
        if (live) return live;
        const H = g.history || {};
        const rec = (H.alumni || []).find((r) => id ? r.athleteId === id : r.name === name) ||
          (H.hallOfFame || []).find((r) => id ? r.athleteId === id : r.name === name);
        if (rec) return rec;
      }
    }
    return Object.assign({ name, role: kind === 'coach' ? 'Head' : undefined }, extra);
  };

  /*
   * A person's name everywhere it is listed: avatar + name in one consistent
   * type style (.person-name). `kind` is 'ath' | 'coach'; when `link` is set
   * the name carries the data-ath / data-coach hooks every screen already
   * wires to the profile openers.
   */
  UI.personName = function (game, kind, id, name, opts = {}) {
    if (!name) return '';
    const Utils = window.XCD.core.Utils;
    const person = opts.person || UI.resolvePerson(game, kind, id, name, opts.extra || {});
    const size = opts.size || 20;
    const outfit = kind === 'coach' ? 'polo' : 'jersey';
    const link = opts.link !== false;
    const hook = !link ? ''
      : kind === 'coach'
        ? ` data-coach="${id || ''}" data-coach-name="${Utils.escapeHtml(name)}"`
        : ` data-ath="${id || ''}" data-ath-name="${Utils.escapeHtml(name)}"`;
    return `<span class="person-name${link ? ' clickable' : ''}"${hook}>${UI.avatar(person, { size, outfit })}<span class="pn-text">${opts.prefix || ''}${Utils.escapeHtml(name)}</span></span>`;
  };

  /*
   * A tiny two-tone team-color swatch (Update 13) — the program's primary and
   * secondary colors as a split disc, shown next to a school's mascot.
   */
  UI.kitSwatch = function (school, size = 16) {
    const colors = (school && Array.isArray(school.colors) && school.colors.length >= 2)
      ? school.colors
      : (window.XCD.data.schoolMeta && school ? window.XCD.data.schoolMeta(school.name).colors : ['#888', '#ccc']);
    return `<span title="Team colors" style="display:inline-flex; flex:none; width:${size}px; height:${size}px; border-radius:50%; overflow:hidden; border:1px solid rgba(255,255,255,0.25); vertical-align:middle;">
      <span style="width:50%; height:100%; background:${colors[0]};"></span>
      <span style="width:50%; height:100%; background:${colors[1] || '#ffffff'};"></span>
    </span>`;
  };

  UI.AVATAR = {
    SKIN_TONES, HAIR_COLORS, HAIR_STYLE_COUNT, BEARD_STYLE_COUNT, POLO_COLORS,
    // Names for the creator's pickers (index = the stored appearance value).
    HAIR_COLOR_NAMES: ['Blonde', 'Dark Blonde', 'Red', 'Light Brown', 'Brown', 'Dark Brown', 'Black', 'Gray'],
    HAIR_STYLE_NAMES: {
      M: ['Bald', 'Buzz', 'Short', 'Crew', 'Side Part', 'Curly', 'Messy', 'Long'],
      W: ['Pixie', 'Bob', 'Shoulder', 'Curly', 'Ponytail', 'Bun', 'Long', 'Braids']
    },
    BEARD_NAMES: ['Clean', 'Stubble', 'Mustache', 'Goatee', 'Short', 'Full', 'Thick', 'Bushy'],
    hashStr
  };
})();
