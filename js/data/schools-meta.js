/*
 * School identity metadata (Update 13): team colors and mascots.
 *
 * Every program in the world gets two things that make it feel like a real
 * school: a color pair (primary, secondary) drawn from its real-life palette,
 * and a mascot NAME that riffs on the real one but is deliberately altered so
 * nothing here is a copyrighted logo or team name (e.g. Oregon Ducks →
 * "Quacks", Kansas State Wildcats → "Wildkats"). Colors drive the athlete
 * uniforms and the coach polos on the avatar system, so a whole roster wears
 * one identity; mascots surface on the program profile and program cards.
 *
 * SCHOOL_META covers the recognizable programs by hand. Everything else falls
 * back to a deterministic palette + mascot derived from the name hash, so all
 * 500+ schools across three divisions have a consistent, distinct identity
 * without hand-authoring every single one.
 */
(function () {
  const D = window.XCD.data;

  // [primary, secondary]. Primary is the dominant kit color; secondary is the
  // trim/accent. Kept vivid enough to read on the dark UI (avatar validates).
  D.SCHOOL_META = {
    // ---- ACC ----
    'Boston College': { colors: ['#8a100b', '#c9a54a'], mascot: 'Soaring Eagles' },
    'California': { colors: ['#1a3d6d', '#f7c948'], mascot: 'Golden Bruins' },
    'Clemson': { colors: ['#f56600', '#522d80'], mascot: 'Tigerpaws' },
    'Duke': { colors: ['#012b6d', '#ffffff'], mascot: 'Blue Devildogs' },
    'Florida State': { colors: ['#782f40', '#ceb888'], mascot: 'Seminoblues' },
    'Georgia Tech': { colors: ['#b3a369', '#003057'], mascot: 'Buzzards' },
    'Louisville': { colors: ['#ad0000', '#000000'], mascot: 'Cardinalbirds' },
    'Miami': { colors: ['#f47321', '#005030'], mascot: 'Hurricans' },
    'NC State': { colors: ['#cc0000', '#ffffff'], mascot: 'Wolfpackers' },
    'North Carolina State': { colors: ['#cc0000', '#ffffff'], mascot: 'Wolfpackers' },
    'North Carolina': { colors: ['#4b9cd3', '#ffffff'], mascot: 'Tarhikers' },
    'Notre Dame': { colors: ['#0c2340', '#c99700'], mascot: 'Fighting Irishmen' },
    'Pittsburgh': { colors: ['#003594', '#ffb81c'], mascot: 'Panthercats' },
    'SMU': { colors: ['#c8102e', '#0033a0'], mascot: 'Mustanglers' },
    'Stanford': { colors: ['#8c1515', '#ffffff'], mascot: 'The Treewood' },
    'Syracuse': { colors: ['#f76900', '#0c2340'], mascot: 'Orangemen' },
    'Virginia': { colors: ['#232d4b', '#f84c1e'], mascot: 'Cavalcades' },
    'Virginia Tech': { colors: ['#630031', '#cf4420'], mascot: 'Hokiebirds' },
    'Wake Forest': { colors: ['#9e7e38', '#000000'], mascot: 'Demon Diaks' },
    // ---- Big Ten ----
    'Illinois': { colors: ['#13294b', '#e84a27'], mascot: 'Fighting Illini' },
    'Indiana': { colors: ['#990000', '#ffffff'], mascot: 'Hoosierhounds' },
    'Iowa': { colors: ['#000000', '#ffcd00'], mascot: 'Hawkguys' },
    'Maryland': { colors: ['#e03a3e', '#ffd200'], mascot: 'Terrapaws' },
    'Michigan': { colors: ['#00274c', '#ffcb05'], mascot: 'Wolverunners' },
    'Michigan State': { colors: ['#18453b', '#ffffff'], mascot: 'Spartanburgs' },
    'Minnesota': { colors: ['#7a0019', '#ffcc33'], mascot: 'Golden Gophguys' },
    'Nebraska': { colors: ['#e41c38', '#ffffff'], mascot: 'Cornhikers' },
    'Northwestern': { colors: ['#4e2a84', '#ffffff'], mascot: 'Wildkits' },
    'Ohio State': { colors: ['#bb0000', '#666666'], mascot: 'Buckguys' },
    'Oregon': { colors: ['#154733', '#fee123'], mascot: 'Quacks' },
    'Penn State': { colors: ['#041e42', '#ffffff'], mascot: 'Nittany Lionhearts' },
    'Purdue': { colors: ['#ceb888', '#000000'], mascot: 'Boilerrunners' },
    'Rutgers': { colors: ['#cc0033', '#000000'], mascot: 'Scarlet Runners' },
    'UCLA': { colors: ['#2d68c4', '#f2a900'], mascot: 'Brubears' },
    'USC': { colors: ['#990000', '#ffcc00'], mascot: 'Trojanners' },
    'Washington': { colors: ['#4b2e83', '#e8e3d3'], mascot: 'Huskydogs' },
    'Wisconsin': { colors: ['#c5050c', '#ffffff'], mascot: 'Badgerbacks' },
    // ---- Big 12 ----
    'Arizona': { colors: ['#003366', '#cc0033'], mascot: 'Wildkittens' },
    'Arizona State': { colors: ['#8c1d40', '#ffc627'], mascot: 'Sun Devildogs' },
    'Baylor': { colors: ['#154734', '#ffb81c'], mascot: 'Bearcubs' },
    'BYU': { colors: ['#002e5d', '#ffffff'], mascot: 'Cougarcats' },
    'Cincinnati': { colors: ['#e00122', '#000000'], mascot: 'Bearkittens' },
    'Colorado': { colors: ['#cfb87c', '#000000'], mascot: 'Buffaracers' },
    'Houston': { colors: ['#c8102e', '#ffffff'], mascot: 'Cougarunners' },
    'Iowa State': { colors: ['#c8102e', '#f1be48'], mascot: 'Cyclonners' },
    'Kansas': { colors: ['#0051ba', '#e8000d'], mascot: 'Jayhikers' },
    'Kansas State': { colors: ['#512888', '#ffffff'], mascot: 'Wildkats' },
    'Oklahoma State': { colors: ['#ff7300', '#000000'], mascot: 'Cowpokes' },
    'TCU': { colors: ['#4d1979', '#ffffff'], mascot: 'Horned Frogmen' },
    'Texas Tech': { colors: ['#cc0000', '#000000'], mascot: 'Red Raidguys' },
    'UCF': { colors: ['#000000', '#ba9b37'], mascot: 'Knightriders' },
    'Utah': { colors: ['#cc0000', '#ffffff'], mascot: 'Runnin Utes' },
    'West Virginia': { colors: ['#002855', '#eaaa00'], mascot: 'Mountainrunners' },
    // ---- SEC ----
    'Alabama': { colors: ['#9e1b32', '#ffffff'], mascot: 'Crimson Rollers' },
    'Arkansas': { colors: ['#9d2235', '#ffffff'], mascot: 'Razorrunners' },
    'Auburn': { colors: ['#0c2340', '#dd550c'], mascot: 'Tigerpaws' },
    'Florida': { colors: ['#0021a5', '#fa4616'], mascot: 'Gatorunners' },
    'Georgia': { colors: ['#ba0c2f', '#000000'], mascot: 'Bulldawgs' },
    'Kentucky': { colors: ['#0033a0', '#ffffff'], mascot: 'Wildkittens' },
    'LSU': { colors: ['#461d7c', '#fdd023'], mascot: 'Tigerbengals' },
    'Mississippi State': { colors: ['#5d1725', '#ffffff'], mascot: 'Bulldawgs' },
    'Missouri': { colors: ['#f1b82d', '#000000'], mascot: 'Tigercats' },
    'Ole Miss': { colors: ['#ce1126', '#14213d'], mascot: 'Rebelrunners' },
    'Oklahoma': { colors: ['#841617', '#fdf9d8'], mascot: 'Sooneriders' },
    'South Carolina': { colors: ['#73000a', '#000000'], mascot: 'Gamecockerels' },
    'Tennessee': { colors: ['#ff8200', '#ffffff'], mascot: 'Volunteerunners' },
    'Texas': { colors: ['#bf5700', '#ffffff'], mascot: 'Longhikers' },
    'Texas A&M': { colors: ['#500000', '#ffffff'], mascot: 'Aggierunners' },
    'Vanderbilt': { colors: ['#000000', '#c9a748'], mascot: 'Commodorunners' },
    // ---- Notable running programs / mid-majors ----
    'Northern Arizona': { colors: ['#003466', '#ffc72c'], mascot: 'Lumberrunners' },
    'New Mexico': { colors: ['#ba0c2f', '#a7a8aa'], mascot: 'Lobowolves' },
    'Colorado State': { colors: ['#1e4d2b', '#c8c372'], mascot: 'Ramrunners' },
    'Furman': { colors: ['#582c83', '#ffffff'], mascot: 'Paladinriders' },
    'Villanova': { colors: ['#00205b', '#13b5ea'], mascot: 'Wildkits' },
    'Georgetown': { colors: ['#041e42', '#8d817b'], mascot: 'Hoyahounds' },
    'Providence': { colors: ['#000000', '#8a8d8f'], mascot: 'Friarunners' },
    'Portland': { colors: ['#4b2e83', '#ffffff'], mascot: 'Pilotrunners' },
    'Gonzaga': { colors: ['#041e42', '#c8102e'], mascot: 'Bulldozers' },
    'Boise State': { colors: ['#0033a0', '#d64309'], mascot: 'Broncorunners' },
    'Air Force': { colors: ['#004a7f', '#b1b3b3'], mascot: 'Falconflyers' },
    'Wyoming': { colors: ['#492f24', '#ffc425'], mascot: 'Cowpokes' },
    'Montana State': { colors: ['#003875', '#a2aaad'], mascot: 'Bobkittens' },
    'Weber State': { colors: ['#4d2d6c', '#ffffff'], mascot: 'Wildkats' },
    'Iona': { colors: ['#7c2529', '#f1c400'], mascot: 'Gaelrunners' },
    'Butler': { colors: ['#13294b', '#a7a9ac'], mascot: 'Bulldawgs' },
    'Tulsa': { colors: ['#002d72', '#c5b783'], mascot: 'Golden Hurricans' },
    'Wichita State': { colors: ['#ffcd00', '#000000'], mascot: 'Shockrunners' },
    'Harvard': { colors: ['#a51c30', '#ffffff'], mascot: 'Crimson Runners' },
    'Yale': { colors: ['#00356b', '#ffffff'], mascot: 'Bulldawgs' },
    'Princeton': { colors: ['#ff8f00', '#000000'], mascot: 'Tigerstripes' },
    'Cornell': { colors: ['#b31b1b', '#ffffff'], mascot: 'Big Redbirds' },
    'Columbia': { colors: ['#75aadb', '#ffffff'], mascot: 'Lionhearts' },
    'Penn': { colors: ['#011f5b', '#990000'], mascot: 'Quakerunners' },
    'Dartmouth': { colors: ['#00693e', '#ffffff'], mascot: 'Big Greens' },
    'Brown': { colors: ['#4e3629', '#ed1c24'], mascot: 'Bearbrowns' },
    'Army': { colors: ['#000000', '#d4bf91'], mascot: 'Black Knightriders' },
    'Navy': { colors: ['#00205b', '#c5b783'], mascot: 'Midshipracers' },
    'Colgate': { colors: ['#821019', '#ffffff'], mascot: 'Raidguys' },
    'Bucknell': { colors: ['#003865', '#e87722'], mascot: 'Bisonbucks' },
    'Lehigh': { colors: ['#472f92', '#a89968'], mascot: 'Mountainhawks' },
    'Grand Canyon': { colors: ['#522398', '#ffffff'], mascot: 'Lopers' },
    // ---- DII / DIII running powers ----
    'Adams State': { colors: ['#006747', '#ffffff'], mascot: 'Grizzlybears' },
    'Colorado Mines': { colors: ['#21314d', '#c7a854'], mascot: 'Oredigguys' },
    'Grand Valley State': { colors: ['#0b5394', '#000000'], mascot: 'Lakerunners' },
    'Western Colorado': { colors: ['#8a1f2b', '#ffffff'], mascot: 'Mountaineerers' },
    'Chico State': { colors: ['#b30838', '#ffffff'], mascot: 'Wildkats' },
    'North Central (IL)': { colors: ['#00205b', '#c8102e'], mascot: 'Cardinalbirds' },
    'UW-La Crosse': { colors: ['#59113d', '#c0a875'], mascot: 'Eaglewings' },
    'MIT': { colors: ['#750014', '#8a8b8c'], mascot: 'Engineerunners' },
    'Williams': { colors: ['#4c2c92', '#ffd100'], mascot: 'Ephrunners' },
    'Carleton': { colors: ['#002d62', '#ffffff'], mascot: 'Knightowls' },
    'Pomona': { colors: ['#00449c', '#f47920'], mascot: 'Sagehens' }
  };

  // Fallback palette: distinct, UI-safe [primary, secondary] pairs. Chosen so
  // that a hash-assigned school still reads as a real, vivid team identity.
  const FALLBACK_PALETTE = [
    ['#c8102e', '#ffffff'], ['#003594', '#ffb81c'], ['#154733', '#fee123'],
    ['#512888', '#ffffff'], ['#ff7300', '#000000'], ['#00274c', '#ffcb05'],
    ['#8c1d40', '#ffc627'], ['#006747', '#ffffff'], ['#630031', '#cf4420'],
    ['#0051ba', '#e8000d'], ['#9e1b32', '#c9a54a'], ['#13294b', '#e84a27'],
    ['#4e2a84', '#ffffff'], ['#bf5700', '#ffffff'], ['#00356b', '#f1c400'],
    ['#7a0019', '#ffcc33'], ['#004a7f', '#b1b3b3'], ['#5d1725', '#f0c040'],
    ['#1e4d2b', '#c8c372'], ['#472f92', '#a89968'], ['#821019', '#a7a9ac'],
    ['#00693e', '#ffffff'], ['#0c2340', '#c99700'], ['#b30838', '#2d2d2d']
  ];

  // Mascot roots for the deterministic fallback — animal/figure names with a
  // slightly-off spin so nothing is a real trademark.
  const FALLBACK_MASCOTS = [
    'Runnin Ridgebacks', 'Thunderhawks', 'Ironwolves', 'Red Foxrunners',
    'Stormcrows', 'Timberjacks', 'River Otterrunners', 'Blue Herons',
    'Grey Wolverunners', 'Copperheads', 'Nightowls', 'Trailblazguys',
    'Wildkits', 'Golden Elkriders', 'Cardinal Runners', 'Frostwolves',
    'Mountain Goatrunners', 'Silverhawks', 'Pinerunners', 'Coyoterunners',
    'Badgerbacks', 'Falconflyers', 'Bison Runners', 'Ospreyrunners'
  ];

  // Patterns the uniform can wear. All athletes on one team share one pattern,
  // chosen deterministically from the name so a program has a signature kit.
  const PATTERNS = ['plain', 'sidestripe', 'pinstripe', 'chestband', 'yoke'];

  function hashName(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  /*
   * Resolve a school's colors + mascot. Hand-authored META wins; otherwise a
   * deterministic palette/mascot is derived from the name so it is stable
   * forever (the same school always looks the same, save after save).
   */
  D.schoolMeta = function (name) {
    const meta = D.SCHOOL_META[name];
    if (meta) return meta;
    const h = hashName(name || 'School');
    return {
      colors: FALLBACK_PALETTE[h % FALLBACK_PALETTE.length],
      mascot: FALLBACK_MASCOTS[(h >>> 8) % FALLBACK_MASCOTS.length]
    };
  };

  /*
   * The full kit for a school: primary/secondary colors plus a deterministic
   * uniform pattern. This is what the avatar reads to dress an athlete, and
   * what a coach's polo pulls its color from. Custom-league overrides (colors,
   * mascot) are respected via the `override` argument.
   */
  D.kitFor = function (name, override) {
    const meta = D.schoolMeta(name);
    const colors = (override && Array.isArray(override.colors) && override.colors.length >= 2)
      ? override.colors : meta.colors;
    const h = hashName(name || 'School');
    return {
      primary: colors[0],
      secondary: colors[1] || '#ffffff',
      pattern: PATTERNS[(h >>> 3) % PATTERNS.length]
    };
  };

  D.KIT_PATTERNS = PATTERNS;
})();
