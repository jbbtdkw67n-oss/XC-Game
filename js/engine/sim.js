/*
 * Sim engine — "advance until something needs me" (groundwork, Code Review
 * Oct 2026 §4: Sim to a date/event with stop conditions).
 *
 * Sim.advanceUntil(game, target, opts) advances week by week until the game
 * reaches the START of the target week (so the player can still set the
 * lineup / make the decision that week is about), a stop-worthy event fires,
 * or a guard trips. It never crosses into a new season's Week 1 unless that
 * is the target, because Week 1 is the season-setup phase the player must
 * complete (spec Part 2, Section 15).
 *
 * Targets (Sim.TARGETS): nextRace, conference, regionals, nationals,
 * offseason (the awards week), signingDay, nextSeason — or a week number.
 *
 * opts:
 *   stopOn   — event types that end the sim after the week they fire in.
 *              Pass [] to ignore events. When omitted, Sim.defaultStopWhen
 *              decides (injuries are ~1 a week, so only long layoffs stop).
 *   maxWeeks — hard guard (default one full year).
 *   beforeWeek(game) — called before every advance (the UI uses it to keep
 *              the weekly flow satisfied, exactly as Sim to Race does today).
 *
 * Returns { weeks, reason, events } where reason is 'target' | 'event' |
 * 'seasonSetup' | 'maxWeeks', and events are the stop-worthy events seen.
 *
 * Nothing in the UI calls this yet: the existing ⏩ Sim to Race button keeps
 * its own loop. A future sim menu calls Sim.advanceUntil, then autosaves and
 * re-renders once at the end.
 */
(function () {
  const D = window.XCD.data;
  const C = D.CALENDAR;

  const Sim = {};

  // What interrupts a sim when the caller passes no stopOn list: a layoff of
  // 4+ weeks on the player's roster, the job market opening, or a firing.
  Sim.defaultStopWhen = function (evt) {
    if (evt.type === 'athlete:injured') return (evt.payload.weeks || 0) >= 4;
    return evt.type === 'jobs:marketOpened' || evt.type === 'career:fired';
  };

  // Each target resolves to a predicate on the game, checked at the start of
  // each week (before advancing).
  Sim.TARGETS = {
    nextRace: { label: 'Next race', reached: (g) => Sim.playerRacesThisWeek(g) },
    conference: { label: 'Conference Championships', week: C.CONFERENCE_WEEK },
    regionals: { label: 'Regional Championships', week: C.REGIONAL_WEEK },
    nationals: { label: 'National Championships', week: C.NATIONAL_WEEK },
    offseason: { label: 'Awards & offseason', week: C.AWARDS_WEEK },
    signingDay: { label: 'Signing Day', week: (D.RECRUITING && D.RECRUITING.SIGNING_WEEK) || 19 },
    nextSeason: { label: 'Next season', newSeason: true }
  };

  // True when the player's team has a meet in the current week — the same
  // test the ⏩ Sim to Race button uses (framework.js).
  Sim.playerRacesThisWeek = function (game) {
    const s = game.season;
    if (!s) return false;
    const wk = game.week;
    if (s.playerMeetByWeek && s.playerMeetByWeek[wk]) return true;
    return wk === s.nationalWeek && !!(
      (s.nationalsFieldIds.M && s.nationalsFieldIds.M.includes(game.playerSchoolId)) ||
      (s.nationalsFieldIds.W && s.nationalsFieldIds.W.includes(game.playerSchoolId)));
  };

  function resolve(target) {
    if (typeof target === 'number') return { week: target };
    const t = Sim.TARGETS[target];
    if (!t) throw new Error('Unknown sim target: ' + target);
    return t;
  }

  Sim.advanceUntil = function (game, target, opts) {
    const o = opts || {};
    const t = resolve(target);
    const stopOn = o.stopOn ? new Set(o.stopOn) : null;
    const stops = (e) => (stopOn ? stopOn.has(e.type) : Sim.defaultStopWhen(e));
    const maxWeeks = o.maxWeeks || C.WEEKS_PER_YEAR;
    const startYear = game.year;
    const seen = [];
    const reachedNow = () => {
      if (t.newSeason) return game.year > startYear;
      if (t.reached) return t.reached(game);
      return game.week === t.week;
    };

    let weeks = 0;
    // Already there? Advance at least once so repeated presses make progress
    // (except for nextSeason, which is "until the year changes").
    let first = true;
    while (weeks < maxWeeks) {
      if (!first && reachedNow()) return { weeks, reason: 'target', events: seen };
      first = false;
      if (o.beforeWeek) o.beforeWeek(game);
      const mark = window.XCD.engine.Events.mark(game);
      const yearBefore = game.year;
      game.advanceWeek();
      weeks += 1;
      const fired = window.XCD.engine.Events.since(game, mark).filter(stops);
      if (fired.length) {
        seen.push(...fired);
        if (!reachedNow()) return { weeks, reason: 'event', events: seen };
      }
      if (game.year > yearBefore && !t.newSeason) {
        // Week 1 is the season-setup phase — never sim past it.
        return { weeks, reason: reachedNow() ? 'target' : 'seasonSetup', events: seen };
      }
      if (t.newSeason && game.year > startYear) return { weeks, reason: 'target', events: seen };
    }
    return { weeks, reason: reachedNow() ? 'target' : 'maxWeeks', events: seen };
  };

  window.XCD.engine.Sim = Sim;
})();
