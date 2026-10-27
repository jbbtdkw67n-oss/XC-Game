// Groundwork (Code Review Oct 2026): the plumbing future features plug into.
//  - Settings: neutral defaults, validation/clamping, save round-trip, old saves
//  - Events + Inbox: emit/subscribe, isolation from subscriber errors, the
//    engine's real emit points over a simulated season, inbox rules + cap
//  - Sim.advanceUntil: calendar targets, next race, season-setup guard, stop-on-event
//  - Save index: listing from meta records only, legacy backfill, rename, delete
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(120000);

  await newDynasty(page);

  // ---- 1) Settings ----
  const settings = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const S = window.XCD.engine.Settings;
    const GS = window.XCD.engine.GameState;
    const out = {
      freshDefault: S.isDefault(g),
      multDefault: S.mult(g, 'injuryRate'),
      flagDefault: S.get(g, 'godMode')
    };
    out.clampHi = S.set(g, 'injuryRate', 9);
    out.snapped = S.set(g, 'hotSeatPatience', 1.2300001);
    out.badChoice = S.set(g, 'theme', 'neon');
    out.flagCoerced = S.set(g, 'godMode', 'yes');
    let threw = false;
    try { S.set(g, 'noSuchKey', 1); } catch (e) { threw = true; }
    out.unknownThrows = threw;
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const back = GS.fromJSON(JSON.parse(JSON.stringify(json)));
    out.roundTrip = S.get(back, 'injuryRate') === 2 && S.get(back, 'hotSeatPatience') === 1.25;
    delete json.settings; delete json.eventLog; delete json.inbox;
    const old = GS.fromJSON(json);
    out.oldSaveDefault = S.isDefault(old) && Array.isArray(old.eventLog) && Array.isArray(old.inbox);
    S.reset(g);
    out.resetDefault = S.isDefault(g);
    return out;
  });
  console.log('settings:', JSON.stringify(settings));
  ok(settings.freshDefault && settings.multDefault === 1 && settings.flagDefault === false, 'a new dynasty starts on neutral default settings');
  ok(settings.clampHi === 2, 'sliders clamp to their max');
  ok(settings.snapped === 1.25, 'sliders snap to their step');
  ok(settings.badChoice === 'dark', 'an invalid choice falls back to the default');
  ok(settings.flagCoerced === false, 'flags only accept true');
  ok(settings.unknownThrows, 'unknown setting keys are rejected');
  ok(settings.roundTrip, 'settings survive a save round-trip');
  ok(settings.oldSaveDefault, 'pre-groundwork saves load with defaults and empty logs');
  ok(settings.resetDefault, 'reset restores every default');

  // ---- 2) Events + Inbox (API) ----
  const bus = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const E = window.XCD.engine.Events;
    const I = window.XCD.engine.Inbox;
    const got = [];
    const off = E.on('test:ping', (gs, evt) => got.push(evt.payload.n));
    const offBad = E.on('test:ping', () => { throw new Error('boom'); });
    const logBefore = (g.eventLog || []).length;
    E.emit(g, 'test:ping', { n: 1 });
    off(); offBad();
    E.emit(g, 'test:ping', { n: 2 });
    const inboxBefore = I.items(g).length;
    E.emit(g, 'athlete:injured', { athleteId: 'x', name: 'Test Runner', weeks: 5, injury: 'Stress reaction' });
    const item = I.items(g)[0];
    for (let i = 0; i < 80; i++) I.push(g, { title: 'filler ' + i });
    const capped = I.items(g).length;
    I.markRead(g, I.items(g)[0].id);
    return {
      got, logged: g.eventLog.length - logBefore,
      inboxAdded: inboxBefore + 1 <= I.items(g).length,
      itemTitle: item.title, itemPriority: item.priority, itemScreen: item.screen,
      capped, unread: I.unread(g).length
    };
  });
  console.log('events:', JSON.stringify(bus));
  ok(bus.got.length === 1 && bus.got[0] === 1, 'subscribers get events until they unsubscribe (and a throwing one cannot break emit)');
  ok(bus.logged === 3, 'every emit lands in the event log');
  ok(bus.itemTitle === 'Injury: Test Runner' && bus.itemPriority === 3 && bus.itemScreen === 'roster', 'an injury event becomes a high-priority Inbox item');
  ok(bus.capped === 60, 'the inbox is capped');
  ok(bus.unread === 59, 'items can be marked read');

  // ---- 3) Sim.advanceUntil + the engine's real emit points ----
  const sim = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Sim = window.XCD.engine.Sim;
    const E = window.XCD.engine.Events;
    const C = window.XCD.data.CALENDAR;
    const flow = (gs) => {
      gs.weeklyFlow.trainingConfirmed = true; gs.weeklyFlow.recruitingDone = true;
      gs.week1 = { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true };
    };
    const out = { startWeek: g.week, startYear: g.year };
    const types = {};
    const off = E.on('*', (gs, evt) => { types[evt.type] = (types[evt.type] || 0) + 1; });

    const r1 = Sim.advanceUntil(g, 'nextRace', { stopOn: [], beforeWeek: flow });
    out.nextRace = { week: g.week, reason: r1.reason, races: Sim.playerRacesThisWeek(g) };
    const r2 = Sim.advanceUntil(g, 'nationals', { stopOn: [], beforeWeek: flow });
    out.nationals = { week: g.week, reason: r2.reason, expected: C.NATIONAL_WEEK };
    const r3 = Sim.advanceUntil(g, 'signingDay', { stopOn: [], beforeWeek: flow });
    out.signing = { week: g.week, reason: r3.reason };
    // Conference week is behind us: the sim must stop at the new season's Week 1.
    const yr = g.year;
    const r4 = Sim.advanceUntil(g, 'conference', { stopOn: [], beforeWeek: flow });
    out.setupGuard = { week: g.week, yearUp: g.year === yr + 1, reason: r4.reason };

    // Stop-on-event: a synthetic stop-worthy event in week 3 ends the sim there.
    const offStop = E.on('week:advanced', (gs, evt) => { if (evt.payload.week === 3) E.emit(gs, 'test:stop', {}); });
    // Fill the log to its cap first: the sim must still see new events.
    for (let i = 0; i < 250; i++) E.emit(g, 'test:filler', { i });
    const r5 = Sim.advanceUntil(g, 'nationals', { stopOn: ['test:stop'], beforeWeek: flow });
    offStop();
    out.stopEvent = { week: g.week, reason: r5.reason, n: r5.events.length };

    const yr2 = g.year;
    const r6 = Sim.advanceUntil(g, 'nextSeason', { stopOn: [], beforeWeek: flow });
    // Default stop rule: only long layoffs, the job market, or a firing.
    const W = window.XCD.engine.Sim.defaultStopWhen;
    out.defaultStop = [
      W({ type: 'athlete:injured', payload: { weeks: 2 } }), W({ type: 'athlete:injured', payload: { weeks: 6 } }),
      W({ type: 'jobs:marketOpened', payload: {} }), W({ type: 'race:completed', payload: {} })
    ];
    out.nextSeason = { week: g.week, yearUp: g.year === yr2 + 1, reason: r6.reason };
    off();
    out.types = types;
    out.raceEvt = (g.eventLog || []).filter((e) => e.type === 'race:completed').slice(-1)[0] || null;
    out.inboxTypes = [...new Set(window.XCD.engine.Inbox.items(g).map((i) => i.eventType).filter(Boolean))];
    return out;
  });
  console.log('sim:', JSON.stringify(sim));
  ok(sim.nextRace.reason === 'target' && sim.nextRace.races, 'Sim to next race stops at the start of a race week');
  ok(sim.nationals.week === sim.nationals.expected && sim.nationals.reason === 'target', 'Sim to Nationals stops at the start of the nationals week');
  ok(sim.signing.week === 19 && sim.signing.reason === 'target', 'Sim to Signing Day stops at week 19');
  ok(sim.setupGuard.week === 1 && sim.setupGuard.yearUp && sim.setupGuard.reason === 'seasonSetup', 'the sim never runs past a new season\'s Week 1 setup');
  ok(sim.stopEvent.week === 3 && sim.stopEvent.reason === 'event' && sim.stopEvent.n === 1, 'a stop-worthy event ends the sim after its week');
  ok(sim.nextSeason.week === 1 && sim.nextSeason.yearUp && sim.nextSeason.reason === 'target', 'Sim to next season lands on Week 1 of the new year');
  ok(JSON.stringify(sim.defaultStop) === '[false,true,true,false]', 'the default stop rule ignores short injuries and routine events');
  ok((sim.types['week:advanced'] || 0) >= 40, 'week:advanced fires every week');
  ok((sim.types['season:started'] || 0) === 2, 'season:started fires once per rollover');
  ok((sim.types['race:completed'] || 0) >= 3 && sim.raceEvt && sim.raceEvt.payload.meetId, 'race:completed fires for the player\'s meets');
  ok((sim.types['jobs:marketOpened'] || 0) >= 1, 'jobs:marketOpened fires when the offseason market opens');

  // ---- 4) Save index ----
  const idx = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    const SM = window.XCD.engine.SaveManager;
    // Count full-store reads (getAll with no key range) during listing.
    const proto = IDBObjectStore.prototype;
    const realGetAll = proto.getAll;
    let fullScans = 0;
    proto.getAll = function (q) { if (q === undefined || q === null) fullScans++; return realGetAll.apply(this, arguments); };
    const out = {};
    try {
      const idA = g.dynastyId;
      await SM.manualSave(g);
      g.dynastyId = 'dyn_groundwork_b';
      const nameA = g.dynastyName;
      g.dynastyName = 'Second Dynasty';
      await SM.manualSave(g);
      g.dynastyId = idA; g.dynastyName = nameA;

      fullScans = 0;
      const rows = await SM.listSlots();
      out.fast = { rows: rows.length, fullScans, names: rows.map((r) => r.dynastyName).sort(), canonical: rows.every((r) => r.slotId.startsWith('dyn_')) };

      // Simulate a dynasty saved by an older build: remove its index record.
      await new Promise((res, rej) => {
        const req = indexedDB.open('xcd-saves');
        req.onsuccess = () => {
          const tx = req.result.transaction('dynasties', 'readwrite');
          tx.objectStore('dynasties').delete('meta:dyn_dyn_groundwork_b');
          tx.oncomplete = () => { req.result.close(); res(); };
          tx.onerror = () => rej(tx.error);
        };
      });
      fullScans = 0;
      const slow = await SM.listSlots();
      out.slow = { rows: slow.length, fullScans };
      fullScans = 0;
      const again = await SM.listSlots();
      out.backfilled = { rows: again.length, fullScans };

      await SM.renameDynasty('dyn_groundwork_b', 'Renamed Dynasty');
      fullScans = 0;
      const renamed = await SM.listSlots();
      out.renamed = { name: (renamed.find((r) => r.dynastyId === 'dyn_groundwork_b') || {}).dynastyName, fullScans };

      await SM.deleteDynasty('dyn_groundwork_b');
      const after = await SM.listSlots();
      const keys = await new Promise((res) => {
        const req = indexedDB.open('xcd-saves');
        req.onsuccess = () => {
          const r2 = req.result.transaction('dynasties').objectStore('dynasties').getAllKeys();
          r2.onsuccess = () => { req.result.close(); res(r2.result); };
        };
      });
      out.deleted = { rows: after.length, leftover: keys.filter((k) => String(k).includes('groundwork_b')) };
      const loaded = await SM.load(idA);
      out.loadOk = !!(loaded && loaded.world);
    } finally {
      proto.getAll = realGetAll;
    }
    return out;
  });
  console.log('save index:', JSON.stringify(idx));
  ok(idx.fast.rows === 2 && idx.fast.fullScans === 0 && idx.fast.canonical, 'the save browser lists from index records without reading any world');
  ok(idx.slow.rows === 2 && idx.slow.fullScans >= 1, 'a save without an index record falls back to the full scan');
  ok(idx.backfilled.rows === 2 && idx.backfilled.fullScans === 0, 'the fallback backfills the index so the next listing is fast');
  ok(idx.renamed.name === 'Renamed Dynasty' && idx.renamed.fullScans === 0, 'renaming updates the index record');
  ok(idx.deleted.rows === 1 && idx.deleted.leftover.length === 0, 'deleting removes the save, its backup, and its index record');
  ok(idx.loadOk, 'the remaining dynasty still loads');

  ok(!errors.length, 'no page errors: ' + errors[0]);
  console.log(fails.length ? 'FAIL\n - ' + fails.join('\n - ') : 'PASS');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
