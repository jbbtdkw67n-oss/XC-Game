/*
 * MeetCalendar — Real Schedules.
 *
 * The regular season (Weeks 4–12) is a real, persistent meet calendar:
 *   - Every meet happens on the SAME week every year (the calendar is built
 *     once per dynasty and stored on the world). Famous invitationals keep
 *     their real weekends; hundreds of host programs run an annual home
 *     invitational, placed so every school has plenty of meets within bus
 *     range. Pre-Nationals is rebuilt each season on that year's NCAA
 *     course and stays exclusive to its division.
 *   - Meets have caps — big meets stay big, small invites stay small — and
 *     the CPU always leaves one open seat so the player can get in.
 *   - Travel costs money. Every program has a HARD travel budget each
 *     season (prestige, an upgradable Travel Program rating, and last
 *     season's results vs expectations). A trip's price is its miles: a
 *     bus ride to a neighbor is cheap, a flight across the country is not.
 *   - The CPU designs its schedules first — 3 to 7 meets, picked by budget,
 *     ambition (a cross-division Team Power rating), and each coach's
 *     scheduling style — then the player builds theirs during Week 1.
 */
(function () {
  const D = window.XCD.data;
  const Utils = window.XCD.core.Utils;
  const CAL = D.CALENDAR;

  const CAL_VERSION = 1;
  const WEEKS = [];
  for (let w = CAL.REGULAR_SEASON_START; w < CAL.CONFERENCE_WEEK; w++) WEEKS.push(w);

  const CFG = {
    MIN_MEETS: 3,
    MAX_MEETS: 7,
    BUS_MAX_MILES: 500,         // longer trips fly
    COVER_MILES: 320,           // "close to home" for the coverage guarantee
    COVER_TARGET: 7,            // open meets every school has within that range
    MEETS_PER_WEEK: 28,         // open invitationals on the calendar each week
    ENTRY_FEE: { elite: 1200, prenats: 1500, major: 500, invite: 250 },
    // Elite gate by Team Power (national percentile, any division).
    powerReq: (weight) => Math.round(74 + ((weight || 1) - 1) * 55),
    PRE_NATS: {
      DI: { fieldSize: 40, atLargeSlots: 6 },
      DII: { fieldSize: 28, atLargeSlots: 4 },
      DIII: { fieldSize: 32, atLargeSlots: 4 }
    }
  };

  const TIER_LABEL = { elite: 'Elite', prenats: 'Pre-Nationals', major: 'Major', invite: 'Invitational' };
  const TIER_ICON = { elite: '⭐', prenats: '🏆', major: '◆', invite: '' };

  /* ================================================================ *
   * Travel cost
   * ================================================================ */
  function milesTo(school, meetState) {
    return D.milesBetweenStates(school && school.state, meetState);
  }

  /*
   * One trip for both squads, round trip: { miles, mode, travel, entry, total }.
   * Bus up to 500 miles ($800 + $7/mile); beyond that the team flies
   * ($5,000 + $4/mile). Hosts race at home for free.
   */
  function tripCost(miles, tier, home) {
    if (home) return { miles: 0, mode: 'home', travel: 0, entry: 0, total: 0 };
    const bus = miles <= CFG.BUS_MAX_MILES;
    const travel = bus ? 800 + miles * 7 : 5000 + miles * 4;
    const entry = CFG.ENTRY_FEE[tier] || CFG.ENTRY_FEE.invite;
    const round50 = (n) => Math.round(n / 50) * 50;
    return { miles, mode: bus ? 'bus' : 'flight', travel: round50(travel), entry, total: round50(travel) + entry };
  }

  function meetCost(gameState, school, meet) {
    return tripCost(milesTo(school, meet.state), meet.tier, meet.hostId === school.id);
  }

  /* ================================================================ *
   * The persistent calendar
   * ================================================================ */
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

  function facilityAvg(s) {
    const f = s.facilities || {};
    const v = Object.values(f);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 50;
  }

  const NAME_STYLES = ['Invitational', 'Invitational', 'Invitational', 'Invite', 'Invite', 'Classic', 'Open', 'Challenge'];

  function ensureCalendar(gameState) {
    const world = gameState.world;
    if (world.meetCalendar && world.meetCalendar.version === CAL_VERSION) return world.meetCalendar;
    const rng = new window.XCD.core.SeededRNG(((gameState.seed || 1) + 40493) >>> 0);
    const schools = world.schoolOrder.map((id) => gameState.getSchool(id)).filter(Boolean);
    const entries = [];
    const hosting = new Set();

    // Famous invitationals: their real weekend, hosted by the state's
    // flagship program (Wisconsin hosts Nuttycombe, and so on).
    (D.ELITE_MEETS || []).filter((m) => !m.preNationals).forEach((em) => {
      const inState = schools.filter((s) => s.state === em.state).sort((a, b) => b.prestige - a.prestige);
      const host = inState[0] || schools.slice().sort((a, b) =>
        D.milesBetweenStates(a.state, em.state) - D.milesBetweenStates(b.state, em.state))[0];
      hosting.add(host.id);
      entries.push({
        key: 'elite:' + slug(em.name), name: em.name, week: em.week, tier: 'elite',
        cap: Math.round(em.size * 1.35), state: em.state, hostId: host.id, famous: true
      });
    });

    // Open invitationals. Loads per week (nationwide and per state) keep the
    // calendar balanced so there is always something nearby every weekend.
    const globalLoad = {};
    const stateLoad = {}; // state -> week -> meets within range
    WEEKS.forEach((w) => { globalLoad[w] = 0; });
    const states = Object.keys(D.STATE_COORDS);
    const nearStates = {};
    states.forEach((a) => {
      nearStates[a] = states.filter((b) => D.milesBetweenStates(a, b) <= CFG.COVER_MILES);
    });
    const coverCount = {};
    states.forEach((s) => { coverCount[s] = 0; stateLoad[s] = {}; WEEKS.forEach((w) => { stateLoad[s][w] = 0; }); });

    const usedNames = new Set(entries.map((e) => e.name));
    const addLocal = (host) => {
      const st = host.state;
      // The emptiest weekend around this host (then nationwide).
      const week = WEEKS.slice().sort((a, b) =>
        (stateLoad[st][a] * 4 + globalLoad[a]) - (stateLoad[st][b] * 4 + globalLoad[b]) || rng.next() - 0.5)[0];
      const major = host.prestige >= 68 && facilityAvg(host) >= 55 && rng.bool(0.65);
      let name = window.XCD.data.customMeetName && window.XCD.data.customMeetName(entries.length + 1);
      if (!name || usedNames.has(name)) name = `${host.name} ${rng.choice(NAME_STYLES)}`;
      usedNames.add(name);
      entries.push({
        key: 'inv:' + host.id, name, week, tier: major ? 'major' : 'invite',
        cap: major ? rng.int(26, 34) : rng.int(14, 22), state: st, hostId: host.id
      });
      hosting.add(host.id);
      globalLoad[week]++;
      (nearStates[st] || [st]).forEach((s) => { stateLoad[s][week]++; coverCount[s]++; });
    };
    const hostWeight = (s) => Math.pow(Math.max(10, s.prestige * 0.6 + facilityAvg(s) * 0.4), 1.6);

    // 1) Coverage: every school gets enough open meets within bus range.
    rng.shuffle(schools).forEach((s) => {
      let guard = 0;
      while (coverCount[s.state] < CFG.COVER_TARGET && guard++ < 12) {
        const cands = schools.filter((c) => !hosting.has(c.id) &&
          (c.state === s.state || D.milesBetweenStates(s.state, c.state) <= CFG.COVER_MILES * 0.85));
        if (!cands.length) break;
        addLocal(rng.weightedChoice(cands, hostWeight));
      }
    });
    // 2) Fill the calendar out to a healthy number of meets each weekend.
    let guard = 0;
    while (entries.filter((e) => !e.famous).length < CFG.MEETS_PER_WEEK * WEEKS.length && guard++ < 2000) {
      const cands = schools.filter((c) => !hosting.has(c.id));
      if (!cands.length) break;
      addLocal(rng.weightedChoice(cands, hostWeight));
    }

    world.meetCalendar = { version: CAL_VERSION, entries };
    return world.meetCalendar;
  }

  /* ================================================================ *
   * Team Power: one cross-division strength rating
   * ================================================================ */
  // National percentile (1–99) of a program's top-5 strength, both squads
  // averaged — the same yardstick for DI, DII and DIII, so an exceptional
  // DII team rates right alongside the DI powers.
  function computePower(gameState) {
    const R = window.XCD.engine.Rankings;
    const rows = Object.values(gameState.world.schools).map((s) => ({
      id: s.id, v: (R.teamStrength(gameState, s, 'M') + R.teamStrength(gameState, s, 'W')) / 2
    })).sort((a, b) => a.v - b.v);
    const out = {};
    const n = rows.length;
    rows.forEach((r, i) => { out[r.id] = Math.max(1, Math.min(99, Math.round(((i + 0.5) / n) * 100))); });
    return out;
  }

  let buildingSeason = null; // the season under construction (not yet on gameState)
  function powerOf(gameState, schoolId) {
    const s = buildingSeason || gameState.season;
    if (!s) return 50;
    if (!s.power) s.power = computePower(gameState);
    return s.power[schoolId] || 1;
  }

  // Best poll rank within the school's own division (either squad).
  function bestRank(gameState, schoolId) {
    const r = gameState.rankings;
    if (!r) return null;
    const m = (r.M || []).find((x) => x.schoolId === schoolId);
    const w = (r.W || []).find((x) => x.schoolId === schoolId);
    const b = Math.min(m ? m.rank : 999, w ? w.rank : 999);
    return b < 999 ? b : null;
  }

  /*
   * May this school enter this meet?  → { ok, reason }
   *   Pre-Nationals: its own division only, on merit (prestige / poll / power).
   *   Elite: Team Power — any division — or, in Division I, prestige or a
   *   top-25 ranking.
   */
  function access(gameState, school, meet) {
    const div = school.division || 'DI';
    if (meet.tier === 'prenats') {
      if ((meet.division || 'DI') !== div) return { ok: false, reason: `${D.DIVISION_SHORT ? (D.DIVISION_SHORT[meet.division] || meet.division) : meet.division} only` };
      if ((meet.schoolIds || []).includes(school.id)) return { ok: true };
      const rank = bestRank(gameState, school.id);
      const pw = powerOf(gameState, school.id);
      if (school.prestige >= 72 || (rank && rank <= 25) || pw >= 80) return { ok: true };
      return { ok: false, reason: 'Invite only: prestige 72+, a top-25 ranking, or Team Power 80+' };
    }
    if (meet.tier === 'elite') {
      const req = CFG.powerReq(meet.elite);
      if (powerOf(gameState, school.id) >= req) return { ok: true };
      if (div === 'DI') {
        const S = window.XCD.engine.Scheduling;
        if (S && school.prestige >= S.eliteRequirement(meet)) return { ok: true };
        const rank = bestRank(gameState, school.id);
        if (rank && rank <= 25) return { ok: true };
        return { ok: false, reason: `Needs Team Power ${req}+, prestige ${S ? S.eliteRequirement(meet) : 60}+, or a top-25 ranking` };
      }
      return { ok: false, reason: `Needs Team Power ${req}+` };
    }
    return { ok: true };
  }

  /* ================================================================ *
   * Travel budget
   * ================================================================ */
  function travelRating(school) {
    if (typeof school.travelRating !== 'number') {
      // Seeded from the program's facilities and standing.
      let h = 0;
      for (let i = 0; i < school.id.length; i++) h = (h * 31 + school.id.charCodeAt(i)) >>> 0;
      school.travelRating = Utils.clamp(Math.round(facilityAvg(school) * 0.55 + school.prestige * 0.4 + (h % 13) - 6), 15, 95);
    }
    return school.travelRating;
  }

  const DIV_SCALE = { DI: 1.0, DII: 0.85, DIII: 0.75 };
  const TIER_SCALE = { 1: 1.15, 2: 1.0, 3: 0.9, 4: 0.82 };

  /*
   * The season's hard travel budget. Stored on school.travelBudget with the
   * pieces that built it (shown to the player), and mirrored on
   * school.budget.travel.
   */
  function computeBudget(gameState, school, cheapest3) {
    const div = school.division || 'DI';
    const p = school.prestige;
    const base = Math.round((2500 + p * p * 8) * (DIV_SCALE[div] || 0.8) *
      (div === 'DI' ? (TIER_SCALE[school.conferenceTier] || 0.9) : 1));
    const rating = travelRating(school);
    const ratingMult = 0.8 + rating / 250;
    const momentum = school.travelMomentum || 0;
    let total = base * ratingMult * (1 + momentum);
    const floor = Math.round((cheapest3 || 0) * 1.1);
    total = Math.max(total, floor);
    total = Math.round(total / 100) * 100;
    school.travelBudget = {
      year: gameState.year, base, rating, ratingMult: Math.round(ratingMult * 100) / 100,
      momentum, notes: (school.travelMomentumNotes || []).slice(), floor, total
    };
    school.budget.travel = total;
    return total;
  }

  // Re-price the budget after a Travel Program upgrade (same season).
  function refreshBudget(gameState, school) {
    const tb = school.travelBudget;
    if (!tb) return null;
    const ratingMult = 0.8 + travelRating(school) / 250;
    let total = Math.max(tb.base * ratingMult * (1 + (tb.momentum || 0)), tb.floor || 0);
    total = Math.round(total / 100) * 100;
    Object.assign(tb, { rating: school.travelRating, ratingMult: Math.round(ratingMult * 100) / 100, total });
    school.budget.travel = total;
    return total;
  }

  /*
   * Yearly swing (run at rollover, before the new season is built): beating
   * the preseason poll and winning titles grows next season's budget;
   * falling short of expectations shrinks it. Half of the old swing fades.
   */
  function updateMomentum(gameState) {
    const season = gameState.season;
    const year = gameState.year - 1;
    const champs = (gameState.history.nationalChampions || {})[year] || {};
    const confChamps = (gameState.history.conferenceChampions || {})[year] || {};
    Object.values(gameState.world.schools).forEach((school) => {
      const notes = [];
      let swing = 0;
      const pre = season && season.preseasonRanks;
      if (pre && gameState.rankings) {
        const deltas = [];
        ['M', 'W'].forEach((g) => {
          const row = (gameState.rankings[g] || []).find((r) => r.schoolId === school.id);
          const was = pre[g] && pre[g][school.id];
          if (row && was) deltas.push(was - row.rank);
        });
        if (deltas.length) {
          const d = deltas.reduce((a, b) => a + b, 0) / deltas.length;
          const v = Utils.clamp(d * 0.008, -0.15, 0.12);
          if (Math.abs(v) >= 0.02) {
            swing += v;
            notes.push(`${v > 0 ? 'Beat' : 'Fell short of'} preseason expectations (${v > 0 ? '+' : ''}${Math.round(v * 100)}%)`);
          }
        }
      }
      ['M', 'W'].forEach((g) => {
        const key = (school.division || 'DI') === 'DI' ? g : `${school.division}-${g}`;
        if ((champs[key] && champs[key].teamId === school.id) || (champs[g] && champs[g].teamId === school.id)) {
          swing += 0.15; notes.push(`National title, ${g === 'M' ? 'men' : 'women'} (+15%)`);
        }
        if (confChamps[`${school.conference}-${g}`] === school.name) {
          swing += 0.05; notes.push(`Conference title, ${g === 'M' ? 'men' : 'women'} (+5%)`);
        }
      });
      school.travelMomentum = Utils.clamp(Math.round(((school.travelMomentum || 0) * 0.5 + swing) * 100) / 100, -0.3, 0.4);
      school.travelMomentumNotes = notes;
    });
  }

  /* ================================================================ *
   * CPU scheduling style (CPU coaches only — the player decides for
   * themselves every year).
   * ================================================================ */
  function scheduleStyle(coach) {
    if (!coach) return 'balanced';
    if (!coach.scheduleStyle) {
      let h = 7;
      for (let i = 0; i < coach.id.length; i++) h = (h * 33 + coach.id.charCodeAt(i)) >>> 0;
      const r = (h % 100) / 100;
      coach.scheduleStyle = r < 0.25 ? 'heavy' : r < 0.8 ? 'balanced' : 'light';
    }
    return coach.scheduleStyle;
  }
  const STYLE_LABEL = { heavy: 'Races often', balanced: 'Balanced', light: 'Races sparingly' };

  /* ================================================================ *
   * Season build
   * ================================================================ */
  function regularMeets(season) {
    const out = [];
    WEEKS.forEach((w) => (season.byWeek[w] || []).forEach((id) => {
      const m = season.meets[id];
      if (m && m.type === 'invite') out.push(m);
    }));
    return out;
  }

  /*
   * Build Weeks 4–12 for a new season: every calendar meet, each division's
   * Pre-Nationals, then the CPU's schedules (the player's school gets a
   * sensible default the player reshapes during Week 1).
   *   api: { buildMeet, buildPreNationals } from the race engine.
   */
  function buildRegularSeason(gameState, season, rng, api) {
    const cal = ensureCalendar(gameState);
    season.calendarVersion = CAL_VERSION;
    season.raceWeeks = WEEKS.slice();
    WEEKS.forEach((w) => { season.byWeek[w] = season.byWeek[w] || []; });

    cal.entries.forEach((e) => {
      const em = e.famous ? (D.ELITE_MEETS || []).find((m) => m.name === e.name) : null;
      const meet = api.buildMeet(gameState, rng, {
        week: e.week, name: e.name, hostId: e.hostId, schoolIds: [], type: 'invite',
        elite: em ? em.weight : undefined,
        courseMeta: em || undefined
      });
      Object.assign(meet, { calendarKey: e.key, tier: e.tier, cap: e.cap, state: e.state });
      season.meets[meet.id] = meet;
      season.byWeek[e.week].push(meet.id);
    });

    // Pre-Nationals: one per division, on that division's NCAA course.
    const divisions = [...new Set(Object.values(gameState.world.schools).map((s) => s.division || 'DI'))];
    season.preNationalsByDiv = {};
    divisions.forEach((div) => {
      const meet = api.buildPreNationals(gameState, rng, div, CFG.PRE_NATS[div] || CFG.PRE_NATS.DI);
      if (!meet) return;
      meet.tier = 'prenats';
      meet.cap = (CFG.PRE_NATS[div] || CFG.PRE_NATS.DI).fieldSize + 4;
      const venue = season.nationalsVenues && season.nationalsVenues[div];
      meet.state = (venue && venue.state) || (gameState.getSchool(meet.hostId) || {}).state;
    });

    season.power = computePower(gameState);
    buildingSeason = season;
    try {
      scheduleAll(gameState, season, rng);
    } finally {
      buildingSeason = null;
    }
    indexSeason(season, true);
    return season;
  }

  function scheduleAll(gameState, season, rng) {
    const meets = regularMeets(season);
    const schools = Object.values(gameState.world.schools);
    const pid = gameState.playerSchoolId;

    // Ranked programs (last poll) and conference members, for field appeal.
    const ranked = new Set();
    if (gameState.rankings) ['M', 'W'].forEach((g) => (gameState.rankings[g] || []).forEach((r) => {
      if (r.rank <= 25) ranked.add(r.schoolId);
    }));
    const stat = {};
    meets.forEach((m) => {
      stat[m.id] = { ranked: 0, conf: {} };
      (m.schoolIds || []).forEach((id) => {
        if (ranked.has(id)) stat[m.id].ranked++;
        const c = (gameState.getSchool(id) || {}).conference;
        stat[m.id].conf[c] = (stat[m.id].conf[c] || 0) + 1;
      });
    });

    // Per-school plan: costs of every meet, a budget, and the commitments.
    const plans = {};
    schools.forEach((s) => {
      const costs = {};
      meets.forEach((m) => { costs[m.id] = meetCost(gameState, s, m); });
      // Cheapest three open meets on different weekends set the budget floor.
      const byWeekMin = {};
      meets.forEach((m) => {
        if (m.tier === 'elite' || m.tier === 'prenats') return;
        const c = costs[m.id].total;
        if (byWeekMin[m.week] === undefined || c < byWeekMin[m.week]) byWeekMin[m.week] = c;
      });
      const cheap = Object.values(byWeekMin).sort((a, b) => a - b);
      const cheapest3 = cheap.slice(0, 3).reduce((a, b) => a + b, 0);
      const budget = computeBudget(gameState, s, cheapest3);
      const near4 = cheap.slice(0, 4);
      const nearCost = near4.length ? near4.reduce((a, b) => a + b, 0) / near4.length : 2500;
      plans[s.id] = { school: s, costs, budget, nearCost, spent: 0, weeks: {} };
    });

    const commit = (plan, m) => {
      const s = plan.school;
      plan.weeks[m.week] = m;
      plan.spent += plan.costs[m.id].total;
      if (!m.schoolIds.includes(s.id)) m.schoolIds.push(s.id);
      const st = stat[m.id];
      if (ranked.has(s.id)) st.ranked++;
      st.conf[s.conference] = (st.conf[s.conference] || 0) + 1;
    };
    const uncommit = (plan, m) => {
      const s = plan.school;
      delete plan.weeks[m.week];
      plan.spent -= plan.costs[m.id].total;
      m.schoolIds = m.schoolIds.filter((id) => id !== s.id);
      const st = stat[m.id];
      if (ranked.has(s.id)) st.ranked--;
      st.conf[s.conference] = Math.max(0, (st.conf[s.conference] || 0) - 1);
    };

    // Pre-Nationals invitees arrive with their place reserved (built on
    // merit by the race engine); hosts always run their own meet.
    meets.filter((m) => m.tier === 'prenats').forEach((m) => {
      const field = m.schoolIds.slice();
      m.schoolIds = [];
      field.forEach((id) => {
        const plan = plans[id];
        if (plan && plan.costs[m.id].total <= plan.budget) commit(plan, m); // invitees who can afford the trip
      });
    });
    meets.filter((m) => m.tier !== 'prenats').forEach((m) => {
      const plan = plans[m.hostId];
      if (!plan) return;
      if (plan.weeks[m.week]) uncommit(plan, plan.weeks[m.week]); // home meet wins
      if (access(gameState, plan.school, m).ok) commit(plan, m);
    });

    // Program strength — Team Power, the same yardstick in every division —
    // decides who picks first: the best teams fill the big meets (an
    // exceptional DII squad included), everyone else builds around them.
    const merit = (s) => (season.power[s.id] || 1) + s.prestige * 0.05 + rng.next() * 5;
    const order = schools.slice().sort((a, b) => merit(b) - merit(a));

    order.forEach((s) => {
      const plan = plans[s.id];
      const coach = s.coachId && gameState.getCoach ? gameState.getCoach(s.coachId) : null;
      const style = s.id === pid ? 'balanced' : scheduleStyle(coach);
      const afford = plan.budget / Math.max(1200, plan.nearCost);
      let target = afford >= 7 ? 5 : afford >= 5 ? 4 : 3;
      if (style === 'heavy') target += afford >= 9 ? 2 : 1;
      if (style === 'light') target -= 1;
      if (rng.bool(0.3)) target += rng.bool(0.5) ? 1 : -1;
      target = Utils.clamp(target, CFG.MIN_MEETS, CFG.MAX_MEETS);
      plan.target = target;
      const power = (season.power[s.id] || 1) / 100;
      const perMeet = plan.budget / target;
      const adjPenalty = style === 'heavy' ? 0 : style === 'light' ? 14 : 7;

      const pick = (relaxed) => {
        let best = null, bestV = -Infinity;
        meets.forEach((m) => {
          if (plan.weeks[m.week]) return;
          if (m.schoolIds.length >= m.cap - 1) return; // one seat always held for the player
          const c = plan.costs[m.id].total;
          if (plan.spent + c > plan.budget) return;
          if (!access(gameState, s, m).ok) return;
          let v;
          if (relaxed) v = -c;
          else {
            const tierQ = m.tier === 'elite' ? 30 + ((m.elite || 1) - 1) * 60
              : m.tier === 'prenats' ? 45 : m.tier === 'major' ? 16 : 8;
            const st = stat[m.id];
            v = tierQ * (0.25 + 1.5 * power * power) +
              Math.min(m.schoolIds.length, 20) * 0.25 +
              (m.schoolIds.length < 6 ? 4 : 0) + // small meets work the phones for teams
              st.ranked * 1.2 * power +
              (st.conf[s.conference] || 0) * 1.5 -
              (c / perMeet) * 14 +
              (rng.next() - 0.5) * 6;
            if (plan.weeks[m.week - 1] || plan.weeks[m.week + 1]) v -= adjPenalty;
          }
          if (v > bestV) { bestV = v; best = m; }
        });
        return best;
      };
      let guard = 0;
      while (Object.keys(plan.weeks).length < target && guard++ < 12) {
        const m = pick(false);
        if (!m) break;
        commit(plan, m);
      }
      guard = 0;
      while (Object.keys(plan.weeks).length < CFG.MIN_MEETS && guard++ < 6) {
        const m = pick(true);
        if (!m) break;
        commit(plan, m);
      }
    });

    // A meet nobody else signed up for doesn't run this year (two teams
    // still race a dual): the host moves to another meet that weekend, or
    // picks one up on another weekend.
    meets.filter((m) => m.tier !== 'prenats' && m.tier !== 'elite' && m.schoolIds.length < 2).forEach((m) => {
      if (m.schoolIds.includes(pid)) return; // never pull the rug on the player's default
      m.schoolIds.slice().forEach((id) => {
        const plan = plans[id];
        uncommit(plan, m);
        const alt = meets.filter((o) => o !== m && o.week === m.week && o.schoolIds.length >= 2 &&
            o.schoolIds.length < o.cap - 1 && plan.spent + plan.costs[o.id].total <= plan.budget &&
            access(gameState, plan.school, o).ok)
          .sort((a, b) => plan.costs[a.id].total - plan.costs[b.id].total)[0];
        if (alt) commit(plan, alt);
      });
      m.cancelled = true;
    });
    // Every program races at least three times: the cheapest open meets
    // that still have room. If those happen to be full, a local meet makes
    // room — and if the budget falls short the athletic department covers
    // the minimum schedule (the budget rises to match).
    Object.values(plans).forEach((plan) => {
      let guard = 0;
      while (Object.keys(plan.weeks).length < CFG.MIN_MEETS && guard++ < 6) {
        const open = meets.filter((o) => !o.cancelled && !plan.weeks[o.week] && o.schoolIds.length >= 1 &&
          access(gameState, plan.school, o).ok);
        const byCost = (a, b) => plan.costs[a.id].total - plan.costs[b.id].total;
        const roomy = open.filter((o) => o.schoolIds.length < o.cap - 1);
        const alt = roomy.filter((o) => plan.spent + plan.costs[o.id].total <= plan.budget).sort(byCost)[0] ||
          roomy.filter((o) => o.tier === 'invite' || o.tier === 'major').sort(byCost)[0];
        if (!alt) break;
        commit(plan, alt);
        if (plan.spent > plan.budget) {
          plan.budget = Math.ceil(plan.spent / 100) * 100;
          plan.school.budget.travel = plan.budget;
          if (plan.school.travelBudget) {
            plan.school.travelBudget.total = plan.budget;
            plan.school.travelBudget.floor = plan.budget;
          }
        }
      }
    });
    meets.filter((m) => m.cancelled || !m.schoolIds.length).forEach((m) => {
      season.byWeek[m.week] = season.byWeek[m.week].filter((id) => id !== m.id);
      delete season.meets[m.id];
    });

    season.playerMeetByWeek = season.playerMeetByWeek || {};
    WEEKS.forEach((w) => { delete season.playerMeetByWeek[w]; });
    const mine = plans[pid];
    if (mine) Object.values(mine.weeks).forEach((m) => { season.playerMeetByWeek[m.week] = m.id; });
  }

  /* ================================================================ *
   * Lookups
   * ================================================================ */
  // school -> week -> meetId for the regular season (cached per season).
  let idxSeason = null, idx = null;
  function indexSeason(season, force) {
    if (!force && idxSeason === season && idx) return idx;
    idx = {};
    WEEKS.forEach((w) => (season.byWeek[w] || []).forEach((id) => {
      const m = season.meets[id];
      if (!m) return;
      (m.schoolIds || []).forEach((sid) => { (idx[sid] = idx[sid] || {})[w] = id; });
    }));
    idxSeason = season;
    return idx;
  }

  // Does this school race this week? (Regular season: its own schedule.
  // Championship weeks and older seasons fall back to the calendar.)
  function schoolRacesWeek(gameState, schoolId, week) {
    const season = gameState.season;
    if (!season) return false;
    if (week >= CAL.CONFERENCE_WEEK) return week <= CAL.NATIONAL_WEEK;
    if (!season.calendarVersion) return (season.raceWeeks || []).includes(week);
    const map = indexSeason(season)[schoolId];
    return !!(map && map[week]);
  }

  function scheduleFor(gameState, schoolId) {
    const season = gameState.season;
    if (!season) return {};
    return Object.assign({}, indexSeason(season)[schoolId] || {});
  }

  // What the player's schedule costs, and what's left.
  function playerSpend(gameState) {
    const season = gameState.season;
    const school = gameState.getPlayerSchool();
    let spent = 0, count = 0;
    WEEKS.forEach((w) => {
      const m = season && season.playerMeetByWeek[w] && season.meets[season.playerMeetByWeek[w]];
      if (!m) return;
      count++;
      spent += meetCost(gameState, school, m).total;
    });
    const budget = (school.travelBudget && school.travelBudget.year === gameState.year)
      ? school.travelBudget.total : school.budget.travel;
    return { spent, budget, left: budget - spent, count };
  }

  /*
   * Everything the schedule builder shows for one meet from the player's
   * side: cost, distance, access, room, and the field.
   */
  function describeMeet(gameState, meet, school) {
    school = school || gameState.getPlayerSchool();
    const cost = meetCost(gameState, school, meet);
    const acc = access(gameState, school, meet);
    const mine = (meet.schoolIds || []).includes(school.id);
    const room = mine || (meet.schoolIds || []).length < (meet.cap || 99);
    const S = window.XCD.engine.Scheduling;
    const course = S ? S.courseInfo(gameState, meet) : {};
    const speed = D.courseSpeed(meet.conditions ? meet.conditions.hilliness : course.hilliness,
      meet.conditions && meet.conditions.altitudeFt != null ? meet.conditions.altitudeFt : (meet.conditions || {}).altitude);
    return {
      meet, cost, access: acc, mine, room, course, speed,
      tierLabel: TIER_LABEL[meet.tier] || 'Invitational', tierIcon: TIER_ICON[meet.tier] || '',
      field: (meet.schoolIds || []).length, cap: meet.cap || null
    };
  }

  /*
   * Player selection for one week (meetId null = off week). Hard rules: the
   * schedule must be open (Week 1), the meet must have room and accept the
   * program, the budget must cover it, and no more than 7 meets.
   */
  function selectMeet(gameState, week, meetId) {
    const season = gameState.season;
    if (!season || !season.calendarVersion) return { ok: false, message: 'No schedule to edit.' };
    if (gameState.scheduleLocked && gameState.scheduleLocked()) {
      return { ok: false, message: 'The schedule is finalized — meets lock for the season after Week 1.' };
    }
    if (!WEEKS.includes(week)) return { ok: false, message: 'Pick a regular-season week (4–12).' };
    if (gameState.week > week) return { ok: false, message: 'That week has already been raced.' };
    const pid = gameState.playerSchoolId;
    const school = gameState.getPlayerSchool();
    const curId = season.playerMeetByWeek[week] || null;
    if ((meetId || null) === curId) return { ok: true, message: 'No change.' };
    const cur = curId && season.meets[curId];
    let target = null;
    if (meetId) {
      target = season.meets[meetId];
      if (!target || target.week !== week || target.type !== 'invite') return { ok: false, message: 'That meet is not on this weekend.' };
      const acc = access(gameState, school, target);
      if (!acc.ok) return { ok: false, message: `${target.name}: ${acc.reason}.` };
      if (target.schoolIds.length >= (target.cap || 99)) return { ok: false, message: `${target.name} is full.` };
      const sp = playerSpend(gameState);
      if (!cur && sp.count >= CFG.MAX_MEETS) return { ok: false, message: `That's the limit — ${CFG.MAX_MEETS} regular-season meets. Take a week off first.` };
      const delta = meetCost(gameState, school, target).total - (cur ? meetCost(gameState, school, cur).total : 0);
      if (sp.spent + delta > sp.budget) {
        return { ok: false, message: `Over budget: ${target.name} costs $${meetCost(gameState, school, target).total.toLocaleString()} and you have $${(sp.left + (cur ? meetCost(gameState, school, cur).total : 0)).toLocaleString()} to spend.` };
      }
    }
    if (cur) cur.schoolIds = cur.schoolIds.filter((id) => id !== pid);
    delete season.playerMeetByWeek[week];
    if (target) {
      if (!target.schoolIds.includes(pid)) target.schoolIds.push(pid);
      season.playerMeetByWeek[week] = target.id;
    }
    indexSeason(season, true);
    return {
      ok: true,
      message: target ? `Entered ${target.name} (Week ${week}).` : `Week ${week} is an off week — a training block instead of a meet.`
    };
  }

  // Can the player's schedule be finalized? (3–7 meets.)
  function validatePlayerSchedule(gameState) {
    const sp = playerSpend(gameState);
    if (sp.count < CFG.MIN_MEETS) return { ok: false, message: `Schedule at least ${CFG.MIN_MEETS} regular-season meets (you have ${sp.count}).` };
    if (sp.count > CFG.MAX_MEETS) return { ok: false, message: `No more than ${CFG.MAX_MEETS} regular-season meets.` };
    if (sp.spent > sp.budget) return { ok: false, message: 'The schedule is over your travel budget.' };
    return { ok: true };
  }

  window.XCD.engine.MeetCalendar = {
    CFG, WEEKS, CAL_VERSION, TIER_LABEL, TIER_ICON, STYLE_LABEL,
    ensureCalendar, buildRegularSeason, tripCost, meetCost, milesTo,
    computePower, powerOf, bestRank, access, travelRating, computeBudget, refreshBudget, updateMomentum,
    scheduleStyle, schoolRacesWeek, scheduleFor, indexSeason, playerSpend, describeMeet,
    selectMeet, validatePlayerSchedule, regularMeets
  };
})();
