// Live Team Score Projection Overhaul (master spec Part 2, Section 17).
// Verifies:
//   - projected team scores are computed from the CURRENT position of every
//     runner (finished by time, in-progress by distance from real splits)
//   - projections change dynamically as the race unfolds
//   - the projection converges exactly to the official final score and
//     locks once every counted runner has finished
//   - the player panel exposes projected finish, scoring five,
//     displacement, and point gaps
//   - the live board renders during a real broadcast replay
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

  // Advance to (and through) the first race week so a broadcast exists.
  const raced = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    let guard = 0;
    while (!g.lastPlayerMeetId && guard++ < 8) g.advanceWeek();
    const meet = g.lastPlayerMeetId && g.season.meets[g.lastPlayerMeetId];
    const res = meet && (meet.results.M || meet.results.W);
    return { hasMeet: !!meet, hasSplits: !!(res && res.splits), finishers: res ? res.finisherCount : 0 };
  });
  ok(raced.hasMeet && raced.hasSplits, 'a player meet with full splits must exist: ' + JSON.stringify(raced));

  // ---- 1) The projection engine: dynamic, convergent, locking ----
  const proj = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const RC = window.XCD.ui.screens.racecenter;
    const meet = g.season.meets[g.lastPlayerMeetId];
    const gender = meet.results.M ? 'M' : 'W';
    const res = meet.results[gender];
    const last = Math.max(...res.finishers.map((f) => f.time));

    const at = (frac) => RC.projectedScore(res, last * frac);
    const quarter = at(0.25), half = at(0.5), nine = at(0.9), done = at(1.001);

    const sig = (p) => p.teams.map((t) => `${t.schoolId}:${t.points}`).join('|');
    const finalSig = res.teamScores.map((t) => `${t.schoolId}:${t.points}`).join('|');
    const samples = [quarter, half, nine];
    const dynamic = new Set(samples.map(sig)).size > 1 || sig(quarter) !== finalSig;

    // Live order sanity: mid-race, in-progress runners rank by distance.
    const order = RC.liveOrderAt(res, last * 0.5);
    const monotonic = order.every((x, i) => i === 0 || order[i - 1].p >= x.p || order[i - 1].done);

    const panel = RC.playerTeamPanel(g, half.teams, half.entries, half.locked);
    return {
      teamsAtHalf: half.teams.length,
      lockedEarly: quarter.locked,
      lockedDone: done.locked,
      convergent: sig(done) === finalSig,
      dynamic, monotonic,
      panelHasProjection: panel.includes('Projected'),
      panelHasScoring: panel.includes('Scoring:'),
      panelHasGap: panel.includes('Leader: +') || panel.includes('Lead:'),
      qPts: quarter.teams.slice(0, 3).map((t) => t.points),
      fPts: res.teamScores.slice(0, 3).map((t) => t.points)
    };
  });
  ok(proj.teamsAtHalf >= 2, 'multiple teams must be scored live: ' + proj.teamsAtHalf);
  ok(!proj.lockedEarly, 'the projection must NOT be locked early in the race');
  ok(proj.lockedDone, 'the score must lock after every counted runner finishes');
  ok(proj.convergent, 'the locked projection must equal the official final score');
  ok(proj.dynamic, 'projections must change as the race unfolds: ' + JSON.stringify({ q: proj.qPts, f: proj.fPts }));
  ok(proj.monotonic, 'the live order must rank by progress');
  ok(proj.panelHasProjection && proj.panelHasScoring && proj.panelHasGap,
    'the player panel must show projected finish, scoring runners, and gaps: ' + JSON.stringify(proj));
  console.log('projection:', JSON.stringify(proj));

  // ---- 2) The broadcast renders the live board ----
  await page.click('[data-nav="racecenter"]');
  await page.waitForSelector('#live-teams');
  await page.waitForFunction(() => {
    const el = document.querySelector('#live-teams');
    return el && (el.textContent.includes('Projected Team Score') || el.textContent.includes('Final Team Score'));
  }, { timeout: 15000 });
  const early = await page.evaluate(() => document.querySelector('#live-teams').textContent);
  await page.waitForTimeout(2500);
  const later = await page.evaluate(() => document.querySelector('#live-teams').textContent);
  ok(early.includes('Team Score'), 'the live board must render during the broadcast');
  ok(later.includes('Team Score'), 'the live board must keep rendering');
  await page.click('#btn-skip');
  await page.waitForFunction(() => {
    const el = document.querySelector('#live-board');
    return el && el.textContent.includes('Final Team Scores');
  }, { timeout: 5000 });
  console.log('broadcast board OK');

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-livescore');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
