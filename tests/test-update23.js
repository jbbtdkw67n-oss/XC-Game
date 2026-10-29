// Update 23: difficulty-scaled roster transfers, Auto Recruiting that works
// the player's board first, one-click ideal mileage, and the one-line names
// in the Training squad monitor.
// Verifies:
//   - Roster transfer pressure (Legend > Normal) amplifies ONLY the player's
//     existing transfer reasons: reason-free athletes and CPU rosters are
//     untouched, and more of the player's unhappy runners hit the portal
//   - Auto Recruiting works every board pick before any fill-in target,
//     offers them, keeps them on the board, tags staff fill-ins, and never
//     re-adds a staff pick the player removed
//   - Ideal mileage sets each runner to their own number under their
//     durable limit (both squads from the Roster screen)
//   - Desktop Training table: every name renders on a single line
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, {});

  // ---- 1) Transfer pressure scales with difficulty, on the player only ----
  const tp = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const S = window.XCD.engine.Settings;
    const school = g.getPlayerSchool();
    const mine = [...g.getRoster(school.id, 'M'), ...g.getRoster(school.id, 'W')]
      .filter((a) => a.eligibilityRemaining >= 2);
    // Give half the roster a real reason to leave: buried and never racing.
    mine.forEach((a, i) => { if (i % 2 === 0) { a.seasonRaces = 0; a.currentOverall = Math.max(a.currentOverall, 55); a.seasonInjuryWeeks = 8; } });
    const cpu = Object.values(g.world.schools).find((s) => s.id !== school.id && s.rosterM.length);
    const cpuAths = g.getRoster(cpu.id, 'M').filter((a) => a.eligibilityRemaining >= 2);
    const read = () => ({
      mine: mine.map((a) => { const r = P.transferRisk(g, a); return { s: r.score, n: r.reasons.length }; }),
      cpu: cpuAths.map((a) => P.transferRisk(g, a).score)
    });
    const portalCount = (seed) => {
      let n = 0;
      for (let k = 0; k < 30; k++) {
        P.openPortal(g, new window.XCD.core.SeededRNG(seed + k));
        n += g.portal.entries.filter((e) => e.fromSchoolId === school.id).length;
      }
      g.portal = null;
      return n;
    };
    S.applyPreset(g, 'normal');
    const normal = read();
    const normalPortal = portalCount(500);
    S.applyPreset(g, 'legend');
    const legend = read();
    const legendPortal = portalCount(500);
    S.applyPreset(g, 'normal');
    let higher = 0, reasonFreeChanged = 0;
    normal.mine.forEach((r, i) => {
      if (r.n === 0 && legend.mine[i].s !== r.s) reasonFreeChanged++;
      if (r.n > 0 && legend.mine[i].s > r.s) higher++;
    });
    return {
      legendPreset: S.PRESETS.legend.values.transferPressure,
      rookiePreset: S.PRESETS.rookie.values.transferPressure,
      higher, withReasons: normal.mine.filter((r) => r.n > 0).length, reasonFreeChanged,
      cpuSame: normal.cpu.every((s, i) => s === legend.cpu[i]),
      normalPortal, legendPortal
    };
  });
  console.log('transfer pressure:', JSON.stringify(tp));
  ok(tp.legendPreset > 1 && tp.rookiePreset < 1, 'presets should scale transfer pressure with difficulty');
  ok(tp.withReasons > 0 && tp.higher === tp.withReasons, 'every athlete with a reason should be likelier to leave on Legend');
  ok(tp.reasonFreeChanged === 0, 'athletes with no transfer reason must be unaffected by difficulty');
  ok(tp.cpuSame, 'CPU rosters must be unaffected by the player transfer pressure');
  ok(tp.legendPortal > tp.normalPortal, `Legend should send more of the player's runners to the portal (${tp.legendPortal} vs ${tp.normalPortal})`);

  // ---- 2) Auto Recruiting works the player's board first ----
  const auto = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const RE = window.XCD.engine.Recruiting;
    const school = g.getPlayerSchool();
    const R = g.recruiting;
    // Board picks: mid-pack uncommitted recruits the CPU logic wouldn't
    // necessarily choose for this program.
    const pool = Object.values(g.world.recruits).filter((r) => !r.committedTo && !r.signed)
      .sort((a, b) => a.nationalRank - b.nationalRank);
    const picks = [pool[40], pool[400], pool[1200]].filter(Boolean)
      .filter((r, i, arr) => arr.indexOf(r) === i);
    picks.forEach((r) => RE.boardAdd(g, r));
    R.auto = true;
    const rng = new window.XCD.core.SeededRNG(7);
    RE.startNewWeek(g);
    RE.processWeek(g, rng);
    const rep = R.autoReport;
    const firstWorked = rep.worked.slice(0, picks.length);
    const allPicksFirst = picks.every((r) => firstWorked.includes(r.id));
    const picksOffered = picks.filter((r) => (r.interests[school.id] || {}).offered || r.committedTo === school.id).length;
    const picksStillOnBoard = picks.every((r) => R.board[r.gender].includes(r.id) && !RE.isStaffPick(g, r));
    const staffM = R.staffAdded.M.slice();
    const staffW = R.staffAdded.W.slice();
    // Remove one staff pick: it must never come back.
    const dropped = staffM[0] || staffW[0];
    const droppedRec = dropped && g.world.recruits[dropped];
    if (droppedRec) RE.boardRemove(g, droppedRec);
    for (let i = 0; i < 6; i++) { g.week++; RE.startNewWeek(g); RE.processWeek(g, rng); }
    const back = droppedRec ? R.board[droppedRec.gender].includes(dropped) : false;
    // Picks keep their place at the top of the board.
    const topIsPicks = ['M', 'W'].every((gd) => {
      const mine = picks.filter((r) => r.gender === gd).map((r) => r.id);
      return R.board[gd].slice(0, mine.length).every((id) => mine.includes(id));
    });
    return {
      picks: picks.length, allPicksFirst, picksOffered, picksStillOnBoard,
      staffAdded: staffM.length + staffW.length, droppedBack: back, topIsPicks,
      spent: rep.points, actions: rep.actions
    };
  });
  console.log('auto recruiting:', JSON.stringify(auto));
  ok(auto.allPicksFirst, 'Auto Recruiting should work every board pick before any fill-in target');
  ok(auto.picksOffered === auto.picks, `every board pick should get an offer on first contact (${auto.picksOffered}/${auto.picks})`);
  ok(auto.picksStillOnBoard, 'board picks must stay on the board as the player\'s own picks');
  ok(auto.staffAdded > 0, 'the staff should add fill-in targets behind the picks');
  ok(!auto.droppedBack, 'a staff pick the player removed must never be re-added');
  ok(auto.topIsPicks, 'board picks should stay at the top of the board');

  // ---- 3) Ideal mileage from the Roster screen (both squads) ----
  await page.evaluate(() => { const g = window.XCD.ui.state.game; g.recruiting.auto = false; window.XCD.ui.navigate('roster'); });
  await page.waitForSelector('#btn-ideal-mileage');
  await page.click('#btn-ideal-mileage');
  const miles = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const TE = window.XCD.engine.Training;
    const all = [...g.getRoster(g.playerSchoolId, 'M'), ...g.getRoster(g.playerSchoolId, 'W')];
    const eff = (a) => g.training.mileageOverrides[a.id] ?? g.training.mileage[a.gender];
    return {
      n: all.length,
      matches: all.filter((a) => eff(a) === TE.idealMileage(g, a)).length,
      underLimit: all.every((a) => eff(a) <= TE.safeMileage(a)),
      distinct: new Set(all.map(eff)).size
    };
  });
  console.log('ideal mileage:', JSON.stringify(miles));
  ok(miles.matches === miles.n, `every runner should be on their ideal mileage (${miles.matches}/${miles.n})`);
  ok(miles.underLimit, 'ideal mileage must never exceed a runner\'s durable limit');
  ok(miles.distinct > 1, 'ideal mileage should be individual, not one squad number');

  // ---- 4) Training squad monitor: names on one line (desktop) ----
  await page.evaluate(() => window.XCD.ui.navigate('training'));
  await page.waitForSelector('table.squad-table');
  const names = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('table.squad-table tbody td.col-grow')];
    const lh = (el) => parseFloat(getComputedStyle(el).lineHeight) || 20;
    const wrapped = cells.filter((td) => {
      const strong = td.querySelector('strong');
      return strong && strong.getClientRects().length > 1 || (strong && strong.getBoundingClientRect().height > lh(strong) * 1.5);
    }).length;
    const ws = cells.length ? getComputedStyle(cells[0]).whiteSpace : '';
    return { cells: cells.length, wrapped, ws };
  });
  console.log('training names:', JSON.stringify(names));
  ok(names.cells > 0 && names.wrapped === 0, `Training names should render on one line (${names.wrapped} wrapped)`);
  ok(await page.$('#preset-ideal'), 'Training mileage card should offer the Ideal Mileage preset');

  ok(errors.length === 0, 'page errors: ' + errors.join('\n'));
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'PASS');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
}
run().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
