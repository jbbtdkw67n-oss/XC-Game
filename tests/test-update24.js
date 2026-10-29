// Update 24: the race-day Top 7, a fresh transfer slate every season, whole-
// number offseason reports, championship-day variance, and the Training
// squad monitor's wide-screen layout.
// Verifies:
//   - Top 7: the Highest Overall preset races the seven best healthy runners;
//     a custom lineup races exactly the coach's picks (an injured pick is
//     covered by the best healthy runner); the lineup is capped at 7, saves
//     round-trip it, and a runner the coach races is never "buried"
//   - Roster screen: the Top 7 card switches modes and the per-runner toggle
//     builds a custom lineup
//   - Transfer desire resets each season: moods and frayed bonds settle back
//     toward a baseline at the rollover (strong bonds stay), and the
//     season-scoped reasons (never raced, not developing) wait for the season
//   - Offseason Progression Report shows whole numbers only
//   - Championship meets swing team results wider than regular-season meets
//   - Squad monitor (1920px): the name column no longer swallows the table
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(120000);

  await newDynasty(page, {});

  // ---- 1) Top 7 engine ----
  const lineup = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const school = g.getPlayerSchool();
    const healthy = () => g.getRoster(school.id, 'M').filter((a) => !a.injury);
    const ids = (arr) => arr.map((a) => a.id);
    const out = {};
    out.defaultMode = R.playerLineup(g, 'M').mode;
    const top7 = ids(healthy().sort((a, b) => b.currentOverall - a.currentOverall).slice(0, 7));
    out.presetMatches = JSON.stringify(R.raceSquad(g, school, 'M').map((a) => a.id).sort()) === JSON.stringify(top7.slice().sort());

    // Custom: bench the #1 runner, race the 8th instead.
    const ranked = healthy().sort((a, b) => b.currentOverall - a.currentOverall);
    const star = ranked[0], eighth = ranked[7];
    R.setLineupMode(g, 'M', 'custom');
    out.customStartsFromTop7 = JSON.stringify(g.training.lineup.M.ids.slice().sort()) === JSON.stringify(top7.slice().sort());
    const rOut = R.toggleLineup(g, 'M', star.id);
    const rIn = R.toggleLineup(g, 'M', eighth.id);
    const squad = ids(R.raceSquad(g, school, 'M'));
    out.toggles = rOut.ok && !rOut.added && rIn.ok && rIn.added;
    out.customRaces = squad.length === 7 && squad.includes(eighth.id) && !squad.includes(star.id);
    out.fullRefused = !R.toggleLineup(g, 'M', ranked[8].id).ok;

    // The benched star is "buried" for transfer purposes; the 8th is not.
    const P = window.XCD.engine.Portal;
    const R2 = window.XCD.data.PORTAL_REASONS;
    const reasons = (a) => (P.transferRisk(g, a) || { reasons: [] }).reasons;
    out.starBuried = reasons(star).includes(R2.racing);

    // An injured pick is covered by the best healthy runner.
    const pick = g.training.lineup.M.ids[0];
    const pa = g.getAthlete(pick);
    pa.injury = { type: 'Test strain', weeksRemaining: 3, totalWeeks: 3 };
    const covered = ids(R.raceSquad(g, school, 'M'));
    out.injuredCovered = covered.length === 7 && !covered.includes(pick);
    delete pa.injury;

    // Actually racing: a meet with the player's school fields the custom seven.
    const meet = Object.values(g.season.meets).find((m) => m.schoolIds.includes(school.id) && m.distances);
    if (meet) {
      const res = R.simulateRace(g, meet, 'M', new window.XCD.core.SeededRNG(7), true);
      const mine = [...res.finishers, ...(res.dnfs || [])].filter((f) => f.schoolId === school.id).map((f) => f.athleteId);
      out.meetUsesLineup = mine.length === 7 && mine.includes(eighth.id) && !mine.includes(star.id);
    }

    // Save round-trip keeps the custom lineup.
    const back = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    out.saveRoundTrip = back.training.lineup.M.mode === 'custom' &&
      JSON.stringify(back.training.lineup.M.ids) === JSON.stringify(g.training.lineup.M.ids);

    // Back to the preset.
    R.setLineupMode(g, 'M', 'overall');
    out.backToPreset = R.playerLineup(g, 'M').mode === 'overall' && g.training.lineup.M.ids.length === 0;
    return out;
  });
  console.log('lineup:', JSON.stringify(lineup));
  ok(lineup.defaultMode === 'overall', 'the Top 7 should default to the Highest Overall preset');
  ok(lineup.presetMatches, 'the preset should race the seven highest-overall healthy runners');
  ok(lineup.customStartsFromTop7, 'switching to Custom should start from the current Top 7');
  ok(lineup.toggles, 'toggling should take a runner out and put another in');
  ok(lineup.customRaces, 'a custom lineup should race exactly the coach\'s picks');
  ok(lineup.fullRefused, 'an eighth pick should be refused while the Top 7 is full');
  ok(lineup.starBuried, 'a benched top runner should carry the racing transfer reason');
  ok(lineup.injuredCovered, 'an injured pick should be covered by the best healthy runner');
  ok(lineup.meetUsesLineup === true, 'a real race should field the custom lineup');
  ok(lineup.saveRoundTrip, 'the custom lineup should survive a save round-trip');
  ok(lineup.backToPreset, 'Highest Overall should clear the custom picks');

  // ---- 2) Roster screen Top 7 card ----
  await page.evaluate(() => window.XCD.ui.navigate('roster'));
  await page.waitForSelector('.lineup-card');
  const before = await page.$$eval('.lineup-chip', (els) => els.length);
  await page.click('#lineup-custom');
  await page.waitForTimeout(100);
  const customActive = await page.$eval('#lineup-custom', (b) => b.classList.contains('active'));
  // Take the first runner in the Top 7 out via their toggle.
  await page.click('[data-lineup].lineup-in');
  await page.waitForTimeout(100);
  const ui = await page.evaluate(() => ({
    mode: window.XCD.ui.state.game.training.lineup.M.mode,
    picks: window.XCD.ui.state.game.training.lineup.M.ids.length,
    autoChips: document.querySelectorAll('.lineup-chip.auto').length
  }));
  console.log('roster ui:', JSON.stringify({ before, customActive, ...ui }));
  ok(before === 7, 'the Top 7 card should list seven runners');
  ok(customActive && ui.mode === 'custom', 'the Custom button should switch the lineup mode');
  ok(ui.picks === 6 && ui.autoChips === 1, 'removing a pick should leave an auto-filled open spot');
  await page.click('#lineup-overall');

  // ---- 3) Transfer desire resets each season ----
  const reset = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const R = window.XCD.data.PORTAL_REASONS;
    const ath = g.getRoster(g.playerSchoolId, 'M').filter((a) => a.eligibilityRemaining >= 2);
    const [low, high] = ath;
    low.morale = 20; low.coachRelationship = 20; low.teamRelationship = 25;
    high.morale = 95; high.coachRelationship = 90;
    P.seasonFreshStart(g);
    const out = {
      lowMorale: low.morale, lowCoach: Math.round(low.coachRelationship), lowTeam: Math.round(low.teamRelationship),
      highMorale: high.morale, highCoach: high.coachRelationship
    };
    // Season-scoped reasons wait for the season: in Week 1 a runner who
    // hasn't raced or developed yet isn't flagged for it.
    const r = ath.find((a, i) => i >= 2 && a.classYear !== 'Freshman');
    r.currentOverall = Math.max(r.currentOverall, 60); r.seasonRaces = 0; r.seasonDev = 0;
    r.potential = Math.max(r.potential, r.currentOverall + 15);
    const wk = g.week;
    g.week = 1;
    const early = P.transferRisk(g, r).reasons;
    g.week = 10;
    const late = P.transferRisk(g, r).reasons;
    g.week = wk;
    out.earlyClean = !early.includes(R.stagnant);
    out.lateFlags = late.includes(R.stagnant);
    return out;
  });
  console.log('season reset:', JSON.stringify(reset));
  ok(reset.lowMorale >= 50 && reset.lowMorale < 70, 'a miserable runner should start the new season much closer to baseline');
  ok(reset.lowCoach > 30 && reset.lowTeam > 30, 'frayed bonds should heal most of the way at the rollover');
  ok(reset.highMorale < 95 && reset.highMorale >= 70, 'moods settle from both directions');
  ok(reset.highCoach === 90, 'strong bonds are earned over a career and stay as they are');
  ok(reset.earlyClean, 'season-scoped transfer reasons should not fire in Week 1');
  ok(reset.lateFlags, 'season-scoped transfer reasons should fire once the season has run');

  // ---- 4) Offseason report: whole numbers ----
  await page.evaluate(() => window.XCD.ui.navigate('dashboard'));
  const rep = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.getRoster(g.playerSchoolId, 'M').forEach((a) => { a.consistency += 0.37; });
    window.XCD.engine.Training.offseasonDevelopment(g, new window.XCD.core.SeededRNG(11));
    const entries = g.offseasonReport.entries;
    const allInts = entries.every((e) => e.attrs.every((r) => Number.isInteger(r.from) && Number.isInteger(r.to) && r.from !== r.to));
    // An old save's report (fractional ratings) still renders whole numbers.
    entries[0].attrs.push({ key: 'consistency', from: 63.7, to: 64.9 });
    g.offseasonReport.year = g.year;
    return { allInts, n: entries.length };
  });
  await page.evaluate(() => window.XCD.ui.navigate('dashboard'));
  const repBtn = await page.$('#btn-offseason-report');
  let modalDecimals = null;
  if (repBtn) {
    await repBtn.click();
    await page.waitForTimeout(150);
    modalDecimals = await page.evaluate(() => {
      const m = document.querySelector('.modal') || document.body;
      return (m.innerText.match(/\b\d+\.\d+\s*→|→\s*\d+\.\d+/g) || []).length;
    });
    await page.evaluate(() => window.XCD.ui.closeModal && window.XCD.ui.closeModal());
  }
  console.log('report:', JSON.stringify({ ...rep, modalDecimals }));
  ok(rep.allInts, 'offseason report entries should hold whole-number ratings');
  ok(modalDecimals === null || modalDecimals === 0, 'the report modal should never show decimal ratings');

  // ---- 5) Championship-day variance ----
  const variance = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const R = window.XCD.engine.Races;
    const Rng = window.XCD.core.SeededRNG;
    const base = Object.values(g.season.meets).find((m) => m.schoolIds.length >= 8 && m.distances);
    if (!base) return null;
    const field = [];
    base.schoolIds.forEach((sid) => g.getSchool(sid).rosterM.forEach((id) => field.push(g.world.athletes[id])));
    const snap = field.map((a) => JSON.stringify(a));
    const restore = () => field.forEach((a, i) => { Object.keys(a).forEach((k) => { delete a[k]; }); Object.assign(a, JSON.parse(snap[i])); });
    const spread = (type) => {
      const meet = Object.assign({}, base, { type, results: {} });
      const bySchool = {};
      for (let seed = 1; seed <= 30; seed++) {
        const res = R.simulateRace(g, meet, 'M', new Rng(seed * 7717), true);
        restore();
        const sums = {};
        res.finishers.forEach((f) => { if (!f.dnf) (sums[f.schoolId] = sums[f.schoolId] || []).push(f.time); });
        Object.entries(sums).forEach(([sid, t]) => {
          const top5 = t.sort((a, b) => a - b).slice(0, 5);
          if (top5.length === 5) (bySchool[sid] = bySchool[sid] || []).push(top5.reduce((s, x) => s + x, 0) / 5);
        });
      }
      const sds = Object.values(bySchool).filter((v) => v.length >= 20).map((v) => {
        const m = v.reduce((s, x) => s + x, 0) / v.length;
        return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length) / m;
      });
      return sds.reduce((s, x) => s + x, 0) / sds.length;
    };
    return { regular: spread('invitational'), championship: spread('conference') };
  });
  console.log('variance:', JSON.stringify(variance));
  ok(variance && variance.championship > variance.regular * 1.3,
    'championship meets should swing team results noticeably wider than regular meets');

  // ---- 6) Squad monitor layout at 1920px ----
  await page.evaluate(() => window.XCD.ui.navigate('training'));
  await page.waitForSelector('table.squad-table');
  const layout = await page.evaluate(() => {
    const t = document.querySelector('table.squad-table');
    const name = t.querySelector('th').getBoundingClientRect().width;
    return { table: t.getBoundingClientRect().width, name, centered: getComputedStyle(t.querySelectorAll('td')[2]).textAlign };
  });
  console.log('squad monitor:', JSON.stringify(layout));
  ok(layout.name < layout.table * 0.3, `the name column should not swallow the table (${Math.round(layout.name)} of ${Math.round(layout.table)}px)`);
  ok(layout.centered === 'center', 'data columns should be centered under their headers');

  // ---- 7) Transfer points reset with a new coach (retirement) ----
  const tp = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const C = window.XCD.engine.Careers;
    const AW = window.XCD.data.CALENDAR.AWARDS_WEEK;
    const setUp = () => {
      g.week = AW + 1;
      P.openPortal(g, new window.XCD.core.SeededRNG(99));
      const mine = g.playerSchoolId;
      const targets = g.portal.entries.filter((e) => e.fromSchoolId !== mine && !e.destination).slice(0, 2);
      targets.forEach((e) => P.setTransferPoints(g, e.athleteId, 60));
      return { mine, targets: targets.map((e) => e.athleteId), spent: P.transferPointsSpent(g), budget: g.portal.player.budget };
    };
    const offersFrom = (ids, sid) => ids.filter((id) => g.portal.entries.find((e) => e.athleteId === id).offers.includes(sid)).length;

    const r1 = setUp();
    const newSchool = Object.values(g.world.schools).find((s) => s.id !== r1.mine && (s.division || 'DI') === 'DI' && s.prestige < 40);
    const res = C.retireAndSucceed(g, { first: 'Next', last: 'Coach', archetype: 'Recruiter', startRole: 'Head' }, newSchool.id);
    const afterRetire = {
      ok: res.ok, spent: P.transferPointsSpent(g), left: P.transferPointsLeft(g),
      budget: g.portal.player && g.portal.player.budget,
      oldPursuits: offersFrom(r1.targets, r1.mine),
      allocations: Object.keys(g.portal.player.allocations).length
    };
    return { before: r1, afterRetire };
  });
  console.log('transfer points reset:', JSON.stringify(tp));
  ok(tp.before.spent > 0, 'setup: the old coach should have points on portal athletes');
  ok(tp.afterRetire.ok, 'retirement should succeed in the offseason');
  ok(tp.afterRetire.spent === 0 && tp.afterRetire.allocations === 0, 'a successor coach should start with no points spent');
  ok(tp.afterRetire.left === tp.afterRetire.budget && tp.afterRetire.budget > 0, 'a successor should get a full, freshly computed budget');
  ok(tp.afterRetire.oldPursuits === 0, "the retired coach's pursuits should be withdrawn");

  await browser.close();
  const all = [...fails, ...errors];
  if (all.length) {
    console.log('FAIL\n' + all.join('\n'));
    process.exit(1);
  }
  console.log('PASS');
}

run().catch((e) => { console.error(e); process.exit(1); });
