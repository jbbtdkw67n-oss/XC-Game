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
 * INBOX_RULES, rendered by the Inbox screen (js/ui/screens/inbox.js) and
 * the Dashboard's Inbox card.
 *
 *   Inbox.items(game) / Inbox.unread(game) / Inbox.markRead(game, id)
 *   Inbox.remove(game, id) / Inbox.clearRead(game) / Inbox.clearAll(game)
 *   Inbox.push(game, item) for ad-hoc entries.
 *
 * Event types emitted (payload fields in parentheses):
 *   week:advanced     (year, week)                         gamestate.advanceWeek
 *   season:started    (year)                               gamestate.advanceWeek (rollover)
 *   race:completed    (meetId, name, places{M,W})          gamestate.advanceWeek (player meets)
 *   athlete:injured   (athleteId, name, weeks, injury)     training.js (player roster)
 *   recruit:committed (recruitId, name, stars, gender)     recruiting.js (to the player)
 *   jobs:marketOpened (count, hot)                         careers.js
 *   career:hotSeat    (year, of)                           awards.js (player)
 *   career:fired      (schoolId)                           awards.js (player)
 *   staff:assistantLeft (name, school, kind)               careers.js (player's staff)
 *   recruit:decommitted (recruitId, name, stars, to)       recruiting.js (from the player)
 *   recruit:signingDay  (offered)                          gamestate.advanceWeek
 *   portal:opened       (count, mine[], mineCount)         portal.js
 *   nationals:selection ({M, W} bid status)                races.js (field set)
 *   jobs:newOpening     (schoolId, name, division)         careers.js evolveJobMarket
 *   jobs:promotionOffer (schoolId, name)                   careers.js (assistant out-rates head coach)
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
      priority: p.weeks >= 4 ? 3 : 2, screen: 'roster', icon: '🩹',
      title: `Injury: ${p.name}`,
      body: `${p.injury || 'Injury'} — out about ${p.weeks} week${p.weeks === 1 ? '' : 's'}.`
    }),
    'recruit:committed': (p) => ({
      priority: 2, screen: 'recruiting', icon: '✍️',
      title: `${'★'.repeat(p.stars || 0)} ${p.name} commits`,
      body: 'A verbal commitment to your program.'
    }),
    'jobs:marketOpened': (p) => ({
      priority: 3, screen: 'jobs', icon: '📞',
      title: 'The coaching market is open',
      body: `${p.count} open head-coaching chair${p.count === 1 ? '' : 's'}${p.hot ? ` — ${p.hot} with real interest in you` : ''}.`
    }),
    'career:hotSeat': (p) => ({
      priority: 3, screen: 'school', icon: '🔥',
      title: `Hot Seat — year ${p.year} of ${p.of}`,
      body: 'The administration expects more next season.'
    }),
    'race:completed': (p) => {
      const ord = (n) => (n ? Utils.ordinal(n) : '—');
      const best = Math.min(p.places.M || 99, p.places.W || 99);
      return {
        priority: 1, screen: 'schedule', icon: best === 1 ? '🏆' : '🏁',
        title: `${p.name}: ${best === 1 ? 'a team win!' : 'results are in'}`,
        body: `Men ${ord(p.places.M)} · Women ${ord(p.places.W)}`
      };
    },
    'season:started': (p) => ({
      priority: 3, screen: 'dashboard', icon: '📅',
      title: `The ${p.year} season begins`,
      body: 'Week 1 is season setup: review progression, finalize the roster and schedule, settle your staff, then confirm.'
    }),
    'staff:assistantLeft': (p) => ({
      priority: 3, screen: 'school', icon: '📣',
      title: `Your assistant ${p.name} is leaving`,
      body: p.kind === 'retired' ? 'Retiring after a long career. Hire a replacement from the pool on My Program.'
        : `Off to ${p.school || 'a new job'}. Hire a replacement from the pool on My Program.`
    }),
    'recruit:decommitted': (p) => ({
      priority: 2, screen: 'recruiting', icon: '💔',
      title: `${'★'.repeat(p.stars || 0)} ${p.name} decommits`,
      body: p.to ? `Flipped to ${p.to}.` : 'Recruitment reopened — there may still be time to win them back.'
    }),
    'recruit:signingDay': (p) => ({
      priority: 3, screen: 'recruiting', icon: '✍️',
      title: 'Signing Day is this week',
      body: p.offered ? `${p.offered} recruit${p.offered === 1 ? '' : 's'} still hold${p.offered === 1 ? 's' : ''} your offer. Make your final pushes before the class signs.`
        : 'The class signs when this week advances. Make your final offers now.'
    }),
    'portal:opened': (p) => ({
      priority: p.mineCount ? 2 : 1, screen: 'portal', icon: '🔄',
      title: 'The transfer portal is open',
      body: `${p.count} athletes entered${p.mineCount ? ` — including ${p.mineCount} of yours${p.mine && p.mine.length ? ` (${p.mine.slice(0, 3).join(', ')}${p.mineCount > 3 ? '…' : ''})` : ''}` : ''}.`
    }),
    'nationals:selection': (p) => {
      const line = (g, st) => {
        const who = g === 'M' ? 'Men' : 'Women';
        if (!st) return null;
        if (st.bid === 'auto') return `${who}: automatic bid`;
        if (st.bid === 'atlarge') return `${who}: at-large (${st.points} Kolas pt${st.points === 1 ? '' : 's'})`;
        return `${who}: ${st.bubble ? `first team out (${st.points} pts)` : 'out'}${st.individuals ? ` · ${st.individuals} individual${st.individuals === 1 ? '' : 's'}` : ''}`;
      };
      const inAny = (p.M && p.M.bid) || (p.W && p.W.bid);
      return {
        priority: 2, screen: 'rankings:selection', icon: '🎟',
        title: inAny ? 'Selection: you are going to Nationals' : 'Selection: the NCAA field is set',
        body: [line('M', p.M), line('W', p.W)].filter(Boolean).join(' · ')
      };
    },
    'jobs:newOpening': (p) => ({
      priority: 1, screen: 'dashboard', icon: '📞',
      title: `New opening: ${p.name}`,
      body: `A ${p.division} head-coaching search begins — it's on the job market board.`
    }),
    'jobs:promotionOffer': (p) => ({
      priority: 3, screen: 'jobs', icon: '🎉',
      title: `Promotion offer: head coach at ${p.name}`,
      body: 'You now out-rate your head coach — the athletic director offers you the job. It is on the job offers board.'
    }),
    'career:fired': () => ({
      priority: 3, screen: 'jobs', icon: '🚪',
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
  Inbox.remove = function (gameState, id) {
    const list = Inbox.items(gameState);
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
    return i >= 0;
  };
  Inbox.clearRead = function (gameState) {
    gameState.inbox = Inbox.items(gameState).filter((i) => !i.read);
  };
  // Clear notifications: every saved item, or only those matching `pred`
  // (the Inbox screen clears whatever its current filter shows). The live
  // "Needs you now" decisions are computed from the game state, so they
  // stay until handled. Returns how many were removed.
  Inbox.clearAll = function (gameState, pred) {
    const before = Inbox.items(gameState).length;
    gameState.inbox = pred ? Inbox.items(gameState).filter((i) => !pred(i)) : [];
    return before - gameState.inbox.length;
  };

  // Built-in subscriber: turn rule-matched events into inbox items. A new
  // season files away last season's leftovers (marked read, still listed).
  Events.on('*', (gameState, evt) => {
    if (evt.type === 'season:started') {
      Inbox.items(gameState).forEach((i) => { if (i.year < gameState.year) i.read = true; });
    }
    const rule = INBOX_RULES[evt.type];
    if (!rule) return;
    Inbox.push(gameState, Object.assign({ eventType: evt.type }, rule(evt.payload)));
  });

  Events.INBOX_RULES = INBOX_RULES;
  window.XCD.engine.Events = Events;
  window.XCD.engine.Inbox = Inbox;
})();
