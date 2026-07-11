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

        // Preferences (used heavily by recruiting engine, phase 2)
        preferredDistance: 'All-Around',
        preferredClimate: 'No Preference',
        preferredSchoolSize: 'No Preference',

        // Potential / overall
        potential: 60,
        currentOverall: 50,
        peakOverall: 60,

        // Physical ratings (0-100)
        vo2Max: 55, lactateThreshold: 55, endurance: 55, rawSpeed: 55, kickSpeed: 55,
        acceleration: 55, runningEconomy: 55, strength: 55, recovery: 55, stamina: 55,
        packRunning: 55, hillRunning: 55, downhillRunning: 55, trackSpeed: 55,
        fiveKAbility: 55, eightKAbility: 55, tenKAbility: 55,
        weatherPerformance: 55, altitudePerformance: 55, injuryResistance: 55, durability: 55,

        // Status
        fatigue: 10,       // 0 fresh - 100 exhausted
        fitness: 50,       // 0-100 current fitness level built from training
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
        raceLog: [],       // last 8 results: {y, w, m, p, t, d}

        schoolId: null,
        isRecruit: false,
        careerStats: { races: 0, wins: 0, top5: 0, personalBests: {} },

        ...data
      });
      this.recalculateOverall();
    }

    get fullName() { return `${this.firstName} ${this.lastName}`; }

    // Weighted overall rating from the physical ratings that matter most
    // for distance running, gently pulled toward potential based on class year.
    recalculateOverall() {
      const weights = {
        vo2Max: 0.14, lactateThreshold: 0.12, endurance: 0.12, runningEconomy: 0.10,
        stamina: 0.08, mentalToughness: 0.08, raceIQ: 0.06, kickSpeed: 0.06,
        hillRunning: 0.05, packRunning: 0.05, rawSpeed: 0.05, recovery: 0.05,
        injuryResistance: 0.04
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
        personality: 'Builder',

        recruiting: 55,
        training: 55,
        raceStrategy: 55,
        development: 55,
        loyalty: 55,
        charisma: 55,
        discipline: 55,
        culture: 55,

        schoolId: null,
        role: 'Head', // Head | Assistant
        isPlayer: false,
        yearsAtSchool: 0,
        hotSeat: 0, // 0-100, drives firing risk in later phases
        careerRecord: { wins: 0, losses: 0, conferenceTitles: 0, nationalTitles: 0 },
        retireAge: Utils.clamp(62 + Math.round(Math.random() * 10), 60, 75),

        ...data
      });
    }

    get fullName() { return `${this.firstName} ${this.lastName}`; }

    get overallRating() {
      return Math.round(Utils.average([
        this.recruiting, this.training, this.raceStrategy, this.development,
        this.loyalty, this.charisma, this.discipline, this.culture
      ]));
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

        prestige: 50, // 0-100 overall program prestige, drives recruiting pull
        academics: 55,
        campusAppeal: 55,

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
        scholarshipsAvailableM: 12.6, // NCAA D1 XC/T&F equivalency scholarship limits (approx)
        scholarshipsAvailableW: 18,

        ...data
      });
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
