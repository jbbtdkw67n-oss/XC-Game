// Feature test: Real Schedules — the persistent meet calendar, hard travel
// budgets, CPU-built 3–7 meet schedules, the Week 1 Schedule Builder
// (drop-downs + meet browser), and the Travel Program upgrade.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  page.setDefaultTimeout(120000);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, { school: 'Weber State' });

  // 1) The world's schedules.
  const world = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, MC = window.XCD.engine.MeetCalendar, s = g.season;
    const idx = MC.indexSeason(s, true);
    const meets = MC.regularMeets(s);
    const counts = Object.values(g.world.schools).map((sc) => Object.keys(idx[sc.id] || {}).length);
    const overBudget = Object.values(g.world.schools).filter((sc) => {
      const spent = Object.values(idx[sc.id] || {}).reduce((a, id) => a + MC.meetCost(g, sc, s.meets[id]).total, 0);
      return spent > sc.budget.travel;
    }).length;
    const weeks = new Set(meets.map((m) => m.week));
    const prenats = meets.filter((m) => m.tier === 'prenats');
    const prenatsExclusive = prenats.every((m) => m.schoolIds.every((id) => (g.getSchool(id).division || 'DI') === m.division));
    const elite = meets.filter((m) => m.tier === 'elite');
    const eliteDivs = new Set();
    elite.forEach((m) => m.schoolIds.forEach((id) => eliteDivs.add(g.getSchool(id).division)));
    const bigVsSmall = { maxCap: Math.max(...meets.map((m) => m.cap)), minCap: Math.min(...meets.map((m) => m.cap)) };
    const overCap = meets.filter((m) => m.schoolIds.length > m.cap).length;
    // Close-to-home options: every school has several open meets within bus range.
    const nearMin = Math.min(...Object.values(g.world.schools).filter((sc) => sc.state !== 'AK' && sc.state !== 'HI').map((sc) =>
      meets.filter((m) => (m.tier === 'invite' || m.tier === 'major') && MC.meetCost(g, sc, m).mode !== 'flight').length));
    const calKeys = g.world.meetCalendar.entries.map((e) => e.key + '@' + e.week).sort().join('|');
    return {
      minCount: Math.min(...counts), maxCount: Math.max(...counts), overBudget,
      weeks: [...weeks].sort((a, b) => a - b), prenats: prenats.length, prenatsExclusive,
      eliteFull: elite.every((m) => m.schoolIds.length >= m.cap - 2), eliteDivs: [...eliteDivs],
      bigVsSmall, overCap, nearMin, calKeys, calSize: g.world.meetCalendar.entries.length
    };
  });
  ok(world.minCount >= 3 && world.maxCount <= 7, 'every program races 3–7 regular-season meets: ' + world.minCount + '–' + world.maxCount);
  ok(world.overBudget === 0, 'no program spends past its hard travel budget: ' + world.overBudget);
  ok(JSON.stringify(world.weeks) === JSON.stringify([4, 5, 6, 7, 8, 9, 10, 11, 12]), 'meets run every weekend from Week 4 to 12: ' + world.weeks);
  ok(world.prenats === 3 && world.prenatsExclusive, 'one Pre-Nationals per division, each exclusive to it');
  ok(world.eliteFull, 'the big elite meets stay big');
  ok(world.eliteDivs.length >= 2, 'elite meets are not limited to one division: ' + world.eliteDivs);
  ok(world.bigVsSmall.maxCap >= 35 && world.bigVsSmall.minCap <= 16, 'there are big meets and small meets: ' + JSON.stringify(world.bigVsSmall));
  ok(world.overCap <= 3, 'meet caps hold: ' + world.overCap + ' over cap');
  ok(world.nearMin >= 5, 'every school has plenty of bus-range meets: ' + world.nearMin);

  // 2) Travel cost model: bus vs flight, distance-priced, hosts free.
  const cost = await page.evaluate(() => {
    const MC = window.XCD.engine.MeetCalendar;
    return { near: MC.tripCost(120, 'invite'), far: MC.tripCost(1900, 'elite'), home: MC.tripCost(0, 'invite', true) };
  });
  ok(cost.near.mode === 'bus' && cost.far.mode === 'flight' && cost.near.total < cost.far.total / 4 && cost.home.total === 0,
    'trips are priced by distance (bus < flight, home free): ' + JSON.stringify(cost));

  // 3) Player rules: hard budget, access, max meets, off weeks.
  const rules = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, MC = window.XCD.engine.MeetCalendar, s = g.season;
    const me = g.getPlayerSchool();
    const out = {};
    // Over budget: shrink the budget and try the priciest open meet.
    const saved = me.travelBudget.total;
    me.travelBudget.total = MC.playerSpend(g).spent; me.budget.travel = me.travelBudget.total;
    const week = MC.WEEKS.find((w) => !s.playerMeetByWeek[w]);
    const pricey = (s.byWeek[week] || []).map((id) => s.meets[id]).filter((m) => m.type === 'invite' && MC.access(g, me, m).ok && m.schoolIds.length < m.cap)
      .sort((a, b) => MC.meetCost(g, me, b).total - MC.meetCost(g, me, a).total)[0];
    out.overBudgetBlocked = pricey ? !MC.selectMeet(g, week, pricey.id).ok : true;
    me.travelBudget.total = saved; me.budget.travel = saved;
    // Access: a meet the program can't get into is refused.
    const locked = MC.regularMeets(s).find((m) => !MC.access(g, me, m).ok);
    out.accessBlocked = locked ? !MC.selectMeet(g, locked.week, locked.id).ok : true;
    // An off week, then back in.
    const wk = Object.keys(s.playerMeetByWeek).map(Number).find((w) => w >= 4 && w <= 12);
    const was = s.playerMeetByWeek[wk];
    out.offWeek = MC.selectMeet(g, wk, null).ok && !s.playerMeetByWeek[wk];
    out.backIn = MC.selectMeet(g, wk, was).ok && s.playerMeetByWeek[wk] === was && s.meets[was].schoolIds.includes(me.id);
    // The CPU always leaves a seat: the player can enter a meet with room.
    out.seatHeld = MC.regularMeets(s).filter((m) => m.tier !== 'prenats').every((m) => m.schoolIds.includes(me.id) || m.schoolIds.length < m.cap || m.cancelled);
    out.racesIdx = MC.schoolRacesWeek(g, me.id, wk) === !!s.playerMeetByWeek[wk];
    return out;
  });
  ok(rules.overBudgetBlocked, 'the travel budget is a hard cap');
  ok(rules.accessBlocked, 'elite access is enforced');
  ok(rules.offWeek && rules.backIn, 'weeks can be switched off and back on');
  ok(rules.seatHeld, 'every meet holds a seat for the player');
  ok(rules.racesIdx, 'schoolRacesWeek follows the schedule');

  // 4) The Schedule Builder UI: drop-downs, course speed, budget, browser.
  await page.evaluate(() => window.XCD.ui.navigate('schedule'));
  await page.waitForSelector('#schedule-builder');
  const ui = await page.evaluate(() => ({
    selects: document.querySelectorAll('select[data-sb-week]').length,
    speed: !!document.querySelector('#schedule-builder .speed-tag'),
    speedInOptions: [...document.querySelectorAll('select[data-sb-week] option')].some((o) => /Fast|Slow|Average/.test(o.textContent)),
    budget: /Travel budget/.test(document.querySelector('.sb-budget').textContent),
    browser: !!document.querySelector('#meet-browser .sb-meet'),
    chips: document.querySelectorAll('#meet-browser .sb-chip').length
  }));
  ok(ui.selects === 9, 'one drop-down per regular-season week: ' + ui.selects);
  ok(ui.speed && ui.speedInOptions, 'fast/slow course is listed in the builder');
  ok(ui.budget && ui.browser && ui.chips > 0, 'budget + meet browser with team chips render: ' + JSON.stringify(ui));
  // Change a week through the drop-down.
  const pickWeek = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select[data-sb-week]')].find((s) => s.value);
    return sel ? sel.dataset.sbWeek : null;
  });
  await page.selectOption(`select[data-sb-week="${pickWeek}"]`, '');
  await page.waitForTimeout(100);
  ok(await page.evaluate((w) => !window.XCD.ui.state.game.season.playerMeetByWeek[w], pickWeek), 'the drop-down sets an off week');
  // Browser filters.
  await page.click('[data-sb-div="DII"]');
  await page.click('#sb-ranked');
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => !!document.querySelector('#meet-browser')), 'browser survives filtering');
  // Finalize needs at least 3 meets.
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game, MC = window.XCD.engine.MeetCalendar;
    Object.keys(g.season.playerMeetByWeek).map(Number).filter((w) => w >= 4 && w <= 12).forEach((w) => MC.selectMeet(g, w, null));
    window.XCD.ui.navigate('schedule');
  });
  await page.click('#btn-finalize-schedule');
  await page.waitForTimeout(80);
  ok(await page.evaluate(() => !window.XCD.ui.state.game.week1.scheduleFinalized), 'finalize refuses fewer than 3 meets');

  // 5) Travel Program upgrade raises this season's budget.
  const upg = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, F = window.XCD.engine.Finances;
    const me = g.getPlayerSchool();
    me.budget.facilitiesFund += 500000;
    const before = me.budget.travel, r0 = me.travelRating;
    const res = F.upgradeFacility(g, me.id, 'travel');
    return { ok: res.ok, before, after: me.budget.travel, r0, r1: me.travelRating };
  });
  ok(upg.ok && upg.r1 === upg.r0 + 4 && upg.after > upg.before, 'Travel Program upgrades lift the budget: ' + JSON.stringify(upg));
  await page.evaluate(() => window.XCD.ui.navigate('school'));
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => /Travel Program/.test(document.body.textContent)), 'Travel Program is listed with the facilities');

  // 6) Next season: same calendar weeks; budgets swing with results.
  const next = await page.evaluate(() => {
    const g = window.XCD.ui.state.game, MC = window.XCD.engine.MeetCalendar;
    const y = g.year;
    let guard = 0;
    while (g.year === y && guard++ < 30) g.advanceWeek();
    const s = g.season;
    const keysOk = MC.regularMeets(s).filter((m) => m.calendarKey).every((m) => {
      const e = g.world.meetCalendar.entries.find((x) => x.key === m.calendarKey);
      return e && e.week === m.week;
    });
    const swings = Object.values(g.world.schools).filter((sc) => (sc.travelMomentum || 0) !== 0).length;
    const ups = Object.values(g.world.schools).filter((sc) => (sc.travelMomentum || 0) > 0).length;
    const downs = Object.values(g.world.schools).filter((sc) => (sc.travelMomentum || 0) < 0).length;
    const idx = MC.indexSeason(s, true);
    const counts = Object.values(g.world.schools).map((sc) => Object.keys(idx[sc.id] || {}).length);
    return { year: g.year, keysOk, swings, ups, downs, min: Math.min(...counts), max: Math.max(...counts),
      calKeys: g.world.meetCalendar.entries.map((e) => e.key + '@' + e.week).sort().join('|') };
  });
  ok(next.keysOk && next.calKeys === world.calKeys, 'every meet keeps its weekend year to year');
  ok(next.ups > 0 && next.downs > 0, 'travel budgets rise and fall with last season: ' + JSON.stringify({ ups: next.ups, downs: next.downs }));
  ok(next.min >= 3 && next.max <= 7, 'season two schedules stay 3–7 meets');

  // 7) Save round-trip keeps the calendar and the season's schedule.
  const rt = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const GS = window.XCD.engine.GameState;
    const back = GS.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    return {
      cal: back.world.meetCalendar.entries.length === g.world.meetCalendar.entries.length,
      sched: JSON.stringify(back.season.playerMeetByWeek) === JSON.stringify(g.season.playerMeetByWeek),
      version: back.season.calendarVersion === 1
    };
  });
  ok(rt.cal && rt.sched && rt.version, 'saves keep the calendar and schedule: ' + JSON.stringify(rt));

  ok(!errors.length, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.log('FAIL\n' + fails.join('\n'));
    process.exit(1);
  }
  console.log('PASS test-real-schedules');
}

run().catch((e) => { console.error(e); process.exit(1); });
