/*
 * Followers — athletes who follow their head coach to a new job.
 *
 * When a head coach leaves one head job for another, a few athletes on the
 * old roster may come along as transfers. Whether they do is never a sure
 * thing: it rides on the bond they built with that coach (Coach
 * Relationship) and on whether the new program fits them (a real shot at
 * the Top 7, the level of the program, distance from home, academics, and
 * how close they are with the teammates they'd leave).
 *
 * The player picks up to MAX_PICKS athletes from the old roster and makes
 * one pitch; each pick rolls once against their displayed chance. CPU head
 * coaches poached during the offseason bring followers the same way.
 *
 * This module also owns:
 *  - coach rapport: a per-athlete, per-coach personal chemistry that makes
 *    Coach Relationship differ meaningfully between teammates, and resets to
 *    a first impression whenever the head coach changes;
 *  - the athlete transfer ledger (athlete.transferHistory) the profile
 *    card reads to show where a transfer came from.
 */
(function () {
  const Utils = window.XCD.core.Utils;

  const MAX_PICKS = 3;
  const MIN_PCT = 2;
  const MAX_PCT = 92; // a pitch is never a guarantee

  /* ---------------- Deterministic noise ----------------
   * Hash-based so relationship swings and CPU follower rolls never draw
   * from (and shift) the shared simulation RNG streams.
   */
  function hash(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
    return h >>> 0;
  }
  function noise(key) { return hash(String(key)) / 4294967296; }

  /* ---------------- Coach rapport ----------------
   * Some personalities click with some coaches. The archetype sets who a
   * coach naturally connects with; on top of that every pairing carries its
   * own chemistry. Range roughly −14..+14, fixed for a given athlete/coach.
   */
  const ARCHETYPE_AFFINITY = {
    'Players Coach': { 'Team-First': 5, Anxious: 5, 'Laid Back': 3, 'Free Spirit': 2, Individualist: -3, Perfectionist: -1 },
    Developer: { Grinder: 5, Perfectionist: 4, Cerebral: 2, 'Free Spirit': -4, 'Laid Back': -3 },
    Tactician: { Cerebral: 5, 'Fiery Competitor': 3, Perfectionist: 2, 'Laid Back': -3, Anxious: -2 },
    Recruiter: { Confident: 4, 'Free Spirit': 3, Individualist: 2, Grinder: -2, Cerebral: -2 }
  };

  function rapport(athlete, coach) {
    if (!athlete || !coach) return 0;
    const affinity = ((ARCHETYPE_AFFINITY[coach.archetype] || {})[athlete.personality]) || 0;
    // Great communicators reach the hard-to-reach.
    const craft = ((coach.relationships ?? 55) - 55) * 0.06;
    const chemistry = (noise(athlete.id + '|' + coach.id) - 0.5) * 20; // −10..+10
    return Utils.clamp(Math.round((affinity + craft + chemistry) * 10) / 10, -14, 14);
  }

  // Where a bond starts the first time an athlete works under a coach.
  function firstImpression(athlete, coach) {
    const r = rapport(athlete, coach);
    return Utils.clamp(Math.round(52 + r * 0.8 + ((coach.relationships ?? 55) - 55) * 0.2), 25, 80);
  }

  /*
   * Keep an athlete's Coach Relationship tied to the head coach it describes.
   * A new head coach means a new relationship: it restarts from a first
   * impression. (The first time an athlete is seen — new signees, walk-ons,
   * older saves — the existing value is kept and just nudged by rapport.)
   */
  function syncBond(athlete, coach) {
    if (!athlete || !coach) return;
    if (athlete.coachBondId === coach.id) return;
    const r = rapport(athlete, coach);
    if (athlete.coachBondId) {
      athlete.coachRelationship = firstImpression(athlete, coach);
    } else {
      athlete.coachRelationship = Utils.clamp((athlete.coachRelationship ?? 60) + r * 0.4, 10, 99);
    }
    athlete.coachBondId = coach.id;
    athlete.coachRapport = r;
  }

  // A short read of the bond for the UI.
  function bondLabel(rel) {
    if (rel >= 85) return { label: 'Unbreakable', color: 'var(--success)' };
    if (rel >= 72) return { label: 'Strong', color: 'var(--success)' };
    if (rel >= 58) return { label: 'Solid', color: 'var(--accent-hover)' };
    if (rel >= 42) return { label: 'Lukewarm', color: 'var(--warning)' };
    return { label: 'Strained', color: 'var(--danger)' };
  }

  /* ---------------- Fit with the new program ----------------
   * Returns { score, factors: [{ icon, label, tone: 'good'|'bad', w }] }.
   */
  function fitReport(gameState, athlete, toSchool, fromSchool) {
    const RE = window.XCD.engine.Recruiting;
    const factors = [];
    const add = (w, icon, label) => factors.push({ w, icon, label, tone: w >= 0 ? 'good' : 'bad' });

    // A shot at racing: where they'd slot on the new depth chart.
    const ahead = gameState.getRoster(toSchool.id, athlete.gender)
      .filter((x) => x.id !== athlete.id && x.currentOverall > athlete.currentOverall).length;
    const slot = ahead + 1;
    if (slot <= 3) add(10, '🏁', `Would lead the squad (#${slot})`);
    else if (slot <= 7) add(5, '🏁', `Projects into the Top 7 (#${slot})`);
    else add(-10, '🪑', `Buried on the depth chart (#${slot})`);

    // Program level, and the division they'd race in.
    const fromP = fromSchool ? (fromSchool.prestige || 50) : 50;
    const toP = toSchool.prestige || 50;
    const DIV = { DI: 3, DII: 2, DIII: 1 };
    const divStep = (DIV[toSchool.division || 'DI'] || 3) - (DIV[(fromSchool && fromSchool.division) || 'DI'] || 3);
    if (divStep < 0 && athlete.currentOverall >= 58) add(-7, '📉', `Would drop to ${toSchool.division || 'DI'}`);
    else if (divStep > 0) add(5, '📈', `A shot at ${toSchool.division || 'DI'} competition`);
    if (toP - fromP >= 10) add(7, '⬆️', 'A step up in program');
    else if (fromP - toP >= 15) add(-7, '⬇️', `A step down from ${fromSchool ? fromSchool.name : 'their program'}`);
    if (toP >= 72 && athlete.currentOverall >= 62) add(4, '🏆', 'Joins a national contender');

    // Home.
    if (athlete.hometownState && athlete.hometownState !== 'INT' && RE && RE.distanceMiles) {
      const dTo = RE.distanceMiles(athlete.hometownState, toSchool.state);
      const dFrom = fromSchool ? RE.distanceMiles(athlete.hometownState, fromSchool.state) : dTo;
      if (dTo < 400 && dFrom >= 400) add(5, '🏠', 'Closer to home');
      else if (dTo > 900 && dTo - dFrom > 500) add(-6, '✈️', `Far from home (${Math.round(dTo / 50) * 50} mi)`);
    }

    // Academics.
    if ((athlete.academics || 0) > 75 && (toSchool.academics || 50) < 50) add(-6, '🎓', 'Weaker academics');
    else if ((athlete.academics || 0) > 70 && (toSchool.academics || 50) >= 75) add(4, '🎓', 'Strong academics');

    // What holds them where they are.
    const teamRel = athlete.teamRelationship ?? 60;
    if (teamRel >= 75) add(-8, '🫂', 'Close with teammates at home');
    else if (teamRel < 40) add(5, '🚪', 'Disconnected from teammates');
    if ((athlete.yearsOnCampus || 1) >= 3) add(-4, '📍', 'Settled on campus');

    // Personality.
    if (athlete.personality === 'Team-First') add(-3, '🤝', 'Loyal to the squad');
    else if (athlete.personality === 'Fiery Competitor' || athlete.personality === 'Individualist') add(3, '🔥', 'Chases opportunity');
    else if (athlete.personality === 'Anxious') add(-3, '😟', 'Wary of a big move');

    factors.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
    const score = Utils.clamp(factors.reduce((s, f) => s + f.w, 0), -30, 25);
    return { score, factors, slot };
  }

  /*
   * The chance an athlete follows `coach` from `fromSchool` to `toSchool`.
   * The relationship is the foundation — nobody follows a coach they don't
   * trust — and fit pushes it up or down, harder the stronger the bond.
   */
  function followChance(gameState, athlete, coach, toSchool, fromSchool, relOverride) {
    const rel = relOverride != null ? relOverride
      : athlete.coachBondId && coach && athlete.coachBondId !== coach.id
        ? 40 // a bond with someone else: barely knows this coach
        : (athlete.coachRelationship ?? 60);
    const relPart = Utils.clamp((rel - 32) * 1.3, 0, 80);
    const fit = fitReport(gameState, athlete, toSchool, fromSchool);
    const pct = Utils.clamp(Math.round(relPart + fit.score * (0.5 + rel / 200)), MIN_PCT, MAX_PCT);
    return { pct, rel: Math.round(rel), fit };
  }

  // Can this athlete be asked? On the old roster, with a season left to give,
  // and not already committed elsewhere through the portal.
  function eligible(gameState, athlete, fromSchool) {
    if (!athlete || athlete.isRecruit || athlete.schoolId !== fromSchool.id) return false;
    if ((athlete.eligibilityRemaining || 0) < 2) return false;
    const entry = portalEntry(gameState, athlete.id);
    return !(entry && entry.destination);
  }

  function portalEntry(gameState, athleteId) {
    const portal = gameState.portal;
    return portal && !portal.summer && portal.entries
      ? portal.entries.find((e) => e.athleteId === athleteId) : null;
  }

  /* ---------------- The transfer ledger ---------------- */
  function recordTransfer(gameState, athlete, fromSchool, toSchool, extra) {
    if (!athlete || !fromSchool || !toSchool) return;
    athlete.transferHistory = Array.isArray(athlete.transferHistory) ? athlete.transferHistory : [];
    athlete.transferHistory.push({
      year: gameState.year,
      fromSchoolId: fromSchool.id,
      fromName: fromSchool.name,
      fromDivision: fromSchool.division || 'DI',
      toSchoolId: toSchool.id,
      toName: toSchool.name,
      ...(extra || {})
    });
  }

  /*
   * Send a follower to the new program. During the fall window they move with
   * every other transfer at the rollover; outside it (no open portal) they
   * move right away.
   */
  function commitFollower(gameState, athlete, fromSchool, toSchool, coach, bond) {
    const R = window.XCD.data.PORTAL_REASONS;
    const portal = gameState.portal;
    if (portal && !portal.summer && Array.isArray(portal.entries)) {
      let entry = portalEntry(gameState, athlete.id);
      if (!entry) {
        entry = {
          athleteId: athlete.id, fromSchoolId: fromSchool.id, reason: R.followCoach,
          offers: [], destination: null, decidedWeek: null
        };
        portal.entries.push(entry);
      }
      if (!entry.offers.includes(toSchool.id)) entry.offers.push(toSchool.id);
      entry.destination = toSchool.id;
      entry.decidedWeek = gameState.week;
      entry.followedCoach = coach ? coach.fullName : true;
      entry.followBond = bond ?? athlete.coachRelationship ?? 60;
      return 'portal';
    }
    // No open window: move now.
    const key = athlete.gender === 'M' ? 'rosterM' : 'rosterW';
    fromSchool[key] = fromSchool[key].filter((id) => id !== athlete.id);
    if (!toSchool[key].includes(athlete.id)) toSchool[key].push(athlete.id);
    athlete.schoolId = toSchool.id;
    arrive(gameState, athlete, coach, bond);
    recordTransfer(gameState, athlete, fromSchool, toSchool, { followedCoach: coach ? coach.fullName : null });
    return 'now';
  }

  // A follower arrives: they came for this coach, so the bond comes with them
  // (a little stronger for the leap of faith).
  function arrive(gameState, athlete, coach, bond) {
    athlete.morale = Math.max(athlete.morale || 0, 76);
    athlete.coachRelationship = Utils.clamp(Math.max(bond ?? athlete.coachRelationship ?? 60, 62) + 4, 10, 99);
    athlete.teamRelationship = 52;
    if (coach) { athlete.coachBondId = coach.id; athlete.coachRapport = rapport(athlete, coach); }
    athlete.transferGraceYear = gameState.week >= window.XCD.data.CALENDAR.OFFSEASON_START
      ? gameState.year + 1 : gameState.year;
  }

  /* ---------------- The player's pitch ---------------- */
  // Called by Careers when the player leaves one head job for another.
  function openForMove(gameState, coach, fromSchool, toSchool) {
    if (!coach || !fromSchool || !toSchool || fromSchool.id === toSchool.id) return null;
    const any = ['M', 'W'].some((g) => gameState.getRoster(fromSchool.id, g).some((a) => eligible(gameState, a, fromSchool)));
    if (!any) { gameState.coachFollowers = null; return null; }
    // The bonds as they stood the day the coach left: the old program's next
    // head coach starts fresh relationships with this roster, but what these
    // athletes feel about YOU doesn't reset with them.
    const bonds = {};
    ['M', 'W'].forEach((g) => gameState.getRoster(fromSchool.id, g).forEach((a) => {
      bonds[a.id] = Math.round(a.coachBondId && a.coachBondId !== coach.id ? 40 : (a.coachRelationship ?? 60));
    }));
    gameState.coachFollowers = {
      year: gameState.year, coachId: coach.id,
      fromSchoolId: fromSchool.id, toSchoolId: toSchool.id,
      bonds, picks: [], results: null
    };
    gameState.logNews(`🧳 Some of your ${fromSchool.name} runners are weighing whether to follow you to ${toSchool.name} — pick up to ${MAX_PICKS} to pitch.`);
    return gameState.coachFollowers;
  }

  // The open offer, if it's still live (same offseason, not yet pitched).
  function pending(gameState) {
    const cf = gameState.coachFollowers;
    if (!cf || cf.results || cf.year !== gameState.year) return null;
    if (gameState.playerSchoolId !== cf.toSchoolId) return null;
    return cf;
  }

  // Every athlete on the old roster who could be asked, best chance first.
  function candidates(gameState) {
    const cf = gameState.coachFollowers;
    if (!cf) return [];
    const from = gameState.getSchool(cf.fromSchoolId);
    const to = gameState.getSchool(cf.toSchoolId);
    const coach = gameState.world.coaches[cf.coachId];
    if (!from || !to || !coach) return [];
    const out = [];
    ['M', 'W'].forEach((g) => {
      gameState.getRoster(from.id, g).forEach((a) => {
        if (!eligible(gameState, a, from)) return;
        const ch = followChance(gameState, a, coach, to, from, cf.bonds && cf.bonds[a.id]);
        const entry = portalEntry(gameState, a.id);
        out.push({ athlete: a, ...ch, inPortal: !!entry });
      });
    });
    out.sort((x, y) => (y.pct - x.pct) || (y.athlete.currentOverall - x.athlete.currentOverall));
    return out;
  }

  function togglePick(gameState, athleteId) {
    const cf = pending(gameState);
    if (!cf) return { ok: false, message: 'That window has closed.' };
    const i = cf.picks.indexOf(athleteId);
    if (i >= 0) { cf.picks.splice(i, 1); return { ok: true, picks: cf.picks }; }
    if (cf.picks.length >= MAX_PICKS) return { ok: false, message: `You can bring at most ${MAX_PICKS} athletes.` };
    const a = gameState.getAthlete(athleteId);
    const from = gameState.getSchool(cf.fromSchoolId);
    if (!eligible(gameState, a, from)) return { ok: false, message: "That athlete can't be asked." };
    cf.picks.push(athleteId);
    return { ok: true, picks: cf.picks };
  }

  /*
   * Make the pitch: each pick rolls once against their current chance. The
   * roll is seeded by the save, year, and athlete, so reloading can't reroll.
   */
  function pitch(gameState) {
    const cf = pending(gameState);
    if (!cf) return { ok: false, message: 'That window has closed.' };
    if (!cf.picks.length) return { ok: false, message: 'Pick at least one athlete to pitch.' };
    const from = gameState.getSchool(cf.fromSchoolId);
    const to = gameState.getSchool(cf.toSchoolId);
    const coach = gameState.world.coaches[cf.coachId];
    const results = [];
    cf.picks.forEach((id) => {
      const a = gameState.getAthlete(id);
      if (!eligible(gameState, a, from)) return;
      const ch = followChance(gameState, a, coach, to, from, cf.bonds && cf.bonds[a.id]);
      const roll = noise(`${gameState.seed}|${gameState.year}|follow|${a.id}`) * 100;
      const came = roll < ch.pct;
      if (came) commitFollower(gameState, a, from, to, coach, ch.rel);
      results.push({ athleteId: a.id, name: a.fullName, gender: a.gender, overall: a.currentOverall, pct: ch.pct, roll: Math.round(roll), came });
    });
    cf.results = results;
    const yes = results.filter((r) => r.came);
    const no = results.filter((r) => !r.came);
    if (yes.length) gameState.logNews(`🧳 FOLLOWING THE COACH: ${yes.map((r) => r.name).join(', ')} will follow you from ${from.name} to ${to.name}.`);
    if (no.length) gameState.logNews(`${no.map((r) => r.name).join(', ')} decide${no.length === 1 ? 's' : ''} to stay at ${from.name}.`);
    if (window.XCD.engine.Events) {
      window.XCD.engine.Events.emit(gameState, 'followers:decided', { coming: yes.map((r) => r.name), staying: no.map((r) => r.name), from: from.name });
    }
    return { ok: true, results };
  }

  // Walk away without pitching anyone.
  function decline(gameState) {
    const cf = pending(gameState);
    if (cf) cf.results = [];
  }

  /* ---------------- CPU coaches ----------------
   * A CPU head coach poached during the offseason pitches their own best
   * bonds the same way: up to three of the most likely (and most useful)
   * athletes, each rolling once. Only while the fall window is open, so
   * the moves land at the rollover with every other transfer.
   */
  function cpuFollow(gameState, coach, fromSchool, toSchool) {
    const portal = gameState.portal;
    if (!coach || coach.isPlayer || !fromSchool || !toSchool) return [];
    if (!portal || portal.summer || !Array.isArray(portal.entries) || portal.year !== gameState.year) return [];
    if (fromSchool.id === gameState.playerSchoolId && !gameState.isAssistant()) return [];
    const pool = [];
    ['M', 'W'].forEach((g) => {
      gameState.getRoster(fromSchool.id, g).forEach((a) => {
        if (!eligible(gameState, a, fromSchool)) return;
        const ch = followChance(gameState, a, coach, toSchool, fromSchool);
        if (ch.pct >= 15) pool.push({ a, pct: ch.pct, rel: ch.rel, value: ch.pct * (0.5 + a.currentOverall / 100) });
      });
    });
    pool.sort((x, y) => y.value - x.value);
    const moved = [];
    pool.slice(0, MAX_PICKS).forEach(({ a, pct, rel }) => {
      if (noise(`${gameState.seed}|${gameState.year}|cpufollow|${a.id}|${coach.id}`) * 100 >= pct) return;
      commitFollower(gameState, a, fromSchool, toSchool, coach, rel);
      moved.push(a);
    });
    if (moved.length && (fromSchool.id === gameState.playerSchoolId || toSchool.id === gameState.playerSchoolId ||
        moved.some((a) => a.currentOverall >= 70))) {
      gameState.logNews(`🧳 ${moved.map((a) => a.fullName).join(', ')} will follow ${coach.fullName} from ${fromSchool.name} to ${toSchool.name}.`);
    }
    return moved;
  }

  window.XCD.engine.Followers = {
    MAX_PICKS,
    rapport,
    firstImpression,
    syncBond,
    bondLabel,
    noise,
    fitReport,
    followChance,
    candidates,
    openForMove,
    pending,
    togglePick,
    pitch,
    decline,
    cpuFollow,
    arrive,
    recordTransfer
  };
})();
