// Update 28: drop-downs that survive Safari, and a coach History tab that
// doesn't pile up on touch screens.
// Verifies:
//   - No <select> is destroyed by its own change event (WebKit / the iPhone
//     app crashes the page when that happens): the card-list "Sort by" box
//     (Roster, World, Course Records at phone width) and the News → Awards
//     conference picker each keep their element and still re-sort / redraw
//   - Every drop-down option on those screens runs without a page error
//   - On a touchscreen, a coach's Season-by-Season rows keep their full
//     height inside the scrolling list instead of squeezing to 40px
//   - The first-season tutorial walks every step, and the origin story no
//     longer names a state
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const errors = [];

  // Touch tablet context: the 40px touch targets apply (coarse pointer).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true });
  const page = await ctx.newPage();
  wireErrors(page, errors);
  page.setDefaultTimeout(600000);
  await page.addInitScript(() => {
    window.__selDestroyed = [];
    window.addEventListener('change', (e) => {
      const t = e.target;
      if (t && t.tagName === 'SELECT' && !t.isConnected) {
        window.__selDestroyed.push((t.id || (t.hasAttribute('data-sort-select') ? 'sort' : t.className)) + ' @' + window.XCD.ui.state.currentScreen);
      }
    });
  });

  // ---- 1) The tutorial, from the origin story to the last step ----
  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  await page.click('#btn-new');
  await require('./helpers').walkCoachWizard(page, {});
  await page.waitForSelector('.school-pick');
  await page.click('.school-pick');
  await page.click('#btn-start');
  await page.waitForSelector('#tut-begin');
  const story = await page.textContent('.tutorial-story-text');
  ok(/at a small high school you decide/.test(story || ''), 'origin story should read "at a small high school": ' + story);
  ok(!/Kansas/.test(story || ''), 'origin story must not name a state');
  await page.click('#tut-begin');
  await page.click('#tut-start');
  const titles = [];
  for (let i = 0; i < 30 && await page.$('#tut-next'); i++) {
    titles.push(await page.textContent('.tutorial-card h2'));
    await page.click('#tut-next');
    await page.waitForTimeout(30);
    if (!(await page.$('#tutorial-overlay'))) break;
  }
  ok(!(await page.$('#tutorial-overlay')), 'tutorial should close after its last step');
  const expectSteps = await page.evaluate(() => window.XCD.ui.tutorial.STEPS.length);
  ok(titles.length === expectSteps, `walked ${titles.length} of ${expectSteps} tutorial steps`);
  for (const t of ['Week 1: Season Setup', 'One Peak Per Season', 'Your Roster & Race-Day Top 7', 'Expectations & Your Job', 'The Offseason']) {
    ok(titles.includes(t), 'tutorial is missing the step: ' + t);
  }
  const tipKeys = await page.evaluate(() => Object.keys(window.XCD.ui.tutorial.TIPS));
  const navIds = await page.evaluate(() => window.XCD.ui.NAV_ITEMS.map((n) => n.id));
  const untipped = navIds.filter((id) => !tipKeys.includes(id));
  ok(!untipped.length, 'every menu screen should have a first-season tip; missing: ' + untipped.join(', '));

  // ---- 2) One finished season (awards + coach history), then mid-season ----
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const step = () => {
      if (g.week1) Object.assign(g.week1, { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true });
      g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
      g.advanceWeek();
    };
    const y = g.year;
    let guard = 0;
    while (g.year === y && guard++ < 80) step();
    guard = 0;
    while (g.week < 14 && guard++ < 30) step();
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.parentNode.removeChild(m));
    window.XCD.ui.renderShell();
  });

  // ---- 3) Coach History tab: rows keep their height on a touchscreen ----
  const rows = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // A long-tenured CPU head coach has the longest Season-by-Season list.
    const c = Object.values(g.world.coaches)
      .filter((x) => x.schoolId && x.role !== 'Assistant' && (x.stints || []).length)
      .sort((a, b) => Math.min(...a.stints.map((s) => s.startYear)) - Math.min(...b.stints.map((s) => s.startYear)))[0];
    window.XCD.ui.showCoachCard(c, g);
    document.querySelector('[data-pctab="history"]').click();
    const list = document.querySelector('[data-pcpane="history"] .lrow-scroll');
    if (!list) return null;
    const rs = [...list.querySelectorAll(':scope > .lrow')];
    const squashed = rs.filter((r) => r.getBoundingClientRect().height + 1 < r.scrollHeight).length;
    const out = { count: rs.length, squashed, overflowing: list.scrollHeight > list.clientHeight };
    window.XCD.ui.closeModal();
    return out;
  });
  ok(rows && rows.count >= 2, 'a coach Season-by-Season list should render: ' + JSON.stringify(rows));
  ok(rows && rows.squashed === 0, 'Season-by-Season rows must not be squeezed below their content: ' + JSON.stringify(rows));

  // ---- 4) Drop-downs at phone width: every option, no self-destroying select ----
  await page.setViewportSize({ width: 390, height: 844 });
  const exercised = [];
  const run1 = async (screen, selector, prep) => {
    await page.evaluate((s) => window.XCD.ui.navigate(s), screen);
    await page.waitForTimeout(120);
    if (prep) await prep();
    const sel = await page.$(selector);
    if (!sel) { fails.push(`${screen}: no ${selector}`); return; }
    const values = await sel.evaluate((s) => [...s.options].filter((o) => !o.disabled).map((o) => o.value));
    for (const v of values) {
      await page.selectOption(selector, v);
      await page.waitForTimeout(40);
    }
    // The element survives its own changes and still drives the list.
    const same = await page.evaluate((el) => el.isConnected, sel);
    ok(same, `${screen}: ${selector} was replaced after a change`);
    exercised.push(`${screen} ${selector} ×${values.length}`);
  };
  await run1('roster', '[data-sort-select]');
  await run1('world', '[data-sort-select]');
  await run1('courses', '[data-sort-select]');
  await run1('news', '#award-conf', async () => {
    await page.click('[data-ntab="awards"]');
    await page.waitForTimeout(80);
    await page.click('[data-ascope="conference"]');
    await page.waitForTimeout(80);
  });
  // Sorting really re-sorts: pick a column and read the card order.
  const sorted = await page.evaluate(async () => {
    window.XCD.ui.navigate('world');
    await new Promise((r) => setTimeout(r, 80));
    const sel = document.querySelector('[data-sort-select]');
    const order = () => [...document.querySelectorAll('[data-cards-body] .m-card')].slice(0, 8).map((c) => c.textContent).join('|');
    const before = order();
    let changed = false;
    let stillThere = true;
    for (const o of [...sel.options]) {
      if (o.value === sel.value) continue;
      sel.value = o.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      stillThere = stillThere && sel.isConnected;
      await new Promise((r) => setTimeout(r, 60));
      if (order() !== before) { changed = true; break; }
    }
    return { changed, stillThere, kept: document.querySelector('[data-sort-select]') === sel };
  });
  ok(sorted.stillThere && sorted.kept, 'the Sort by box must be kept, not rebuilt: ' + JSON.stringify(sorted));
  ok(sorted.changed, 'changing Sort by should re-sort the cards: ' + JSON.stringify(sorted));

  const destroyed = await page.evaluate(() => window.__selDestroyed);
  ok(!destroyed.length, 'selects destroyed by their own change event: ' + JSON.stringify(destroyed));

  console.log('Tutorial steps:', titles.length, '| coach history rows:', JSON.stringify(rows));
  console.log('Exercised:', exercised.join(', '));
  await browser.close();
  if (errors.length) fails.push('page errors:\n' + errors.slice(0, 5).join('\n'));
  if (fails.length) {
    console.log('FAIL\n' + fails.join('\n'));
    process.exit(1);
  }
  console.log('PASS');
}

run().catch((e) => { console.error(e); process.exit(1); });
