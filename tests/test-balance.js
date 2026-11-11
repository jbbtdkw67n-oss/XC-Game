// Philosophy & race-strategy balance: Threshold Focus is gone (and old saves
// migrate), every training philosophy and race strategy carries real
// mechanical strengths AND weaknesses, the form-shaping effects reach the
// engine, and no option dominates another on paper.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, {});

  // ---- 1) Training philosophies: six, no Threshold Focus, real trade-offs ----
  const tp = await page.evaluate(() => {
    const D = window.XCD.data, TE = window.XCD.engine.Training;
    const coach = window.XCD.ui.state.game.getPlayerCoach();
    const keep = coach.trainingPhilosophy;
    const rows = D.TRAINING_PHILOSOPHIES.map((p) => {
      const e = p.effects;
      // Signed "is this good for the player" for every effect (1 = neutral).
      const good = [], bad = [];
      const mark = (v, higherIsBetter) => { if (v == null || v === 1) return; ((v > 1) === higherIsBetter ? good : bad).push(v); };
      Object.values(e.attrMult || {}).forEach((v) => mark(v, true));
      ['devMult', 'baseMult', 'sharpMult', 'peakMult', 'hillMult'].forEach((k) => mark(e[k], true));
      ['fatigueMult', 'injuryMult', 'staleMult'].forEach((k) => mark(e[k], false));
      coach.trainingPhilosophy = p.key; coach.training = 90;
      const fx = TE.philosophyEffect(coach);
      return { key: p.key, pros: p.pros.length, cons: p.cons.length, good: good.length, bad: bad.length,
        fx: { base: fx.baseMult, sharp: fx.sharpMult, stale: fx.staleMult, peak: fx.peakMult, hill: fx.hillMult }, e };
    });
    coach.trainingPhilosophy = keep;
    // Pairwise dominance: A dominates B if it is at least as good on every
    // effect and better on one.
    const KEYS = [['devMult', 1], ['baseMult', 1], ['sharpMult', 1], ['peakMult', 1], ['fatigueMult', -1], ['injuryMult', -1],
      ...['vo2Max', 'lactateThreshold', 'runningEconomy', 'stamina', 'speed'].map((a) => ['attr:' + a, 1])];
    const val = (e, k) => (k.startsWith('attr:') ? (e.attrMult || {})[k.slice(5)] : e[k]) ?? 1;
    const dominated = [];
    rows.forEach((a) => rows.forEach((b) => {
      if (a === b) return;
      const diffs = KEYS.map(([k, s]) => (val(a.e, k) - val(b.e, k)) * s);
      if (diffs.every((d) => d >= 0) && diffs.some((d) => d > 0)) dominated.push(`${a.key} > ${b.key}`);
    }));
    return { rows, dominated, fallback: D.trainingPhilosophy('threshold').key };
  });
  ok(tp.rows.length === 6, 'six training philosophies: ' + tp.rows.map((r) => r.key));
  ok(!tp.rows.some((r) => r.key === 'threshold'), 'Threshold Focus must be removed');
  tp.rows.forEach((r) => {
    ok(r.pros >= 2 && r.cons >= 2, `${r.key} lists strengths and weaknesses: ${r.pros}/${r.cons}`);
    ok(r.good >= 1 && r.bad >= 1, `${r.key} must have a mechanical strength AND a mechanical weakness: ${r.good}/${r.bad}`);
  });
  ok(tp.dominated.length === 0, 'no training philosophy may dominate another: ' + tp.dominated);
  const fx = Object.fromEntries(tp.rows.map((r) => [r.key, r.fx]));
  ok(fx.speed.sharp > 1 && fx.speed.peak < 1, 'Speed sharpens faster and peaks smaller: ' + JSON.stringify(fx.speed));
  ok(fx['high-mileage'].base > 1 && fx['high-mileage'].peak > 1 && fx['high-mileage'].sharp < 1, 'High Mileage: more base and peak, flatter legs: ' + JSON.stringify(fx['high-mileage']));
  ok(fx['strength-endurance'].hill > 1, 'Strength Endurance builds hill strength faster');

  // ---- 2) The form effects land in the engine ----
  const form = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, TE = window.XCD.engine.Training;
    const coach = g.getPlayerCoach(); coach.training = 80;
    const school = g.getPlayerSchool();
    // Every run starts from the same squad (full snapshot), trains on the
    // same RNG stream, and injuries are switched off so only the philosophy
    // differs.
    const M = window.XCD.models;
    const ids = school.rosterM.slice();
    const snap = ids.map((id) => JSON.stringify(g.world.athletes[id]));
    g.settings = g.settings || {};
    const keepRate = g.settings.injuryRate;
    g.settings.injuryRate = 0;
    const sim = (philo, plan, weeksN = 5) => {
      ids.forEach((id, i) => { g.world.athletes[id] = new M.Athlete(JSON.parse(snap[i])); g.world.athletes[id].injury = null; });
      coach.trainingPhilosophy = philo;
      g.training.M = plan; g.training.W = plan;
      const all = g.world.schools; g.world.schools = { [school.id]: school };
      const wk = g.week;
      for (let w = 4; w < 4 + weeksN; w++) { g.week = w; TE.processWeek(g, new window.XCD.core.SeededRNG(w * 31)); }
      g.week = wk; g.world.schools = all;
      const r = ids.map((id) => g.world.athletes[id]).filter((a) => !a.injury);
      const avg = (f) => r.reduce((s, a) => s + f(a), 0) / r.length;
      return { n: r.length, fit: avg((a) => a.fitness), sharp: avg((a) => a.sharpness), stale: avg((a) => a.staleness || 0) };
    };
    const classic = ['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy'];
    const crammed = ['intervals', 'speed', 'easy', 'intervals', 'speed', 'long', 'easy'];
    const easyWeek = ['easy', 'intervals', 'easy', 'easy', 'racesim', 'easy', 'easy']; // two hard sessions, five easy days
    const out = { hm: sim('high-mileage', classic), sp: sim('speed', classic), bal: sim('balanced', classic),
      polCram: sim('polarized', crammed, 2), balCram: sim('balanced', crammed, 2), polEasy: sim('polarized', easyWeek), balEasy: sim('balanced', easyWeek) };
    coach.trainingPhilosophy = 'balanced';
    ids.forEach((id, i) => { g.world.athletes[id] = new M.Athlete(JSON.parse(snap[i])); });
    if (keepRate === undefined) delete g.settings.injuryRate; else g.settings.injuryRate = keepRate;
    return out;
  });
  ok(form.hm.fit > form.bal.fit + 2 && form.hm.fit > form.sp.fit + 2, 'Base builds fastest under High Mileage: ' + JSON.stringify([form.hm.fit, form.bal.fit, form.sp.fit]));
  ok(form.sp.sharp > form.hm.sharp, 'Speed squads are sharper than High Mileage squads mid-season: ' + JSON.stringify([form.sp.sharp, form.hm.sharp]));
  ok(form.polCram.stale > form.balCram.stale, 'Polarized goes stale faster when quality is crammed in: ' + JSON.stringify([form.polCram.stale, form.balCram.stale]));
  ok(form.polEasy.stale < form.balEasy.stale, 'Polarized stays fresher with 5 easy days: ' + JSON.stringify([form.polEasy.stale, form.balEasy.stale]));

  // ---- 3) Old saves: Threshold Focus coaches carry on as Norwegian ----
  const mig = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const json = JSON.parse(JSON.stringify(g.toJSON()));
    const ids = Object.keys(json.world.coaches).slice(0, 3);
    ids.forEach((id) => { json.world.coaches[id].trainingPhilosophy = 'threshold'; });
    json.world.coaches[ids[2]].racePhilosophy = 'nope';
    const g2 = window.XCD.engine.GameState.fromJSON(json);
    return { tp: ids.map((id) => g2.world.coaches[id].trainingPhilosophy), rp: g2.world.coaches[ids[2]].racePhilosophy,
      any: Object.values(g2.world.coaches).some((c) => c.trainingPhilosophy === 'threshold') };
  });
  ok(mig.tp.every((k) => k === 'norwegian') && !mig.any, 'Threshold Focus coaches migrate to the Norwegian Method: ' + JSON.stringify(mig));
  ok(mig.rp === 'even', 'an unknown race philosophy falls back to Even Pace: ' + mig.rp);

  // ---- 4) Race strategies: real trade-offs, none dominant ----
  const rp = await page.evaluate(() => {
    const D = window.XCD.data;
    const base = { packBias: 0, reserveBonus: 0, surge: 1, kick: 1, earlyPace: 1, lateGrind: 1, drift: 1, costMult: 1 };
    return D.RACE_PHILOSOPHIES.map((p) => {
      const t = Object.assign({}, base, p.tactic);
      const good = [], bad = [];
      if (t.reserveBonus > 0) good.push('reserve'); if (t.reserveBonus < 0) bad.push('reserve');
      if (t.surge > 1) good.push('surge'); if (t.surge < 1) bad.push('surge');
      if (t.kick > 1) good.push('kick'); if (t.kick < 1) bad.push('kick');
      if (t.earlyPace < 1) good.push('early'); if (t.earlyPace > 1) bad.push('early');
      if (t.lateGrind > 1) good.push('grind');
      if (t.drift < 1) good.push('drift');
      if (t.costMult < 1) good.push('cost');
      if (t.evenness) good.push('steady');
      if (t.teamPack) { good.push('pack'); bad.push('leader held back'); }
      return { key: p.key, pros: p.pros.length, cons: p.cons.length, good, bad };
    });
  });
  ok(rp.length === 5, 'five race strategies');
  rp.forEach((r) => {
    ok(r.pros >= 2 && r.cons >= 2, `${r.key} lists strengths and weaknesses`);
    ok(r.good.length >= 1 && r.bad.length >= 1, `${r.key} must have a mechanical strength AND weakness: ${JSON.stringify(r)}`);
  });

  // ---- 5) Pack running really runs as a pack: a tighter 1-5 spread ----
  const pack = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR;
    let guard = 0;
    while (guard++ < 12 && !(g.season.byWeek[g.week] || []).length) g.advanceWeek();
    const spreads = { pack: [], aggressive: [] };
    for (let round = 0; round < 6 && g.week < weeks.CONFERENCE_WEEK; round++) {
      const coaches = Object.values(g.world.schools).map((s) => g.getCoach(s.coachId)).filter(Boolean);
      coaches.forEach((c, i) => { c.racePhilosophy = i % 2 ? 'pack' : 'aggressive'; });
      const philo = {}; Object.values(g.world.schools).forEach((s) => { const c = g.getCoach(s.coachId); philo[s.id] = c && c.racePhilosophy; });
      const ids = (g.season.byWeek[g.week] || []).slice();
      g.advanceWeek();
      ids.forEach((id) => { const m = g.season.meets[id]; ['M', 'W'].forEach((gd) => {
        const res = m && m.results && m.results[gd]; if (!res) return;
        const by = {}; res.finishers.forEach((f) => { (by[f.schoolId] = by[f.schoolId] || []).push(f.time); });
        Object.entries(by).forEach(([sid, ts]) => { if (ts.length >= 5 && spreads[philo[sid]]) spreads[philo[sid]].push(ts[4] - ts[0]); });
      }); });
    }
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    return { n: spreads.pack.length, pack: avg(spreads.pack), aggressive: avg(spreads.aggressive) };
  });
  ok(pack.n >= 20, 'enough team races sampled: ' + pack.n);
  ok(pack.pack < pack.aggressive, 'pack-running teams finish with a tighter 1-5 spread: ' + JSON.stringify(pack));
  // ---- 6) Head to head: no strategy is a trap, and each has its spot ----
  // Every tester team in a 24-team DI field runs each strategy on the same
  // field and course (fresh legs, then a tired squad). Fresh, no strategy
  // may sit far from the others; tired, Conservative must beat Aggressive.
  const h2h = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, R = window.XCD.engine.Races, D = window.XCD.data, M = window.XCD.models;
    const RNG = window.XCD.core.SeededRNG;
    const keys = D.RACE_PHILOSOPHIES.map((p) => p.key);
    const tmpl = Object.values(g.season.meets).find((m) => m.type === 'invite') || Object.values(g.season.meets)[0];
    const schools = Object.values(g.world.schools).filter((s) => s.division === 'DI');
    const keepPhilo = Object.fromEntries(Object.values(g.world.coaches).map((c) => [c.id, c.racePhilosophy]));
    const out = {};
    [0, 40].forEach((fatigueAdd) => {
      const sum = Object.fromEntries(keys.map((k) => [k, { s: 0, n: 0 }]));
      const rng0 = new RNG(9001);
      for (let t = 0; t < 30; t++) {
        const field = rng0.shuffle(schools.slice()).slice(0, 24);
        const coaches = field.map((s) => g.getCoach(s.coachId));
        const strat = coaches.map(() => rng0.choice(keys));
        const ids = []; field.forEach((s) => ids.push(...s.rosterM, ...s.rosterW));
        const snap = ids.map((id) => JSON.stringify(g.world.athletes[id]));
        const meet = JSON.parse(JSON.stringify(tmpl));
        meet.schoolIds = field.map((s) => s.id); meet.type = 'invite'; meet.distances = { M: 8000, W: 6000 };
        meet.conditions.hilliness = rng0.int(20, 80);
        field.slice(0, 8).forEach((ts, ti) => keys.forEach((k) => ['M', 'W'].forEach((gd) => {
          ids.forEach((id, i) => {
            const a = g.world.athletes[id] = new M.Athlete(JSON.parse(snap[i]));
            if (a.schoolId === ts.id) a.fatigue = Math.min(100, a.fatigue + fatigueAdd);
          });
          coaches.forEach((c, i) => { c.racePhilosophy = i === ti ? k : strat[i]; });
          const res = R.simulateRace(g, meet, gd, new RNG(t * 131 + ti * 7 + (gd === 'M' ? 3 : 5)), false);
          const team = res && res.teamScores.find((x) => x.schoolId === ts.id);
          if (team) { sum[k].s += team.place; sum[k].n++; }
        })));
        ids.forEach((id, i) => { g.world.athletes[id] = new M.Athlete(JSON.parse(snap[i])); });
      }
      out[fatigueAdd ? 'tired' : 'fresh'] = Object.fromEntries(keys.map((k) => [k, +(sum[k].s / Math.max(1, sum[k].n)).toFixed(2)]));
    });
    Object.values(g.world.coaches).forEach((c) => { c.racePhilosophy = keepPhilo[c.id]; });
    return out;
  });
  const fresh = Object.values(h2h.fresh);
  ok(Math.max(...fresh) - Math.min(...fresh) < 0.7, 'fresh legs: every race strategy lands near the same team place: ' + JSON.stringify(h2h.fresh));
  ok(h2h.tired.conservative < h2h.tired.aggressive, 'tired squads: Conservative beats Aggressive: ' + JSON.stringify(h2h.tired));
  ok(h2h.tired.conservative <= h2h.tired.even + 0.15, 'tired squads: Conservative is at least as good as Even Pace: ' + JSON.stringify(h2h.tired));
  console.log('balance:', JSON.stringify({ form, pack, h2h }));

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 4).join(' | '));
  await browser.close();
  if (fails.length) { console.error('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS test-balance');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
