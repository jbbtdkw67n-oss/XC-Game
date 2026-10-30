// Per-runner fatigue: the squad's plan sets the session load, each runner's
// OWN mileage sets the volume load. Verifies:
//   - Same plan, different individual miles → different fatigue
//   - The planner's projection (Training.projectedFatigue) matches what the
//     week actually does, runner by runner (overrides, load settings, the
//     slider, and the Down Week)
//   - The Squad Monitor shows each runner's projection and updates live
//     when one runner's miles change
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

  const res = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const GS = window.XCD.engine.GameState;
    const T = window.XCD.engine.Training;
    window.XCD.engine.Settings.set(g0, 'injuryRate', 0);
    const clone = () => GS.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
    const scenario = (downWeek) => {
      const g = clone();
      g.week = 5;
      g.training.overrides = {}; g.training.mileageOverrides = {};
      g.training.M = ['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy'];
      g.training.mileage.M = 70;
      const r = g.getRoster(g.playerSchoolId, 'M');
      const miles = [40, 55, 85, 100, 118];
      r.forEach((a, i) => {
        a.injury = null; a.health = 'Healthy'; a.recentInjuryWeeks = 0;
        a.fatigue = 30 + (i * 7) % 45; a.chronicMileage = 70;
        if (i < miles.length) g.training.mileageOverrides[a.id] = miles[i];
      });
      if (r[5]) g.training.overrides[r[5].id] = 'reduced';
      if (r[6]) g.training.overrides[r[6].id] = 'rest';
      if (downWeek) T.setDownWeek(g, 'M', true);
      const projected = r.map((a) => T.projectedFatigue(g, a));
      T.processWeek(g, new window.XCD.core.SeededRNG(3));
      const actual = r.map((a) => a.fatigue);
      return { projected, actual };
    };
    // Same start, same plan, only the miles differ.
    const g = clone();
    g.week = 5; g.training.overrides = {}; g.training.mileageOverrides = {};
    g.training.M = ['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy'];
    const r = g.getRoster(g.playerSchoolId, 'M');
    const pair = r.slice(0, 2);
    pair.forEach((a) => { a.fatigue = 40; a.chronicMileage = 70; a.injuryResistance = 60; a.fitness = 60; a.injury = null; a.recentInjuryWeeks = 0; });
    g.training.mileageOverrides[pair[0].id] = 50;
    g.training.mileageOverrides[pair[1].id] = 95;
    T.processWeek(g, new window.XCD.core.SeededRNG(4));
    return { normal: scenario(false), down: scenario(true), low: pair[0].fatigue, high: pair[1].fatigue };
  });
  console.log('fatigue projection:', JSON.stringify(res));
  ok(res.high >= res.low + 6, 'a runner on more miles must tire more on the same plan: ' + JSON.stringify(res));
  ['normal', 'down'].forEach((k) => {
    const { projected, actual } = res[k];
    const off = projected.map((p, i) => Math.abs(p - actual[i])).filter((d) => d > 1);
    ok(!off.length, `${k}: the projection must match the week runner by runner: ` + JSON.stringify(res[k]));
  });

  // UI: per-runner projection shows and follows one runner's mileage.
  const ui = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    g.training.mileageOverrides = {}; g.training.overrides = {};
    window.XCD.ui.navigate('training');
    await new Promise((r) => setTimeout(r, 150));
    const a = g.getRoster(g.playerSchoolId, 'M').find((x) => !x.injury);
    const read = () => { const el = document.querySelector(`[data-proj="${a.id}"]`); return el ? el.textContent.trim() : null; };
    const before = read();
    const inp = document.querySelector(`[data-miles="${a.id}"]`);
    inp.value = 118; inp.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 80));
    const after = read();
    const preview = document.querySelector('#plan-preview').textContent;
    return { before, after, preview: /fatigue avg/.test(preview) };
  });
  console.log('ui:', JSON.stringify(ui));
  ok(ui.before && /→ \d+/.test(ui.before), 'each runner must show a projected fatigue: ' + JSON.stringify(ui));
  ok(ui.after && Number(ui.after.replace(/\D/g, '')) > Number(ui.before.replace(/\D/g, '')), 'raising one runner\'s miles must raise their projection: ' + JSON.stringify(ui));
  ok(ui.preview, 'the plan preview must report per-runner fatigue');

  await browser.close();
  const all = fails.concat(errors);
  if (all.length) { console.error('FAIL\n' + all.join('\n')); process.exit(1); }
  console.log('PASS test-fatigue-projection');
}
run().catch((e) => { console.error(e); process.exit(1); });
