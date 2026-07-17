/*
 * ============================================================================
 * WORLD DATABASE — the single source of truth for the game's fictional
 * collegiate cross country universe.
 * ============================================================================
 *
 * Everything that gives the world its identity lives here: the governing body
 * (the NXCA), the three divisions and how they're labelled, the named meets and
 * championships, the award names, and the shared mascot / color-palette pools
 * used when new (custom-world) programs are minted.
 *
 * This universe is entirely original and legally distinct. It is inspired by
 * the spirit of collegiate distance running while copying no real association,
 * institution, conference, mascot, award, or branding. Every screen references
 * these values instead of hard-coding strings, so the world stays internally
 * consistent and is trivial to expand.
 *
 * NOTE: the division KEYS (DA / DB / DC) are internal identifiers only —
 * they are never shown to the player. Every player-facing label comes from
 * WORLD.divisionLabel() / divisionShort() below (Division A / B / C).
 */
(function () {
  const D = window.XCD.data;

  const WORLD = {
    /* -------------------------------------------------------------- *
     * Governing body — the NXCA (replaces the real-world association).
     * -------------------------------------------------------------- */
    ORG: {
      abbr: 'NXCA',
      name: 'National Cross Country Association'
    },

    /* -------------------------------------------------------------- *
     * Divisions. Internal keys map to fictional public labels.
     * -------------------------------------------------------------- */
    DIVISION_LABELS: { DA: 'Division A', DB: 'Division B', DC: 'Division C' },
    DIVISION_SHORT:  { DA: 'DA', DB: 'DB', DC: 'DC' },

    /* -------------------------------------------------------------- *
     * Named meets & championships. These are the game's own events.
     * -------------------------------------------------------------- */
    MEETS: {
      // Prestigious regular-season invitationals.
      elite: [
        { key: 'prairieGold', name: 'Prairie Gold Invitational' },
        { key: 'northland',   name: 'Northland Classic' },
        { key: 'honeyBadger', name: 'Honey Badger Invite' },
        { key: 'northwoods',  name: 'Northwoods Invitational' }
      ],
      preview: 'National Preview Invitational',   // late-season championship-course preview
      conference: 'Conference Championship',
      regional: 'Regional Championship',
      national: 'National Championship',
      // High School Cross Nationals — the prep national championship that
      // feeds the recruiting class (replaces the old branded prep meet).
      highSchoolNationals: { abbr: 'HSXN', name: 'High School Cross Nationals' }
    },

    /* -------------------------------------------------------------- *
     * Awards. Original names; some intentionally generic (Runner of the
     * Year, All-Conference) since those describe the honor, not a brand.
     * -------------------------------------------------------------- */
    AWARDS: {
      runnerOfYear: 'Runner of the Year',
      newcomerOfYear: 'Newcomer of the Year',        // top first-year runner
      coachOfYear: 'Coach of the Year',
      allAmerican: 'First Team All-American',
      academicElite: 'Academic Elite Team',          // top scholar-athletes
      allConference: 'All-Conference',
      nationalChampion: 'National Champion',
      regionalChampion: 'Regional Champion'
    }
  };

  /* -------------------------------------------------------------- *
   * Conference abbreviations. Full names read well on detail pages;
   * the short form is used in filters, dropdowns, and standings so the
   * UI stays compact. None matches a real-world conference abbreviation.
   * -------------------------------------------------------------- */
  WORLD.CONFERENCE_ABBR = {
    "Atlantic Alliance Conference": "AAL", "Heartland Ten Conference": "HT10", "Large 12 Conference": "L12",
    "Southern Premier Conference": "SPC", "National Metro Conference": "NMC", "Western Peaks Conference": "WPC",
    "Southern Horizon Conference": "SHC", "Continental Conference": "CNC", "Great Lakes Conference": "GLK",
    "Empire Athletic Conference": "EAC", "Ancient Oaks League": "AO8", "Liberty Conference": "LBC",
    "Seaboard Ten Conference": "SB10", "Tidewater Conference": "TWC", "Blue Ridge Conference": "BRC",
    "Pacific Shores Conference": "PSH", "Great Sky Conference": "GSK", "Desert West Conference": "DWC",
    "Golden Coast Conference": "GCC", "Azalea Conference": "AZC", "Piedmont Conference": "PMC",
    "Frontier South Conference": "FSC", "Chesapeake Heritage Conference": "CHC", "Magnolia Heritage Conference": "MHC",
    "Lakeland Metro Conference": "LMC", "Central Valley Conference": "CVL", "High Plains Conference": "HPC",
    "Northern Coast Conference": "NCoast", "Hudson Valley Conference": "HVC", "Northern Frontier Conference": "NFR",
    "River Valley Conference": "RVC", "Rocky Summit Conference": "RSC", "Great Lakes Interstate Conference": "GLI",
    "Keystone Athletic Conference": "KAC", "Southern Highlands Conference": "SHL", "Republic Athletic Conference": "RPC",
    "Midland Athletic Conference": "MDL", "Coastal Intercollegiate Conference": "CIC", "Deep South Athletic Conference": "DSC",
    "Northern Sun Alliance": "NSA", "Prairie Heartland Conference": "PHC", "Golden State Athletic Conference": "GSA",
    "Ozark Athletic Conference": "OZC", "Peach Country Conference": "PCC", "New England Ten Conference": "NE10x",
    "Sunshine Coast Conference": "SCC", "Carolina Piedmont Conference": "CPC", "Cascadia Athletic Conference": "CAS",
    "Pacific Rim Conference": "PRC", "Northwoods Athletic Conference": "NWA", "New England Scholars Conference": "NES",
    "North Coast Scholars Conference": "NCS", "University Scholars Association": "USA8", "Empire State Athletic Conference": "ESA",
    "Great Lakes Scholars Conference": "GLS", "Southern Scholars Conference": "SSC", "Prairie Colleges Conference": "PRA",
    "Commonwealth Scholars Conference": "CWS", "Founders Scholars Conference": "FSA", "Liberty Scholars League": "LSL",
    "Northland Colleges Conference": "NLC", "Empire Eight Colleges": "EE8", "Southern Athletic Alliance": "SAL",
    "Ridgeline Colleges Conference": "RLC", "Capital Coast Conference": "CAP", "New England Colleges Conference": "NEC8",
    "Waypoint Colleges Conference": "WPT", "Coastal East Conference": "CEC"
  };

  // Short conference label for compact UI. Falls back to the full name (custom
  // worlds may add conferences without an abbreviation).
  WORLD.confAbbr = function (name) {
    return (name && WORLD.CONFERENCE_ABBR[name]) || name || '';
  };

  /* ---------------- helper accessors (used everywhere) ---------------- */

  // Public label for a division key (or a school). Defaults to Division A so
  // legacy saves without a division read correctly.
  WORLD.divisionLabel = function (schoolOrKey) {
    const key = typeof schoolOrKey === 'string'
      ? schoolOrKey
      : (schoolOrKey && schoolOrKey.division) || 'DA';
    return WORLD.DIVISION_LABELS[key] || WORLD.DIVISION_LABELS.DA;
  };
  WORLD.divisionShort = function (schoolOrKey) {
    const key = typeof schoolOrKey === 'string'
      ? schoolOrKey
      : (schoolOrKey && schoolOrKey.division) || 'DA';
    return WORLD.DIVISION_SHORT[key] || WORLD.DIVISION_SHORT.DA;
  };

  // The full championship name for a division, e.g.
  // "NXCA National Championship" (Division A) or
  // "NXCA Division B National Championship".
  WORLD.championshipName = function (divKey) {
    const label = WORLD.divisionLabel(divKey);
    const tag = label === WORLD.DIVISION_LABELS.DA ? '' : label + ' ';
    return `${WORLD.ORG.abbr} ${tag}National Championship`;
  };
  WORLD.regionalName = function () { return `${WORLD.ORG.abbr} Regional Championship`; };

  /* -------------------------------------------------------------- *
   * Shared pools for minting new / custom-world programs. Every
   * mascot and palette here is original and none is tied to a real
   * school's identity. Kept in the World Database so expansions and
   * the custom-world builder draw from one consistent set.
   * -------------------------------------------------------------- */
  WORLD.MASCOTS = ['Granite Foxes','Thunder Elk','Iron Wolves','Prairie Falcons','Copper Owls','Storm Bison','River Serpents','Ash Bears','Silver Lynx','Red Hawks','Coal Ravens','Timber Cats','Glacier Rams','Dust Devils','Blue Herons','Peregrines','Night Owls','Mountain Goats','Honey Badgers','Pine Martens','Cinder Stags','Frost Wolves','Amber Coyotes','Steel Herons','Marsh Cranes','Canyon Hawks','Delta Gators','Dune Jackals','Ember Phoenix','Flint Badgers','Gale Ospreys','Harbor Seals','Juniper Jays','Kestrels','Lantern Moths','Meadow Larks','Nettle Vipers','Obsidian Panthers','Quarry Rams','Rapids Otters','Sable Wolves','Tundra Foxes','Verglas Lynx','Willow Herons','Basalt Rhinos','Cobalt Sharks','Grove Stags','Hollow Owls','Inlet Terns','Jetstream Falcons','Mesa Condors','Thistle Rams','Boulder Bears','Cypress Hawks','Whitecaps','Aurora Lynx','Cascade Falcons','Emberhawks','Gorge Ravens','Ironclad Elk','Loon Divers','Nightjars','Slate Hawks','Timberjacks','Windrunners','Zephyr Swifts','Chinook Salmon','Greywolves','Sandpipers','Talon Eagles'];

  WORLD.PALETTES = [
    ['#1d3f6e','#c9a227'],['#5a1f2b','#d8c7a0'],['#0f5a3c','#f0e6c8'],['#3a2a5a','#c8b28a'],
    ['#8a4a1f','#2a2a2a'],['#12233f','#7ac0e0'],['#6a1f24','#dcae52'],['#0a3a3a','#e0a04a'],
    ['#4a1f5a','#c8a24a'],['#7a1f2b','#d0d0d0'],['#1c3a2a','#c0a060'],['#2a3a5a','#d8b84a'],
    ['#5a3a1f','#e0d0b0'],['#1f4a5a','#e0e0e0'],['#3a1f2a','#c0a878'],['#2a4a3a','#e8c85a'],
    ['#4a2a1f','#a8c0d0'],['#1f2a4a','#c8b0e0'],['#0e2a4a','#b0c8d8'],['#4a0f1f','#e8d0a0']
  ];

  // Deterministic helpers so a custom-world program is stable across reloads.
  WORLD.mascotFor = function (seedStr) {
    let h = 2166136261 >>> 0;
    const s = String(seedStr || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return WORLD.MASCOTS[(h >>> 0) % WORLD.MASCOTS.length];
  };
  WORLD.paletteFor = function (seedStr) {
    let h = 2166136261 >>> 0;
    const s = String(seedStr || '') + '|c';
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return WORLD.PALETTES[(h >>> 0) % WORLD.PALETTES.length];
  };

  D.WORLD = WORLD;

  /* ================================================================== *
   * CUSTOM WORLDS — everything above is a DEFAULT that players can fully
   * override with their own data, so nothing about the universe is locked
   * in code. A custom world is a plain JSON object (loaded from a file or a
   * URL) shaped like:
   *
   * {
   *   "org":      { "abbr": "XYZ", "name": "..." },
   *   "divisions":{ "labels": { "DA": "...", "DB": "...", "DC": "..." },
   *                 "short":  { "DA": "...", "DB": "...", "DC": "..." } },
   *   "meets":    { "elite": [ { "name": "..." }, ... ], "preview": "...",
   *                 "conference": "...", "regional": "...", "national": "...",
   *                 "highSchoolNationals": { "abbr": "...", "name": "..." } },
   *   "awards":   { "runnerOfYear": "...", "newcomerOfYear": "...", ... },
   *   "mascots":  [ "..." ],
   *   "palettes": [ ["#112233","#445566"], ... ],
   *   "conferences": { "My Conference": { "tier": 1, "division": "DA" }, ... },
   *   "prestigeSeeds": { "My School": 90, ... },
   *   "schools":  [ ["Name","ST","Conference","Mascot","#primary","#secondary","DA"], ... ]
   * }
   *
   * Every field is OPTIONAL — anything omitted keeps the built-in default.
   * Supply only `schools` to reskin the roster, or a full object to build an
   * entirely different universe. The applied config is stamped into the save
   * so a custom-world dynasty reloads exactly as it was.
   * ================================================================== */
  D.CUSTOM_WORLD = null;

  const DIV_TO_RAW = { DA: 'RAW_SCHOOLS', DB: 'RAW_SCHOOLS_DII', DC: 'RAW_SCHOOLS_DIII' };

  D.applyCustomWorld = function (cfg) {
    if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'Custom world must be a JSON object.' };
    try {
      if (cfg.org) {
        if (cfg.org.abbr) WORLD.ORG.abbr = String(cfg.org.abbr);
        if (cfg.org.name) WORLD.ORG.name = String(cfg.org.name);
      }
      if (cfg.divisions) {
        if (cfg.divisions.labels) Object.assign(WORLD.DIVISION_LABELS, cfg.divisions.labels);
        if (cfg.divisions.short) Object.assign(WORLD.DIVISION_SHORT, cfg.divisions.short);
        if (D.DIVISIONS) Object.keys(WORLD.DIVISION_LABELS).forEach((k) => {
          if (D.DIVISIONS[k]) D.DIVISIONS[k].label = WORLD.DIVISION_LABELS[k];
        });
        if (D.DIVISION_SHORT) Object.assign(D.DIVISION_SHORT, WORLD.DIVISION_SHORT);
      }
      if (cfg.meets) {
        const m = cfg.meets;
        if (Array.isArray(m.elite)) {
          WORLD.MEETS.elite = m.elite.map((e, i) => ({ key: (e && e.key) || ('m' + i), name: String((e && e.name) || ('Invitational ' + (i + 1))) }));
          if (Array.isArray(D.ELITE_MEETS)) {
            let ei = 0;
            D.ELITE_MEETS.forEach((meet) => { if (!meet.preNationals && WORLD.MEETS.elite[ei]) { meet.name = WORLD.MEETS.elite[ei].name; ei++; } });
          }
        }
        ['preview', 'conference', 'regional', 'national'].forEach((k) => { if (m[k]) WORLD.MEETS[k] = String(m[k]); });
        if (m.preview) {
          if (D.PRE_NATIONALS) D.PRE_NATIONALS.name = String(m.preview);
          if (Array.isArray(D.ELITE_MEETS)) { const p = D.ELITE_MEETS.find((x) => x.preNationals); if (p) p.name = String(m.preview); }
        }
        if (m.highSchoolNationals) WORLD.MEETS.highSchoolNationals = {
          abbr: String(m.highSchoolNationals.abbr || WORLD.MEETS.highSchoolNationals.abbr),
          name: String(m.highSchoolNationals.name || WORLD.MEETS.highSchoolNationals.name)
        };
      }
      if (cfg.awards) Object.assign(WORLD.AWARDS, cfg.awards);
      if (Array.isArray(cfg.mascots) && cfg.mascots.length) WORLD.MASCOTS = cfg.mascots.map(String);
      if (Array.isArray(cfg.palettes) && cfg.palettes.length) WORLD.PALETTES = cfg.palettes;
      if (cfg.conferences && typeof cfg.conferences === 'object' && D.CONFERENCES) {
        Object.entries(cfg.conferences).forEach(([name, meta]) => {
          D.CONFERENCES[name] = (typeof meta === 'number') ? { tier: meta } : Object.assign({}, meta);
          if (meta && meta.abbr) WORLD.CONFERENCE_ABBR[name] = String(meta.abbr);
        });
      }
      if (cfg.prestigeSeeds && typeof cfg.prestigeSeeds === 'object' && D.PRESTIGE_SEEDS) {
        Object.assign(D.PRESTIGE_SEEDS, cfg.prestigeSeeds);
      }
      if (Array.isArray(cfg.schools) && cfg.schools.length) {
        const buckets = { DA: [], DB: [], DC: [] };
        cfg.schools.forEach((row) => {
          const div = DIV_TO_RAW[row[6]] ? row[6] : 'DA';
          buckets[div].push([row[0], row[1], row[2], row[3], row[4], row[5]]);
          if (row[2] && D.CONFERENCES && !D.CONFERENCES[row[2]]) D.CONFERENCES[row[2]] = { tier: 3, division: div };
        });
        if (buckets.DA.length) D.RAW_SCHOOLS = buckets.DA;
        if (buckets.DB.length) D.RAW_SCHOOLS_DII = buckets.DB;
        if (buckets.DC.length) D.RAW_SCHOOLS_DIII = buckets.DC;
      }
      D.CUSTOM_WORLD = cfg;
      return { ok: true, schools: Array.isArray(cfg.schools) ? cfg.schools.length : 0 };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e) };
    }
  };

  // Fetch a custom world JSON from a URL and apply it. Returns the apply result.
  D.loadCustomWorldFromUrl = async function (url) {
    const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching custom world');
    const cfg = await res.json();
    const r = D.applyCustomWorld(cfg);
    if (!r.ok) throw new Error(r.error || 'Failed to apply custom world');
    return r;
  };

  // Auto-load a custom world from a ?world=<url> (or ?worldData=<url>) query
  // param at boot, so a shared link can carry an entire universe. Best-effort.
  D.autoloadCustomWorld = async function () {
    try {
      const params = new URLSearchParams((window.location && window.location.search) || '');
      const url = params.get('world') || params.get('worldData');
      if (url) return await D.loadCustomWorldFromUrl(url);
    } catch (e) { /* a bad link never blocks the game */ }
    return null;
  };
})();
