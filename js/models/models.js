(function () {
  const M = window.XCD.models;
  const Utils = window.XCD.core.Utils;

  /* ---------------------------------------------------------------- *
   * Athlete
   * ---------------------------------------------------------------- */
  class Athlete {
    constructor(data) {
      Object.assign(this, {
        id: Utils.generateId('ath'),
        firstName: '',
        lastName: '',
        gender: 'M', // 'M' or 'W'
        hometownCity: '',
        hometownState: '',
        region: '',
        classYear: 'Freshman',
        age: 18,
        heightIn: 68,
        weightLb: 140,
        major: 'Undecided',

        // Mental / makeup
        academics: 60,
        discipline: 60,
        leadership: 50,
        confidence: 60,
        consistency: 60,
        workEthic: 60,
        coachability: 60,
        mentalToughness: 60,
        raceIQ: 55,
        personality: 'Grinder',
        // Relationship attributes (Update 5, Part 7): loyalty is two-sided.
        // Coach Relationship tracks the bond with the head coach (playing
        // time, redshirt calls, injuries, development, communication);
        // Team Relationship tracks chemistry with teammates. An athlete may
        // stay for a beloved coach despite weak team chemistry, or remain for
        // close friendships despite a frosty coach relationship. Both feed the
        // transfer portal — poor relationships raise transfer probability.
        coachRelationship: 60,
        teamRelationship: 60,

        // Preferences (used heavily by recruiting engine, phase 2)
        preferredDistance: 'All-Around',
        preferredClimate: 'No Preference',
        preferredSchoolSize: 'No Preference',

        // Potential / overall
        potential: 60,
        currentOverall: 50,
        peakOverall: 60,

        // The six core physical ratings (0-100). Race performance is
        // computed from these — there are no per-distance abilities.
        vo2Max: 55,
        runningEconomy: 55,
        stamina: 55,
        injuryResistance: 55,
        lactateThreshold: 55,
        speed: 55,
        // Hidden: hill-course adaptation, built through Hills training.
        hillAdaptation: 40,
        isWalkOn: false,

        // Status
        fatigue: 10,       // 0 fresh - 100 exhausted
        fitness: 50,       // 0-100 current fitness level built from training
        sharpness: 55,     // 0-100 race sharpness: low mileage/tapering raises it
        chronicMileage: 0, // rolling weekly-volume average (taper detection)
        seasonInjuryWeeks: 0, // weeks lost to injury this season (offseason dev)
        // Injury-risk history (Update 6, Phase 2): the body remembers abuse.
        highLoadWeeks: 0,     // consecutive weeks of heavy workload/fatigue
        raceLoad: 0,          // recent race intensity, decays weekly (0-100)
        recentInjuryWeeks: 0, // reinjury window after returning from an injury
        morale: 70,        // 0-100
        devProfile: 'normal', // hidden archetype: normal | early | late | bust
        devProgress: 0,    // fractional development accumulator
        lastDelta: 0,      // overall change last week (UI)
        seasonDev: 0,      // overall gained this season (UI)
        health: 'Healthy', // Healthy | Injured | Recovering
        injury: null,      // { type, weeksRemaining }
        redshirt: 'None',  // None | True | Medical | Used
        eligibilityRemaining: 4,
        yearsOnCampus: 1,  // NCAA five-year clock
        seasonRaces: 0,    // races run this season (blocks redshirting)
        honors: { allAmerican: 0, natChamp: 0, confChamp: 0, awards: [] },
        // Permanent award badges by year (Part 10): survive graduation via
        // the alumni ledger. { allAmerican:[years], natChamp:[...],
        // confChamp:[...], allConference:[...] }
        honorYears: { allAmerican: [], natChamp: [], confChamp: [], allConference: [] },
        // Complete career accolade ledger (Update 4, Part 1): one entry per
        // honor earned, each stamped with the division, conference (when
        // applicable), and year. Nothing is ever overwritten — honors earned
        // across multiple divisions/conferences (transfers, realignment) all
        // coexist, so the ledger is a full historical record of the career.
        // { year, division, conference?, type, label }
        accolades: [],
        // Season-by-season overall progression (Update 4, Part 10).
        overallHistory: [], // [{ year, overall }]
        generational: false, // ⭐ once-in-a-decade prospect (Part 12.5)
        genProfile: null,    // signature strength/weakness archetype key
        raceLog: [],       // last 8 results: {y, w, m, p, t, d}

        schoolId: null,
        isRecruit: false,
        careerStats: { races: 0, wins: 0, top5: 0, personalBests: {} },

        ...data
      });
      this.migrateLegacyRatings(data);
      // Update 5, Part 7: relationship attributes. Saves from before this
      // update seed both from morale so existing rosters carry believable
      // loyalty without a regeneration.
      if (data && data.coachRelationship === undefined) {
        this.coachRelationship = Utils.clamp(Math.round((this.morale ?? 70) * 0.7 + 20), 15, 95);
      }
      if (data && data.teamRelationship === undefined) {
        this.teamRelationship = Utils.clamp(Math.round((this.morale ?? 70) * 0.6 + (this.leadership ?? 50) * 0.2 + 12), 15, 95);
      }
      // Backfill the accolade ledger for saves from before Update 4 so old
      // careers still show a complete, richly-labeled history.
      if (!Array.isArray(this.accolades)) this.accolades = [];
      if (!Array.isArray(this.overallHistory)) this.overallHistory = [];
      if (data && (!data.accolades || !data.accolades.length) &&
          window.XCD.engine.Legacy && window.XCD.engine.Legacy.backfillAccolades) {
        window.XCD.engine.Legacy.backfillAccolades(this);
      }
      this.recalculateOverall();
    }

    get fullName() { return `${this.firstName} ${this.lastName}`; }

    // Saves from before the six-rating overhaul carry the old attribute
    // set; fold the meaningful ones into the new ratings and drop the rest.
    migrateLegacyRatings(data) {
      if (!data || data.rawSpeed === undefined) return;
      if (data.speed === undefined) {
        this.speed = Math.round((data.rawSpeed + (data.kickSpeed ?? data.rawSpeed)) / 2);
      }
      if (data.endurance !== undefined) {
        this.stamina = Math.round(((data.stamina ?? data.endurance) + data.endurance) / 2);
      }
      if (data.hillRunning !== undefined && data.hillAdaptation === undefined) {
        this.hillAdaptation = data.hillRunning;
      }
      ['endurance', 'rawSpeed', 'kickSpeed', 'acceleration', 'strength', 'recovery',
        'packRunning', 'hillRunning', 'downhillRunning', 'trackSpeed',
        'fiveKAbility', 'eightKAbility', 'tenKAbility',
        'weatherPerformance', 'altitudePerformance', 'durability'].forEach((k) => { delete this[k]; });
    }

    // Weighted overall rating from the six core physical ratings.
    recalculateOverall() {
      const weights = {
        vo2Max: 0.24, lactateThreshold: 0.18, runningEconomy: 0.18,
        stamina: 0.18, speed: 0.14, injuryResistance: 0.08
      };
      let total = 0;
      for (const key in weights) total += this[key] * weights[key];
      this.currentOverall = Math.round(Utils.clamp(total, 1, 99));
      return this.currentOverall;
    }

    isEligible() {
      return this.eligibilityRemaining > 0 && this.health !== 'Retired';
    }
  }

  /* ---------------------------------------------------------------- *
   * Coach
   * ---------------------------------------------------------------- */
  class Coach {
    constructor(data) {
      Object.assign(this, {
        id: Utils.generateId('coach'),
        firstName: '',
        lastName: '',
        age: 40,
        archetype: 'Developer', // Recruiter | Developer | Tactician | Players Coach
        portrait: '🧢',
        // Where the coach is from and ran/studied — biography shown on the
        // profile card (player coaches set these in the creation wizard).
        hometown: '',
        almaMater: '',

        // Coaching philosophies (Update 4). Training philosophy is PERMANENT
        // (chosen at creation, never changes); its effectiveness scales with
        // the Training rating. Race philosophy CAN be changed anytime and
        // shapes in-race tactics. Both default sensibly for old saves/AI.
        trainingPhilosophy: 'balanced',
        racePhilosophy: 'even',

        // Permanent coach award ledger (Update 4, Part 6): every national and
        // conference Coach-of-the-Year, stamped with division/conference/year.
        coachAccolades: [], // { year, division, conference?, type, label }

        // The four core coach ratings.
        recruiting: 55, // recruiting effectiveness
        training: 55,   // athlete development
        peaking: 55,    // race strategy & championship-week form
        culture: 55,    // morale, happiness, transfers, chemistry

        // Secondary craft ratings (Update 2, Part 2): shape AI identity and
        // feed specific systems without diluting the four core ratings.
        talentEval: 55,        // scouting accuracy / board quality
        motivation: 55,        // athlete morale & confidence upkeep
        transferRecruiting: 55,// pull in the portal
        internationalRecruiting: 45, // overseas pipeline
        media: 50,             // press handling: buzz, preseason attention
        staffManagement: 55,   // assistant quality & retention
        relationships: 55,     // bonds that keep athletes home

        // National reputation (Part 1): separate from school prestige.
        reputation: 25,

        // Long-term identity (Part 2): tendencies persist for a career.
        tendencies: [],

        // Career progression: points earned through success, spent on ratings.
        upgradePoints: 0,

        schoolId: null,
        role: 'Head', // Head | Assistant
        isPlayer: false,
        yearsAtSchool: 0,
        hotSeat: 0, // 0-100, drives firing risk
        careerRecord: {
          wins: 0, losses: 0, conferenceTitles: 0, regionalTitles: 0, nationalTitles: 0,
          seasons: 0, allAmericans: 0, allConference: 0, indivNatChamps: 0, indivConfChamps: 0,
          nationalsAppearances: 0, bestClassRank: null,
          confCOY: 0, natCOY: 0 // Conference / National Coach of the Year awards
        },
        // Career timeline (Part 9): every stop, forever.
        stints: [], // { schoolId, school, division, startYear, endYear }
        retireAge: 75 + Math.round(Math.random() * 8), // retirement is random, 75+

        ...data
      });
      this.migrateLegacyRatings(data);
      this.migrateUpdate2(data);
      this.migrateUpdate4(data);
    }

    // Saves from before Update 4: assign philosophies deterministically so
    // existing worlds gain coaching variety without a full regeneration.
    migrateUpdate4(data) {
      if (!Array.isArray(this.coachAccolades)) this.coachAccolades = [];
      const TP = window.XCD.data.TRAINING_PHILOSOPHIES;
      const RP = window.XCD.data.RACE_PHILOSOPHIES;
      if (!data || data.trainingPhilosophy === undefined) {
        // Seed from identity so it feels earned: volume tendency + archetype.
        const t = this.tendencies || [];
        let key = 'balanced';
        if (t.includes('mileage-heavy')) key = 'high-mileage';
        else if (t.includes('low-mileage')) key = 'speed';
        else if (this.archetype === 'Developer') key = 'polarized';
        else if (this.archetype === 'Tactician') key = 'threshold';
        else if (this.lactateThreshold >= 70) key = 'norwegian';
        else if ((this.id || '').length) key = TP[(this.id.charCodeAt(this.id.length - 1)) % TP.length].key;
        this.trainingPhilosophy = key;
      }
      if (!data || data.racePhilosophy === undefined) {
        const t = this.tendencies || [];
        let key = 'even';
        if (t.includes('aggressive')) key = 'aggressive';
        else if (t.includes('conservative')) key = 'conservative';
        else if (this.archetype === 'Players Coach') key = 'pack';
        else if (this.speed >= 68) key = 'sit-and-kick';
        else if ((this.id || '').length) key = RP[(this.id.charCodeAt(this.id.length - 1)) % RP.length].key;
        this.racePhilosophy = key;
      }
      // Validate against the current catalogs (defensive).
      if (!window.XCD.data.trainingPhilosophy(this.trainingPhilosophy)) this.trainingPhilosophy = 'balanced';
      if (!window.XCD.data.racePhilosophy(this.racePhilosophy)) this.racePhilosophy = 'even';
    }

    // Saves from before Update 2: derive the new fields from what exists.
    migrateUpdate2(data) {
      if (!data) return;
      const cr = this.careerRecord;
      ['seasons', 'allAmericans', 'allConference', 'indivNatChamps', 'indivConfChamps',
        'nationalsAppearances', 'confCOY', 'natCOY']
        .forEach((k) => { if (cr[k] === undefined) cr[k] = 0; });
      if (cr.bestClassRank === undefined) cr.bestClassRank = null;
      if (data.reputation === undefined) {
        // Seed reputation from résumé + rating so old worlds feel earned.
        this.reputation = Utils.clamp(Math.round(
          this.overallRating * 0.45 + cr.nationalTitles * 12 + cr.conferenceTitles * 3 +
          Math.min(20, this.yearsAtSchool)), 5, 90);
      }
      if (data.retireAge !== undefined && data.retireAge < 75) {
        this.retireAge = 75 + (data.retireAge % 9); // deterministic-ish remap to the 75+ rule
      }
      if (data.talentEval === undefined) {
        const near = (base, spread) => Utils.clamp(Math.round(base + (Math.random() - 0.5) * spread), 20, 99);
        this.talentEval = near(this.recruiting, 20);
        this.motivation = near(this.culture, 20);
        this.transferRecruiting = near(this.recruiting, 24);
        this.internationalRecruiting = near(this.recruiting - 12, 24);
        this.media = near((this.recruiting + this.culture) / 2 - 5, 20);
        this.staffManagement = near(this.culture, 22);
        this.relationships = near(this.culture, 18);
      }
    }

    // Coaches saved before the four-rating overhaul fold down cleanly.
    migrateLegacyRatings(data) {
      if (!data || (data.development === undefined && data.raceStrategy === undefined)) return;
      if (data.training === undefined || data.development !== undefined) {
        this.training = Math.round(Math.max(data.training ?? 0, data.development ?? 55));
      }
      if (data.peaking === undefined && data.raceStrategy !== undefined) this.peaking = data.raceStrategy;
      if (data.archetype === undefined && data.personality !== undefined) {
        const map = {
          'Aggressive Recruiter': 'Recruiter', 'Transfer Hunter': 'Recruiter', 'Prestige Chaser': 'Recruiter',
          'Development Guru': 'Developer', 'Builder': 'Developer', 'Distance Specialist': 'Developer',
          'Win Now': 'Tactician', 'Loyal': 'Players Coach'
        };
        this.archetype = map[data.personality] || 'Developer';
      }
      ['personality', 'raceStrategy', 'development', 'loyalty', 'charisma', 'discipline']
        .forEach((k) => { delete this[k]; });
      this.careerRecord.regionalTitles = this.careerRecord.regionalTitles || 0;
    }

    get fullName() { return `${this.firstName} ${this.lastName}`; }

    get overallRating() {
      return Math.round(Utils.average([this.recruiting, this.training, this.peaking, this.culture]));
    }

    get reputationLevel() {
      return window.XCD.data.reputationLevel(this.reputation || 0);
    }

    hasTendency(key) { return (this.tendencies || []).includes(key); }

    get winPct() {
      const cr = this.careerRecord;
      const games = (cr.wins || 0) + (cr.losses || 0);
      return games ? Math.round((cr.wins / games) * 1000) / 10 : 0;
    }
  }

  /* ---------------------------------------------------------------- *
   * School
   * ---------------------------------------------------------------- */
  class School {
    constructor(data) {
      Object.assign(this, {
        id: Utils.generateId('sch'),
        name: '',
        state: '',
        region: '',
        conference: '',
        conferenceTier: 3,
        division: 'DI', // NCAA division key into XCD.data.DIVISIONS

        prestige: 50, // 0-100 program prestige — dynamic, rises and falls yearly
        prestigeHistory: [], // [{year, prestige}] recent trajectory (last 30)
        prestigeMomentum: 0, // rolling success trend feeding the yearly update
        // Program heritage (Update 4, Part 8): historically great programs
        // carry a slow-decaying gravity that resists prestige collapse — a
        // blue blood needs several poor seasons to truly fall, while an
        // unlisted program can still climb into the elite tier over time.
        heritage: 0,
        poorSeasons: 0, // consecutive down years, used for resilient decline
        academics: 55,
        campusAppeal: 55,

        // Team morale (Update 3): 0-100 confidence/chemistry/belief. Driven
        // mostly by the coach's Culture rating and by results measured against
        // expectations (not raw win/loss). A realistic performance modifier —
        // never a talent override. Defaults to a neutral-positive baseline.
        teamMorale: 65,

        facilities: {
          trainingCenter: 50, weightRoom: 50, recoveryCenter: 50, nutrition: 50,
          lockerRoom: 50, indoorTrack: 40, altitudeRoom: 20, sportsScienceLab: 30
        },

        budget: {
          total: 250000, recruiting: 40000, travel: 60000,
          scholarships: 120000, nil: 10000, facilitiesFund: 20000
        },

        weather: { tempBase: 60, altitude: 'Low', humidity: 'Medium' },

        historicalSuccess: { conferenceTitlesM: 0, conferenceTitlesW: 0, nationalTitlesM: 0, nationalTitlesW: 0 },
        rivalries: [],
        records: {}, // "M-8K" -> { time, name, year }

        coachId: null,
        assistantId: null,
        rosterM: [],
        rosterW: [],
        // Scholarship limits come from the division rules; these mirror the
        // school's division so old code paths keep working.
        scholarshipsAvailableM: 12.6,
        scholarshipsAvailableW: 18,

        ...data
      });
      // Keep scholarship limits in sync with division rules (data-driven).
      const div = window.XCD.data.divisionFor && window.XCD.data.divisionFor(this);
      if (div && (!data || data.scholarshipsAvailableM === undefined)) {
        this.scholarshipsAvailableM = div.scholarships.M;
        this.scholarshipsAvailableW = div.scholarships.W;
      }
    }

    get facilitiesOverall() {
      const f = this.facilities;
      return Math.round(Utils.average(Object.values(f)));
    }
  }

  /* ---------------------------------------------------------------- *
   * Recruit — an Athlete plus everything the recruiting engine needs.
   * Recruits live in world.recruits until they sign & enroll, at which
   * point the engine converts them into a rostered Athlete.
   * ---------------------------------------------------------------- */
  class Recruit extends Athlete {
    constructor(data) {
      super(data);
      Object.assign(this, {
        isRecruit: true,
        source: 'HS',            // HS | JUCO | International
        country: 'USA',

        starRating: 2,
        nationalRank: 0,
        stateRank: 0,
        regionalRank: 0,

        // Hidden decision drivers (revealed to the player via scouting)
        motivations: [],         // keys into XCD.data.MOTIVATIONS
        parentsInfluence: 50,

        // What matters to this recruit when weighing schools (20-100 each)
        importance: {
          playingTime: 50, development: 50, prestige: 50,
          location: 50, nil: 30, academics: 50, facilities: 50
        },

        // Per-school recruiting state, sparse — only schools actively
        // recruiting this athlete have an entry.
        // { schoolId: { relationship, interest, offered, visited, overnight } }
        interests: {},

        committedTo: null,
        signed: false,
        commitWeek: null,
        decisionWeek: 12,        // when they start seriously deciding
        breakout: false,         // hidden late-riser flag
        breakoutFired: false,

        // The player's scouting knowledge of this recruit.
        playerKnowledge: { scout: 0, revealed: [] },

        ...data
      });
      this.isRecruit = true;
    }

    getSchoolState(schoolId, create = false) {
      if (!this.interests[schoolId] && create) {
        this.interests[schoolId] = { relationship: 0, interest: 0, offered: false, visited: false, overnight: false };
      }
      return this.interests[schoolId] || null;
    }
  }

  M.Athlete = Athlete;
  M.Coach = Coach;
  M.School = School;
  M.Recruit = Recruit;
})();
