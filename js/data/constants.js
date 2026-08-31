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
    // ---- Division I ----
    // Elite blue bloods of distance running (top of the sport).
    'Northern Arizona': 96, 'BYU': 92, 'Oklahoma State': 91, 'Stanford': 90,
    'Oregon': 90, 'Arkansas': 90, 'Colorado': 89,
    // Strong national programs (perennial contenders / recent podiums).
    'Wisconsin': 87, 'Iowa State': 86, 'Washington': 85, 'Syracuse': 84,
    'Notre Dame': 84, 'NC State': 84, 'North Carolina State': 84,
    'New Mexico': 83, 'Villanova': 83, 'Michigan': 83, 'Iona': 82,
    'Providence': 82, 'Georgetown': 82, 'Portland': 81, 'Alabama': 81,
    'Ole Miss': 80, 'Texas': 80, 'Furman': 80,
    // Solid, established programs (regular NCAA qualifiers).
    'Florida State': 78, 'Colorado State': 77, 'Michigan State': 77,
    'Minnesota': 76, 'Air Force': 76, 'Tulsa': 76, 'Butler': 75, 'Princeton': 75,
    'Indiana': 74, 'Harvard': 74, 'Cornell': 74, 'Tennessee': 74, 'Texas A&M': 74,
    'Wake Forest': 73, 'Boston College': 73, 'Columbia': 73, 'Boise State': 73,
    'Montana State': 73, 'Eastern Kentucky': 73, 'California': 73, 'Duke': 72,
    'Oklahoma': 72, 'Utah State': 72, 'Weber State': 72, 'Southern Utah': 72,
    'Northern Colorado': 72, 'Gonzaga': 71, 'Yale': 71, 'Penn': 71, 'Dartmouth': 71,
    'Mississippi State': 71, 'Wyoming': 70, 'Utah': 74, 'Arizona': 72, 'Arizona State': 73,
    // ---- Division II powers ----
    'Adams State': 64, 'Colorado Mines': 62, 'Grand Valley State': 62,
    'Western Colorado': 58, 'Chico State': 57, 'Augustana (SD)': 56,
    'Western Washington': 56, 'Colorado Christian': 55, 'Simon Fraser': 55,
    'U-Mary': 55, 'Grand Canyon': 54, 'Cal Poly Pomona': 53, 'Pittsburg State': 52,
    'Minnesota State': 52, 'Western Oregon': 51, 'Alaska Anchorage': 51,
    // ---- Division III powers ----
    'North Central (IL)': 54, 'UW-La Crosse': 53, 'UW-Oshkosh': 51,
    'Williams': 51, 'MIT': 50, 'Carleton': 50, 'Johns Hopkins': 50,
    'Washington U. (MO)': 50, 'Middlebury': 49, 'Wheaton (IL)': 49,
    'Calvin': 49, 'St. Olaf': 48, 'Amherst': 48, 'Pomona': 48,
    'Haverford': 47, 'RPI': 46, 'Wartburg': 50, 'Nebraska Wesleyan': 46
  };

  /*
   * Real-world academic reputation (Balance & Realism update). Each program's
   * in-game Academics rating (0–99) is anchored to its actual academic
   * standing so that a genuinely strong academic school reads as one in the
   * game — a recruit who values academics feels the difference between an Ivy
   * and a low-major. Worldgen seeds Academics from this value (with a tiny
   * ± wobble) when a school is listed; unlisted programs fall back to a
   * conference-tier baseline. Aliases (e.g. "NC State"/"North Carolina State")
   * are both listed so whichever name the world uses resolves.
   */
  D.ACADEMIC_SEEDS = {
    // ================= Division I =================
    // ---- ACC ----
    'Boston College': 89, 'California': 96, 'Clemson': 78, 'Duke': 98,
    'Florida State': 79, 'Georgia Tech': 93, 'Louisville': 68, 'Miami': 81,
    'NC State': 80, 'North Carolina State': 80, 'North Carolina': 90,
    'Notre Dame': 96, 'Pittsburgh': 84, 'SMU': 82, 'Stanford': 99,
    'Syracuse': 80, 'Virginia': 94, 'Virginia Tech': 79, 'Wake Forest': 90,
    // ---- Big Ten ----
    'Illinois': 87, 'Indiana': 77, 'Iowa': 79, 'Maryland': 85, 'Michigan': 94,
    'Michigan State': 77, 'Minnesota': 83, 'Nebraska': 70, 'Northwestern': 97,
    'Ohio State': 83, 'Oregon': 73, 'Penn State': 83, 'Purdue': 84,
    'Rutgers': 81, 'UCLA': 95, 'USC': 90, 'Washington': 86, 'Wisconsin': 89,
    // ---- Big 12 ----
    'Arizona': 76, 'Arizona State': 72, 'Baylor': 78, 'BYU': 76,
    'Cincinnati': 68, 'Colorado': 78, 'Houston': 66, 'Iowa State': 74,
    'Kansas': 73, 'Kansas State': 66, 'Oklahoma State': 66, 'TCU': 78,
    'Texas Tech': 66, 'UCF': 66, 'Utah': 78, 'West Virginia': 63,
    // ---- SEC ----
    'Alabama': 71, 'Arkansas': 66, 'Auburn': 71, 'Florida': 87, 'Georgia': 83,
    'Kentucky': 68, 'LSU': 68, 'Mississippi State': 62, 'Missouri': 70,
    'Ole Miss': 64, 'Oklahoma': 70, 'South Carolina': 68, 'Tennessee': 75,
    'Texas': 88, 'Texas A&M': 81, 'Vanderbilt': 97,
    // ---- American ----
    'Charlotte': 57, 'East Carolina': 56, 'Florida Atlantic': 55, 'Memphis': 57,
    'North Texas': 57, 'Rice': 96, 'South Florida': 66, 'Temple': 70,
    'Tulane': 87, 'Tulsa': 68, 'UAB': 62, 'UTSA': 55, 'Wichita State': 60,
    // ---- Mountain West ----
    'Air Force': 85, 'Boise State': 60, 'Colorado State': 69, 'Fresno State': 55,
    'Nevada': 58, 'New Mexico': 58, 'San Diego State': 66, 'San Jose State': 58,
    'UNLV': 55, 'Utah State': 62, 'Wyoming': 60,
    // ---- Sun Belt ----
    'Appalachian State': 63, 'Arkansas State': 49, 'Coastal Carolina': 50,
    'Georgia Southern': 54, 'Georgia State': 54, 'James Madison': 71,
    'Louisiana': 50, 'Louisiana Monroe': 46, 'Marshall': 52, 'Old Dominion': 54,
    'South Alabama': 48, 'Southern Miss': 52, 'Texas State': 54, 'Troy': 48,
    // ---- Conference USA ----
    'FIU': 56, 'Jacksonville State': 46, 'Kennesaw State': 52, 'Liberty': 55,
    'Louisiana Tech': 56, 'Middle Tennessee': 50, 'New Mexico State': 48,
    'Sam Houston': 46, 'UTEP': 52, 'Western Kentucky': 50,
    // ---- MAC ----
    'Akron': 52, 'Ball State': 56, 'Bowling Green': 56, 'Buffalo': 67,
    'Central Michigan': 54, 'Eastern Michigan': 50, 'Kent State': 54,
    'Miami (Ohio)': 74, 'Northern Illinois': 52, 'Ohio University': 61,
    'Toledo': 54, 'Western Michigan': 56,
    // ---- Big East ----
    'Butler': 72, 'Creighton': 74, 'DePaul': 66, 'Georgetown': 93,
    'Marquette': 75, 'Providence': 68, 'Seton Hall': 66, 'St. John\'s': 62,
    'Villanova': 88, 'Xavier': 68, 'UConn': 80,
    // ---- Ivy League ----
    'Brown': 97, 'Columbia': 98, 'Cornell': 96, 'Dartmouth': 97, 'Harvard': 99,
    'Penn': 98, 'Princeton': 99, 'Yale': 99,
    // ---- Patriot League ----
    'American University': 76, 'Army': 86, 'Boston University': 88,
    'Bucknell': 87, 'Colgate': 88, 'Holy Cross': 82, 'Lafayette': 86,
    'Lehigh': 87, 'Loyola Maryland': 70, 'Navy': 87,
    // ---- Atlantic 10 ----
    'Davidson': 90, 'Dayton': 68, 'Duquesne': 60, 'Fordham': 82,
    'George Mason': 66, 'George Washington': 82, 'La Salle': 58,
    'Loyola Chicago': 68, 'Rhode Island': 58, 'Richmond': 88,
    'Saint Joseph\'s': 66, 'Saint Louis': 74, 'St. Bonaventure': 54,
    'UMass': 76, 'VCU': 62,
    // ---- CAA ----
    'Campbell': 52, 'Charleston': 60, 'Delaware': 66, 'Drexel': 72, 'Elon': 69,
    'Hampton': 54, 'Hofstra': 62, 'Monmouth': 54, 'North Carolina A&T': 52,
    'Northeastern': 85, 'Stony Brook': 77, 'Towson': 58, 'UNC Wilmington': 61,
    'William & Mary': 91,
    // ---- Southern ----
    'Chattanooga': 52, 'The Citadel': 66, 'East Tennessee State': 50,
    'Furman': 81, 'Mercer': 67, 'Samford': 66, 'VMI': 74, 'Western Carolina': 48,
    'Wofford': 75,
    // ---- West Coast ----
    'Gonzaga': 73, 'Loyola Marymount': 72, 'Pacific': 66, 'Pepperdine': 77,
    'Portland': 68, 'San Diego': 73, 'San Francisco': 66, 'Santa Clara': 83,
    'Saint Mary\'s': 70,
    // ---- Big Sky ----
    'Eastern Washington': 50, 'Idaho': 52, 'Idaho State': 48, 'Montana': 56,
    'Montana State': 58, 'Northern Arizona': 56, 'Northern Colorado': 50,
    'Portland State': 52, 'Sacramento State': 52, 'Weber State': 48,
    // ---- WAC ----
    'Abilene Christian': 54, 'California Baptist': 50, 'Grand Canyon': 52,
    'Southern Utah': 48, 'Tarleton State': 46, 'UT Rio Grande Valley': 48,
    'Utah Tech': 46, 'Utah Valley': 48, 'Seattle University': 66,
    // ---- Big South ----
    'Charleston Southern': 44, 'Gardner-Webb': 46, 'High Point': 58,
    'Longwood': 48, 'Presbyterian': 54, 'Radford': 48, 'UNC Asheville': 58,
    'USC Upstate': 46, 'Winthrop': 52,
    // ---- ASUN ----
    'Austin Peay': 46, 'Bellarmine': 56, 'Central Arkansas': 46,
    'Eastern Kentucky': 48, 'Florida Gulf Coast': 50, 'Jacksonville': 54,
    'Lipscomb': 58, 'North Alabama': 46, 'North Florida': 54,
    'Queens University': 52, 'Stetson': 62, 'West Georgia': 44,
    // ---- Southland ----
    'East Texas A&M': 46, 'Houston Christian': 50, 'Incarnate Word': 50,
    'Lamar': 46, 'McNeese': 44, 'Nicholls': 44, 'Northwestern State': 44,
    'Southeastern Louisiana': 46, 'Stephen F. Austin': 46,
    'Texas A&M-Corpus Christi': 46, 'New Orleans': 50,
    // ---- MEAC ----
    'Coppin State': 42, 'Delaware State': 44, 'Howard': 74,
    'Maryland Eastern Shore': 42, 'Morgan State': 48, 'Norfolk State': 44,
    'NC Central': 48, 'South Carolina State': 42,
    // ---- SWAC ----
    'Alabama A&M': 42, 'Alabama State': 42, 'Alcorn State': 42,
    'Arkansas-Pine Bluff': 40, 'Bethune-Cookman': 44, 'Florida A&M': 54,
    'Grambling State': 44, 'Jackson State': 46, 'Mississippi Valley State': 40,
    'Prairie View A&M': 44, 'Southern University': 44, 'Texas Southern': 42,
    // ---- Horizon ----
    'Cleveland State': 54, 'Green Bay': 52, 'IU Indianapolis': 58,
    'Milwaukee': 54, 'Northern Kentucky': 52, 'Oakland': 54,
    'Purdue Fort Wayne': 52, 'Robert Morris': 52, 'Wright State': 52,
    'Youngstown State': 50,
    // ---- Missouri Valley ----
    'Belmont': 62, 'Bradley': 62, 'Drake': 68, 'Evansville': 60,
    'Illinois State': 56, 'Indiana State': 48, 'Missouri State': 54,
    'Murray State': 50, 'Northern Iowa': 58, 'Southern Illinois': 52,
    'UIC': 62, 'Valparaiso': 62,
    // ---- Summit League ----
    'Denver': 74, 'Kansas City': 54, 'North Dakota': 54, 'North Dakota State': 56,
    'Omaha': 52, 'Oral Roberts': 50, 'South Dakota': 54, 'South Dakota State': 56,
    'St. Thomas': 66,
    // ---- America East ----
    'Albany': 58, 'Binghamton': 78, 'Bryant': 60, 'Maine': 56, 'NJIT': 66,
    'UMBC': 71, 'UMass Lowell': 62, 'New Hampshire': 63, 'Vermont': 69,
    // ---- MAAC ----
    'Canisius': 56, 'Fairfield': 68, 'Iona': 54, 'Manhattan': 56, 'Marist': 64,
    'Mount St. Mary\'s': 54, 'Niagara': 52, 'Quinnipiac': 64, 'Rider': 56,
    'Sacred Heart': 56, 'Siena': 58,
    // ---- NEC ----
    'Central Connecticut': 48, 'Chicago State': 40, 'Fairleigh Dickinson': 52,
    'LIU': 50, 'Merrimack': 54, 'Saint Francis': 50, 'Stonehill': 56, 'Wagner': 50,
    // ---- OVC ----
    'Eastern Illinois': 48, 'Lindenwood': 48, 'Little Rock': 50,
    'Morehead State': 48, 'SIU Edwardsville': 52, 'Southeast Missouri State': 48,
    'Tennessee State': 46, 'Tennessee Tech': 52, 'UT Martin': 48,
    // ---- Big West ----
    'Cal Poly': 74, 'Cal State Bakersfield': 50, 'Cal State Fullerton': 58,
    'Cal State Northridge': 54, 'Hawaii': 60, 'Long Beach State': 60,
    'UC Davis': 83, 'UC Irvine': 82, 'UC Riverside': 68, 'UC San Diego': 88,
    'UC Santa Barbara': 84,

    // ================= Division II / III (notable) =================
    'Adams State': 46, 'Colorado Mines': 85, 'Grand Valley State': 60,
    'Western Colorado': 50, 'Chico State': 56, 'Augustana (SD)': 58,
    'Western Washington': 62, 'Colorado Christian': 50, 'Simon Fraser': 66,
    'U-Mary': 50, 'Cal Poly Pomona': 66, 'Pittsburg State': 50,
    'Minnesota State': 52, 'Western Oregon': 50, 'Alaska Anchorage': 48,
    'MIT': 99, 'Williams': 97, 'Amherst': 97, 'Middlebury': 92, 'Tufts': 93,
    'Bowdoin': 94, 'Bates': 88, 'Colby': 88, 'Wesleyan': 92, 'Pomona': 97,
    'Carleton': 94, 'Johns Hopkins': 98, 'Washington U. (MO)': 96,
    'Chicago': 98, 'Emory': 92, 'Carnegie Mellon': 94, 'Case Western Reserve': 90,
    'NYU': 92, 'Rochester (NY)': 88, 'Brandeis': 90, 'Swarthmore': 98,
    'Haverford': 93, 'Colorado College': 84, 'Trinity (TX)': 80, 'Kenyon': 84,
    'Denison': 82, 'Oberlin': 86, 'Grinnell': 88, 'St. Olaf': 80, 'Calvin': 68,
    'DePauw': 76, 'Wabash': 72, 'Hope': 66, 'North Central (IL)': 60,
    'UW-La Crosse': 58, 'RPI': 88, 'WPI': 86, 'Dickinson': 82, 'Gettysburg': 80,
    'Franklin & Marshall': 82, 'Vassar': 90, 'Skidmore': 80, 'Union': 82,
    'Macalester': 88, 'Grand Valley': 60
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

  /*
   * Coach ambitions (Update 16) — a coach's HIDDEN career motivation, seeded
   * at birth and carried for life. Separate from the public archetype, it
   * shapes when and where a coach moves on the carousel: a Career Builder
   * jumps at the first head job, a Loyal grinder stays put, a Prestige Chaser
   * holds out for a blue blood. It governs the player's own hired assistants
   * exactly as it does every CPU coach, so losing a Career Builder to a head
   * job (and keeping a Loyal one for a decade) both feel earned.
   *
   *  weightHC      — pull toward accepting a HEAD-coaching promotion (1 = base)
   *  weightLateral — pull toward a bigger ASSISTANT seat (1 = base)
   *  prestigePull  — how much destination prestige sways the decision
   *  stay          — inertia: how strongly they resist leaving at all
   */
  D.COACH_AMBITIONS = [
    { key: 'careerBuilder', label: 'Career Builder', icon: '🚀', hint: 'Chases head-coaching jobs the moment they come.', weightHC: 1.7, weightLateral: 1.15, prestigePull: 0.6, stay: 0.7 },
    { key: 'loyal',         label: 'Loyal',          icon: '🤝', hint: 'Values stability — slow to leave a good situation.',   weightHC: 0.6, weightLateral: 0.55, prestigePull: 0.5, stay: 1.8 },
    { key: 'recruiter',     label: 'Recruiter',      icon: '📣', hint: 'Drawn to programs that recruit at the highest level.', weightHC: 1.0, weightLateral: 1.4,  prestigePull: 1.1, stay: 0.95 },
    { key: 'builder',       label: 'Builder',        icon: '🏗', hint: 'Relishes a rebuild — will take on a struggling job.',    weightHC: 1.4, weightLateral: 0.85, prestigePull: 0.3, stay: 0.9 },
    { key: 'prestigeChaser',label: 'Prestige Chaser',icon: '👑', hint: 'Holds out for blue-blood programs.',                    weightHC: 1.1, weightLateral: 1.2,  prestigePull: 1.6, stay: 1.0 },
    { key: 'moneyFocused',  label: 'Money Focused',  icon: '💰', hint: 'Follows the biggest budgets and best resources.',       weightHC: 1.2, weightLateral: 1.25, prestigePull: 1.3, stay: 0.85 }
  ];
  D.coachAmbition = (key) => D.COACH_AMBITIONS.find((a) => a.key === key) || null;

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
    // 'small-school' is special (Update 11): never rolled randomly — it is
    // attached only to recruits who carry a genuine division preference for
    // DII/DIII, and is discoverable through the normal scouting reveals.
    { key: 'small-school', label: 'Drawn to the small-school experience', assigned: true },
    { key: 'homebody', label: 'Wants to stay close to home' },
    { key: 'title-chaser', label: 'Dreams of contending for national titles' },
    // Update 13, Phase 4: the name on the office door is the whole pitch. A
    // recruit with this motivation is heavily swayed by coach REPUTATION —
    // Legends get a major bonus, unknown assistants struggle to compete.
    { key: 'elite-coach', label: 'Wants to play for an elite coach' },
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
  // `tip` (Update 15) is the plain-language tooltip shown on each action
  // button so new players know what everything does.
  D.RECRUIT_ACTIONS = {
    letter:        { label: 'Send Letter',          points: 1, cost: 50,   relationship: 2,  interest: 1, scout: 2,  reveal: 0.03,
                     tip: 'Cheap weekly contact — a small relationship bump.' },
    call:          { label: 'Phone Call',           points: 2, cost: 100,  relationship: 5,  interest: 2, scout: 4,  reveal: 0.22,
                     tip: 'Builds the relationship and often reveals what the recruit cares about.' },
    // Watch Race (Update 19): a scouting trip is legwork, not a budget line —
    // it costs recruiting effort (2 points) but no money. Everything else
    // about it (the big scouting reveal) is unchanged.
    watchRace:     { label: 'Watch Race',           points: 2, cost: 0,    relationship: 2,  interest: 2, scout: 30, reveal: 0.05,
                     tip: 'Scouting trip — lifts the fog off their true ratings. Costs 2 recruiting points, no money.' },
    assistantVisit:{ label: 'Assistant Visit',      points: 3, cost: 800,  relationship: 7,  interest: 4, scout: 12, reveal: 0.25,
                     tip: 'Your assistant works the recruit — effect scales with their recruiting skill.' },
    homeVisit:     { label: 'Home Visit',           points: 5, cost: 1200, relationship: 12, interest: 6, scout: 8,  reveal: 0.55,
                     tip: 'Sit down with the family — big relationship gain and the best way to learn hidden motivations.' },
    campusVisit:   { label: 'Campus Visit',         points: 6, cost: 2000, relationship: 8,  interest: 14, scout: 5, reveal: 0.25, requires: 'interest30',
                     tip: 'The big sell — lands harder with good facilities. Needs 30 interest.' },
    hostOvernight: { label: 'Host Overnight',       points: 4, cost: 1000, relationship: 10, interest: 9, scout: 3,  reveal: 0.15, requires: 'visited',
                     tip: 'A night with the team after a campus visit — strong all-around gains.' },
    meetTeam:      { label: 'Invite to Meet Team',  points: 2, cost: 200,  relationship: 5,  interest: 4, scout: 2,  reveal: 0.08,
                     tip: 'Introduce the squad — solid, affordable interest builder.' },
    // Sway (rebuilt): a genuine FLIP attempt on a recruit who has verbally
    // committed to ANOTHER school. Only available when your program holds a
    // real (10%+) commitment chance with them. Each attempt lands ~35% of
    // the time — a success flips the commitment to you on the spot, a miss
    // leaves them committed where they were. Recruiting rating, the
    // assistant's recruiting craft, and the relationship all nudge the odds,
    // and repeat attempts get harder — a flip is never guaranteed.
    sway:          { label: 'Sway',                 points: 3, cost: 5000, relationship: 0,  interest: 0, scout: 1,  reveal: 0.06, requires: 'sway',
                     tip: 'Try to flip a recruit committed elsewhere (~35% chance). Needs a real (10%+) commit chance with them. Success flips the commitment immediately.' },
    offer:         { label: 'Offer Scholarship',    points: 2, cost: 0,    relationship: 6,  interest: 10, scout: 0, reveal: 0,
                     tip: 'Put the offer on the table — required before a recruit can ever commit to you.' }
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
  // Easy Run fatigue eased (Update 13, Phase 7): easy running is genuine
  // recovery, so its net fatigue is a touch lower (−4) — fresher legs across a
  // training block without touching the hard-day balance.
  D.WORKOUTS = {
    rest:      { label: 'Rest Day',          short: 'Rest',  fatigue: -13, injury: 0.0, hard: false, attrs: {}, isRest: true },
    easy:      { label: 'Easy Run',          short: 'Easy',  fatigue: -4, injury: 0.4, hard: false, attrs: { stamina: 0.5 } },
    long:      { label: 'Long Run',          short: 'Long',  fatigue: 10, injury: 1.1, hard: true,  attrs: { stamina: 3.0, vo2Max: 1.0 } },
    tempo:     { label: 'Tempo',             short: 'Tempo', fatigue: 9,  injury: 1.0, hard: true,  attrs: { lactateThreshold: 3.0, stamina: 1.0 } },
    // Double Threshold (Update 13, Phase 7): two threshold sessions in a day —
    // roughly twice the physiological benefit of one Tempo, fatigue on par
    // with an Interval session, and a higher injury risk when overused. An
    // advanced tool that should complement, not replace, single tempo work.
    double:    { label: 'Double Threshold', short: '2×Thr', fatigue: 12, injury: 1.25, hard: true, attrs: { lactateThreshold: 6.0, stamina: 2.0 } },
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
  // Periodization (Update 13, Phase 7 fix): the Build phase advice and its
  // evaluation now AGREE. "2-3 quality sessions plus the long run" means the
  // long run does NOT count against the quality budget — a week of 2-3 hard
  // workouts and a long run (up to 4 hard total including the long run) is the
  // textbook build week and develops as such (see planMetaFor).
  D.TRAINING_PHASES = [
    { key: 'base',        label: 'Base Phase',         icon: '🧱', upTo: 3,
      ideal: 'Aerobic volume: a long run, tempo work, plenty of easy running — no more than 2 hard days.',
      fit: (m) => m.hasLong && m.hardDays >= 1 && m.hardDays <= 2 },
    { key: 'build',       label: 'Build Phase',        icon: '📈', upTo: 7,
      ideal: 'Classic quality: 2-3 quality sessions plus the long run, real recovery between.',
      // Quality = hard days minus the long run; 2-3 quality + long run fits.
      fit: (m) => m.hasLong && (m.hardDays - 1) >= 2 && (m.hardDays - 1) <= 3 },
    { key: 'specific',    label: 'Specific Phase',     icon: '🎯', upTo: 11,
      ideal: 'Race-specific work: 2-3 hard days including intervals, speed, or a championship simulation.',
      fit: (m) => m.hardDays >= 2 && m.hardDays <= 3 && (m.speedDays > 0 || m.racesimDays > 0) },
    { key: 'peak',        label: 'Peak Phase',         icon: '⛰', upTo: 12,
      ideal: 'Sharpen while shedding load: at most 2 hard days, speed or a race simulation, mostly easy running.',
      fit: (m) => m.hardDays >= 1 && m.hardDays <= 2 && (m.speedDays > 0 || m.racesimDays > 0) },
    { key: 'championship', label: 'Championship Phase', icon: '🏆', upTo: 15,
      ideal: 'The taper: one hard touch at most, rest days banked, everything else easy.',
      fit: (m) => m.hardDays <= 1 && (m.restDays > 0 || m.easyDays >= 4) },
    // Postseason recovery (Update 13, Phase 7): the week immediately after
    // Nationals is a mandatory complete recovery week — skip it and
    // development stalls and injury resistance slips (enforced in the engine).
    { key: 'recovery',    label: 'Postseason Recovery', icon: '🛌', upTo: 16,
      ideal: 'One complete recovery week: easy running and rest, zero quality — the body must absorb the season before track prep.',
      fit: (m) => m.hardDays === 0 && (m.restDays > 0 || m.easyDays >= 5) },
    // Track preparation (Update 13, Phase 7): once the mandatory recovery week
    // is banked, 2-3 quality workouts are exactly right as athletes turn
    // toward the track season.
    { key: 'trackprep',   label: 'Track Preparation',  icon: '🏟', upTo: 99,
      ideal: 'Track prep: 2-3 quality workouts as the athletes turn toward the track season.',
      fit: (m) => m.hardDays >= 2 && m.hardDays <= 3 }
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
   * The famous-invitational database (Meet Database Expansion). Every named
   * meet carries its real-world identity: location, course, altitude (feet),
   * a hilliness profile, and a prestige tier. Elite programs get the call;
   * everyone else runs regional invitationals the same weekend.
   *   `size`   — teams invited (dealt across the week's elite meets so the
   *              national contenders SPREAD OUT instead of piling into one)
   *   `weight` — extra poll credit for racing (and beating) the best; also
   *              drives the prestige requirement to earn an invitation
   *   `altitudeFt` / `hilliness` — the course profile the race engine uses
   *   `divisions` — restriction list when a meet isn't open to everyone
   */
  D.ELITE_MEETS = [
    // Week 4 — season-opening classics
    { week: 4,  name: 'Cowboy Jamboree',                size: 24, weight: 1.1,
      city: 'Stillwater', state: 'OK', course: 'Greiner Family OSU Cross Country Course',
      altitudeFt: 988, hilliness: 55, prestige: 'High' },
    { week: 4,  name: 'Crimson Classic',                size: 22, weight: 1.0,
      city: 'Tuscaloosa', state: 'AL', course: 'Harry Pritchett Running Park',
      altitudeFt: 226, hilliness: 22, prestige: 'Medium' },
    { week: 4,  name: 'Panorama Farms Invitational',    size: 22, weight: 1.0,
      city: 'Earlysville', state: 'VA', course: 'Panorama Farms',
      altitudeFt: 465, hilliness: 68, prestige: 'Medium' },
    // Week 6 — the September marquees
    { week: 6,  name: 'Joe Piane Invitational',         size: 26, weight: 1.2,
      city: 'Notre Dame', state: 'IN', course: 'Burke Golf Course',
      altitudeFt: 725, hilliness: 20, prestige: 'High' },
    { week: 6,  name: 'Roy Griak Invitational',         size: 26, weight: 1.15,
      city: 'Falcon Heights', state: 'MN', course: 'Les Bolstad Golf Course',
      altitudeFt: 942, hilliness: 62, prestige: 'High' },
    { week: 6,  name: 'Paul Short Run',                 size: 28, weight: 1.1,
      city: 'Bethlehem', state: 'PA', course: 'Goodman Campus Cross Country Course',
      altitudeFt: 400, hilliness: 45, prestige: 'High' },
    // Week 8 — the October showdowns
    { week: 8,  name: 'Nuttycombe Wisconsin Invitational', size: 30, weight: 1.3,
      city: 'Madison', state: 'WI', course: 'Thomas Zimmer Championship Course',
      altitudeFt: 900, hilliness: 48, prestige: 'Elite' },
    { week: 8,  name: 'Gans Creek Invitational',        size: 28, weight: 1.2,
      city: 'Columbia', state: 'MO', course: 'Gans Creek Cross Country Course',
      altitudeFt: 738, hilliness: 42, prestige: 'High' },
    { week: 8,  name: 'Chile Pepper Festival',          size: 26, weight: 1.1,
      city: 'Fayetteville', state: 'AR', course: 'Agri Park Cross Country Course',
      altitudeFt: 1400, hilliness: 25, prestige: 'High' },
    // Pre-Nationals (Update 3): a Division I-only elite invitational late in
    // the regular season, contested on the NCAA DI Championship course. Built
    // specially by the race engine (invite/decline, course familiarity) — not
    // through the generic prestige-field path, so it carries no `size` here.
    { week: 10, name: 'Pre-Nationals', preNationals: true, weight: 1.45,
      prestige: 'Elite', divisions: ['DI'] }
  ];

  /*
   * Seeded all-time record baselines (Records realism). The record book opens
   * anchored to genuinely elite modern collegiate marks — faster than a typical
   * national champion — so early records already read as historic and only an
   * exceptional performance on a fast day breaks one. They are NOT hard caps:
   * as development progresses across decades, a generational talent can lower
   * them, but rarely. Keyed `${gender}-${distanceK}` to match the race engine.
   * Seconds are elite course-record territory for each distance.
   */
  // NCAA men race the 8K (regular season), 10K (DI/DII regionals + nationals)
  // and, early season, the 6K — never a 5K, so there is no men's 5K record.
  // Women race the 6K (championship) and the 5K (regular season).
  D.SEED_RECORDS = {
    'M-10K': 1718, // 28:38 — near the fastest realistic collegiate 10K
    'M-8K':  1388, // 23:08
    'M-6K':  1050, // 17:30 — a realistic historic men's 6K best
    'W-6K':  1158, // 19:18
    'W-5K':  950   // 15:50
  };

  // Hilliness label for a 0-100 course profile (course information display).
  D.hillinessLabel = (h) => h >= 55 ? 'Hilly' : h >= 30 ? 'Rolling' : 'Flat';
  // Altitude category from feet (matches the Low/Medium/High weather model).
  // Thresholds reflect real racing effect: only genuinely high-altitude venues
  // (~5,500 ft+, e.g. Flagstaff, the Colorado front range) read "High"; the
  // 3,000–5,500 band is "Medium"; everything below — the vast majority of the
  // country, including near-sea-level and merely-elevated courses — is "Low".
  D.altitudeCategory = (ft) => ft >= 5500 ? 'High' : ft >= 3000 ? 'Medium' : 'Low';

  // Standardized meet-altitude class (Altitude standardization). EVERY meet —
  // every division, every round — surfaces only Low / Medium / High; exact
  // elevation is never shown in normal meet information. Accepts a course/meta
  // object (real `altitudeFt` preferred), a conditions object, or a bare
  // category string, and always resolves to one of the three tiers.
  D.altitudeClass = function (src) {
    if (src == null) return 'Low';
    if (typeof src === 'string') return src;
    if (typeof src.altitudeFt === 'number') return D.altitudeCategory(src.altitudeFt);
    if (src.altitude) return src.altitude;
    return 'Low';
  };

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
    // Update 11.1: 3,000 per gender (6,000 nationally). Right-sized to the
    // 727-program world: steady-state demand is ~2,450 signees per gender
    // (recruit-to-need classes replacing graduates), so this comfortably
    // fills every school's class with real recruits while leaving a
    // realistic ~18% unsigned tail — enough competition to feel alive,
    // lean enough that the talent pool never waters down. Generational-talent
    // odds are per CLASS (below), not per recruit, so the cadence holds.
    CLASS_SIZE_PER_GENDER: 3000,
    SIGNING_WEEK: 19,       // national signing day (offseason)
    EARLY_COMMIT_WEEK: 3,   // earliest anyone verbals
    AI_SIGNEES_TARGET: 5,   // fallback signing target when roster needs are unknown
    // Per-gender signing-target CAPS by division (Update 11.1). The real
    // target is computed from genuine roster need (open spots + an
    // improvement allowance) in signingTarget(); these are just the ceilings
    // that keep even a full rebuild believable. A steady program replaces
    // its ~3-4 graduating runners; a rebuild pushes toward the cap. [_, cap].
    TARGETS: { DI: [2, 7], DII: [2, 8], DIII: [2, 8] }
  };

  /*
   * Diamonds in the rough (Update 11). A small slice of every class hides an
   * elite development ceiling behind modest ratings: the scouting consensus
   * (rankings, stars, displayed potential) reads their PERCEIVED ceiling,
   * while the real one stays hidden until college development reveals it.
   * They tend to share tells — huge work ethic, coachability, consistency,
   * late physical growth — surfaced only as soft scouting notes that plenty
   * of ordinary grinders also earn, so nothing ever outs a gem outright.
   */
  D.HIDDEN_GEMS = {
    SHARE_MIN: 0.03,   // 3-7% of each class carries hidden upside
    SHARE_MAX: 0.07,
    HINTS: [
      'Improving rapidly.',
      'Exceptional training habits.',
      'Late bloomer.',
      'Raw but talented.',
      'Huge upside.',
      'Coaches rave about the work ethic.',
      'Body still catching up to the engine.',
      'Outworked everyone at camp.'
    ]
  };

  /* ------------------------------------------------------------------ *
   * Mileage (Part 6). Weekly volume is its own training variable,
   * independent of the day-by-day workout plan.
   * ------------------------------------------------------------------ */
  D.MILEAGE = {
    MIN: 30,
    MAX: 120,
    // Gendered absolute ceilings on what a body can safely absorb (mileage
    // rebalance): even the most durable women top out below the most durable
    // men — elite women still handle genuinely high volume (up to ~105), but
    // the 110-120 mpw stratosphere belongs to exceptionally durable men.
    SAFE_CAP: { M: 120, W: 105 },
    // Mileage scaling (Update 13, Phase 7): women race 6K and generally train
    // on less volume than men, who race 8K/10K — men average ~75 mpw, women
    // ~60 mpw across the world (tendencies still shift individual programs).
    DEFAULT: { M: 75, W: 60 },
    // Named presets for the training screen (per-athlete deltas are
    // applied relative to the squad's program mileage).
    PRESETS: [
      { key: 'plus10',    label: '+10 mi',                   desc: 'Bump every runner +10 miles from their current load', delta: +10, filter: 'all' },
      { key: 'minus10',   label: '−10 mi',                   desc: 'Ease every runner −10 miles from their current load',  delta: -10, filter: 'all' },
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

  // Assistant-coach reputation ladder (Update 13): a recruiting coordinator
  // climbs a named track of their own — Unknown → Local Recruiter →
  // Respected Assistant → Elite Assistant → National Recruiter → Legend
  // Assistant — realistically over 15-25 successful seasons under the
  // rebalanced (slower) reputation gains.
  D.ASSISTANT_REPUTATION_LEVELS = [
    { min: 80, label: 'Legend Assistant',   icon: '👑' },
    { min: 64, label: 'National Recruiter', icon: '🌟' },
    { min: 48, label: 'Elite Assistant',    icon: '🎯' },
    { min: 32, label: 'Respected Assistant',icon: '🤝' },
    { min: 16, label: 'Local Recruiter',    icon: '🏫' },
    { min: 0,  label: 'Unknown',            icon: '❔' }
  ];

  D.reputationLevel = function (rep, role) {
    const table = role === 'Assistant' ? D.ASSISTANT_REPUTATION_LEVELS : D.REPUTATION_LEVELS;
    return table.find((l) => rep >= l.min) || table[table.length - 1];
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
    rosterCut:    'Roster cut',
    walkOnCut:    'Walk-on cut',
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
    stagnant:     'Limited development',
    injuries:     'Injury frustration',
    miserable:    'Completely unhappy',
    fresh:        'Fresh start'
  };

  /*
   * Transfer Desire levels (spec Part 2, Section 14): every athlete's
   * internal desire score maps to one of five visible risk levels shown on
   * their profile. The CPU's portal entries run on the exact same scale.
   */
  D.TRANSFER_RISK_LEVELS = [
    { key: 'very-low',  label: 'Very Low',  max: 8,        color: 'var(--success)' },
    { key: 'low',       label: 'Low',       max: 22,       color: 'var(--success)' },
    { key: 'moderate',  label: 'Moderate',  max: 40,       color: 'var(--warning)' },
    { key: 'high',      label: 'High',      max: 60,       color: 'var(--danger)' },
    { key: 'very-high', label: 'Very High', max: Infinity, color: 'var(--danger)' }
  ];
  D.transferRiskLevel = (u) => D.TRANSFER_RISK_LEVELS.find((l) => u < l.max) ||
    D.TRANSFER_RISK_LEVELS[D.TRANSFER_RISK_LEVELS.length - 1];
})();
