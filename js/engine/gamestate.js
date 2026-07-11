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

  /*
   * The standard year: a 10-week season (Wk 1-10) plus a 4-week offseason.
   *   Wk 1 Meet · Wk 2 Training · Wk 3 Meet · Wk 4 Training ·
   *   Wk 5 Pre-Nationals · Wk 6 Training · Wk 7 Meet ·
   *   Wk 8 Conference · Wk 9 Regionals · Wk 10 Nationals ·
   *   Wk 11-14 Offseason (awards, transfer portal, signing day).
   */
  const WEEKS_PER_YEAR = 14;
  const AWARDS_WEEK = 11; // the week after nationals
  const SEASON_PHASES = [
    { upTo: 7, label: 'Regular Season' },
    { upTo: 8, label: 'Conference Championships' },
    { upTo: 9, label: 'Regional Championships' },
    { upTo: 10, label: 'National Championships' },
    { upTo: 14, label: 'Offseason' }
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

      // Weekly training plans: 7 workout keys (Mon-Sun) per squad,
      // plus per-athlete load overrides.
      this.training = {
        M: D.DEFAULT_WEEK_PLAN.slice(),
        W: D.DEFAULT_WEEK_PLAN.slice(),
        overrides: {} // athleteId -> 'reduced' | 'rest'
      };

      this.season = null;    // current season schedule + results (Races engine)
      this.rankings = null;  // latest polls (Rankings engine)
      this.lastPlayerMeetId = null; // for the race center replay
      this.portal = null;    // active transfer portal window

      // The player's coaching career ledger
      this.career = {
        seasons: 0, conferenceTitles: 0, nationalTitles: 0,
        nationalsAppearances: 0, podiums: 0, bestFinish: null, awards: [],
        stops: [] // coaching stops: { school, startYear }
      };

      // Team culture: player-selected captains per squad
      this.culture = { captains: { M: [], W: [] } };
      this.jobOffers = null; // outside interest after strong seasons
    }

    /*
     * `world` is optional: pass a pre-generated world (e.g. the one shown in
     * the school picker) so entity ids match what the player selected.
     * Ids are unique per generation, so regenerating from the same seed
     * would produce identical data but different ids.
     */
    static newGame({ schoolId, dynastyName, coachFirstName, coachLastName, archetype, portrait, seed, world }) {
      const gs = new GameState();
      gs.dynastyName = dynastyName || `${coachLastName} Dynasty`;
      gs.seed = seed >>> 0;
      gs.world = world || window.XCD.engine.WorldGenerator.generate(gs.seed);
      gs.playerSchoolId = schoolId;
      gs.year = 2026;
      gs.week = 1;
      gs.createdAt = Date.now();

      const school = gs.world.schools[schoolId];
      // Replace the AI coach at the chosen school with the player's
      // created coach. Archetype grants a real bonus to its rating.
      const oldCoachId = school.coachId;
      delete gs.world.coaches[oldCoachId];
      const arch = (D.COACH_ARCHETYPES || []).find((a) => a.key === archetype) || { key: 'Developer', rating: 'training' };
      const playerCoach = new M.Coach({
        firstName: coachFirstName || 'Alex',
        lastName: coachLastName || 'Carter',
        age: 34,
        archetype: arch.key,
        portrait: portrait || '🧢',
        recruiting: 50, training: 50, peaking: 50, culture: 50,
        schoolId,
        isPlayer: true,
        yearsAtSchool: 0
      });
      playerCoach[arch.rating] = 64;
      gs.world.coaches[playerCoach.id] = playerCoach;
      school.coachId = playerCoach.id;
      gs.playerCoachId = playerCoach.id;

      gs.career.stops.push({ school: school.name, startYear: gs.year });
      gs.logNews(`${coachFirstName} ${coachLastName} takes over as head coach at ${school.name}.`);

      // Spin up the first recruiting cycle.
      const rng = new window.XCD.core.SeededRNG((gs.seed ^ 0xA11CE) >>> 0);
      gs.world.recruits = {};
      gs.recruiting.budgetLeft = school.budget.recruiting;
      window.XCD.engine.Recruiting.generateClass(gs, rng);
      window.XCD.engine.Recruiting.startNewWeek(gs);

      // Build the season schedule and preseason polls.
      window.XCD.engine.Races.newSeason(gs, rng);
      window.XCD.engine.Rankings.compute(gs);
      gs.capturePreseasonRanks();
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

    capturePreseasonRanks() {
      if (!this.season || !this.rankings) return;
      const snap = { M: {}, W: {} };
      ['M', 'W'].forEach((g) => this.rankings[g].forEach((r) => { snap[g][r.schoolId] = r.rank; }));
      this.season.preseasonRanks = snap;
    }

    // --- Game loop -------------------------------------------------
    advanceWeek() {
      // Deterministic per-week RNG so simulated worlds are reproducible.
      const rng = new window.XCD.core.SeededRNG((this.seed + this.year * 53 + this.week * 7919) >>> 0);

      // Recruiting: AI schools work their boards, recruits decide.
      window.XCD.engine.Recruiting.processWeek(this, rng);

      // Race day: every meet in the country runs this week's races.
      const meetBefore = this.season && this.season.playerMeetByWeek[this.week];
      window.XCD.engine.Races.processWeek(this, rng);
      this.lastPlayerMeetId = meetBefore ||
        (this.season && this.week === this.season.nationalWeek ? this.season.nationalsMeetId : null) ||
        this.lastPlayerMeetId;

      // Training & development: every athlete in the world trains,
      // develops, fatigues, and risks injury.
      window.XCD.engine.Training.processWeek(this, rng);

      this.week += 1;
      if (this.week > WEEKS_PER_YEAR) {
        this.week = 1;
        this.year += 1;
        this.rolloverYear();
      }

      // Post-week: build the nationals field once regionals wrap.
      window.XCD.engine.Races.postWeekHousekeeping(this);

      // Awards ceremony the week after nationals; ADs start calling.
      if (this.week === AWARDS_WEEK) {
        window.XCD.engine.Awards.processPostNationals(this, rng);
        window.XCD.engine.Careers.generateOffers(this, rng);
      }
      window.XCD.engine.Careers.expireOffers(this);

      // Redshirts + the transfer portal window.
      window.XCD.engine.Portal.processWeek(this, rng);

      // Beat writers file their stories.
      window.XCD.engine.News.processWeek(this, rng);

      // Fresh weekly recruiting points/limits for the player.
      window.XCD.engine.Recruiting.startNewWeek(this);
    }

    rolloverYear() {
      const D_ORDER = D.CLASS_YEARS; // Freshman..Graduate
      const rng = new window.XCD.core.SeededRNG((this.seed + this.year) >>> 0);

      // 0) Transfers move to their new programs before anything else.
      const transferCount = window.XCD.engine.Portal.applyTransfers(this);
      if (transferCount) this.logNews(`Transfer portal closes: ${transferCount} athletes changed schools this cycle.`);

      // 1) Age everyone; redshirt years preserve eligibility and class;
      //    graduates leave (Hall of Fame careers get enshrined).
      Object.values(this.world.schools).forEach((school) => {
        ['rosterM', 'rosterW'].forEach((rosterKey) => {
          const survivors = [];
          school[rosterKey].forEach((athId) => {
            const athlete = this.world.athletes[athId];
            if (!athlete) return;
            athlete.age += 1;
            athlete.yearsOnCampus = (athlete.yearsOnCampus || 1) + 1;
            athlete.seasonRaces = 0;

            const redshirted = athlete.redshirt === 'True' || athlete.redshirt === 'Medical';
            if (redshirted) {
              // The season didn't burn eligibility; athletic class holds.
              athlete.redshirt = 'Used';
              if (athlete.yearsOnCampus > 5) { // five-year clock still expires
                window.XCD.engine.Awards.considerHallOfFame(this, athlete);
                athlete.schoolId = null;
                athlete.health = 'Graduated';
                delete this.world.athletes[athId];
                return;
              }
              survivors.push(athId);
              return;
            }

            if (athlete.eligibilityRemaining <= 1 || athlete.yearsOnCampus > 5 ||
                athlete.classYear === 'Graduate') {
              window.XCD.engine.Awards.considerHallOfFame(this, athlete);
              athlete.schoolId = null;
              athlete.health = 'Graduated';
              delete this.world.athletes[athId];
              return;
            }
            const idx = D_ORDER.indexOf(athlete.classYear);
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
            school.coachChangedYear = this.year; // transfers may follow the old coach out
            this.logNews(`${school.name} hires ${replacement.fullName} as head coach after a retirement.`);
          }
        } else if (coach) {
          coach.age += 1;
          coach.yearsAtSchool += 1;
        }
        const assistant = this.world.coaches[school.assistantId];
        if (assistant) assistant.age += 1;
      });

      // 4b) Elite programs raid successful small-school coaches.
      window.XCD.engine.Careers.aiPoaching(this, rng);

      // 4c) Captains who graduated fall off the leadership group.
      ['M', 'W'].forEach((g) => {
        this.culture.captains[g] = this.culture.captains[g].filter((id) => this.world.athletes[id]);
      });

      // 5) Budgets refresh, boosters reward success, AI programs build.
      window.XCD.engine.Finances.yearlyRefresh(this, rng);

      // 5b) A brand-new national recruiting class appears.
      window.XCD.engine.Recruiting.resetForNewYear(this, rng);

      // 6) Season development counters reset; stale training overrides clear.
      Object.values(this.world.athletes).forEach((a) => { a.seasonDev = 0; });
      Object.keys(this.training.overrides).forEach((id) => {
        if (!this.world.athletes[id]) delete this.training.overrides[id];
      });

      // 7) Archive last season's player results, then build the new season.
      if (this.season) {
        const summary = [];
        Object.values(this.season.meets).forEach((meet) => {
          ['M', 'W'].forEach((gender) => {
            const res = meet.results[gender];
            if (!res) return;
            const mine = res.teamScores.find((t) => t.schoolId === this.playerSchoolId);
            if (mine) summary.push({ week: meet.week, meet: meet.name, gender, place: mine.place, teams: res.teamScores.length, points: mine.points });
          });
        });
        this.history.seasonSummaries = this.history.seasonSummaries || {};
        this.history.seasonSummaries[this.season.year] = summary;
      }
      const seasonRng = new window.XCD.core.SeededRNG((this.seed + this.year * 977) >>> 0);
      window.XCD.engine.Races.newSeason(this, seasonRng);
      window.XCD.engine.Rankings.compute(this);
      this.capturePreseasonRanks();
      this.lastPlayerMeetId = null;

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
        history: this.history,
        training: this.training,
        season: this.season,
        rankings: this.rankings,
        lastPlayerMeetId: this.lastPlayerMeetId,
        portal: this.portal,
        career: this.career,
        fundraisedYear: this.fundraisedYear || null,
        culture: this.culture,
        jobOffers: this.jobOffers
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
      // Day-planner training; saves from the old primary/secondary system
      // fall back to the default balanced week.
      const savedTraining = obj.training || {};
      gs.training = {
        M: Array.isArray(savedTraining.M) ? savedTraining.M : D.DEFAULT_WEEK_PLAN.slice(),
        W: Array.isArray(savedTraining.W) ? savedTraining.W : D.DEFAULT_WEEK_PLAN.slice(),
        overrides: savedTraining.overrides || {}
      };
      gs.season = obj.season || null;
      gs.rankings = obj.rankings || null;
      gs.lastPlayerMeetId = obj.lastPlayerMeetId || null;
      gs.portal = obj.portal || null;
      gs.career = obj.career || {
        seasons: 0, conferenceTitles: 0, nationalTitles: 0,
        nationalsAppearances: 0, podiums: 0, bestFinish: null, awards: []
      };
      gs.career.stops = gs.career.stops || [{ school: gs.getPlayerSchool().name, startYear: 2026 }];
      gs.culture = obj.culture || { captains: { M: [], W: [] } };
      gs.jobOffers = obj.jobOffers || null;
      // Saves from before the 14-week calendar: clamp into the new year shape
      // and rebuild the season so every week reference is valid.
      if (gs.week > WEEKS_PER_YEAR) gs.week = WEEKS_PER_YEAR;
      if (!gs.season || gs.season.year !== gs.year ||
          gs.season.nationalWeek !== window.XCD.engine.Races.NATIONAL_WEEK) {
        const seasonRng = new window.XCD.core.SeededRNG((gs.seed + gs.year * 977) >>> 0);
        window.XCD.engine.Races.newSeason(gs, seasonRng);
      }
      if (!gs.rankings) window.XCD.engine.Rankings.compute(gs);
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
