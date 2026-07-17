// Update 12 (Living History & Legacy) smoke test: drives a couple of seasons,
// then exercises the GOAT lists, legacy leaderboards, program archive/records/
// hall of fame, clickable profiles, the mileage +10/-10 quick sets, the
// regional/pre-nats distance fix, and unpursued transfers.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

function assert(cond, msg) { if (!cond) { console.log('FAIL: ' + msg); process.exitCode = 1; throw new Error(msg); } }

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page);

  // Advance two full seasons via the flow shortcut.
  for (let i = 0; i < 42; i++) {
    await page.evaluate(() => {
      const g = window.XCD.ui.state.game;
      g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
      g.week1 = { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true };
    });
    await page.click('#btn-advance-week');
    await page.waitForTimeout(40);
    if (errors.length) break;
  }
  assert(!errors.length, 'no console errors during two-season sim: ' + errors[0]);

  // --- Bug fix: D1 regionals 10K men, Pre-Nats 8K men ---
  const dist = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const meets = Object.values(g.season.meets);
    const reg = meets.find((m) => m.type === 'regional' && (m.division || 'DA') === 'DA');
    const pre = meets.find((m) => m.preNationals);
    return { regM: reg && reg.distances.M, preM: pre && pre.distances.M, preW: pre && pre.distances.W };
  });
  assert(dist.regM === 10000, 'DA regional men race 10K (got ' + dist.regM + ')');
  if (dist.preM != null) assert(dist.preM === 8000, 'Pre-Nats men race 8K (got ' + dist.preM + ')');

  // --- GOAT engine sanity + top-40 cap ---
  const goat = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const G = window.XCD.engine.GOAT;
    const data = G.recalculate(g);
    return {
      hasGoat: !!g.history.goat,
      aths: data.athletes.length, coaches: data.coaches.length,
      progs: data.programs.length, teams: data.teams.length,
      progSorted: data.programs.every((r, i, a) => i === 0 || a[i - 1].score >= r.score),
      champTeams: (g.history.championTeams || []).length,
      teamHasScore: data.teams.length ? typeof data.teams[0].score === 'number' : true
    };
  });
  assert(goat.hasGoat, 'GOAT snapshot stored in history');
  assert(goat.aths <= 40 && goat.coaches <= 40 && goat.progs <= 40 && goat.teams <= 40, 'GOAT lists capped at top 40');
  assert(goat.progSorted, 'programs ranked by descending legacy score');
  assert(goat.champTeams > 0, 'championship team snapshots recorded (' + goat.champTeams + ')');
  console.log('GOAT:', JSON.stringify(goat));

  // --- Championship snapshots carry a roster (for the archive Roster Link) ---
  const rosterOk = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const ct = g.history.championTeams || [];
    return ct.length && ct.every((t) => Array.isArray(t.roster) && t.roster.length >= 5 &&
      typeof t.teamOverall === 'number' && (t.margin === null || typeof t.margin === 'number'));
  });
  assert(rosterOk, 'champion-team snapshots carry a 5+ runner roster and rating fields');

  // --- History screen: every GOAT + board + archive sub-view renders ---
  await page.evaluate(() => window.XCD.ui.navigate('history'));
  await page.waitForTimeout(80);
  for (const tab of ['goat', 'boards', 'champions', 'awards', 'records', 'legends', 'hof', 'career']) {
    await page.evaluate((t) => {
      document.querySelector(`[data-tab="${t}"]`).click();
    }, tab);
    await page.waitForTimeout(60);
  }
  // Cycle GOAT sub-pages and board sub-pages.
  await page.evaluate(() => document.querySelector('[data-tab="goat"]').click());
  await page.waitForTimeout(50);
  for (const s of ['athletes', 'coaches', 'programs', 'teams']) {
    await page.evaluate((k) => { const b = document.querySelector(`[data-goat="${k}"]`); if (b) b.click(); }, s);
    await page.waitForTimeout(50);
  }
  await page.evaluate(() => document.querySelector('[data-tab="boards"]').click());
  await page.waitForTimeout(50);
  for (const s of ['programs', 'coaches', 'athletes']) {
    await page.evaluate((k) => { const b = document.querySelector(`[data-board="${k}"]`); if (b) b.click(); }, s);
    await page.waitForTimeout(50);
  }
  assert(!errors.length, 'no errors browsing history tabs: ' + errors[0]);

  // --- Clickable profile from a leaderboard row (opens a modal) ---
  const clicked = await page.evaluate(() => {
    document.querySelector('[data-tab="boards"]').click();
    const row = document.querySelector('#board-table tbody tr');
    if (!row) return 'no-rows';
    row.click();
    return document.getElementById('active-modal') ? 'modal-open' : 'no-modal';
  });
  await page.waitForTimeout(60);
  assert(clicked === 'modal-open' || clicked === 'no-rows', 'leaderboard row opens a profile modal (' + clicked + ')');
  await page.evaluate(() => window.XCD.ui.closeModal());

  // --- My Program archive / records / hall of fame render ---
  await page.evaluate(() => window.XCD.ui.navigate('school'));
  await page.waitForTimeout(60);
  await page.evaluate(() => document.querySelector('[data-stab="history"]').click());
  await page.waitForTimeout(60);
  for (const s of ['archive', 'records', 'hof']) {
    await page.evaluate((k) => { const b = document.querySelector(`[data-hsub="${k}"]`); if (b) b.click(); }, s);
    await page.waitForTimeout(60);
  }
  assert(!errors.length, 'no errors in program history archive/records/hof: ' + errors[0]);

  // --- Mileage +10 / -10 quick sets exist and adjust loads ---
  await page.evaluate(() => window.XCD.ui.navigate('training'));
  await page.waitForTimeout(60);
  const mileage = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const plus = document.querySelector('[data-preset="plus10"]');
    const minus = document.querySelector('[data-preset="minus10"]');
    if (!plus || !minus) return { ok: false };
    const before = { ...g.training.mileageOverrides };
    plus.click();
    const afterPlus = Object.keys(g.training.mileageOverrides).length;
    return { ok: true, hasButtons: true, afterPlus };
  });
  assert(mileage.ok, 'mileage +10/-10 quick-set buttons present');
  assert(mileage.afterPlus > 0, '+10 applied overrides to the squad');

  // --- Some transfer entries go unpursued (0 AI offers) ---
  const portal = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const p = g.portal;
    if (!p || !p.entries) return { checked: false };
    // portal.offers includes the from-school marker? No — offers are suitor ids.
    const unpursued = p.entries.filter((e) => !e.destination && (!e.offers || e.offers.length === 0)).length;
    return { checked: true, total: p.entries.length, unpursued };
  });
  console.log('portal:', JSON.stringify(portal));

  await browser.close();
  if (!process.exitCode) console.log('PASS');
})().catch((e) => { console.log('FAIL:', e.message); process.exit(1); });
