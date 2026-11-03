// Save compaction: the save omits default-valued athlete fields, rounds a few
// drifting floats, and tuple-packs + string-interns the history ledgers. Every
// one of those must round-trip exactly through GameState.fromJSON, and saves
// written before compaction (plain history, full athletes) must still load.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  await newDynasty(page);
  page.setDefaultTimeout(300000);

  // ---- Codec edge cases (no game needed) ----
  const codec = await page.evaluate(() => {
    const C = window.XCD.engine.GameState.SaveCodec;
    const proto = {};
    Object.defineProperty(proto, '__proto__', { value: 1, enumerable: true, writable: true, configurable: true });
    const cases = [
      { a: 1, b: 'x', c: [1, 2, { d: null, e: true }] },
      ['§', '§1', 'plain'],
      ['¶', '¶0', '¶¶', 'repeat me', 'repeat me'],
      { '§': '§packed', '¶k': ['§0', { '§': 1 }] },
      [{ y: 2026, o: 50 }, { o: 51, y: 2027 }, { y: 2028 }, {}, []],
      { 2026: 'a', 10: 'b', z: 'c' },
      proto,
      { gone: undefined, fn: () => 1, arr: [undefined, () => 2, 3] },
      'just a string', 42, null, []
    ];
    const bad = [];
    cases.forEach((c, i) => {
      const want = JSON.stringify(c);
      const packed = JSON.parse(JSON.stringify(C.pack(c)));
      const got = JSON.stringify(C.unpack(packed));
      if (want !== got) bad.push(i + ': ' + want + ' -> ' + got);
    });
    return { bad, plainNotPacked: !C.isPacked({ alumni: [] }) && !C.isPacked(null) };
  });
  console.log('codec:', JSON.stringify(codec));
  ok(codec.bad.length === 0, 'the history codec must round-trip every shape exactly: ' + codec.bad.join(' | '));
  ok(codec.plainNotPacked, 'plain history must never be mistaken for packed history');

  // ---- A lived-in world: two seasons of history ----
  const rt = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const GS = window.XCD.engine.GameState;
    const M = window.XCD.models;
    const W = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    for (let i = 0; i < 2 * W + 6; i++) g.advanceWeek();

    const packed = g.toJSON();
    const json = JSON.stringify(packed);
    // The same save the way it was written before compaction.
    const legacyJson = JSON.stringify(Object.assign({}, packed, { world: g.world, history: g.history }));
    const ROUND = { confidence: 2, consistency: 2, mentalToughness: 2, hillAdaptation: 2,
      coachRelationship: 2, teamRelationship: 2, devProgress: 4, devExecAvg: 4, _devCeiling: 3 };

    const a = GS.fromJSON(JSON.parse(json));
    const b = GS.fromJSON(JSON.parse(legacyJson));

    // Every athlete / recruit field survives (rounded floats within rounding).
    const fieldDiffs = [];
    const compare = (live, back, label) => {
      Object.keys(live).forEach((id) => {
        const x = live[id], y = back[id];
        if (!y) { fieldDiffs.push(label + ' missing ' + id); return; }
        Object.keys(x).forEach((k) => {
          const vx = x[k], vy = y[k];
          if (vx === undefined || typeof vx === 'function') return;
          if (ROUND[k] !== undefined && typeof vx === 'number') {
            if (Math.abs(vx - vy) > Math.pow(10, -ROUND[k])) fieldDiffs.push(`${label}.${k}: ${vx} vs ${vy}`);
            return;
          }
          if (k === 'interests') return; // relationship/interest rounded, checked below
          if (JSON.stringify(vx) !== JSON.stringify(vy)) fieldDiffs.push(`${label}.${k}`);
        });
      });
    };
    compare(b.world.athletes, a.world.athletes, 'athlete');
    compare(b.world.recruits, a.world.recruits, 'recruit');
    const interestsOk = Object.keys(b.world.recruits).every((id) => {
      const x = b.world.recruits[id].interests || {}, y = a.world.recruits[id].interests || {};
      return Object.keys(x).every((sid) => y[sid] &&
        Math.abs((x[sid].relationship || 0) - (y[sid].relationship || 0)) <= 0.01 &&
        Math.abs((x[sid].interest || 0) - (y[sid].interest || 0)) <= 0.01 &&
        x[sid].offered === y[sid].offered && x[sid].visited === y[sid].visited);
    });

    const savedAth = Object.values(packed.world.athletes);
    const liveAth = Object.values(g.world.athletes);
    const avgKeys = (xs) => xs.reduce((s, x) => s + Object.keys(x).length, 0) / xs.length;
    return {
      historyPacked: GS.SaveCodec.isPacked(packed.history),
      historyExact: JSON.stringify(a.history) === JSON.stringify(g.history),
      legacyHistoryExact: JSON.stringify(b.history) === JSON.stringify(g.history),
      schoolsCoachesSame: JSON.stringify(a.world.schools) === JSON.stringify(b.world.schools) &&
        JSON.stringify(a.world.coaches) === JSON.stringify(b.world.coaches),
      fieldDiffs: fieldDiffs.slice(0, 8),
      nFieldDiffs: fieldDiffs.length,
      interestsOk,
      instances: Object.values(a.world.athletes).every((x) => x instanceof M.Athlete) &&
        Object.values(a.world.recruits).every((x) => x instanceof M.Recruit),
      plainAthletes: savedAth.every((x) => Object.getPrototypeOf(x) === Object.prototype && x.id),
      relationshipsKept: savedAth.every((x) => x.coachRelationship !== undefined && x.teamRelationship !== undefined),
      savedKeys: +avgKeys(savedAth).toFixed(1), liveKeys: +avgKeys(liveAth).toFixed(1),
      mb: +(json.length / 1048576).toFixed(1), legacyMb: +(legacyJson.length / 1048576).toFixed(1),
      liveUntouched: liveAth.every((x) => x instanceof M.Athlete && x.honors && x.careerStats),
      year: a.year === g.year && a.week === g.week,
      // The loaded dynasty keeps simulating.
      survives: (() => { try { for (let i = 0; i < 3; i++) a.advanceWeek(); return true; } catch (e) { return e.message; } })()
    };
  });
  console.log('round-trip:', JSON.stringify(rt));
  ok(rt.historyPacked, 'history must be saved packed');
  ok(rt.historyExact, 'packed history must unpack to exactly the live ledgers');
  ok(rt.legacyHistoryExact, 'a pre-compaction save (plain history) must still load its ledgers');
  ok(rt.schoolsCoachesSame, 'schools and coaches must load identically either way');
  ok(rt.nFieldDiffs === 0, `every athlete/recruit field must survive the lean save (${rt.nFieldDiffs}): ` + rt.fieldDiffs.join(', '));
  ok(rt.interestsOk, 'recruit interest maps must survive (to 2 decimals)');
  ok(rt.instances, 'loaded athletes/recruits must be model instances');
  ok(rt.plainAthletes, 'saved athletes stay plain { field: value } objects');
  ok(rt.relationshipsKept, 'relationship fields are never omitted (their absence means a pre-Update-5 save)');
  ok(rt.savedKeys < rt.liveKeys * 0.8, `default fields must be omitted from the save (${rt.savedKeys} vs ${rt.liveKeys} keys)`);
  ok(rt.mb < rt.legacyMb * 0.8, `the compact save must be clearly smaller (${rt.mb} MB vs ${rt.legacyMb} MB)`);
  ok(rt.liveUntouched, 'saving must not alter the live athletes');
  ok(rt.year, 'the loaded save resumes at the same week');
  ok(rt.survives === true, 'the loaded dynasty must keep simulating: ' + rt.survives);

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-save-compaction');
})().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
