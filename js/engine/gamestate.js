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
   * The standard year — Update 2 (Part 5):
   *   Wk 1-3   Summer Training
   *   Wk 4-12  Regular Season (meets 4/6/8/10/12 — one bye between each)
   *   Wk 13    Conference · Wk 14 Regionals · Wk 15 Nationals (no byes)
   *   Wk 16-21 Offseason (awards, portal, signing day, development)
   * All numbers live in XCD.data.CALENDAR — nothing downstream hardcodes them.
   */
  const WEEKS_PER_YEAR = D.CALENDAR.WEEKS_PER_YEAR;
  const AWARDS_WEEK = D.CALENDAR.AWARDS_WEEK; // the week after nationals
  const SEASON_PHASES = [
    { upTo: D.CALENDAR.SUMMER_WEEKS, label: 'Summer Training' },
    { upTo: D.CALENDAR.CONFERENCE_WEEK - 1, label: 'Regular Season' },
    { upTo: D.CALENDAR.CONFERENCE_WEEK, label: 'Conference Championships' },
    { upTo: D.CALENDAR.REGIONAL_WEEK, label: 'Regional Championships' },
    { upTo: D.CALENDAR.NATIONAL_WEEK, label: 'National Championships' },
    { upTo: D.CALENDAR.WEEKS_PER_YEAR, label: 'Offseason' }
  ];

  function phaseForWeek(week) {
    for (const p of SEASON_PHASES) if (week <= p.upTo) return p.label;
    return 'Offseason';
  }

  class GameState {
    constructor() {
      this.dynastyName = '';
      // Unique identity for this dynasty (Update 6, Phase 5): every dynasty
      // owns its own save + autosave slots, so starting a new one never
      // overwrites an existing one. Assigned in newGame; derived for legacy
      // saves that predate multi-save on load.
      this.dynastyId = null;
      this.seed = 0;
      this.world = null; // { schools, coaches, athletes, recruits, schoolOrder }
      this.playerSchoolId = null;
      this.playerCoachId = null;
      // Coaching role (Update 5, Part 4): 'Head' controls everything;
      // 'Assistant' controls only recruiting while an AI head coach runs
      // training, scheduling, and race strategy. Assistants who recruit well
      // earn head-coach offers — a full playable career path.
      this.playerRole = 'Head';
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
        classYear: null,
        auto: false            // Auto Recruiting: the CPU runs your board
      };

      // Long-term records (grows through later phases)
      this.history = {
        recruitingClasses: {} // year -> ranked class list
      };

      // Weekly training plans: 7 workout keys (Mon-Sun) per squad,
      // plus per-athlete load overrides, plus the mileage layer (Part 6):
      // program mileage per squad and per-athlete mileage overrides.
      this.training = {
        M: D.DEFAULT_WEEK_PLAN.slice(),
        W: D.DEFAULT_WEEK_PLAN.slice(),
        overrides: {}, // athleteId -> 'reduced' | 'rest'
        mileage: { M: D.MILEAGE.DEFAULT.M, W: D.MILEAGE.DEFAULT.W },
        mileageOverrides: {} // athleteId -> weekly miles (30-120)
      };

      this.season = null;    // current season schedule + results (Races engine)
      this.rankings = null;  // latest polls (Rankings engine)
      this.lastPlayerMeetId = null; // for the race center replay
      this.portal = null;    // active transfer portal window

      // The weekly coaching rhythm: plan training -> recruit -> advance.
      this.weeklyFlow = { trainingConfirmed: false, recruitingDone: false };

      // Week 1 Administrative Phase (spec Part 2, Section 15): the season-
      // setup checklist a head coach completes before Week 2 unlocks —
      // review progression, finalize the roster (DI: 14 per squad),
      // finalize the schedule (permanently locked afterward), settle the
      // staff, and confirm the season setup. Reset every rollover.
      this.week1 = GameState.freshWeek1();

      // The player's coaching career ledger
      this.career = {
        seasons: 0, conferenceTitles: 0, nationalTitles: 0,
        nationalsAppearances: 0, podiums: 0, bestFinish: null, awards: [],
        stops: [] // coaching stops: { school, startYear }
      };

      // Team culture: player-selected captains per squad
      this.culture = { captains: { M: [], W: [] } };
      this.jobOffers = null; // outside interest after strong seasons
      // A pending coordinator vacancy after an assistant leaves (Update 16).
      this.assistantDeparture = null;

      // First-season tutorial (Update 15): set at dynasty creation for the
      // FIRST coach only ({ pending, tipsYear, seen }); cleared forever when
      // a successor coach is created inside the same dynasty. Null for
      // pre-Update-15 saves — they never see it.
      this.tutorial = null;
    }

    /*
     * `world` is optional: pass a pre-generated world (e.g. the one shown in
     * the school picker) so entity ids match what the player selected.
     * Ids are unique per generation, so regenerating from the same seed
     * would produce identical data but different ids.
     */
    static newGame({ schoolId, dynastyName, coachFirstName, coachLastName, archetype, portrait, gender, appearance, trainingPhilosophy, racePhilosophy, startRole, age, hometown, almaMater, seed, world, customLeague }) {
      const gs = new GameState();
      gs.dynastyName = dynastyName || `${coachLastName} Dynasty`;
      gs.dynastyId = GameState.newDynastyId();
      gs.seed = seed >>> 0;
      // Custom League (Update 13): apply the imported spec's global name
      // overrides before the world is used, so labels read correctly from the
      // first frame. The world itself was already customized in the preview.
      gs.customLeague = customLeague || null;
      D.applyCustomLeague(gs.customLeague);
      gs.world = world || window.XCD.engine.WorldGenerator.generate(gs.seed);
      gs.playerSchoolId = schoolId;
      gs.playerRole = startRole === 'Assistant' ? 'Assistant' : 'Head';
      gs.year = 2026;
      gs.week = 1;
      gs.createdAt = Date.now();

      const school = gs.world.schools[schoolId];
      const arch = (D.COACH_ARCHETYPES || []).find((a) => a.key === archetype) || { key: 'Developer', rating: 'training' };
      const isAssistant = gs.playerRole === 'Assistant';
      // A head coach REPLACES the AI coach at the chosen school; an assistant
      // JOINS an existing staff (the AI head coach stays and runs training,
      // scheduling, and race strategy).
      if (!isAssistant) {
        delete gs.world.coaches[school.coachId];
      }
      const playerCoach = new M.Coach({
        firstName: coachFirstName || 'Alex',
        lastName: coachLastName || 'Carter',
        age: Utils.clamp(Math.round(age || (isAssistant ? 30 : 34)), 26, 60),
        hometown: hometown || '',
        almaMater: almaMater || '',
        archetype: arch.key,
        portrait: portrait || '🧢',
        gender: gender === 'W' ? 'W' : 'M',
        appearance: (appearance && appearance.skin !== undefined) ? { ...appearance, gender: gender === 'W' ? 'W' : 'M' } : null,
        recruiting: 50, training: 50, peaking: 50, culture: 50,
        // Coaching philosophies (Update 4). Training philosophy is permanent;
        // race philosophy can be changed later on the My Program screen.
        trainingPhilosophy: (D.trainingPhilosophy(trainingPhilosophy) || {}).key || 'balanced',
        racePhilosophy: (D.racePhilosophy(racePhilosophy) || {}).key || 'even',
        schoolId,
        role: isAssistant ? 'Assistant' : 'Head',
        isPlayer: true,
        yearsAtSchool: 0
      });
      playerCoach[arch.rating] = 64;
      // An assistant leans on their recruiting; that is their whole job.
      if (isAssistant) playerCoach.recruiting = Math.max(playerCoach.recruiting, 58);
      playerCoach.reputation = isAssistant ? 12 : 20; // an assistant is a true unknown
      gs.world.coaches[playerCoach.id] = playerCoach;
      gs.playerCoachId = playerCoach.id;
      if (isAssistant) {
        // The player takes the existing assistant chair; the AI assistant who
        // held it is retired out of the world rather than left orphaned.
        if (school.assistantId && gs.world.coaches[school.assistantId]) {
          delete gs.world.coaches[school.assistantId];
        }
        school.assistantId = playerCoach.id;
      } else {
        school.coachId = playerCoach.id;
      }
      window.XCD.engine.Legacy.openStint(gs, playerCoach, school, gs.year);
      // Coaching tree (Update 6): link whoever now leads this staff with
      // whoever assists them — the first boss becomes the mentor.
      window.XCD.engine.Legacy.linkStaff(gs, school, gs.year);

      gs.career.stops.push({ school: school.name, startYear: gs.year, role: gs.playerRole });
      if (isAssistant) {
        const head = gs.getCoach(school.coachId);
        gs.logNews(`${coachFirstName} ${coachLastName} joins ${school.name} as recruiting coordinator under head coach ${head ? head.fullName : 'the staff'}.`);
      } else {
        gs.logNews(`${coachFirstName} ${coachLastName} takes over as head coach at ${school.name}.`);
      }

      // Spin up the first recruiting cycle.
      const rng = new window.XCD.core.SeededRNG((gs.seed ^ 0xA11CE) >>> 0);
      gs.world.recruits = {};
      gs.recruiting.budgetLeft = school.budget.recruiting;
      window.XCD.engine.Recruiting.generateClass(gs, rng);
      window.XCD.engine.Recruiting.startNewWeek(gs);

      // Team morale seeded from coach culture across the world.
      window.XCD.engine.Morale.init(gs);

      // Build the season schedule and preseason polls.
      window.XCD.engine.Races.newSeason(gs, rng);
      window.XCD.engine.Rankings.compute(gs);
      gs.capturePreseasonRanks();
      // An assistant never plans training — that step is pre-confirmed.
      if (!gs.controlsTraining()) gs.weeklyFlow.trainingConfirmed = true;

      // The first coach of a dynasty gets the origin story + optional
      // tutorial on their first screen (Update 15). Successor coaches
      // created later in this dynasty never will.
      gs.tutorial = { pending: true, tipsYear: null, seen: {} };
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

    // Role helpers (Update 5). An assistant delegates training, scheduling,
    // and race strategy to the program's head coach; a head coach controls
    // all of it. Recruiting is always the player's to run.
    isAssistant() { return this.playerRole === 'Assistant'; }
    controlsTraining() { return this.playerRole !== 'Assistant'; }
    controlsScheduling() { return this.playerRole !== 'Assistant'; }
    // The head coach the player answers to as an assistant (null when a head).
    getHeadCoach() {
      if (!this.isAssistant()) return this.getPlayerCoach();
      const school = this.getPlayerSchool();
      return school ? this.getCoach(school.coachId) : null;
    }

    getRoster(schoolId, gender) {
      const school = this.getSchool(schoolId);
      const ids = gender === 'W' ? school.rosterW : school.rosterM;
      return ids.map((id) => this.getAthlete(id)).filter(Boolean);
    }

    get seasonPhase() { return phaseForWeek(this.week); }

    /* ---- Week 1 Administrative Phase (spec Part 2, Section 15) ---- */
    static freshWeek1() {
      return {
        progressionReviewed: false, rosterConfirmed: false,
        scheduleFinalized: false, staffConfirmed: false, setupConfirmed: false
      };
    }

    // Division I programs carry at most 14 athletes per squad; DII/DIII
    // rosters are unlimited.
    static get DI_ROSTER_LIMIT() { return 14; }

    // Squad sizes vs the limit for the player's program.
    rosterLimitStatus() {
      const school = this.getPlayerSchool();
      const limit = (school && (school.division || 'DI') === 'DI') ? GameState.DI_ROSTER_LIMIT : Infinity;
      const M = school ? school.rosterM.length : 0;
      const W = school ? school.rosterW.length : 0;
      return { limit, M, W, over: M > limit || W > limit };
    }

    // Does the Week 1 checklist require the offseason report review?
    week1NeedsReport() {
      return !!(this.offseasonReport && this.offseasonReport.year === this.year &&
        (this.offseasonReport.entries || []).length);
    }

    // The schedule is editable only during Week 1, until it's finalized;
    // advancing to Week 2 locks it permanently either way.
    scheduleLocked() {
      return this.week > 1 || !!(this.week1 && this.week1.scheduleFinalized);
    }

    // Week 2 stays locked until the administrative checklist is complete.
    // Assistants don't run the program, so they are never gated.
    week1Complete() {
      if (this.week !== 1) return true;
      if (this.isAssistant()) return true;
      const t = this.week1 || {};
      return (!this.week1NeedsReport() || t.progressionReviewed) &&
        t.rosterConfirmed && t.scheduleFinalized && t.staffConfirmed && t.setupConfirmed;
    }

    capturePreseasonRanks() {
      if (!this.season || !this.rankings) return;
      const snap = { M: {}, W: {} };
      ['M', 'W'].forEach((g) => this.rankings[g].forEach((r) => { snap[g][r.schoolId] = r.rank; }));
      this.season.preseasonRanks = snap;
      // Preseason individual projections (Update 4, Part 9): who the favorites
      // are before a single race is run.
      try {
        this.season.preseasonIndividuals = window.XCD.engine.Rankings.computePreseasonIndividuals(this);
      } catch (e) { this.season.preseasonIndividuals = { M: [], W: [] }; }
      // Custom race schedule options (Update 4, Part 7): what the player can
      // enter each regular-season week, gated by prestige.
      try {
        if (window.XCD.engine.Scheduling) window.XCD.engine.Scheduling.buildOptions(this);
      } catch (e) { /* scheduling is best-effort UI sugar */ }
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

      // Nike Cross Nationals runs the same week as NCAA Nationals (Update 5,
      // Part 9): the high-school class crowns its champions, once per year.
      if (this.season && this.week === this.season.nationalWeek && !(this.season.nxn && this.season.nxn.year === this.year)) {
        window.XCD.engine.Awards.runNXN(this, rng);
      }

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
        if (this.isAssistant()) window.XCD.engine.Careers.generateAssistantOffers(this, rng);
        else window.XCD.engine.Careers.generateOffers(this, rng);
      }
      window.XCD.engine.Careers.expireOffers(this);
      // The offseason job market keeps evolving week to week (spec Part 2):
      // fresh openings surface, others get filled behind the scenes.
      if (this.week > AWARDS_WEEK) window.XCD.engine.Careers.evolveJobMarket(this, rng);

      // Redshirts + the transfer portal window.
      window.XCD.engine.Portal.processWeek(this, rng);

      // Beat writers file their stories.
      window.XCD.engine.News.processWeek(this, rng);

      // Fresh weekly recruiting points/limits for the player.
      window.XCD.engine.Recruiting.startNewWeek(this);

      // A new week begins: plan training first, then recruit, then advance.
      // An assistant coach doesn't control training, so that step is already
      // handled by the head coach — auto-confirm it.
      this.weeklyFlow = { trainingConfirmed: !this.controlsTraining(), recruitingDone: false };
      // Auto Recruiting: the CPU already worked the board this week.
      if (this.recruiting.auto) this.weeklyFlow.recruitingDone = true;
    }

    rolloverYear() {
      const D_ORDER = D.CLASS_YEARS; // Freshman..Graduate
      const rng = new window.XCD.core.SeededRNG((this.seed + this.year) >>> 0);

      // 0) Transfers move to their new programs before anything else.
      const transferCount = window.XCD.engine.Portal.applyTransfers(this, rng);
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
                window.XCD.engine.Legacy.recordAlumni(this, athlete);
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
              window.XCD.engine.Legacy.recordAlumni(this, athlete);
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

      // 2b) Offseason development (Part 12): every athlete in the world
      //     progresses or regresses between seasons.
      window.XCD.engine.Training.offseasonDevelopment(this, rng);

      // 2c) Division I roster limits (spec Part 2, Section 15): CPU programs
      //     over 14 per squad make intelligent cuts; cut athletes move on
      //     through the portal to programs with room. The player's own cuts
      //     are a Week 1 checklist task, never automated.
      const trimmed = window.XCD.engine.Portal.trimRosters(this, rng);
      if (trimmed) this.logNews(`Roster deadline: Division I programs trim to 14 per squad — ${trimmed} athletes move on.`);

      // 2d) A new season brings a fresh Week 1 administrative checklist.
      this.week1 = GameState.freshWeek1();

      // 3) Every program must field 14 men and 14 women. If recruiting
      //    left a roster short, walk-ons fill the gap — weak, low-ceiling
      //    runners, except the ~0.1% hidden legend.
      let playerWalkOns = 0;
      Object.values(this.world.schools).forEach((school) => {
        ['rosterM', 'rosterW'].forEach((rosterKey) => {
          const gender = rosterKey === 'rosterM' ? 'M' : 'W';
          while (school[rosterKey].length < 14) {
            const walkOn = window.XCD.engine.WorldGenerator.buildWalkOn(rng, school, gender);
            this.world.athletes[walkOn.id] = walkOn;
            school[rosterKey].push(walkOn.id);
            if (school.id === this.playerSchoolId) playerWalkOns++;
          }
        });
      });
      if (playerWalkOns) {
        this.logNews(`${playerWalkOns} walk-on${playerWalkOns > 1 ? 's' : ''} join your program to fill the roster to 14 per squad.`);
      }

      // 4) Coaches age, progress or decline, and reputations move with
      //    results (Parts 1-2) — before the carousel judges anyone.
      window.XCD.engine.Coaching.yearlyProgression(this, rng);

      // 4a) The coaching carousel (Part 11): retirements (75+), poaching
      //     chains, and the rehiring pool — schools only hire when a coach
      //     retires, is fired, or leaves.
      window.XCD.engine.Careers.runCarousel(this, rng);

      // 4a2) The assistant-coach carousel (Update 6, Phase 3): assistants
      //      retire, move up, get promoted or let go, and every program
      //      keeps a full staff — a living assistant ecosystem.
      window.XCD.engine.Careers.runAssistantCarousel(this, rng);

      // 4b) Program prestige rises and falls on the year's evidence (Part 3).
      window.XCD.engine.Prestige.yearlyUpdate(this, rng);

      // 4b2) Team morale settles on the season vs its projection (Update 3).
      window.XCD.engine.Morale.yearlyUpdate(this, rng);

      // 4c) Captains who graduated fall off the leadership group.
      ['M', 'W'].forEach((g) => {
        this.culture.captains[g] = this.culture.captains[g].filter((id) => this.world.athletes[id]);
      });

      // 5) Budgets refresh, boosters reward success, AI programs build.
      window.XCD.engine.Finances.yearlyRefresh(this, rng);

      // 5b) A brand-new national recruiting class appears.
      window.XCD.engine.Recruiting.resetForNewYear(this, rng);

      // 6) Season development counters reset; stale training overrides clear.
      Object.values(this.world.athletes).forEach((a) => {
        a.seasonDev = 0;
        a.seasonInjuryWeeks = 0;
      });
      Object.keys(this.training.overrides).forEach((id) => {
        if (!this.world.athletes[id]) delete this.training.overrides[id];
      });
      Object.keys(this.training.mileageOverrides || {}).forEach((id) => {
        if (!this.world.athletes[id]) delete this.training.mileageOverrides[id];
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
        saveVersion: GameState.SAVE_VERSION,
        dynastyName: this.dynastyName,
        dynastyId: this.dynastyId,
        seed: this.seed,
        world: this.world,
        playerSchoolId: this.playerSchoolId,
        playerCoachId: this.playerCoachId,
        playerRole: this.playerRole,
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
        jobOffers: this.jobOffers,
        // Update 11: accepting a job closes the carousel for the season.
        jobSearchClosedYear: this.jobSearchClosedYear || null,
        weeklyFlow: this.weeklyFlow,
        offseasonReport: this.offseasonReport || null,
        staffHiredYear: this.staffHiredYear || null,
        // The player's coordinator left this offseason (Update 16): a pending
        // vacancy the player resolves from the hiring pool.
        assistantDeparture: this.assistantDeparture || null,
        week1: this.week1,
        // First-season tutorial state (Update 15).
        tutorial: this.tutorial || null,
        // Custom League (Update 13): the imported spec that renamed divisions,
        // added conferences, and set meet/award names. Re-applied on load.
        customLeague: this.customLeague || null
      };
    }

    static fromJSON(obj) {
      // Versioned migrations (Part 13): old saves are upgraded in place,
      // never rejected. Each migration moves a save one version forward.
      obj = GameState.migrateSave(obj);
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
      if (gs.recruiting.auto === undefined) gs.recruiting.auto = false;
      gs.history = obj.history || { recruitingClasses: {} };
      // Day-planner training; saves from the old primary/secondary system
      // fall back to the default balanced week.
      const savedTraining = obj.training || {};
      gs.training = {
        M: Array.isArray(savedTraining.M) ? savedTraining.M : D.DEFAULT_WEEK_PLAN.slice(),
        W: Array.isArray(savedTraining.W) ? savedTraining.W : D.DEFAULT_WEEK_PLAN.slice(),
        overrides: savedTraining.overrides || {},
        mileage: savedTraining.mileage || { M: D.MILEAGE.DEFAULT.M, W: D.MILEAGE.DEFAULT.W },
        mileageOverrides: savedTraining.mileageOverrides || {}
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
      gs.weeklyFlow = obj.weeklyFlow || { trainingConfirmed: false, recruitingDone: false };
      gs.offseasonReport = obj.offseasonReport || null;
      gs.staffHiredYear = obj.staffHiredYear || null;
      gs.assistantDeparture = obj.assistantDeparture || null;
      // Tutorial state (Update 15): null for older saves — never shown to them.
      gs.tutorial = obj.tutorial || null;
      // Saves from before the Week 1 administrative phase are grandfathered:
      // the in-progress season's checklist counts as complete (its schedule
      // still locks normally once Week 1 passes).
      gs.week1 = obj.week1 || {
        progressionReviewed: true, rosterConfirmed: true,
        scheduleFinalized: obj.week > 1, staffConfirmed: true, setupConfirmed: true
      };
      // Custom League (Update 13): re-apply the imported spec's global name
      // overrides (division labels, conferences, meet/award names) so a loaded
      // custom dynasty reads exactly as it did when created; a standard save
      // resets the tables back to their defaults.
      gs.customLeague = obj.customLeague || null;
      D.applyCustomLeague(gs.customLeague);

      // Every dynasty owns a stable id (Phase 5). Pre-multi-save dynasties get
      // one derived deterministically from their seed + creation time, so a
      // legacy save keeps the same autosave slot across loads.
      gs.dynastyId = obj.dynastyId || GameState.deriveLegacyDynastyId(obj);
      // Role defaults to Head for every pre-Update-5 dynasty.
      gs.playerRole = obj.playerRole === 'Assistant' ? 'Assistant' : 'Head';
      if (!gs.controlsTraining()) gs.weeklyFlow.trainingConfirmed = true;
      if (gs.week > WEEKS_PER_YEAR) gs.week = WEEKS_PER_YEAR;
      // A season built under a different calendar is rebuilt so every week
      // reference is valid (results already banked in history are kept).
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
      // Team morale: seed any school missing it (older saves / new field).
      window.XCD.engine.Morale.init(gs);

      // HS 5K PBs (Section 16): recruit classes saved before the feature get
      // deterministic PBs so the board is never blank mid-cycle.
      const pbRng = new window.XCD.core.SeededRNG((gs.seed ^ 0x5B5B) >>> 0);
      Object.values(gs.world.recruits).forEach((r) => {
        if (r.hsPB === undefined) r.hsPB = window.XCD.engine.Recruiting.generateHsPB(pbRng, r);
      });

      // Tell the player when their dynasty was upgraded into the multi-division world.
      if (obj.__migratedDivisions) {
        gs.logNews('🏛 Your dynasty has joined the new three-division NCAA: Division II and Division III programs now compete alongside you, with their own conferences, regionals, and championships. Your program, roster, and history carried over intact.');
      }
      return gs;
    }

    /*
     * Versioned save migrations. `saveVersion` history:
     *   (absent) — pre-Update-2 saves (14-week calendar, static prestige,
     *              4-rating coaches, no mileage/divisions)
     *   3        — Update 2 (21-week calendar, divisions, mileage,
     *              reputation, program history)
     * Model constructors handle per-entity field defaults; this handles
     * cross-cutting shape changes.
     */
    static migrateSave(obj) {
      const from = obj.saveVersion || 2;
      if (from >= GameState.SAVE_VERSION) return obj;

      // v2 -> v3: the calendar changed shape (14 -> 21 weeks), so week
      // numbers from old saves point at different phases. Rather than
      // guess, resume the dynasty at the top of the same academic year —
      // rosters, history, recruiting classes, and careers all survive.
      if (from < 3) {
        obj.week = 1;
        obj.season = null;    // rebuilt for the new calendar in fromJSON
        obj.portal = null;    // old portal windows reference dead weeks
        obj.jobOffers = null; // ditto for offer expiry weeks
        if (obj.recruiting) obj.recruiting.actionsThisWeek = {};
        obj.weeklyFlow = { trainingConfirmed: false, recruitingDone: false };
      }

      // v3 -> v4 (Update 3): the world becomes multi-division. Existing
      // DI-only dynasties gain the full DII and DIII ecosystems so all three
      // coexist. The player's program, roster, history, and career are
      // untouched — the lower divisions are simply added alongside.
      if (from < 4) {
        const hasLower = obj.world && Object.values(obj.world.schools || {})
          .some((s) => (s.division || 'DI') !== 'DI');
        if (obj.world && !hasLower && window.XCD.engine.WorldGenerator.generateLowerDivisions) {
          const lower = window.XCD.engine.WorldGenerator.generateLowerDivisions((obj.seed || 1) >>> 0);
          Object.assign(obj.world.schools, lower.schools);
          Object.assign(obj.world.coaches, lower.coaches);
          Object.assign(obj.world.athletes, lower.athletes);
          obj.world.schoolOrder = (obj.world.schoolOrder || []).concat(lower.order);
          obj.season = null;   // rebuild division-aware postseason + Pre-Nationals
          obj.rankings = null; // recompute per-division polls
          obj.__migratedDivisions = true;
        }
        if (obj.recruiting && obj.recruiting.auto === undefined) obj.recruiting.auto = false;
      }

      // v4 -> v5 (Update 4): coaching philosophies, rich accolades, and
      // program heritage. Per-entity fields (coach philosophies, athlete
      // accolade backfill) are handled by the model constructors on revive;
      // here we only backfill program heritage for historically great
      // programs so their resilience carries into existing dynasties.
      if (from < 5) {
        const seeds = D.PRESTIGE_SEEDS || {};
        Object.values((obj.world && obj.world.schools) || {}).forEach((s) => {
          if (s.heritage === undefined || s.heritage === null) {
            s.heritage = seeds[s.name] || 0;
          }
          if (s.poorSeasons === undefined) s.poorSeasons = 0;
        });
      }

      obj.saveVersion = GameState.SAVE_VERSION;
      return obj;
    }
  }

  GameState.SAVE_VERSION = 5;

  // A collision-resistant id for a brand-new dynasty (Phase 5).
  GameState.newDynastyId = function () {
    return 'dyn_' + Date.now().toString(36) + '_' +
      Math.floor(Math.random() * 0x7FFFFFFF).toString(36);
  };

  // A stable id for a dynasty saved before multi-save existed, derived from
  // fields it already carried so repeated loads land on the same slot.
  GameState.deriveLegacyDynastyId = function (obj) {
    const seed = (obj && obj.seed ? obj.seed >>> 0 : 0).toString(36);
    const created = (obj && obj.createdAt ? obj.createdAt : 0).toString(36);
    return 'dyn_legacy_' + seed + '_' + created;
  };

  window.XCD.engine.GameState = GameState;
})();
