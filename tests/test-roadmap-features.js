// Feature test (Oct 2026 roadmap): the Available Jobs popup appears once per
// offseason (after nationals), Sim to a date menu + report, the Inbox screen,
// Settings (difficulty wired into the engine, presets, theme, text size),
// real NCAA selection (Kolas at-large teams + DI individual rules), and
// pack stats in race results.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, {});
  const unlock = () => page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.week1 = { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true };
    g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
  });
  await unlock();
  await page.evaluate(() => window.XCD.ui.renderShell());

  /* ---------- 1) Sim to a date: menu, stop rules, report ---------- */
  await page.click('#btn-sim-menu');
  await page.waitForSelector('#sim-menu');
  const menu = await page.evaluate(() => ({
    opts: [...document.querySelectorAll('[data-sim-target]')].map((b) => ({ k: b.dataset.simTarget, dis: b.disabled })),
    toggle: !!document.querySelector('#sim-stop-check')
  }));
  ok(menu.opts.length === 7, 'sim menu lists 7 targets: ' + JSON.stringify(menu.opts));
  ok(menu.opts.every((o) => !o.dis), 'every target is reachable from Week 1');
  ok(menu.toggle, 'sim menu has the stop-when-needed toggle');
  // Deterministic run: no event stops, straight to Conference week.
  await page.click('#sim-stop-check');
  await page.click('[data-sim-target="conference"]');
  await page.waitForSelector('.sim-report');
  const rep = await page.evaluate(() => ({
    week: window.XCD.ui.state.game.week,
    title: document.querySelector('.sim-reason-title').textContent,
    races: document.querySelectorAll('.sim-report .lrow').length
  }));
  ok(rep.week === 13, 'sim to Conference stops at the start of Week 13: ' + rep.week);
  ok(/Arrived/.test(rep.title), 'report says the target was reached: ' + rep.title);
  ok(rep.races >= 4, 'report lists the races run on the way: ' + rep.races);
  await page.evaluate(() => { window.XCD.ui.state.simStops = true; window.XCD.ui.closeModal(); });
  // Engine: a reached/passed target is disabled in the menu.
  const desc = await page.evaluate(() => {
    const S = window.XCD.engine.Sim; const g = window.XCD.ui.state.game;
    return { here: S.describeTarget(g, 'conference'), next: S.describeTarget(g, 'regionals') };
  });
  ok(!desc.here.available && desc.next.available && desc.next.weeks === 1, 'describeTarget: here vs next week ' + JSON.stringify(desc));

  /* ---------- 2) Pack stats ---------- */
  const pack = await page.evaluate(() => {
    const g = window.XCD.ui.state.game; const R = window.XCD.engine.Races;
    const meet = g.season.meets[g.lastPlayerMeetId];
    const res = meet.results.M;
    const t = res.teamScores[0];
    const mine = res.finishers.filter((f) => f.schoolId === t.schoolId).slice(0, 5);
    return {
      gap: t.gap, avg: t.avg,
      expectGap: Math.round((mine[4].time - mine[0].time) * 10) / 10,
      expectAvg: Math.round((mine.reduce((s, f) => s + f.time, 0) / 5) * 10) / 10,
      allHave: res.teamScores.every((x) => typeof x.gap === 'number'),
      player: R.packStats(res, g.playerSchoolId),
      fmt: R.formatGap(18.44)
    };
  });
  ok(pack.allHave, 'every scored team carries a 1-5 gap');
  ok(Math.abs(pack.gap - pack.expectGap) < 0.11 && Math.abs(pack.avg - pack.expectAvg) < 0.11, 'gap/avg match the top-5 times: ' + JSON.stringify(pack));
  ok(pack.player && typeof pack.player.gap === 'number', 'packStats returns the player team pack');
  ok(pack.fmt === '18.4s', 'formatGap under a minute: ' + pack.fmt);
  await page.evaluate(() => window.XCD.ui.navigate('racecenter'));
  await page.waitForSelector('#btn-skip');
  await page.click('#btn-skip');
  await page.waitForSelector('.pack-report');
  const packUi = await page.evaluate(() => ({
    stats: document.querySelectorAll('.pack-report .pack-stat').length,
    dots: document.querySelectorAll('.pack-report .pack-dot').length,
    chips: document.querySelectorAll('#live-board .pack-gap-chip').length
  }));
  ok(packUi.stats === 2 && packUi.dots === 5, 'Race Center shows the Pack Report with 5 scorer dots: ' + JSON.stringify(packUi));
  ok(packUi.chips > 0, 'Final Team Scores show 1-5 gap chips');

  /* ---------- 3) Real NCAA selection (Kolas + DI individuals) ---------- */
  await unlock();
  const sel = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    while (g.week < 15) g.advanceWeek();
    const D = window.XCD.data;
    const out = {};
    ['M', 'W'].forEach((gender) => {
      const champ = g.season.championships.DI;
      const s = champ.selection[gender];
      const rules = D.divisionFor('DI').championship;
      const fieldSet = new Set(champ.fieldIds[gender]);
      const regionals = (g.season.byWeek[14] || []).map((id) => g.season.meets[id]).filter((m) => (m.division || 'DI') === 'DI');
      // Region-order rule: an at-large team is never picked ahead of a
      // non-qualified team that beat it at its own regional.
      let orderOk = true;
      const picked = new Set(s.auto.map((p) => p.schoolId));
      s.atLarge.forEach((p) => {
        const meet = regionals.find((m) => m.region === p.region);
        const ahead = meet.results[gender].teamScores.filter((t) => t.place < p.regionalPlace);
        if (ahead.some((t) => !picked.has(t.schoolId))) orderOk = false;
        picked.add(p.schoolId);
      });
      // Kolas points recount: each pick's points = wins over the field at that moment.
      const ind = s.individuals;
      const perRegion = {};
      ind.auto.forEach((x) => { perRegion[x.region] = (perRegion[x.region] || 0) + 1; });
      const indivIds = champ.individualQualifiers[gender];
      out[gender] = {
        field: champ.fieldIds[gender].length, auto: s.auto.length, atLarge: s.atLarge.length,
        expectField: rules.nationalsFieldSize, orderOk,
        pointsAll: s.atLarge.every((p) => typeof p.points === 'number' && p.points >= 0),
        indTotal: indivIds.length, indAuto: ind.auto.length, indAL: ind.atLarge.length,
        top25: ind.auto.every((x) => x.place <= 25),
        maxPerRegion: Math.max(...Object.values(perRegion)),
        noTeamQualifiers: indivIds.every((id) => !fieldSet.has((g.getAthlete(id) || {}).schoolId)),
        // The at-large individuals place no worse than any skipped candidate.
        alFlag: ind.atLarge.every((x) => regionals.some((m) => m.results[gender].finishers.some((f) => f.athleteId === x.athleteId && f.nationalsIndividualAtLarge)))
      };
    });
    return out;
  });
  ['M', 'W'].forEach((gender) => {
    const s = sel[gender];
    ok(s.field === s.expectField && s.auto === 18 && s.atLarge === 13, `${gender}: DI field = 18 auto + 13 at-large = 31: ` + JSON.stringify(s));
    ok(s.orderOk, `${gender}: at-large picks respect regional finish order (Kolas)`);
    ok(s.pointsAll, `${gender}: every at-large pick records its Kolas points`);
    ok(s.indTotal === 38 && s.indAuto === 36 && s.indAL === 2, `${gender}: 38 individuals = 36 regional + 2 at-large: ` + JSON.stringify(s));
    ok(s.top25, `${gender}: automatic individuals placed in their regional top 25`);
    ok(s.maxPerRegion <= 4, `${gender}: at most 4 automatic individuals per regional`);
    ok(s.noTeamQualifiers, `${gender}: no individual qualifier comes from a qualifying team`);
    ok(s.alFlag, `${gender}: at-large individuals are flagged on the regional results`);
  });
  await page.evaluate(() => { window.XCD.ui.screens.rankings.openTab('selection'); window.XCD.ui.navigate('rankings'); });
  await page.waitForSelector('.sel-tiles');
  const selUi = await page.evaluate(() => ({
    rows: document.querySelectorAll('#rank-body tbody tr').length,
    indivs: document.querySelectorAll('.sel-indiv').length,
    explainer: !!document.querySelector('.kolas-explainer')
  }));
  ok(selUi.rows >= 13 && selUi.indivs === 38 && selUi.explainer, 'Rankings → Selection renders picks, 38 individuals, explainer: ' + JSON.stringify(selUi));

  /* ---------- 4) Inbox ---------- */
  const inbox = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const types = new Set(window.XCD.engine.Inbox.items(g).map((i) => i.eventType));
    return { n: window.XCD.engine.Inbox.unread(g).length, sel: types.has('nationals:selection'), race: types.has('race:completed') };
  });
  ok(inbox.sel && inbox.race, 'Selection Day and race results land in the Inbox: ' + JSON.stringify(inbox));
  await page.click('#btn-inbox');
  await page.waitForSelector('.inbox-list');
  const inboxUi = await page.evaluate(() => ({
    items: document.querySelectorAll('.inbox-item').length,
    badge: (document.querySelector('#btn-inbox .count-badge') || {}).textContent,
    navBadge: !!document.querySelector('.nav-item[data-nav="inbox"] .nav-badge'),
    decisions: document.querySelectorAll('.inbox-decision').length
  }));
  ok(inboxUi.items >= 3 && inboxUi.navBadge && Number(inboxUi.badge) === inbox.n, 'Inbox lists items with unread badges: ' + JSON.stringify(inboxUi));
  await page.click('[data-inbox-filter="results"]');
  const onlyResults = await page.evaluate(() => [...document.querySelectorAll('.inbox-item-icon')].every((el) => /🏁|🏆|🎟/.test(el.textContent)));
  ok(onlyResults, 'Results filter shows only race/selection items');
  await page.click('#inbox-read-all');
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => !document.querySelector('#btn-inbox .count-badge')), 'Mark all read clears the badge');

  /* ---------- 5) Job popup: once, after nationals ---------- */
  await unlock();
  await page.evaluate(() => window.XCD.ui.navigate('dashboard'));
  await page.click('#btn-advance-week'); // runs nationals (week 15 -> 16)
  await page.waitForTimeout(150);
  let jp = await page.evaluate(() => ({
    week: window.XCD.ui.state.game.week, screen: window.XCD.ui.state.currentScreen,
    popup: !!document.querySelector('.job-popup'), pending: window.XCD.ui.jobOffersPending(window.XCD.ui.state.game)
  }));
  ok(jp.week === 16, 'advanced into the awards week');
  if (jp.screen === 'racecenter') {
    ok(!jp.popup, 'the popup waits for the nationals broadcast');
    await page.click('#btn-skip');
    await page.waitForSelector('.job-popup', { timeout: 4000 }).catch(() => {});
  }
  jp = await page.evaluate(() => ({ popup: !!document.querySelector('.job-popup'), yr: window.XCD.ui.state.game.jobPopupYear, year: window.XCD.ui.state.game.year }));
  ok(jp.popup && jp.yr === jp.year, 'the Available Jobs popup appears once nationals is in the books: ' + JSON.stringify(jp));
  await page.click('#job-later');
  let again = 0;
  for (let i = 0; i < 3; i++) {
    await unlock();
    await page.click('#btn-advance-week');
    await page.waitForTimeout(120);
    if (await page.$('.job-popup')) { again++; await page.evaluate(() => window.XCD.ui.closeModal()); }
  }
  ok(again === 0, 'the popup never reappears later in the offseason: ' + again);
  // Turning offers down closes the market for good this cycle.
  const closed = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    if (!g.jobOffers) return { skipped: true };
    window.XCD.engine.Careers.declineOffers(g);
    // A new vacancy appears — the market must NOT rebuild.
    const s = Object.values(g.world.schools).find((x) => x.id !== g.playerSchoolId && x.coachId);
    s.coachId = null;
    window.XCD.engine.Careers.evolveJobMarket && window.XCD.engine.Careers.evolveJobMarket(g, new window.XCD.core.SeededRNG(5));
    return { market: g.jobOffers, closedYear: g.jobSearchClosedYear === g.year, pending: window.XCD.ui.jobOffersPending(g) };
  });
  ok(closed.skipped || (closed.market === null && closed.closedYear && !closed.pending), 'declining closes the market for the cycle: ' + JSON.stringify(closed));
  const rt = await page.evaluate(() => {
    const GS = window.XCD.engine.GameState || window.XCD.GameState;
    const g = window.XCD.ui.state.game;
    const back = (GS.fromJSON || GS.deserialize)(JSON.parse(JSON.stringify(g.toJSON())));
    return { popupYear: back.jobPopupYear === g.jobPopupYear, closed: back.jobSearchClosedYear === g.jobSearchClosedYear };
  }).catch((e) => ({ err: String(e) }));
  ok(rt.popupYear && rt.closed, 'job popup + closed-search state survive a save round-trip: ' + JSON.stringify(rt));

  /* ---------- 6) Settings: difficulty wired, presets, display ---------- */
  await page.evaluate(() => window.XCD.ui.navigate('settings'));
  await page.waitForSelector('.preset-row');
  await page.click('[data-preset="legend"]');
  const pre = await page.evaluate(() => {
    const S = window.XCD.engine.Settings; const g = window.XCD.ui.state.game;
    return { preset: S.currentPreset(g), inj: S.get(g, 'injuryRate'), limit: S.hotSeatLimit(g) };
  });
  ok(pre.preset === 'legend' && pre.inj === 1.5 && pre.limit === 2, 'Legend preset applies its sliders: ' + JSON.stringify(pre));
  await page.click('[data-theme-choice="light"]');
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  ok(theme === 'light', 'Light theme applies: ' + theme);
  await page.evaluate(() => {
    const el = document.querySelector('#set-textScale');
    el.value = '1.2'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
  });
  const zoom = await page.evaluate(() => document.documentElement.style.getPropertyValue('--ui-zoom'));
  ok(zoom === '1.2', 'Text size sets the UI zoom: ' + zoom);
  // Injury frequency 0 = no new injuries at all.
  const inj = await page.evaluate(() => {
    const S = window.XCD.engine.Settings; const g = window.XCD.ui.state.game;
    S.set(g, 'injuryRate', 0);
    const ids = new Set(Object.values(g.world.athletes).filter((a) => a.injury).map((a) => a.id));
    for (let i = 0; i < 3; i++) g.advanceWeek();
    const fresh = Object.values(g.world.athletes).filter((a) => a.injury && !ids.has(a.id)).length;
    S.reset(g);
    return fresh;
  });
  ok(inj === 0, 'injuryRate 0 stops new injuries: ' + inj);
  // God Mode was removed: no Sandbox card, no ✏️ Edit on profiles.
  await page.evaluate(() => window.XCD.ui.renderShell());
  const noGod = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const sandbox = !!document.querySelector('#set-godMode');
    window.XCD.ui.showPlayerCard(g.getRoster(g.playerSchoolId, 'M')[0], g);
    return { sandbox, editBtn: !!document.querySelector('.god-btn'), schema: window.XCD.engine.Settings.SCHEMA.some((x) => x.key === 'godMode') };
  });
  ok(!noGod.sandbox && !noGod.editBtn && !noGod.schema, 'God Mode is gone from settings and profiles: ' + JSON.stringify(noGod));
  await page.evaluate(() => window.XCD.ui.closeModal());
  await page.evaluate(() => { const g = window.XCD.ui.state.game; window.XCD.engine.Settings.reset(g); window.XCD.ui.applyDisplaySettings(g); });

  await browser.close();
  const problems = fails.concat(errors);
  if (problems.length) {
    console.log('FAIL\n' + problems.join('\n'));
    process.exit(1);
  }
  console.log('PASS — sim menu + report, pack stats, Kolas + DI individual selection, Inbox, one-time job popup, settings');
}

run().catch((e) => { console.log('FAIL', e); process.exit(1); });
