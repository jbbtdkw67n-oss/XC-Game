/*
 * GameState: the single source of truth for an in-progress dynasty.
 * Owns the generated world, the player's identity within it, and the
 * calendar. advanceWeek() is the game loop's heartbeat -- later phases
 * (training, racing, recruiting) hook into it; for now it progresses
 * fatigue/morale drift and a full academic-year rollover (aging,
 * graduation, simple incoming-freshman replacement, coaching changes)
 * so the world keeps evolving even before those systems exist.
 */
(function () {
  const Utils = window.XCD.core.Utils;
  const M = window.XCD.models;
  const D = window.XCD.data;

  const WEEKS_PER_YEAR = 34;
  const SEASON_PHASES = [
    { upTo: 4, label: 'Summer Training' },
    { upTo: 14, label: 'Regular Season' },
    { upTo: 17, label: 'Conference Championships' },
    { upTo: 20, label: 'Regional Championships' },
    { upTo: 22, label: 'National Championships' },
    { upTo: 34, label: 'Offseason' }
  ];

  function phaseForWeek(week) {
    for (const p of SEASON_PHASES) if (week <= p.upTo) return p.label;
    return 'Offseason';
  }

  class GameState {
    constructor() {
      this.dynastyName = '';
      this.seed = 0;
      this.world = null; // { schools, coaches, athletes, recruits, schoolOrder }
      this.playerSchoolId = null;
      this.playerCoachId = null;
      this.year = 2026;
      this.week = 1;
      this.newsLog = [];
      this.createdAt = null;

      // Recruiting session state (player economy + boards)
      this.recruiting = {
        pointsLeft: 0,
        budgetLeft: 0,
        actionsThisWeek: {},   // recruitId -> actions used this week
        board: { M: [], W: [] }, // player's target lists
        aiBoards: {},          // schoolId -> { M: [ids], W: [ids] }
        classYear: null
      };

      // Long-term records (grows through later phases)
      this.history = {
        recruitingClasses: {} // year -> ranked class list
      };
    }

    /*
     * `world` is optional: pass a pre-generated world (e.g. the one shown in
     * the school picker) so entity ids match what the player selected.
     * Ids are unique per generation, so regenerating from the same seed
     * would produce identical data but different ids.
     */
    static newGame({ schoolId, dynastyName, coachFirstName, coachLastName, seed, world }) {
      const gs = new GameState();
      gs.dynastyName = dynastyName || `${coachLastName} Dynasty`;
      gs.seed = seed >>> 0;
      gs.world = world || window.XCD.engine.WorldGenerator.generate(gs.seed);
      gs.playerSchoolId = schoolId;
      gs.year = 2026;
      gs.week = 1;
      gs.createdAt = Date.now();

      const school = gs.world.schools[schoolId];
      // Replace the AI coach at the chosen school with the player.
      const oldCoachId = school.coachId;
      delete gs.world.coaches[oldCoachId];
      const playerCoach = new M.Coach({
        firstName: coachFirstName || 'Alex',
        lastName: coachLastName || 'Carter',
        age: 34,
        recruiting: 55, training: 55, raceStrategy: 55, development: 55,
        loyalty: 60, charisma: 55, discipline: 55, culture: 55,
        schoolId,
        isPlayer: true,
        yearsAtSchool: 0
      });
      gs.world.coaches[playerCoach.id] = playerCoach;
      school.coachId = playerCoach.id;
      gs.playerCoachId = playerCoach.id;

      gs.logNews(`${coachFirstName} ${coachLastName} takes over as head coach at ${school.name}.`);

      // Spin up the first recruiting cycle.
      const rng = new window.XCD.core.SeededRNG((gs.seed ^ 0xA11CE) >>> 0);
      gs.world.recruits = {};
      gs.recruiting.budgetLeft = school.budget.recruiting;
      window.XCD.engine.Recruiting.generateClass(gs, rng);
      window.XCD.engine.Recruiting.startNewWeek(gs);
      return gs;
    }

    logNews(text) {
      this.newsLog.unshift({ year: this.year, week: this.week, text, id: Utils.generateId('news') });
      if (this.newsLog.length > 300) this.newsLog.length = 300;
    }

    getSchool(id) { return this.world.schools[id]; }
    getCoach(id) { return this.world.coaches[id]; }
    getAthlete(id) { return this.world.athletes[id]; }
    getPlayerSchool() { return this.getSchool(this.playerSchoolId); }
    getPlayerCoach() { return this.getCoach(this.playerCoachId); }

    getRoster(schoolId, gender) {
      const school = this.getSchool(schoolId);
      const ids = gender === 'W' ? school.rosterW : school.rosterM;
      return ids.map((id) => this.getAthlete(id)).filter(Boolean);
    }

    get seasonPhase() { return phaseForWeek(this.week); }

    // --- Game loop -------------------------------------------------
    advanceWeek() {
      // Deterministic per-week RNG so simulated worlds are reproducible.
      const rng = new window.XCD.core.SeededRNG((this.seed + this.year * 53 + this.week * 7919) >>> 0);

      // Recruiting: AI schools work their boards, recruits decide.
      window.XCD.engine.Recruiting.processWeek(this, rng);

      Object.values(this.world.athletes).forEach((a) => {
        if (!a.schoolId) return;
        a.fatigue = Utils.clamp(a.fatigue - Utils.clamp(8 - Math.round(a.recovery / 20), 2, 8), 0, 100);
        a.morale = Utils.clamp(a.morale + (a.morale < 70 ? 1 : -1) + Utils.clamp(Math.round((70 - a.morale) / 20), -2, 2), 0, 100);
        if (a.injury) {
          a.injury.weeksRemaining -= 1;
          if (a.injury.weeksRemaining <= 0) {
            a.injury = null;
            a.health = 'Healthy';
          }
        }
      });

      this.week += 1;
      if (this.week > WEEKS_PER_YEAR) {
        this.week = 1;
        this.year += 1;
        this.rolloverYear();
      }

      // Fresh weekly recruiting points/limits for the player.
      window.XCD.engine.Recruiting.startNewWeek(this);
    }

    rolloverYear() {
      const D_ORDER = D.CLASS_YEARS; // Freshman..Graduate
      const rng = new window.XCD.core.SeededRNG((this.seed + this.year) >>> 0);

      // 1) Age everyone; seniors graduate off rosters.
      Object.values(this.world.schools).forEach((school) => {
        ['rosterM', 'rosterW'].forEach((rosterKey) => {
          const survivors = [];
          school[rosterKey].forEach((athId) => {
            const athlete = this.world.athletes[athId];
            if (!athlete) return;
            athlete.age += 1;
            const idx = D_ORDER.indexOf(athlete.classYear);
            if (athlete.classYear === 'Senior' || athlete.classYear === 'Graduate' || athlete.eligibilityRemaining <= 1) {
              athlete.schoolId = null;
              athlete.health = 'Graduated';
              delete this.world.athletes[athId];
              return;
            }
            athlete.classYear = D_ORDER[Math.min(idx + 1, 3)];
            athlete.eligibilityRemaining = Math.max(0, athlete.eligibilityRemaining - 1);
            survivors.push(athId);
          });
          school[rosterKey] = survivors;
        });
      });

      // 2) Signed recruits enroll as freshmen (JUCOs as sophomores).
      const enrolled = window.XCD.engine.Recruiting.enrollSignees(this);
      const playerClass = enrolled[this.playerSchoolId] || [];
      if (playerClass.length) {
        this.logNews(`${playerClass.length} signees arrive on campus: ${playerClass.map((r) => r.fullName).join(', ')}.`);
      }

      // 3) Thin rosters top up with unheralded walk-ons.
      Object.values(this.world.schools).forEach((school) => {
        ['rosterM', 'rosterW'].forEach((rosterKey) => {
          const gender = rosterKey === 'rosterM' ? 'M' : 'W';
          while (school[rosterKey].length < 10) {
            const walkOn = window.XCD.engine.WorldGenerator.buildAthlete(rng, school, gender);
            walkOn.classYear = 'Freshman';
            walkOn.age = 18 + rng.int(0, 1);
            walkOn.eligibilityRemaining = 4;
            // Walk-ons are a clear notch below scholarship talent.
            walkOn.potential = Math.min(walkOn.potential, rng.int(35, 62));
            walkOn.recalculateOverall();
            this.world.athletes[walkOn.id] = walkOn;
            school[rosterKey].push(walkOn.id);
          }
        });

        // 4) Coaching changes: AI coaches may retire at their target age.
        const coach = this.world.coaches[school.coachId];
        if (coach && !coach.isPlayer) {
          coach.age += 1;
          coach.yearsAtSchool += 1;
          if (coach.age >= coach.retireAge) {
            delete this.world.coaches[coach.id];
            const replacement = window.XCD.engine.WorldGenerator.buildReplacementCoach(rng, school);
            this.world.coaches[replacement.id] = replacement;
            school.coachId = replacement.id;
            this.logNews(`${school.name} hires ${replacement.fullName} as head coach after a retirement.`);
          }
        } else if (coach) {
          coach.age += 1;
          coach.yearsAtSchool += 1;
        }
        const assistant = this.world.coaches[school.assistantId];
        if (assistant) assistant.age += 1;
      });

      // 5) A brand-new national recruiting class appears.
      window.XCD.engine.Recruiting.resetForNewYear(this, rng);

      this.logNews(`A new academic year begins: ${this.year}.`);
    }

    // --- Serialization ----------------------------------------------
    toJSON() {
      return {
        version: window.XCD.VERSION,
        dynastyName: this.dynastyName,
        seed: this.seed,
        world: this.world,
        playerSchoolId: this.playerSchoolId,
        playerCoachId: this.playerCoachId,
        year: this.year,
        week: this.week,
        newsLog: this.newsLog,
        createdAt: this.createdAt,
        recruiting: this.recruiting,
        history: this.history
      };
    }

    static fromJSON(obj) {
      const gs = new GameState();
      Object.assign(gs, obj);
      // Revive plain objects back into class instances so methods/getters work.
      const schools = {};
      Object.values(obj.world.schools).forEach((s) => { schools[s.id] = new M.School(s); });
      const coaches = {};
      Object.values(obj.world.coaches).forEach((c) => { coaches[c.id] = new M.Coach(c); });
      const athletes = {};
      Object.values(obj.world.athletes).forEach((a) => { athletes[a.id] = new M.Athlete(a); });
      const recruits = {};
      Object.values(obj.world.recruits || {}).forEach((r) => { recruits[r.id] = new M.Recruit(r); });
      gs.world = { schools, coaches, athletes, recruits, schoolOrder: obj.world.schoolOrder, seed: obj.world.seed };

      // Defaults for saves from before the recruiting engine existed.
      gs.recruiting = obj.recruiting || {
        pointsLeft: 0, budgetLeft: 0, actionsThisWeek: {},
        board: { M: [], W: [] }, aiBoards: {}, classYear: null
      };
      gs.history = obj.history || { recruitingClasses: {} };
      if (!Object.keys(recruits).length) {
        const rng = new window.XCD.core.SeededRNG((gs.seed ^ 0xA11CE) >>> 0);
        gs.recruiting.budgetLeft = gs.getPlayerSchool().budget.recruiting;
        window.XCD.engine.Recruiting.generateClass(gs, rng);
        window.XCD.engine.Recruiting.startNewWeek(gs);
      }
      return gs;
    }
  }

  window.XCD.engine.GameState = GameState;
})();
