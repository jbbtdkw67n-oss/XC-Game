/*
 * Update 15 balance test: 40-season stress sim at a blue blood.
 *
 * Verifies the new systems hold up over a long dynasty:
 *  - Tutorial: origin story shows once, is skippable, and first-season tips
 *    render; state persists.
 *  - Transfer Points: elite program+coach budget ≈ 300; a preference-matched
 *    elite transfer locks for ~1/3 of a max budget; top transfers draw ~5
 *    suitors; the player lands 3-6 transfers per cycle with sane play.
 *  - Recruiting: a blue-blood player signs genuine top-level classes
 *    (4★/5★ signees) with the buffed Sway, while CPU powers still win
 *    their share — the game stays difficult.
 *  - World health after 40 seasons: no rating drift, championship variety,
 *    every screen still renders.
 */
const { chromium } = require('playwright');
const path = require('path');
const { walkCoachWizard, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  const fails = [];
  const fail = (m) => fails.push(m);
  wireErrors(page, errors);
  page.setDefaultTimeout(180000);

  // ---- 1) New dynasty at a blue blood, walking the REAL tutorial flow ----
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  await walkCoachWizard(page, { archetype: 'Recruiter' });
  await page.waitForSelector('.school-pick');
  await page.fill('#school-search', 'Northern Arizona');
  await page.waitForTimeout(80);
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#sidebar');

  // The origin story must show for a brand-new dynasty.
  await page.waitForSelector('#tut-begin');
  const story = await page.textContent('.tutorial-story-text');
  if (!/back to back state championships at a small Kansas high school/.test(story || '')) {
    fail('origin story text missing or wrong: ' + story);
  }
  await page.click('#tut-begin');
  await page.waitForSelector('#tut-start');
  // Take the tutorial: walk every step to the end.
  await page.click('#tut-start');
  for (let i = 0; i < 12; i++) {
    const next = await page.$('#tut-next');
    if (!next) break;
    await next.click();
    await page.waitForTimeout(40);
    if (!(await page.$('#tutorial-overlay'))) break;
  }
  if (await page.$('#tutorial-overlay')) fail('tutorial overlay did not close after walking all steps');

  // First-season tips: the dashboard banner should be up right now.
  const tipState = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    return {
      pending: g.tutorial && g.tutorial.pending,
      tipsYear: g.tutorial && g.tutorial.tipsYear,
      year: g.year,
      bannerVisible: !!document.querySelector('.tip-banner')
    };
  });
  if (tipState.pending !== false) fail('tutorial.pending should be false after completion');
  if (tipState.tipsYear !== tipState.year) fail('first-season tips should be armed for the creation year');
  if (!tipState.bannerVisible) fail('dashboard tip banner should render during the first season');
  // Dismiss the dashboard tip; it must not return.
  await page.click('.tip-banner .tip-close');
  await page.click('[data-nav="roster"]');
  await page.waitForTimeout(100);
  const rosterTip = await page.$('.tip-banner');
  if (!rosterTip) fail('roster tip banner should appear on first visit');
  await page.click('[data-nav="dashboard"]');
  await page.waitForTimeout(100);
  if (await page.$('.tip-banner')) fail('dismissed dashboard tip must not reappear');

  // ---- 2) Transfer Points unit checks ----
  const unit = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const school = g.getPlayerSchool();
    const coach = g.getPlayerCoach();
    const keep = { prestige: school.prestige, rec: coach.recruiting };
    school.prestige = 95; coach.recruiting = 90;
    const elite = P.playerTransferBudget(g, false);
    // Elite transfer, level-appropriate for a max program, prefs matched → lock cost
    const star = { id: 'x', currentOverall: 82, potential: 90, gender: 'M', classYear: 'Sophomore',
      hometownState: school.state, academics: 60, personality: 'Grinder', eligibilityRemaining: 3 };
    const lockStar = P.pointsToLock(g, star, school, { reason: 'Championship aspirations', fromSchoolId: null, offers: [] });
    school.prestige = 50; coach.recruiting = 55;
    const midBudget = P.playerTransferBudget(g, false).budget;
    const lockStarMid = P.pointsToLock(g, star, school, { reason: 'Championship aspirations', fromSchoolId: null, offers: [] });
    school.prestige = keep.prestige; coach.recruiting = keep.rec;
    return { eliteBudget: elite.budget, lockStar, ratio: lockStar / elite.budget, midBudget, lockStarMid };
  });
  console.log('transfer-points unit:', JSON.stringify(unit));
  if (unit.eliteBudget < 260 || unit.eliteBudget > 340) fail('elite program+coach budget should be ~300: ' + unit.eliteBudget);
  if (unit.ratio < 0.25 || unit.ratio > 0.45) fail('elite lock should cost ~1/3 of a max budget: ' + unit.ratio.toFixed(2));
  if (unit.lockStarMid <= unit.lockStar * 1.3) fail('a mid program must pay far more to lock a star: ' + unit.lockStarMid + ' vs ' + unit.lockStar);

  // ---- 3) The 40-season stress sim ----
  // The harness plays like a competent human at a blue blood: it manually
  // recruits a short list of 4★/5★ targets every week (call → offer →
  // visit → SWAY), lets Auto fill the rest of the class, spends coach
  // upgrade points every offseason, and works the portal with a mixed
  // lock/value strategy.
  const sim = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const RE = window.XCD.engine.Recruiting;
    const out = { seasons: [], err: null, suitorSamples: [], swayUses: 0, swayBoosts: 0 };
    const t0 = performance.now();
    try {
      g.tutorial = null; // tips done — pure sim from here
      for (let season = 0; season < 40; season++) {
        const yr = g.year;
        let landed = 0, pursued = 0;
        while (g.year === yr) {
          g.weeklyFlow.trainingConfirmed = true;
          g.weeklyFlow.recruitingDone = true;
          g.recruiting.auto = true;

          // Manual star recruiting: work the top uncommitted 4★/5★ per
          // gender through the classic funnel; sway once they're close.
          // (Manual points spend first; Auto uses whatever remains.)
          if (g.week <= window.XCD.data.RECRUITING.SIGNING_WEEK) {
            const school = g.getPlayerSchool();
            ['M', 'W'].forEach((gender) => {
              const all = Object.values(g.world.recruits)
                .filter((r) => r.gender === gender && !r.signed)
                .sort((a, b) => a.nationalRank - b.nationalRank);
              const pool = all.filter((r) => !r.committedTo);
              // A realistic board: chase the top two 5★s AND the top two
              // 4★s (less contested) instead of going all-in on the elite —
              // plus flip attempts on elite recruits committed elsewhere
              // that we already hold an offer with (the rebuilt Sway).
              const flipTargets = all.filter((r) => {
                if (!r.committedTo || r.committedTo === school.id || r.starRating < 4) return false;
                const st = r.interests[school.id];
                return !!(st && st.offered);
              }).slice(0, 2);
              const targets = pool.filter((r) => r.starRating === 5).slice(0, 2)
                .concat(pool.filter((r) => r.starRating === 4).slice(0, 2))
                .concat(flipTargets);
              for (const r of targets) {
                for (let act = 0; act < 2; act++) {
                  if (g.recruiting.pointsLeft <= 6) break;
                  const st = r.getSchoolState(school.id, true);
                  const cc = st.offered ? RE.commitChance(g, school, r) : 0;
                  const committedElsewhere = r.committedTo && r.committedTo !== school.id;
                  let key;
                  if (committedElsewhere && st.offered && cc >= 0.10) key = 'sway';
                  else if (committedElsewhere) break; // nothing else moves a committed recruit
                  else if (!st.offered && st.interest >= 10) key = 'offer';
                  else if (st.interest >= 30 && !st.visited) key = 'campusVisit';
                  else if (st.visited && !st.overnight && st.interest >= 45) key = 'hostOvernight';
                  else if (st.relationship < 55) key = 'homeVisit';
                  else key = 'call';
                  let res = RE.doAction(g, r.id, key);
                  // Count only sways that actually resolved (not the fallback call).
                  if (key === 'sway' && res.ok) {
                    out.swayUses++;
                    if (/FLIPPED/.test(res.message)) out.swayBoosts++;
                    break; // one flip attempt per week per recruit is plenty
                  }
                  if (!res.ok && key !== 'call' && !committedElsewhere) res = RE.doAction(g, r.id, 'call');
                  if (!res.ok) break;
                }
              }
            });
          }

          // Portal policy: lock the best star, then lock value adds
          // (solid contributors), spreading whatever's left.
          if (g.portal && g.portal.open && !g.portal.summer) {
            const school = g.getPlayerSchool();
            const cands = g.portal.entries
              .filter((e) => !e.destination && e.fromSchoolId !== g.playerSchoolId)
              .map((e) => ({ e, a: g.getAthlete(e.athleteId) }))
              .filter((x) => x.a && x.a.currentOverall >= 55)
              .sort((x, y) => P.transferQuality(y.a) - P.transferQuality(x.a));
            let slot = 0;
            for (const { e, a } of cands) {
              if (P.transferPointsLeft(g) < 20 || slot >= 7) break;
              const already = g.portal.player && g.portal.player.allocations[a.id];
              if (already) { slot++; continue; }
              const lock = P.pointsToLock(g, a, school, e);
              const left = P.transferPointsLeft(g);
              // Lock the first star, then lock anything affordable; put a
              // 60% stake on names too expensive to lock outright.
              const want = lock <= left ? lock : Math.round(lock * 0.6);
              const res = P.setTransferPoints(g, a.id, Math.min(want, left));
              if (res.ok) slot++;
            }
          }

          // Sample suitor counts for star transfers late in the window.
          if (g.week === P.DECISION_WEEK && g.portal && !g.portal.summer) {
            g.portal.entries.forEach((e) => {
              const a = g.getAthlete(e.athleteId);
              if (a && P.transferQuality(a) >= 70) out.suitorSamples.push(e.offers.length);
              if (e.offers.includes(g.playerSchoolId)) pursued++;
            });
          }

          // Star-signing census just before the class rolls over.
          if (g.week === window.XCD.data.CALENDAR.WEEKS_PER_YEAR) {
            const mine = Object.values(g.world.recruits)
              .filter((r) => r.signed && r.committedTo === g.playerSchoolId);
            const all5 = Object.values(g.world.recruits).filter((r) => r.signed && r.starRating === 5).length;
            out._census = {
              four: mine.filter((r) => r.starRating === 4).length,
              five: mine.filter((r) => r.starRating === 5).length,
              all5,
              total: mine.length
            };
          }
          g.advanceWeek();
        }

        // A real player spends their dynasty points every offseason.
        const coach = g.getPlayerCoach();
        if (coach && (coach.upgradePoints || 0) > 0) {
          const rng = new window.XCD.core.SeededRNG((g.seed + g.year * 131) >>> 0);
          window.XCD.engine.Awards.cpuSpendUpgradePoints(coach, rng);
        }

        // After rollover: what did the cycle produce?
        const ps = (g.history.portalSummaries || {})[yr];
        if (ps && ps.inBySchool && ps.inBySchool[g.playerSchoolId]) landed = ps.inBySchool[g.playerSchoolId].count;
        const nat = (g.history.nationalChampions || {})[yr] || {};
        const wonTitle = Object.values(nat).some((c) => c && c.teamId === g.playerSchoolId);
        const census = out._census || { four: 0, five: 0, all5: 0, total: 0 };
        out.seasons.push({
          year: yr,
          landed, pursued,
          four: census.four, five: census.five, all5: census.all5, classCount: census.total,
          wonTitle,
          prestige: g.getPlayerSchool().prestige,
          coachRec: g.getPlayerCoach().recruiting
        });
        out._census = null;
      }
    } catch (e) { out.err = e.message + '\n' + e.stack; }
    out.ms = Math.round(performance.now() - t0);

    // Star signees across the era: read the permanent star tallies from the
    // most recent classes (recruits are regenerated each year, so sample the
    // final cycle) plus world health.
    const g2 = window.XCD.ui.state.game;
    const athletes = Object.values(g2.world.athletes).filter((a) => !a.isRecruit);
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
    const champsM = new Set();
    Object.values(g2.history.nationalChampions || {}).forEach((slate) => {
      if (slate.M) champsM.add(slate.M.team);
    });
    out.world = {
      athletes: athletes.length,
      avgOvr: +avg(athletes.map((a) => a.currentOverall)).toFixed(1),
      distinctChampsM: champsM.size,
      playerPrestige: g2.getPlayerSchool().prestige
    };
    return out;
  });

  if (sim.err) {
    console.log('SIM CRASH:\n' + sim.err);
    fail('40-season sim crashed');
  } else {
    const s = sim.seasons;
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    const transfers = s.map((x) => x.landed);
    const titles = s.filter((x) => x.wonTitle).length;
    const fourPlus = s.map((x) => x.four + x.five);
    const fives = s.reduce((n, x) => n + x.five, 0);
    const allFives = s.reduce((n, x) => n + x.all5, 0);
    console.log(`40 seasons in ${(sim.ms / 1000).toFixed(1)}s`);
    console.log('seasons 1/20/40:', JSON.stringify([s[0], s[19], s[39]]));
    console.log(`transfers/season: avg ${avg(transfers).toFixed(2)} (min ${Math.min(...transfers)}, max ${Math.max(...transfers)})`);
    console.log(`player titles: ${titles}/40 • 4★+ signees/season: avg ${avg(fourPlus).toFixed(2)} • 5★ signed: ${fives} (of ${allFives} nationally)`);
    console.log(`star-transfer suitors: avg ${avg(sim.suitorSamples).toFixed(1)} (n=${sim.suitorSamples.length})`);
    console.log(`sway: ${sim.swayUses} uses, ${sim.swayBoosts} boosts (${sim.swayUses ? Math.round(sim.swayBoosts / sim.swayUses * 100) : 0}%)`);
    console.log('world:', JSON.stringify(sim.world));

    // The player should reliably land 3-6 transfers per cycle.
    if (avg(transfers) < 2.5 || avg(transfers) > 6.5) fail('avg transfers/season out of the 3-6 target band: ' + avg(transfers).toFixed(2));
    if (transfers.filter((t) => t >= 2).length < 30) fail('too many near-empty transfer cycles: ' + JSON.stringify(transfers));
    // Blue-blood recruiting: top talent is attainable — the player signs
    // 4★/5★ recruits regularly and lands genuine five-stars over the era.
    if (avg(fourPlus) < 0.8) fail('a blue-blood player should sign 4★+ recruits regularly: avg ' + avg(fourPlus).toFixed(2) + '/season');
    if (fives < 3) fail('a blue-blood player should land some five-stars across 40 seasons: ' + fives);
    // Difficulty: the player must NOT hoard everything.
    if (allFives > 0 && fives / allFives > 0.5) fail('player hoards five-stars — too easy: ' + fives + '/' + allFives);
    if (titles > 24) fail('game too easy — player won ' + titles + '/40 titles');
    if (sim.world.distinctChampsM < 4) fail('championship monopoly: ' + sim.world.distinctChampsM + " distinct men's champions");
    // Star transfers draw a real bidding war (~5 schools incl. the player).
    if (sim.suitorSamples.length && avg(sim.suitorSamples) < 3.2) fail('star transfers should draw ~5 suitors: avg ' + avg(sim.suitorSamples).toFixed(1));
    // Sway (rebuilt): flip attempts land at roughly the ~35% design rate —
    // never a sure thing, never useless.
    if (sim.swayUses >= 30) {
      const rate = sim.swayBoosts / sim.swayUses;
      if (rate < 0.12 || rate > 0.6) fail('sway flip rate outside the ~35% design band: ' + rate.toFixed(2));
    }
    // World health.
    if (sim.world.avgOvr < 40 || sim.world.avgOvr > 60) fail('rating drift after 40 seasons: ' + sim.world.avgOvr);
    if (sim.world.athletes < 8000) fail('athlete population collapsed: ' + sim.world.athletes);
  }

  // ---- 4) Save/load roundtrip keeps tutorial + portal points state ----
  const roundtrip = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    await window.XCD.engine.SaveManager.manualSave(g);
    const loaded = await window.XCD.engine.SaveManager.load(g.dynastyId);
    return {
      tutorialNull: loaded.tutorial === null || (loaded.tutorial && loaded.tutorial.pending === false),
      portalShape: !g.portal || !!(loaded.portal && loaded.portal.entries)
    };
  });
  Object.entries(roundtrip).forEach(([k, v]) => { if (!v) fail('roundtrip: ' + k); });

  // ---- 5) UI sweep after 40 seasons (portal screen included) ----
  let errBase = errors.length;
  for (const nav of ['dashboard', 'roster', 'training', 'recruiting', 'portal', 'rankings', 'history', 'school', 'news', 'saves']) {
    await page.click(`[data-nav="${nav}"]`);
    await page.waitForTimeout(140);
    if (errors.length > errBase) { console.log('ERROR ON SCREEN:', nav); errBase = errors.length; }
  }

  const all = fails.concat(errors);
  console.log(all.length ? 'FAIL\n' + all.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(all.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
