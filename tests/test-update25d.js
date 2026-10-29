// Update 25 (Stage 3 — season form): Base, Sharpening, Staleness, and one
// peak per season, for the player and the CPU.
// Verifies:
//   - A real taper (Championship taper miles + a quality session) spends the
//     season's one peak: full the next week, ~a third the week after, then
//     gone — and a second taper the same season gives nothing
//   - A mileage cut with no quality session is a recovery week (peak saved)
//   - Interval-heavy training sharpens faster but goes stale and builds less
//     Base than threshold-heavy training
//   - Racing sharpens
//   - Form moves race time meaningfully (a peak beats a stale squad by ~4%+)
//   - CPU staffs read their standing: contenders target Nationals, the
//     bottom targets Conference; poor staffs botch tapers more often; over a
//     real season top CPU programs peak for Nationals and weak ones earlier
//   - The training screen shows the Squad Form card and the taper warning
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(600000);
  await newDynasty(page, {});

  // ---- 1) One peak per season (player squad) ----
  const peak = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    const D = window.XCD.data;
    window.XCD.engine.Settings.set(g, 'injuryRate', 0);
    const rng = new window.XCD.core.SeededRNG(9);
    const roster = () => g.getRoster(g.playerSchoolId, 'M').filter((a) => !a.injury);
    const avg = (f) => { const r = roster(); return r.reduce((s, a) => s + f(a), 0) / r.length; };
    g.week = 12;
    roster().forEach((a) => { a.chronicMileage = 75; a.taperCharge = 1; a.fitness = 72; a.peakSeason = null; a.peakBonus = 0; });
    g.training.overrides = {}; g.training.mileageOverrides = {};
    g.training.M = D.TRAINING_PHASES && T.idealPlanForPhase({ week: 13 }); // championship plan: has one quality session
    g.training.mileage.M = 40;
    T.processWeek(g, rng);
    const after1 = { peak: avg((a) => a.peakBonus || 0), spent: roster().every((a) => a.peakSeason === g.year), week: roster()[0].peakWeek };
    g.week = 13; g.training.mileage.M = 75; g.training.M = ['easy', 'tempo', 'easy', 'easy', 'easy', 'long', 'easy'];
    roster().forEach((a) => { a.chronicMileage = 60; });
    T.processWeek(g, rng);
    const after2 = avg((a) => a.peakBonus || 0);
    g.week = 14; T.processWeek(g, rng);
    const after3 = avg((a) => a.peakBonus || 0);
    // A second taper the same season: nothing.
    g.week = 14; roster().forEach((a) => { a.chronicMileage = 75; a.taperCharge = 1; });
    g.training.M = T.idealPlanForPhase({ week: 13 }); g.training.mileage.M = 40;
    T.processWeek(g, rng);
    const second = avg((a) => a.peakBonus || 0);
    return { after1, after2, after3, second };
  });
  ok(peak.after1.spent && peak.after1.peak >= 15 && peak.after1.week === 13, 'a real taper must spend the peak and land it next week: ' + JSON.stringify(peak));
  ok(peak.after2 > 2 && peak.after2 < peak.after1.peak * 0.5, 'the peak must fade to about a third the week after: ' + JSON.stringify(peak));
  ok(peak.after3 === 0, 'the peak must be gone two weeks later: ' + JSON.stringify(peak));
  ok(peak.second === 0, 'a second taper in the same season must give no peak: ' + JSON.stringify(peak));
  console.log('peak:', JSON.stringify(peak));

  // ---- 2) Recovery week saves the peak; racing sharpens ----
  const misc = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    const rng = new window.XCD.core.SeededRNG(10);
    const roster = g.getRoster(g.playerSchoolId, 'W').filter((a) => !a.injury);
    g.week = 9;
    roster.forEach((a) => { a.chronicMileage = 70; a.taperCharge = 1; a.peakSeason = null; a.fitness = 70; a.sharpness = 50; a.staleness = 0; a.lastRaced = null; });
    roster[0].lastRaced = g.year * 100 + g.week; // raced this week
    g.training.W = ['easy', 'easy', 'rest', 'easy', 'easy', 'rest', 'easy']; // recovery week, no quality
    g.training.mileage.W = 40;
    T.processWeek(g, rng);
    return {
      saved: roster.every((a) => a.peakSeason !== g.year),
      racedSharp: roster[0].sharpness, restSharp: roster[1].sharpness
    };
  });
  ok(misc.saved, 'a cut with no quality session is a recovery week and must save the peak');
  ok(misc.racedSharp > misc.restSharp, 'racing must sharpen: ' + JSON.stringify(misc));
  console.log('recovery/racing:', JSON.stringify(misc));

  // ---- 3) Intervals early vs threshold first ----
  const styles = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    const rng = new window.XCD.core.SeededRNG(11);
    const M = g.getRoster(g.playerSchoolId, 'M').filter((a) => !a.injury);
    const W = g.getRoster(g.playerSchoolId, 'W').filter((a) => !a.injury);
    const reset = (a) => { a.fitness = 55; a.sharpness = 50; a.staleness = 0; a.fatigue = 10; a.chronicMileage = 65; a.lastRaced = null; a.peakBonus = 0; a.peakSeason = g.year; };
    M.concat(W).forEach(reset);
    g.training.M = ['easy', 'intervals', 'easy', 'intervals', 'easy', 'speed', 'easy']; // interval-heavy
    g.training.W = ['easy', 'tempo', 'easy', 'tempo', 'easy', 'long', 'easy'];         // threshold-heavy
    g.training.mileage.M = 65; g.training.mileage.W = 65;
    g.training.mileageOverrides = {};
    const avg = (r, f) => r.reduce((s, a) => s + f(a), 0) / r.length;
    const snap = () => ({ mSharp: avg(M, (a) => a.sharpness), wSharp: avg(W, (a) => a.sharpness), mStale: avg(M, (a) => a.staleness || 0), wStale: avg(W, (a) => a.staleness || 0), mBase: avg(M, (a) => a.fitness), wBase: avg(W, (a) => a.fitness), mForm: avg(M, T.formScore), wForm: avg(W, T.formScore) });
    const out = [];
    for (let i = 0; i < 9; i++) { g.week = 2 + i; T.processWeek(g, rng); out.push(snap()); }
    return { wk2: out[1], wk9: out[8] };
  });
  ok(styles.wk2.mSharp > styles.wk2.wSharp + 5, 'interval work must sharpen faster early: ' + JSON.stringify(styles));
  ok(styles.wk9.mStale >= 15 && styles.wk9.mStale > styles.wk9.wStale + 10, 'interval-heavy weeks must go stale: ' + JSON.stringify(styles));
  ok(styles.wk9.wBase > styles.wk9.mBase, 'threshold work must build more Base: ' + JSON.stringify(styles));
  console.log('styles:', JSON.stringify(styles));

  // ---- 4) Form moves race time ----
  const race = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const a = g.getRoster(g.playerSchoolId, 'M')[0];
    const meet = { conditions: { tempF: 55, hilliness: 40, altitude: 'Low', altitudeFt: 500, ground: 'Firm', windMph: 0 }, type: 'invitational', week: 6 };
    const set = (sharp, peakB, stale) => { a.sharpness = sharp; a.peakBonus = peakB; a.staleness = stale; a.fitness = 70; a.fatigue = 10; return R.conditionsMultiplier(g, a, meet, 'M'); };
    const peaked = set(82, 18, 0);
    const stale = set(60, 0, 30);
    return { peaked, stale, gapPct: +((stale - peaked) * 100).toFixed(2) };
  });
  ok(race.gapPct >= 4, 'a peaked runner must race meaningfully faster than a stale one (~4%+): ' + JSON.stringify(race));
  console.log('race impact:', JSON.stringify(race));

  // ---- 5) CPU peak planning ----
  const cpu = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    const CAL = window.XCD.data.CALENDAR;
    g.week = 6;
    const di = (g.rankings.M || []).filter((r) => (r.division || 'DI') === 'DI' && r.schoolId !== g.playerSchoolId);
    const top = di.slice(0, 5).map((r) => g.getSchool(r.schoolId));
    const bottom = di.slice(-5).map((r) => g.getSchool(r.schoolId));
    const targetOf = (s) => { s.peakPlan = null; return T.cpuPeakPlan(g, s, 'M', g.getCoach(s.coachId)).target; };
    const topTargets = top.map(targetOf);
    const botTargets = bottom.map(targetOf);
    // Botch rates by staff quality, across the whole world.
    let poor = 0, poorB = 0, elite = 0, eliteB = 0;
    Object.values(g.world.schools).forEach((s) => {
      const c = g.getCoach(s.coachId);
      if (!c) return;
      s.peakPlan = null;
      const p = T.cpuPeakPlan(g, s, 'M', c);
      const craft = T.coachCraft(c);
      if (craft < 45) { poor++; if (p.botch) poorB++; } else if (craft >= 70) { elite++; if (p.botch) eliteB++; }
    });
    return { topTargets, botTargets, NAT: CAL.NATIONAL_WEEK, CONF: CAL.CONFERENCE_WEEK, poorRate: poor ? poorB / poor : null, eliteRate: elite ? eliteB / elite : null, poor, elite };
  });
  ok(cpu.topTargets.filter((t) => t === cpu.NAT).length >= 4, 'top CPU programs must target Nationals: ' + JSON.stringify(cpu));
  ok(cpu.botTargets.filter((t) => t === cpu.CONF).length >= 4, 'bottom CPU programs must target their Conference meet: ' + JSON.stringify(cpu));
  ok(cpu.poorRate === null || cpu.eliteRate === null || cpu.poorRate > cpu.eliteRate, 'poor staffs must botch tapers more often than elite ones: ' + JSON.stringify(cpu));
  console.log('cpu plans:', JSON.stringify(cpu));

  // ---- 6) A real season: where CPU programs actually peak ----
  const season = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    const CAL = window.XCD.data.CALENDAR;
    window.XCD.engine.Settings.set(g, 'injuryRate', 1);
    // Run to the start of the next season, then through Nationals' training week.
    while (g.week !== 1) g.advanceWeek();
    while (g.week <= CAL.NATIONAL_WEEK) g.advanceWeek();
    const di = (g.rankings.M || []).filter((r) => (r.division || 'DI') === 'DI' && r.schoolId !== g.playerSchoolId);
    const weekOf = (r) => { const f = T.squadForm(g, g.getSchool(r.schoolId), 'M'); return f && f.peakUsed ? f.peakWeek : null; };
    const top = di.slice(0, 12).map(weekOf);
    const bottom = di.slice(-25).map(weekOf);
    return { top, bottom, NAT: CAL.NATIONAL_WEEK, CONF: CAL.CONFERENCE_WEEK };
  });
  const topNat = season.top.filter((w) => w === season.NAT).length;
  const botEarly = season.bottom.filter((w) => w !== null && w <= season.CONF + 1).length;
  ok(topNat >= 6, 'most top CPU programs must peak for Nationals: ' + JSON.stringify(season));
  ok(botEarly >= 10, 'most weak CPU programs must peak early (Conference): ' + JSON.stringify(season));
  console.log('season peaks:', JSON.stringify(season));

  // ---- 7) UI: Squad Form card + taper warning ----
  const ui = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    g.week = 12;
    g.getRoster(g.playerSchoolId, 'M').forEach((a) => { a.peakSeason = null; a.taperCharge = 1; a.chronicMileage = 75; });
    g.training.M = window.XCD.engine.Training.idealPlanForPhase({ week: 13 });
    g.training.mileage.M = 40;
    g.training.mileageOverrides = {};
    window.XCD.ui.navigate('training');
    await new Promise((r) => setTimeout(r, 300));
    const txt = document.body.innerText;
    return { card: /Squad Form/.test(txt) && /Sharpening/.test(txt) && /Staleness/.test(txt), charged: /Charged/.test(txt), taperWarn: /SPENDS your one peak/.test(txt) };
  });
  ok(ui.card, 'the training screen must show the Squad Form card');
  ok(ui.charged, 'the Squad Form card must show a charged taper');
  ok(ui.taperWarn, 'the mileage hint must warn that a taper spends the season\'s peak');
  console.log('ui:', JSON.stringify(ui));

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.log('FAIL');
    fails.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
  console.log('PASS');
}

run().catch((e) => { console.error(e); console.log('FAIL'); process.exit(1); });
