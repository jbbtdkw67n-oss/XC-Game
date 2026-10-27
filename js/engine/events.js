/*
 * Events engine — a small game-event bus plus the player's Inbox
 * (groundwork, Code Review Oct 2026 §4: Inbox, Sim-to-date stop conditions,
 * achievements, media moments).
 *
 * The engine already narrates everything through logNews(); that text is for
 * reading. Events are the machine-readable twin: a typed record of the few
 * moments that matter to the player, which other systems can react to.
 *
 *   Events.emit(game, type, payload)  → notifies subscribers; never throws
 *   Events.on(type | '*', fn)         → subscribe; returns an unsubscribe fn
 *   Events.mark(game) / Events.since(game, mark) → events after a bookmark
 *   Events.recent(game, n)            → the last n events
 *
 * Every emit is also appended to game.eventLog (the last 200, saved), so the
 * sim runner can ask "did anything stop-worthy happen this week?" and a
 * future Inbox screen has a history to show.
 *
 * Inbox: a capped, saved list of player-facing items built from events by
 * INBOX_RULES. Nothing renders it yet — the Dashboard/News still carry the
 * same information — so adding it changes no behavior.
 *
 *   Inbox.items(game) / Inbox.unread(game) / Inbox.markRead(game, id)
 *   Inbox.push(game, item) for ad-hoc entries.
 *
 * Event types emitted today (payload fields in parentheses):
 *   week:advanced     (year, week)                         gamestate.advanceWeek
 *   season:started    (year)                               gamestate.advanceWeek (rollover)
 *   race:completed    (meetId, name, places{M,W})          gamestate.advanceWeek (player meets)
 *   athlete:injured   (athleteId, name, weeks, injury)     training.js (player roster)
 *   recruit:committed (recruitId, name, stars, gender)     recruiting.js (to the player)
 *   jobs:marketOpened (count, hot)                         careers.js
 *   career:hotSeat    (year, of)                           awards.js (player)
 *   career:fired      (schoolId)                           awards.js (player)
 */
(function () {
  const Utils = window.XCD.core.Utils;
  const LOG_CAP = 200;
  const INBOX_CAP = 60;

  const listeners = {}; // type -> [fn]  (runtime only; never saved)

  const Events = {};

  Events.on = function (type, fn) {
    (listeners[type] = listeners[type] || []).push(fn);
    return () => {
      const list = listeners[type] || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  };

  Events.emit = function (gameState, type, payload) {
    if (!gameState) return null;
    const evt = {
      id: Utils.generateId('evt'),
      type,
      year: gameState.year,
      week: gameState.week,
      payload: payload || {}
    };
    const log = gameState.eventLog || (gameState.eventLog = []);
    log.push(evt);
    if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
    // Subscribers may never break a simulated week.
    [...(listeners[type] || []), ...(listeners['*'] || [])].forEach((fn) => {
      try { fn(gameState, evt); } catch (e) { /* best-effort */ }
    });
    return evt;
  };

  // A bookmark into the (capped, front-trimmed) event log, and every event
  // logged after it. Positions shift once the log is full, so bookmark by id.
  Events.mark = function (gameState) {
    const log = gameState.eventLog || [];
    return log.length ? log[log.length - 1].id : null;
  };
  Events.since = function (gameState, markId) {
    const log = gameState.eventLog || [];
    if (!markId) return log.slice();
    const i = log.findIndex((e) => e.id === markId);
    return log.slice(i + 1); // i === -1 (trimmed away) → the whole log
  };

  Events.recent = function (gameState, n) {
    const log = gameState.eventLog || [];
    return log.slice(Math.max(0, log.length - (n || 20)));
  };

  /* ---------------- Inbox ---------------- */
  // priority: 3 = needs a decision now, 2 = important, 1 = FYI.
  // screen: where the future Inbox's action button navigates.
  const INBOX_RULES = {
    'athlete:injured': (p) => ({
      priority: p.weeks >= 4 ? 3 : 2, screen: 'roster',
      title: `Injury: ${p.name}`,
      body: `${p.injury || 'Injury'} — out about ${p.weeks} week${p.weeks === 1 ? '' : 's'}.`
    }),
    'recruit:committed': (p) => ({
      priority: 2, screen: 'recruiting',
      title: `${'★'.repeat(p.stars || 0)} ${p.name} commits`,
      body: 'A verbal commitment to your program.'
    }),
    'jobs:marketOpened': (p) => ({
      priority: 3, screen: 'dashboard',
      title: 'The coaching market is open',
      body: `${p.count} open head-coaching chair${p.count === 1 ? '' : 's'}${p.hot ? ` — ${p.hot} with real interest in you` : ''}.`
    }),
    'career:hotSeat': (p) => ({
      priority: 3, screen: 'school',
      title: `Hot Seat — year ${p.year} of ${p.of}`,
      body: 'The administration expects more next season.'
    }),
    'career:fired': () => ({
      priority: 3, screen: 'dashboard',
      title: 'You have been let go',
      body: 'Land a new job from the carousel before the season turns, or a rebuilding program will hire you.'
    })
  };

  const Inbox = {};

  Inbox.push = function (gameState, item) {
    const list = gameState.inbox || (gameState.inbox = []);
    const entry = Object.assign({
      id: Utils.generateId('inbox'),
      year: gameState.year,
      week: gameState.week,
      priority: 1,
      title: '',
      body: '',
      screen: null,
      read: false
    }, item);
    list.unshift(entry);
    if (list.length > INBOX_CAP) list.length = INBOX_CAP;
    return entry;
  };

  Inbox.items = function (gameState) { return gameState.inbox || []; };
  Inbox.unread = function (gameState) { return Inbox.items(gameState).filter((i) => !i.read); };
  Inbox.markRead = function (gameState, id) {
    const it = Inbox.items(gameState).find((i) => i.id === id);
    if (it) it.read = true;
    return !!it;
  };
  Inbox.markAllRead = function (gameState) { Inbox.items(gameState).forEach((i) => { i.read = true; }); };

  // Built-in subscriber: turn rule-matched events into inbox items.
  Events.on('*', (gameState, evt) => {
    const rule = INBOX_RULES[evt.type];
    if (!rule) return;
    Inbox.push(gameState, Object.assign({ eventType: evt.type }, rule(evt.payload)));
  });

  Events.INBOX_RULES = INBOX_RULES;
  window.XCD.engine.Events = Events;
  window.XCD.engine.Inbox = Inbox;
})();
