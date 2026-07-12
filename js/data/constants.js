(function () {
  const D = window.XCD.data;

  // Every US state (plus DC) mapped to a broad recruiting/geographic region.
  // Used for regional recruiting territory logic, weather profiles, and travel.
  D.STATE_REGION = {
    CT: 'Northeast', ME: 'Northeast', MA: 'Northeast', NH: 'Northeast', RI: 'Northeast',
    VT: 'Northeast', NJ: 'Northeast', NY: 'Northeast', PA: 'Northeast',
    DE: 'Mid-Atlantic', MD: 'Mid-Atlantic', VA: 'Mid-Atlantic', WV: 'Mid-Atlantic', DC: 'Mid-Atlantic',
    NC: 'Southeast', SC: 'Southeast', GA: 'Southeast', FL: 'Southeast', AL: 'Southeast',
    MS: 'Southeast', TN: 'Southeast', KY: 'Southeast', LA: 'Southeast', AR: 'Southeast',
    OH: 'Midwest', MI: 'Midwest', IN: 'Midwest', IL: 'Midwest', WI: 'Midwest',
    MN: 'Midwest', IA: 'Midwest', MO: 'Midwest', ND: 'Midwest', SD: 'Midwest', NE: 'Midwest', KS: 'Midwest',
    TX: 'South', OK: 'South',
    AZ: 'Southwest', NM: 'Southwest',
    CO: 'Mountain', UT: 'Mountain', WY: 'Mountain', MT: 'Mountain', ID: 'Mountain', NV: 'Mountain',
    WA: 'Pacific', OR: 'Pacific', CA: 'Pacific', AK: 'Pacific', HI: 'Pacific'
  };

  // Conference metadata: prestige tier drives starting budget/facilities/talent baseline.
  // tier 1 = Power conferences, tier 2 = strong mid-major, tier 3 = mid-major, tier 4 = low-major
  D.CONFERENCES = {
    'ACC': { tier: 1 }, 'Big Ten': { tier: 1 }, 'Big 12': { tier: 1 }, 'SEC': { tier: 1 },
    'Big East': { tier: 2 }, 'American': { tier: 2 }, 'Mountain West': { tier: 2 }, 'Atlantic 10': { tier: 2 },
    'West Coast': { tier: 2 }, 'Ivy League': { tier: 2 },
    'Sun Belt': { tier: 3 }, 'Conference USA': { tier: 3 }, 'MAC': { tier: 3 }, 'CAA': { tier: 3 },
    'Patriot League': { tier: 3 }, 'Missouri Valley': { tier: 3 }, 'Southern': { tier: 3 }, 'Big Sky': { tier: 3 },
    'WAC': { tier: 3 }, 'Big West': { tier: 3 },
    'ASUN': { tier: 4 }, 'Big South': { tier: 4 }, 'Southland': { tier: 4 }, 'MEAC': { tier: 4 },
    'SWAC': { tier: 4 }, 'Horizon': { tier: 4 }, 'Summit League': { tier: 4 }, 'America East': { tier: 4 },
    'MAAC': { tier: 4 }, 'NEC': { tier: 4 }, 'OVC': { tier: 4 }, 'Independent': { tier: 4 }
  };

  D.CLASS_YEARS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];

  D.GENDERS = ['M', 'W'];

  /*
   * The four coach archetypes. Each starts with a meaningful bonus to its
   * signature rating (and AI coaches lean into it as they progress).
   */
  D.COACH_ARCHETYPES = [
    { key: 'Recruiter',     rating: 'recruiting', icon: '📞', desc: 'A relentless salesman on the trail. Starts with bonus Recruiting — more points every week and more pull with prospects.' },
    { key: 'Developer',     rating: 'training',   icon: '📈', desc: 'A master of the daily grind. Starts with bonus Training — athletes develop faster all year long.' },
    { key: 'Tactician',     rating: 'peaking',    icon: '🎯', desc: 'Built for November. Starts with bonus Peaking — athletes hit championship fitness at Conference, Regionals, and Nationals.' },
    { key: 'Players Coach', rating: 'culture',    icon: '🤝', desc: 'Runs the best locker room in the country. Starts with bonus Culture — happier athletes, better chemistry, fewer transfers.' }
  ];

  D.COACH_PORTRAITS = ['🧢', '😤', '🧔', '👩‍🦰', '👨‍🦲', '🕶', '👴', '🧑‍🏫'];

  D.ATHLETE_PERSONALITIES = [
    'Grinder', 'Confident', 'Laid Back', 'Fiery Competitor', 'Team-First', 'Individualist',
    'Perfectionist', 'Free Spirit', 'Cerebral', 'Anxious'
  ];

  D.PREFERRED_DISTANCES = ['5K', '8K', '10K', 'All-Around'];

  D.PREFERRED_CLIMATES = ['Warm', 'Cold', 'Temperate', 'No Preference'];

  D.PREFERRED_SCHOOL_SIZES = ['Small', 'Medium', 'Large', 'No Preference'];

  D.MAJORS = [
    'Exercise Science', 'Business', 'Biology', 'Communications', 'Engineering', 'Psychology',
    'Nursing', 'Education', 'Kinesiology', 'Economics', 'Undecided', 'Political Science',
    'Computer Science', 'Sports Management', 'Marketing', 'Public Health'
  ];

  // Broad regional weather/altitude flavor, used for training & race conditions later phases.
  D.REGION_WEATHER = {
    'Northeast': { tempBase: 55, altitude: 'Low', humidity: 'Medium' },
    'Mid-Atlantic': { tempBase: 60, altitude: 'Low', humidity: 'Medium' },
    'Southeast': { tempBase: 72, altitude: 'Low', humidity: 'High' },
    'Midwest': { tempBase: 54, altitude: 'Low', humidity: 'Medium' },
    'South': { tempBase: 75, altitude: 'Low', humidity: 'High' },
    'Southwest': { tempBase: 78, altitude: 'Medium', humidity: 'Low' },
    'Mountain': { tempBase: 50, altitude: 'High', humidity: 'Low' },
    'Pacific': { tempBase: 62, altitude: 'Medium', humidity: 'Medium' }
  };

  D.INJURY_TYPES = [
    'Stress Fracture', 'Shin Splints', 'Hamstring Strain', 'Achilles Tendinitis',
    'Foot Injury', 'Illness', 'IT Band Syndrome', 'Overtraining Fatigue'
  ];

  // Approximate state centroid coordinates for recruiting distance math.
  D.STATE_COORDS = {
    AL: [32.8, -86.8], AK: [64.0, -152.0], AZ: [34.2, -111.6], AR: [34.9, -92.4], CA: [37.2, -119.3],
    CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4],
    GA: [32.6, -83.4], HI: [20.8, -156.3], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3],
    IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.0, -92.0], ME: [45.4, -69.2],
    MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7],
    MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6],
    NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.6], NC: [35.5, -79.4], ND: [47.4, -100.5],
    OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.6],
    SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7],
    VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.7],
    WY: [43.0, -107.6]
  };

  /* ------------------------------------------------------------------ *
   * Recruiting
   * ------------------------------------------------------------------ */

  // Hidden motivations: discovered through phone calls / home visits.
  // Each has a key used by the fit engine to weight appeal.
  D.MOTIVATIONS = [
    { key: 'homebody', label: 'Wants to stay close to home' },
    { key: 'title-chaser', label: 'Dreams of contending for national titles' },
    { key: 'scholar', label: 'Values elite academics' },
    { key: 'impact', label: 'Wants to score for the varsity right away' },
    { key: 'project', label: 'Wants a program that develops runners long-term' },
    { key: 'nil-money', label: 'Motivated by NIL opportunities' },
    { key: 'facilities-hound', label: 'Obsessed with training facilities' },
    { key: 'warm-weather', label: 'Wants to train in warm weather' },
    { key: 'cold-weather', label: 'Prefers cool training climates' },
    { key: 'altitude-seeker', label: 'Believes in altitude training' },
    { key: 'family-first', label: 'Parents heavily influence the decision' },
    { key: 'spotlight', label: 'Wants big-conference atmosphere' },
    { key: 'underdog', label: 'Likes the idea of building something new' }
  ];

  D.RECRUIT_SOURCES = ['HS', 'JUCO', 'International'];

  D.INTERNATIONAL_COUNTRIES = [
    'Kenya', 'Ethiopia', 'Great Britain', 'Ireland', 'Australia', 'Canada',
    'Germany', 'Japan', 'Norway', 'New Zealand', 'Uganda', 'Spain', 'Mexico'
  ];

  /*
   * Recruiting actions available to every program.
   * points  — weekly recruiting effort points
   * cost    — dollars from the annual recruiting budget
   * relationship / interest — base gains (scaled by coach charisma etc.)
   * scout   — scouting knowledge gained
   * reveal  — chance to uncover one hidden motivation
   * requires — gating rules checked by the engine
   */
  D.RECRUIT_ACTIONS = {
    letter:        { label: 'Send Letter',          points: 1, cost: 50,   relationship: 2,  interest: 1, scout: 2,  reveal: 0.03 },
    call:          { label: 'Phone Call',           points: 2, cost: 100,  relationship: 5,  interest: 2, scout: 4,  reveal: 0.22 },
    watchRace:     { label: 'Watch Race',           points: 3, cost: 500,  relationship: 2,  interest: 2, scout: 30, reveal: 0.05 },
    assistantVisit:{ label: 'Assistant Visit',      points: 3, cost: 800,  relationship: 7,  interest: 4, scout: 12, reveal: 0.25 },
    homeVisit:     { label: 'Home Visit',           points: 5, cost: 1200, relationship: 12, interest: 6, scout: 8,  reveal: 0.55 },
    campusVisit:   { label: 'Campus Visit',         points: 6, cost: 2000, relationship: 8,  interest: 14, scout: 5, reveal: 0.25, requires: 'interest30' },
    hostOvernight: { label: 'Host Overnight',       points: 4, cost: 1000, relationship: 10, interest: 9, scout: 3,  reveal: 0.15, requires: 'visited' },
    meetTeam:      { label: 'Invite to Meet Team',  points: 2, cost: 200,  relationship: 5,  interest: 4, scout: 2,  reveal: 0.08 },
    offer:         { label: 'Offer Scholarship',    points: 3, cost: 0,    relationship: 6,  interest: 10, scout: 0, reveal: 0 }
  };

  // Weekly cap on actions per recruit (prevents interest-dumping).
  D.MAX_ACTIONS_PER_RECRUIT_WEEK = 2;

  /* ------------------------------------------------------------------ *
   * Training
   * ------------------------------------------------------------------ */

  /*
   * The seven workout types (the ONLY workouts in the game).
   * attrs   = which of the six core ratings a day of this work develops
   * fatigue = fatigue cost of one day (negative = restorative)
   * injury  = injury-risk factor of one day
   * hard    = counts as a quality/hard day for plan-balance math
   */
  D.WORKOUTS = {
    easy:      { label: 'Easy Run',          short: 'Easy',  fatigue: 4,  injury: 0.6, hard: false, attrs: { stamina: 1.0 } },
    recovery:  { label: 'Recovery Run',      short: 'Rec',   fatigue: -7, injury: 0.3, hard: false, attrs: { stamina: 0.25 } },
    long:      { label: 'Long Run',          short: 'Long',  fatigue: 10, injury: 1.1, hard: true,  attrs: { stamina: 3.0, vo2Max: 1.0 } },
    tempo:     { label: 'Tempo',             short: 'Tempo', fatigue: 9,  injury: 1.0, hard: true,  attrs: { lactateThreshold: 3.0, stamina: 1.0 } },
    hills:     { label: 'Hills',             short: 'Hills', fatigue: 11, injury: 1.4, hard: true,  attrs: { vo2Max: 2.0, speed: 2.0, runningEconomy: 2.0 } },
    intervals: { label: 'Intervals',         short: 'Int',   fatigue: 12, injury: 1.3, hard: true,  attrs: { vo2Max: 3.0, speed: 1.0 } },
    speed:     { label: 'Speed Development', short: 'Spd',   fatigue: 8,  injury: 1.2, hard: true,  attrs: { speed: 3.0, runningEconomy: 2.0 } }
  };

  D.DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // A sensible balanced starting week (Mon → Sun).
  D.DEFAULT_WEEK_PLAN = ['easy', 'intervals', 'recovery', 'tempo', 'easy', 'long', 'recovery'];

  // Injury table: name + base weeks out [min, max]
  D.INJURIES = [
    { type: 'Shin Splints',        weeks: [1, 3],  weight: 22 },
    { type: 'Illness',             weeks: [1, 2],  weight: 20 },
    { type: 'Foot Injury',         weeks: [2, 4],  weight: 14 },
    { type: 'Hamstring Strain',    weeks: [2, 5],  weight: 13 },
    { type: 'IT Band Syndrome',    weeks: [2, 5],  weight: 10 },
    { type: 'Achilles Tendinitis', weeks: [3, 7],  weight: 9 },
    { type: 'Overtraining Fatigue',weeks: [2, 4],  weight: 6 },
    { type: 'Stress Fracture',     weeks: [6, 12], weight: 6 }
  ];

  // Hidden development archetypes (assigned at generation, never shown raw)
  D.DEV_PROFILES = [
    { type: 'normal', weight: 55 },
    { type: 'early',  weight: 15 },  // freshman-year surger, plateaus sooner
    { type: 'late',   weight: 18 },  // slow start, junior/senior leap
    { type: 'bust',   weight: 12 }   // never quite gets there
  ];

  /* ------------------------------------------------------------------ *
   * The season calendar — Update 2 (Part 5).
   *
   *   Wk 1-3   Summer Training (3 weeks)
   *   Wk 4-12  Regular Season (9 weeks): meets at 4/6/8/10/12 with one
   *            bye week between every meet
   *   Wk 13    Conference Championships   ┐
   *   Wk 14    NCAA Regionals             ├ no bye weeks between rounds
   *   Wk 15    NCAA Nationals             ┘
   *   Wk 16-21 Offseason (6 weeks): awards, portal, signing day
   * ------------------------------------------------------------------ */
  D.CALENDAR = {
    WEEKS_PER_YEAR: 21,
    SUMMER_WEEKS: 3,
    REGULAR_SEASON_START: 4,
    MEET_WEEKS: [4, 6, 8, 10, 12],
    CONFERENCE_WEEK: 13,
    REGIONAL_WEEK: 14,
    NATIONAL_WEEK: 15,
    OFFSEASON_START: 16,
    AWARDS_WEEK: 16
  };

  /*
   * Prestigious regular-season invitationals (Part 7). Elite programs get
   * the call; everyone else runs regional invitationals the same weekend.
   * `size` = teams invited (by prestige, with a few lottery mid-majors),
   * `weight` = extra poll credit for racing (and beating) the best.
   */
  D.ELITE_MEETS = [
    { week: 6,  name: 'Joe Piane Invitational',  size: 28, weight: 1.2 },
    { week: 6,  name: 'Roy Griak Invitational',  size: 28, weight: 1.15 },
    { week: 8,  name: 'Nuttycombe Invitational', size: 34, weight: 1.3 },
    { week: 8,  name: 'Wisconsin Invitational',  size: 34, weight: 1.2 },
    // Pre-Nationals (Update 3): a Division I-only elite invitational late in
    // the regular season, contested on the NCAA DI Championship course. Built
    // specially by the race engine (invite/decline, course familiarity) — not
    // through the generic prestige-field path, so it carries no `size` here.
    { week: 10, name: 'Pre-Nationals', preNationals: true, weight: 1.45 }
  ];

  /*
   * Pre-Nationals Invitational (Update 3). Division I only. Racing it earns a
   * small, non-decisive familiarity edge on the same course at NCAA Nationals.
   */
  D.PRE_NATIONALS = {
    name: 'Pre-Nationals Invitational',
    week: 10,                 // 3 weeks before conference (wk 13)
    fieldSize: 40,            // invited DI programs (before declines)
    atLargeSlots: 6,          // rising mid-majors having exceptional seasons
    familiarityBonus: 0.006,  // ~0.6% faster at Nationals on the same course
    pollWeight: 1.45          // one of the most influential regular-season meets
  };

  // Recruiting calendar (within the 21-week year)
  D.RECRUITING = {
    CLASS_SIZE_PER_GENDER: 1200,
    SIGNING_WEEK: 19,       // national signing day (offseason)
    EARLY_COMMIT_WEEK: 3,   // earliest anyone verbals
    AI_SIGNEES_TARGET: 5    // roster spots AI schools try to fill per gender
  };

  /* ------------------------------------------------------------------ *
   * Mileage (Part 6). Weekly volume is its own training variable,
   * independent of the day-by-day workout plan.
   * ------------------------------------------------------------------ */
  D.MILEAGE = {
    MIN: 30,
    MAX: 120,
    DEFAULT: { M: 70, W: 60 },
    // Named presets for the training screen (per-athlete deltas are
    // applied relative to the squad's program mileage).
    PRESETS: [
      { key: 'freshmen',  label: 'Freshmen preset',          desc: 'New arrivals absorb less volume', delta: -15, filter: 'freshmen' },
      { key: 'redshirt',  label: 'Redshirt preset',          desc: 'A quiet year of aerobic building', delta: +10, filter: 'redshirts' },
      { key: 'taper',     label: 'Championship taper',       desc: 'Cut volume, sharpen, race fast',   scale: 0.55, filter: 'all' },
      { key: 'recovery',  label: 'Recovery preset',          desc: 'Back off everyone to recharge',    absolute: 42, filter: 'all' }
    ]
  };

  /* ------------------------------------------------------------------ *
   * Coach reputation (Part 1): national standing, separate from school
   * prestige. Earned by winning and developing; lost by losing and misses.
   * ------------------------------------------------------------------ */
  D.REPUTATION_LEVELS = [
    { min: 92, label: 'Hall of Fame Coach', icon: '🏛' },
    { min: 80, label: 'Legend',             icon: '👑' },
    { min: 66, label: 'Elite Recruiter',    icon: '🌟' },
    { min: 50, label: 'National Coach',     icon: '🇺🇸' },
    { min: 34, label: 'Respected Builder',  icon: '🔨' },
    { min: 18, label: 'Small School Coach', icon: '🏫' },
    { min: 0,  label: 'Unknown Assistant',  icon: '❔' }
  ];

  D.reputationLevel = function (rep) {
    return D.REPUTATION_LEVELS.find((l) => rep >= l.min) || D.REPUTATION_LEVELS[D.REPUTATION_LEVELS.length - 1];
  };

  /*
   * Coaching tendencies (Part 2): every coach — AI and player alike —
   * carries identity traits that shape how they run their program over
   * decades. Mileage tendencies set training volume; recruiting
   * tendencies shape boards; temperament shapes race-week choices.
   */
  D.COACH_TENDENCIES = [
    { key: 'elite-recruiter',        label: 'Elite Recruiter',        group: 'recruiting' },
    { key: 'development-specialist', label: 'Development Specialist', group: 'recruiting' },
    { key: 'transfer-expert',        label: 'Transfer Portal Expert', group: 'recruiting' },
    { key: 'international',         label: 'International Recruiter', group: 'territory' },
    { key: 'regional',              label: 'Regional Recruiter',      group: 'territory' },
    { key: 'mileage-heavy',         label: 'Mileage Heavy',           group: 'volume' },
    { key: 'low-mileage',           label: 'Low Mileage',             group: 'volume' },
    { key: 'conservative',          label: 'Conservative',            group: 'temperament' },
    { key: 'aggressive',            label: 'Aggressive',              group: 'temperament' }
  ];

  /* ------------------------------------------------------------------ *
   * Generational talent (Part 12.5). Roughly one per 7-8 recruiting
   * classes via weighted odds — streaks and droughts both happen, and
   * (very rarely) two land in the same class.
   * ------------------------------------------------------------------ */
  D.GENERATIONAL = {
    // Per gender, per class: P(1) + P(2) ≈ 0.066 → ~0.13 expected per
    // year across both genders ≈ one every 7.6 classes. As a share of
    // recruits that's ~1 in 18,000 generated (≈0.006% per recruit, and
    // ~0.05-0.15% of the *ranked* national pool in the years one appears).
    P_ONE: 0.062,
    P_TWO: 0.004,
    // Signature strength/weakness archetypes — no two feel the same.
    PROFILES: [
      { key: 'diesel',     label: 'The Diesel',        strengths: { stamina: 8, lactateThreshold: 6 }, weaknesses: { speed: -14 },            note: 'Incredible endurance, average finishing kick.' },
      { key: 'kicker',     label: 'The Closer',        strengths: { speed: 9, runningEconomy: 4 },     weaknesses: { consistency: -18 },      note: 'Elite speed, inconsistent pacing.' },
      { key: 'engine',     label: 'The Aerobic Freak', strengths: { vo2Max: 9 },                       weaknesses: { injuryResistance: -25 }, note: 'Outstanding engine with injury concerns.' },
      { key: 'tactician',  label: 'The Tactician',     strengths: { raceIQ: 12, consistency: 8 },      weaknesses: { hillAdaptation: -20 },   note: 'Tactical genius, struggles on hills.' },
      { key: 'metronome',  label: 'The Metronome',     strengths: { consistency: 14, lactateThreshold: 5 }, weaknesses: { mentalToughness: -12 }, note: 'Machine-like pacing, wobbles under pressure.' },
      { key: 'complete',   label: 'The Prodigy',       strengths: { vo2Max: 4, speed: 4, stamina: 4 }, weaknesses: { workEthic: -10 },        note: 'Does everything well; talent came easy.' }
    ]
  };

  /* Transfer portal entry reasons (Part 4) — every departure has a story. */
  D.PORTAL_REASONS = {
    racing:       'Lack of racing opportunities',
    coachLeft:    'Coach departed',
    culture:      'Poor team culture',
    homesick:     'Homesickness',
    academics:    'Academics',
    contender:    'Championship aspirations',
    trainingFit:  'Poor training fit',
    relationship: 'Low coach relationship',
    nil:          'NIL opportunities',
    style:        'Playing style mismatch',
    overtraining: 'Overtraining',
    undertraining:'Undertraining',
    fresh:        'Fresh start'
  };
})();
