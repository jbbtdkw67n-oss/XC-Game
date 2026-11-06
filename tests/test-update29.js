// Update 29: honest scouting notes, 99-potential Phenom generationals,
// screens that reset when you leave them, and Region/Conference poll moves.
// Verifies:
//   - Every scout's-notebook line belongs to a recruit with real upside (a
//     high true ceiling well above today's overall); "Late bloomer." only on
//     a Late Bloomer curve; old notes on a maxed-out recruit are hidden
//   - Every generational talent has 99 potential and the Phenom curve; the
//     Phenom curve still shows up (rarely) among ordinary recruits
//   - Leaving a screen and coming back lands on its default tab (My Program
//     → History → Roster → My Program shows Overview), while an Inbox deep
//     link still opens its tab
//   - Region/Conference tabs show movement within that region/conference,
//     not the national-poll change
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(600000);
  await newDynasty(page, {});

  // ---- 1) Scouting notes + generational + phenom ----
  const rec = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    const RE = window.XCD.engine.Recruiting;
    const H = D.HIDDEN_GEMS;
    const G = D.GENERATIONAL;
    const saved = { one: G.P_ONE, two: G.P_TWO };
    const out = { noted: 0, total: 0, badNotes: [], lateBad: 0, gens: [], phenomOrdinary: 0, gemsNoted: 0, gems: 0, visible: 0 };
    for (let c = 0; c < 4; c++) {
      // Force a generational talent into every other class so they are checked.
      if (c % 2 === 0) { G.P_ONE = 1; G.P_TWO = 0; } else { G.P_ONE = saved.one; G.P_TWO = saved.two; }
      const recs = RE.generateClass(g, new window.XCD.core.SeededRNG(1000 + c));
      Object.values(recs).forEach((r) => {
        out.total++;
        if (r.generational) { out.gens.push({ pot: r.potential, dev: r.devProfile, notes: (r.scoutNotes || []).length }); return; }
        if (r.devProfile === 'legend') out.phenomOrdinary++;
        if (r.hiddenGem) { out.gems++; if (r.scoutNotes && r.scoutNotes.length) out.gemsNoted++; }
        if (r.scoutNotes && r.scoutNotes.length) {
          out.noted++;
          const head = r.potential - r.currentOverall;
          if (head < H.MIN_HEADROOM || r.potential < H.MIN_CEILING) out.badNotes.push({ pot: r.potential, ovr: r.currentOverall, n: r.scoutNotes });
          if (r.scoutNotes.includes('Late bloomer.') && r.devProfile !== 'late') out.lateBad++;
          if (RE.scoutNotesFor(r).length === r.scoutNotes.length) out.visible++;
        }
      });
    }
    G.P_ONE = saved.one; G.P_TWO = saved.two;
    // A legacy note on a recruit already at their potential is never shown.
    const any = Object.values(g.world.recruits)[0];
    const fake = Object.assign(Object.create(Object.getPrototypeOf(any)), any, { scoutNotes: ['Late bloomer.', 'Huge upside.'], devProfile: 'late', generational: false });
    fake.potential = fake.currentOverall;
    out.legacyShown = RE.scoutNotesFor(fake).length;
    return out;
  });
  console.log('scouting:', JSON.stringify({ ...rec, badNotes: rec.badNotes.slice(0, 3) }));
  ok(rec.badNotes.length === 0, `${rec.badNotes.length} notebook lines went to recruits without real upside: ` + JSON.stringify(rec.badNotes.slice(0, 3)));
  ok(rec.lateBad === 0, `${rec.lateBad} "Late bloomer." notes on non-Late-Bloomer curves`);
  ok(rec.noted > 0 && rec.noted / rec.total < 0.16, `notebook lines should stay a rare signal: ${rec.noted}/${rec.total}`);
  ok(rec.gemsNoted / rec.noted < 0.6, `hidden gems must stay a minority of noted recruits: ${rec.gemsNoted}/${rec.noted}`);
  ok(rec.gems > 0 && rec.gemsNoted === rec.gems, `every hidden gem should still carry its tells: ${rec.gemsNoted}/${rec.gems}`);
  ok(rec.visible === rec.noted, 'every freshly generated note must pass the display filter');
  ok(rec.legacyShown === 0, 'old notes on a recruit already at their potential must be hidden');
  ok(rec.gens.length >= 2, 'expected forced generational talents: ' + rec.gens.length);
  ok(rec.gens.every((x) => x.pot === 99 && x.dev === 'legend' && x.notes === 0), 'every generational talent must be a 99-potential Phenom: ' + JSON.stringify(rec.gens));
  ok(rec.phenomOrdinary >= 1 && rec.phenomOrdinary / rec.total < 0.005, `Phenom should stay very rare among ordinary recruits: ${rec.phenomOrdinary}/${rec.total}`);

  // ---- 2) Screens reset when you leave them ----
  const nav = (id) => page.evaluate((s) => window.XCD.ui.navigate(s), id);
  await nav('school');
  await page.click('[data-stab="history"]');
  ok(await page.$eval('[data-stab="history"]', (b) => b.classList.contains('active')), 'History tab should open');
  await nav('roster');
  await nav('school');
  ok(await page.$eval('[data-stab="overview"]', (b) => b.classList.contains('active')), 'My Program should be back on Overview after leaving it');

  await nav('rankings');
  await page.click('[data-tab="conference"]');
  await page.click('#g-w');
  // Staying on the screen keeps the tab (a re-render of the same screen).
  await page.evaluate(() => window.XCD.ui.renderShell());
  ok(await page.$eval('[data-tab="conference"]', (b) => b.classList.contains('active')), 'a re-render of the same screen should keep its tab');
  await nav('recruiting');
  await nav('rankings');
  ok(await page.$eval('[data-tab="national"]', (b) => b.classList.contains('active')), 'Rankings should be back on National');
  ok(await page.$eval('#g-m', (b) => b.classList.contains('active')), 'Rankings should be back on Men');

  await nav('dashboard');
  await page.evaluate(() => window.XCD.ui.inboxGo(window.XCD.ui.state.game, 'rankings:selection'));
  ok(await page.$eval('[data-tab="selection"]', (b) => b.classList.contains('active')), 'an Inbox deep link should still open its tab');

  // ---- 3) Region/Conference rank movement ----
  const moves = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Rk = window.XCD.engine.Rankings;
    const school = g.getPlayerSchool();
    const div = school.division || 'DI';
    Rk.compute(g);
    // Shuffle last week's scores so this week's poll moves.
    const rows = g.rankings.M;
    const confRows = rows.filter((r) => r.division === div && r.conference === school.conference);
    // Make "last week" the conference in exact reverse, leaving the national
    // ranks as they were — conference moves must then differ from national.
    const ranks = confRows.map((r) => r.rank).sort((a, b) => a - b);
    const prevSnapshot = rows.map((r) => ({ ...r }));
    const revOrder = confRows.slice().reverse();
    revOrder.forEach((r, i) => { prevSnapshot.find((p) => p.schoolId === r.schoolId).rank = ranks[i]; });
    g.rankings.M = prevSnapshot;
    Rk.compute(g);
    const now = g.rankings.M.filter((r) => r.division === div && r.conference === school.conference);
    return now.map((r) => ({ id: r.schoolId, rank: r.rank, prev: r.prevRank, conf: r.confRank, prevConf: r.prevConfRank, reg: r.regionRank, prevReg: r.prevRegionRank }));
  });
  const n = moves.length;
  ok(n >= 2, 'conference should have several teams');
  ok(moves.every((m, i) => m.conf === i + 1), 'confRank should follow poll order: ' + JSON.stringify(moves.slice(0, 4)));
  ok(moves.every((m) => m.prevConf === n + 1 - m.conf), 'prevConfRank should be last week\'s place in the conference: ' + JSON.stringify(moves.slice(0, 4)));
  ok(moves.every((m) => m.reg >= 1 && m.prevReg >= 1), 'region ranks should be recorded');

  await nav('school');
  await nav('rankings');
  await page.click('[data-tab="conference"]');
  const cells = await page.$$eval('#rank-body tbody tr td.col-rank', (tds) => tds.map((td) => td.textContent.replace(/\s+/g, ' ').trim()));
  const expect = moves.map((m) => {
    const d = m.prevConf - m.conf;
    return d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '–';
  });
  ok(cells.length === n && cells.every((c, i) => c.includes(expect[i])), 'Conference tab arrows should show conference movement: ' + JSON.stringify(cells.slice(0, 4)) + ' vs ' + JSON.stringify(expect.slice(0, 4)));

  ok(errors.length === 0, 'page errors: ' + errors.join('\n'));
  await browser.close();
  if (fails.length) {
    console.log('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS');
}

run().catch((e) => { console.error(e); process.exit(1); });
