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
 * NOTE: the division KEYS (DI / DII / DIII) are internal identifiers only —
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
    DIVISION_LABELS: { DI: 'Division A', DII: 'Division B', DIII: 'Division C' },
    DIVISION_SHORT:  { DI: 'DA', DII: 'DB', DIII: 'DC' },

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

  /* ---------------- helper accessors (used everywhere) ---------------- */

  // Public label for a division key (or a school). Defaults to Division A so
  // legacy saves without a division read correctly.
  WORLD.divisionLabel = function (schoolOrKey) {
    const key = typeof schoolOrKey === 'string'
      ? schoolOrKey
      : (schoolOrKey && schoolOrKey.division) || 'DI';
    return WORLD.DIVISION_LABELS[key] || WORLD.DIVISION_LABELS.DI;
  };
  WORLD.divisionShort = function (schoolOrKey) {
    const key = typeof schoolOrKey === 'string'
      ? schoolOrKey
      : (schoolOrKey && schoolOrKey.division) || 'DI';
    return WORLD.DIVISION_SHORT[key] || WORLD.DIVISION_SHORT.DI;
  };

  // The full championship name for a division, e.g.
  // "NXCA National Championship" (Division A) or
  // "NXCA Division B National Championship".
  WORLD.championshipName = function (divKey) {
    const label = WORLD.divisionLabel(divKey);
    const tag = label === WORLD.DIVISION_LABELS.DI ? '' : label + ' ';
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
})();
