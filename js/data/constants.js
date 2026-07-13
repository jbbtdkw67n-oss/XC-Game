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

  /*
   * Real-world program heritage (Update 4, Part 8). Historically successful
   * cross country programs start with elevated prestige AND a `heritage`
   * value that gives resilience: a blue blood must have several poor seasons
   * before its standing truly collapses, while unlisted programs can still
   * climb into the elite tier through sustained success. Prestige is always
   * relative to division — an elite DII program's number sits below an elite
   * DI program's on the shared national scale.
   *
   * Value = starting prestige floor for that program (worldgen seeds prestige
   * from it, and the prestige engine uses `heritage` as slow-decaying gravity).
   */
  D.PRESTIGE_SEEDS = {
    // Division I blue bloods of distance running
    'Northern Arizona': 96, 'Oklahoma State': 92, 'BYU': 92, 'Stanford': 90,
    'Oregon': 90, 'Colorado': 90, 'Washington': 86, 'Wisconsin': 85,
    'Arkansas': 86, 'Notre Dame': 84, 'Syracuse': 83, 'Iowa State': 83,
    'New Mexico': 82, 'Providence': 81, 'Michigan': 82, 'Georgetown': 81,
    'Portland': 80, 'Villanova': 82, 'North Carolina State': 80, 'NC State': 80,
    'Alabama': 80, 'Texas': 79, 'Ole Miss': 80, 'Furman': 78,
    // Division II powers
    'Adams State': 63, 'Colorado Mines': 62, 'Grand Valley State': 62,
    'Western Colorado': 58, 'Chico State': 57, 'Augustana (SD)': 56,
    'Colorado Christian': 55, 'Simon Fraser': 55, 'U-Mary': 55,
    'Grand Canyon': 54, 'Cal Poly Pomona': 53,
    // Division III powers
    'North Central (IL)': 53, 'UW-La Crosse': 52, 'UW-Oshkosh': 51,
    'Williams': 51, 'MIT': 50, 'Carleton': 50, 'Johns Hopkins': 50,
    'Washington U. (MO)': 50, 'Middlebury': 49, 'Wheaton (IL)': 49,
    'Calvin': 49, 'St. Olaf': 48, 'Amherst': 48, 'Pomona': 48,
    'Haverford': 47, 'RPI': 46
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

  // Expanded for the Update 6 creation wizard: hair, facial hair, skin tones,
  // ages, and accessories — enough variety that successive coaches in a
  // century-long dynasty don't all wear the same face.
  D.COACH_PORTRAITS = [
    '🧢', '😤', '🧔', '👩‍🦰', '👨‍🦲', '🕶', '👴', '🧑‍🏫',
    '🧔🏻', '🧔🏽', '🧔🏿', '👨‍🦰', '👨🏾‍🦱', '👨🏻‍🦳', '👱', '👱🏾',
    '👩', '👩🏽', '👩🏿', '👩‍🦱', '👩🏻‍🦳', '👵', '👴🏾', '🧓🏽',
    '🤠', '🥸', '😎', '🤓', '🧐', '☺️', '😏', '🫡'
  ];

  // Alma-mater pool (Update 6, Phase 3): where a coach ran in college. Flavor
  // shown on the coach profile card — a mix of storied distance programs
  // across all three divisions.
  D.ALMA_MATERS = [
    'Oregon', 'Stanford', 'Colorado', 'Northern Arizona', 'Oklahoma State',
    'BYU', 'Wisconsin', 'Arkansas', 'Villanova', 'Georgetown', 'Michigan',
    'Notre Dame', 'Iona', 'Portland', 'Washington', 'Syracuse', 'Indiana',
    'Providence', 'Colorado State', 'New Mexico', 'Furman', 'Butler', 'Tulsa',
    'Adams State', 'Western Colorado', 'Grand Valley State', 'Colorado Mines',
    'Chico State', 'Augustana', 'North Central', 'UW–La Crosse', 'MIT',
    'Williams', 'Middlebury', 'Carleton', 'Pomona-Pitzer', 'SUNY Geneseo',
    'Wartburg', 'Calvin', 'Haverford', 'Amherst', 'Johns Hopkins', 'Tufts'
  ];

  /*
   * Training Philosophy (Update 4, Part 2). A permanent identity chosen at
   * coach creation — it can NEVER change. It is separate from the coach's four
   * ratings: its effectiveness scales with the coach's Training attribute
   * (higher Training = better execution), but it is never "upgraded" directly.
   *
   * Effects are deliberately balanced trade-offs so every philosophy is
   * viable and none is objectively best. Effects feed the training engine:
   *   attrMult   — multipliers on which core ratings a week develops
   *   devMult    — flat development-rate multiplier
   *   fatigueMult— weekly fatigue accumulation multiplier
   *   injuryMult — overtraining/injury-risk multiplier
   *   durability — tiny bonus chance to build Injury Resistance
   * The magnitude of every bonus/penalty scales with Training via
   * Training.philosophyEffect(coach).
   */
  D.TRAINING_PHILOSOPHIES = [
    {
      key: 'norwegian', label: 'Norwegian Method', icon: '🇳🇴',
      short: 'Threshold-driven, controlled, low-risk.',
      desc: 'Double-threshold work and tight pace control. Threshold sessions land harder, aerobic development gets a bump, and disciplined intensity reduces overtraining risk.',
      effects: { attrMult: { lactateThreshold: 1.22, vo2Max: 1.06, stamina: 1.05 }, devMult: 1.04, fatigueMult: 0.94, injuryMult: 0.86 }
    },
    {
      key: 'high-mileage', label: 'High Mileage', icon: '🛣️',
      short: 'Relentless aerobic volume.',
      desc: 'Big weeks build enormous engines. Easy runs and long runs pay off more and endurance soars — at the cost of extra fatigue.',
      effects: { attrMult: { stamina: 1.28, vo2Max: 1.08 }, devMult: 1.03, fatigueMult: 1.14, injuryMult: 1.06 }
    },
    {
      key: 'polarized', label: 'Polarized Training', icon: '🎿',
      short: 'Easy days easy, hard days hard.',
      desc: 'Most running truly easy, the rest genuinely hard. Easy days become more productive, hard workouts more impactful, and fatigue is well managed.',
      effects: { attrMult: { vo2Max: 1.16, stamina: 1.12, lactateThreshold: 1.08 }, devMult: 1.05, fatigueMult: 0.9, injuryMult: 0.95 }
    },
    {
      key: 'threshold', label: 'Threshold Focus', icon: '⏱️',
      short: 'Tempo and lactate threshold.',
      desc: 'Tempo work is the centerpiece. Lactate threshold develops noticeably faster and race-pace strength comes early.',
      effects: { attrMult: { lactateThreshold: 1.3, runningEconomy: 1.08 }, devMult: 1.02, fatigueMult: 1.0, injuryMult: 0.96 }
    },
    {
      key: 'speed', label: 'Speed Development', icon: '⚡',
      short: 'Sharp legs and a finishing kick.',
      desc: 'Interval and speed sessions cut deeper. Raw speed, economy, and the finishing kick sharpen faster — endurance builds a touch slower.',
      effects: { attrMult: { speed: 1.32, runningEconomy: 1.12, vo2Max: 1.06, stamina: 0.95 }, devMult: 1.02, fatigueMult: 1.02, injuryMult: 1.0 }
    },
    {
      key: 'strength-endurance', label: 'Strength Endurance', icon: '⛰️',
      short: 'Hills, strength, late-race power.',
      desc: 'Hill work and strength sessions matter more. Late-race strength and durability improve, so your runners are still moving up when others fade.',
      effects: { attrMult: { runningEconomy: 1.18, stamina: 1.12, speed: 1.06 }, devMult: 1.02, fatigueMult: 1.0, injuryMult: 0.9, durability: 1.6 }
    },
    {
      key: 'balanced', label: 'Balanced', icon: '⚖️',
      short: 'A little of everything, no weaknesses.',
      desc: 'Small, steady improvements across every workout type. No glaring strengths, but no weaknesses either — supremely dependable.',
      effects: { attrMult: { vo2Max: 1.06, stamina: 1.06, lactateThreshold: 1.06, runningEconomy: 1.06, speed: 1.06 }, devMult: 1.05, fatigueMult: 0.97, injuryMult: 0.97 }
    }
  ];

  D.trainingPhilosophy = function (key) {
    return D.TRAINING_PHILOSOPHIES.find((p) => p.key === key) ||
      D.TRAINING_PHILOSOPHIES.find((p) => p.key === 'balanced');
  };

  /*
   * Race Philosophy (Update 4, Part 3). Unlike Training Philosophy this CAN be
   * changed after creation (on the My Program screen). It shapes how a coach's
   * athletes behave in a race — pack discipline, energy conservation, surging,
   * and the finish. Every option is a genuine trade-off; none dominates.
   * The race engine reads these `tactic` weights per runner.
   */
  D.RACE_PHILOSOPHIES = [
    {
      key: 'sit-and-kick', label: 'Sit &amp; Kick', icon: '🏹',
      desc: 'Stay tucked in the pack, conserve energy, and unleash a decisive kick over the final stretch.',
      tactic: { packBias: 0.18, reserveBonus: 0.10, surge: 0.6, kick: 1.35, earlyPace: 0.99 }
    },
    {
      key: 'aggressive', label: 'Aggressive Front Running', icon: '🔥',
      desc: 'Push the pace from the gun and try to break the field early. High reward, higher fade risk.',
      tactic: { packBias: -0.16, reserveBonus: -0.06, surge: 1.7, kick: 0.85, earlyPace: 0.975 }
    },
    {
      key: 'conservative', label: 'Conservative', icon: '🧊',
      desc: 'Avoid early burnout and grind steadily through the field in the second half.',
      tactic: { packBias: 0.08, reserveBonus: 0.12, surge: 0.75, kick: 1.05, earlyPace: 1.012, lateGrind: 1.18 }
    },
    {
      key: 'even', label: 'Even Pace', icon: '📏',
      desc: 'Run metronomic, evenly-paced efforts. Fewer highs and lows, very consistent finishes.',
      tactic: { packBias: 0.02, reserveBonus: 0.05, surge: 0.55, kick: 1.0, earlyPace: 1.0, evenness: 1.0 }
    },
    {
      key: 'pack', label: 'Pack Running', icon: '🐺',
      desc: 'Teammates run together as long as possible for stronger, more consistent team scoring.',
      tactic: { packBias: 0.22, reserveBonus: 0.06, surge: 0.7, kick: 1.08, earlyPace: 1.0, teamPack: 1.0 }
    }
  ];

  D.racePhilosophy = function (key) {
    return D.RACE_PHILOSOPHIES.find((p) => p.key === key) ||
      D.RACE_PHILOSOPHIES.find((p) => p.key === 'even');
  };

  // Short division tags for accolade labels (DI → D1, etc.).
  D.DIVISION_SHORT = { DI: 'D1', DII: 'D2', DIII: 'D3' };

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
    'Stress Fracture', 'Stress Reaction', 'Shin Splints', 'Hamstring Strain',
    'Calf Strain', 'Achilles Tendinitis', 'Plantar Fasciitis', 'Foot Injury',
    'Illness', 'IT Band Syndrome', 'Overtraining Fatigue'
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
  // Update 6, Section 4: the old separate Easy/Recovery runs merged into one
  // genuinely restorative Easy Run (legacy plans with 'recovery' auto-map).
  // Championship Simulation joined the hard sessions: a full race-effort
  // rehearsal — big fitness/sharpness payoff, big fatigue and injury risk.
  D.WORKOUTS = {
    rest:      { label: 'Rest Day',          short: 'Rest',  fatigue: -13, injury: 0.0, hard: false, attrs: {}, isRest: true },
    easy:      { label: 'Easy Run',          short: 'Easy',  fatigue: -3, injury: 0.4, hard: false, attrs: { stamina: 0.5 } },
    long:      { label: 'Long Run',          short: 'Long',  fatigue: 10, injury: 1.1, hard: true,  attrs: { stamina: 3.0, vo2Max: 1.0 } },
    tempo:     { label: 'Tempo',             short: 'Tempo', fatigue: 9,  injury: 1.0, hard: true,  attrs: { lactateThreshold: 3.0, stamina: 1.0 } },
    hills:     { label: 'Hills',             short: 'Hills', fatigue: 11, injury: 1.4, hard: true,  attrs: { vo2Max: 2.0, speed: 2.0, runningEconomy: 2.0 } },
    intervals: { label: 'Intervals',         short: 'Int',   fatigue: 12, injury: 1.3, hard: true,  attrs: { vo2Max: 3.0, speed: 1.0 } },
    speed:     { label: 'Speed Development', short: 'Spd',   fatigue: 8,  injury: 1.2, hard: true,  attrs: { speed: 3.0, runningEconomy: 2.0 } },
    racesim:   { label: 'Championship Simulation', short: 'Sim', fatigue: 13, injury: 1.5, hard: true, attrs: { vo2Max: 1.5, lactateThreshold: 1.5, stamina: 0.5 } }
  };

  D.DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // A sensible balanced starting week (Mon → Sun).
  D.DEFAULT_WEEK_PLAN = ['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy'];

  /* ------------------------------------------------------------------ *
   * Periodization (Update 6, Section 4): the season moves through named
   * training phases; plans that match the phase develop athletes best,
   * and AI staffs follow the same calendar. `fit` inspects a plan meta.
   * ------------------------------------------------------------------ */
  D.TRAINING_PHASES = [
    { key: 'base',        label: 'Base Phase',         icon: '🧱', upTo: 3,
      ideal: 'Aerobic volume: a long run, tempo work, plenty of easy running — no more than 2 hard days.',
      fit: (m) => m.hasLong && m.hardDays >= 1 && m.hardDays <= 2 },
    { key: 'build',       label: 'Build Phase',        icon: '📈', upTo: 7,
      ideal: 'Classic quality: 2-3 hard sessions plus the long run, real recovery between.',
      fit: (m) => m.hasLong && m.hardDays >= 2 && m.hardDays <= 3 },
    { key: 'specific',    label: 'Specific Phase',     icon: '🎯', upTo: 11,
      ideal: 'Race-specific work: 2-3 hard days including intervals, speed, or a championship simulation.',
      fit: (m) => m.hardDays >= 2 && m.hardDays <= 3 && (m.speedDays > 0 || m.racesimDays > 0) },
    { key: 'peak',        label: 'Peak Phase',         icon: '⛰', upTo: 12,
      ideal: 'Sharpen while shedding load: at most 2 hard days, speed or a race simulation, mostly easy running.',
      fit: (m) => m.hardDays >= 1 && m.hardDays <= 2 && (m.speedDays > 0 || m.racesimDays > 0) },
    { key: 'championship', label: 'Championship Phase', icon: '🏆', upTo: 15,
      ideal: 'The taper: one hard touch at most, rest days banked, everything else easy.',
      fit: (m) => m.hardDays <= 1 && (m.restDays > 0 || m.easyDays >= 4) },
    { key: 'transition',  label: 'Transition Phase',   icon: '🍂', upTo: 99,
      ideal: 'Let the body absorb the season: easy running, genuine rest, no forced quality.',
      fit: (m) => m.hardDays <= 1 }
  ];
  D.trainingPhaseForWeek = (week) => D.TRAINING_PHASES.find((p) => week <= p.upTo) ||
    D.TRAINING_PHASES[D.TRAINING_PHASES.length - 1];

  // Injury table: name + base weeks out [min, max]. `overuse:true` marks the
  // chronic breakdowns that mileage abuse drives (Update 3).
  D.INJURIES = [
    { type: 'Shin Splints',        weeks: [1, 3],  weight: 20, overuse: true },
    { type: 'Illness',             weeks: [1, 2],  weight: 18 },
    { type: 'Calf Strain',         weeks: [1, 3],  weight: 14 },
    { type: 'Foot Injury',         weeks: [2, 4],  weight: 12 },
    { type: 'Hamstring Strain',    weeks: [2, 5],  weight: 12 },
    { type: 'IT Band Syndrome',    weeks: [2, 5],  weight: 10, overuse: true },
    { type: 'Achilles Tendinitis', weeks: [3, 7],  weight: 9,  overuse: true },
    { type: 'Plantar Fasciitis',   weeks: [3, 8],  weight: 8,  overuse: true },
    { type: 'Stress Reaction',     weeks: [3, 6],  weight: 8,  overuse: true },
    { type: 'Overtraining Fatigue',weeks: [2, 4],  weight: 6,  overuse: true },
    { type: 'Stress Fracture',     weeks: [6, 12], weight: 5,  overuse: true }
  ];

  // When mileage is pushed well beyond what a body can absorb, injuries skew
  // hard toward these chronic overuse breakdowns rather than random bad luck.
  D.OVERUSE_INJURIES = D.INJURIES.filter((i) => i.overuse);

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
    familiarityBonus: 0.004,  // ~0.4% faster at Nationals on the same course
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

  /* ------------------------------------------------------------------ *
   * Job security (Update 5, Part 5): every coach's chair carries a
   * legible status derived from the hot-seat pressure that builds when a
   * program underperforms its expectations for multiple seasons. Shown on
   * coach profiles and the player's dashboard so the carousel feels alive.
   * ------------------------------------------------------------------ */
  D.SEAT_STATUSES = [
    { min: 62, key: 'hot',    label: 'Hot Seat',   icon: '🔥', desc: 'Another poor season likely ends this tenure.' },
    { min: 34, key: 'warm',   label: 'Warm Seat',  icon: '🟠', desc: 'Expectations are being missed — the pressure is building.' },
    { min: 0,  key: 'stable', label: 'Stable',     icon: '🟢', desc: 'The job is secure; results meet or beat expectations.' }
  ];

  D.seatStatus = function (hotSeat) {
    const h = hotSeat || 0;
    return D.SEAT_STATUSES.find((s) => h >= s.min) || D.SEAT_STATUSES[D.SEAT_STATUSES.length - 1];
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
    teamChem:     'Disconnected from teammates',
    moveUp:       'Chasing higher-division competition',
    nil:          'NIL opportunities',
    style:        'Playing style mismatch',
    overtraining: 'Overtraining',
    undertraining:'Undertraining',
    fresh:        'Fresh start'
  };
})();
