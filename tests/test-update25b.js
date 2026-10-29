// Update 25 (Stage 2 — load & injuries): load spikes raise injury risk, and
// injuries cost real overall that comes back faster than it was built.
// Verifies:
//   - loadSpike: steady load = no spike; a big jump in miles or in quality
//     work = a spike; cutting load is never penalized
//   - The weekly loop records each runner's spike and rolling quality load
//   - Each week out costs ~2 overall (banked as an injury deficit, capped)
//   - Back in training, the deficit is rebuilt in far fewer weeks than it
//     took to lose plus build, and the summer restores whatever is left
//   - Ideal Mileage and competent CPU staffs ramp volume (no spike)
//   - The training screen shows the spike warning and the deficit
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(180000);
  await newDynasty(page, {});

  // ---- 1) Spike math ----
  const spike = await page.evaluate(() => {
    const T = window.XCD.engine.Training;
    return {
      steady: T.loadSpike(70, 70, 31, 31).mult,
      milesJump: T.loadSpike(75, 40, 31, 31).mult,
      qualityJump: T.loadSpike(70, 70, 50, 15).mult,
      cut: T.loadSpike(40, 75, 8, 31).mult,
      modest: T.loadSpike(80, 70, 31, 31).mult
    };
  });
  ok(spike.steady === 1 && spike.cut === 1 && spike.modest === 1, 'steady, cut, and modest (<20%) loads must not spike: ' + JSON.stringify(spike));
  ok(spike.milesJump >= 1.5, 'a 40→75 mile jump must be a real spike: ' + JSON.stringify(spike));
  ok(spike.qualityJump >= 1.5, 'a big jump in quality work must be a real spike: ' + JSON.stringify(spike));
  console.log('spike:', JSON.stringify(spike));

  // ---- 2) Detraining & comeback through the real weekly loop ----
  const layoff = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    window.XCD.engine.Settings.set(g, 'injuryRate', 0); // no random injuries muddying the test
    const rng = new window.XCD.core.SeededRNG(5);
    g.week = 5;
    const a = g.getRoster(g.playerSchoolId, 'M').filter((x) => !x.injury)
      .sort((x, y) => y.currentOverall - x.currentOverall)[0];
    a.fatigue = 30;
    const start = a.currentOverall;
    a.injury = { type: 'Stress Reaction', weeksRemaining: 6, totalWeeks: 6, overuse: true };
    a.health = 'Injured';
    const drops = [];
    for (let i = 0; i < 6; i++) { T.processWeek(g, rng); drops.push(a.currentOverall); }
    const low = a.currentOverall;
    const peakDeficit = T.injuryDeficitOverall(a);
    const healthyAfterLayoff = !a.injury;
    let weeks = 0;
    while (T.injuryDeficitOverall(a) > 0.5 && weeks < 20) { T.processWeek(g, rng); weeks++; }
    const leftover = T.injuryDeficitOverall(a);
    // Summer restores the rest.
    a.injuryDeficit = { vo2Max: 6, stamina: 4 };
    a.vo2Max -= 6; a.stamina -= 4;
    window.XCD.engine.Training.offseasonDevelopment(g, rng);
    return { start, drops, low, peakDeficit, healthyAfterLayoff, rebuildWeeks: weeks, leftover,
      summerCleared: !a.injuryDeficit, spikeRecorded: typeof a.loadSpike === 'number', chronicIntensity: a.chronicIntensity };
  });
  const lost = layoff.start - layoff.low;
  ok(lost >= 9 && lost <= 14, 'a six-week layoff should cost about 12 overall (~2/week): ' + JSON.stringify(layoff));
  ok(layoff.healthyAfterLayoff, 'the runner must be back after the layoff');
  ok(layoff.rebuildWeeks <= 11, 'the deficit must rebuild quickly (≤ 11 weeks for a 6-week layoff): ' + JSON.stringify(layoff));
  ok(layoff.summerCleared, 'the summer must restore any remaining injury deficit');
  ok(layoff.spikeRecorded && typeof layoff.chronicIntensity === 'number', 'the weekly loop must record load spike and rolling quality load');
  console.log('layoff:', JSON.stringify(layoff));

  // ---- 3) Ramping: Ideal Mileage and competent CPU staffs ----
  const ramp = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const T = window.XCD.engine.Training;
    g.week = 6;
    const a = g.getRoster(g.playerSchoolId, 'M').find((x) => !x.injury);
    a.chronicMileage = 30;
    const ideal = T.idealMileage(g, a);
    const limit = T.rampLimit(a);
    // A competent CPU staff ramps a runner coming back at low volume.
    const school = Object.values(g.world.schools).find((s) => {
      const c = s.id !== g.playerSchoolId && g.world.coaches[s.coachId];
      return c && T.coachCraft(c) >= 50 && s.rosterM.length;
    });
    const coach = g.world.coaches[school.coachId];
    const b = g.world.athletes[school.rosterM[0]];
    b.chronicMileage = 30;
    const cpu = T.mileageFor(g, school, 'M', b, coach);
    return { ideal, limit, cpu, cpuLimit: T.rampLimit(b) };
  });
  ok(ramp.ideal <= ramp.limit, 'Ideal Mileage must respect the ramp limit: ' + JSON.stringify(ramp));
  ok(ramp.cpu <= ramp.cpuLimit, 'a competent CPU staff must ramp volume: ' + JSON.stringify(ramp));
  console.log('ramp:', JSON.stringify(ramp));

  // ---- 4) Training screen: spike warning + deficit display ----
  const ui = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    const roster = g.getRoster(g.playerSchoolId, 'M');
    roster.forEach((a) => { a.chronicMileage = 35; a.chronicIntensity = 10; });
    g.training.mileage.M = 85;
    const inj = roster.find((a) => !a.injury);
    inj.injury = { type: 'Ankle Sprain', weeksRemaining: 2, totalWeeks: 3 };
    inj.health = 'Injured';
    inj.injuryDeficit = { vo2Max: 9, stamina: 6 };
    window.XCD.ui.navigate('training');
    await new Promise((r) => setTimeout(r, 300));
    const txt = document.body.innerText;
    return { spikeWarn: /Load spike for/.test(txt), deficit: /OVR so far/.test(txt) };
  });
  ok(ui.spikeWarn, 'the training screen must warn about load spikes');
  ok(ui.deficit, 'the injury report must show the overall lost so far');
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
