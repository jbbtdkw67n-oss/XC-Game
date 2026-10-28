// Clean UI pass: every screen title is its menu label (no emoji), long
// screens group cards under section labels, tables use the shared column
// helpers, and the Awards / Champions screens (History + News) render the
// shared honor tiles with clean conference / regional tables.
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

  /* ---------- 1) Screen titles match the menu ---------- */
  const titles = await page.evaluate(async () => {
    const UI = window.XCD.ui;
    const out = [];
    for (const n of UI.NAV_ITEMS) {
      UI.navigate(n.id);
      await new Promise((r) => setTimeout(r, 60)); // Save / Load renders after reading saves
      const h1 = document.querySelector('#screen-container .screen-header h1');
      out.push({ id: n.id, label: n.label, h1: h1 ? h1.textContent.trim() : null });
    }
    return out;
  });
  const bad = titles.filter((t) => t.h1 !== t.label);
  ok(!bad.length, 'every screen title equals its menu label: ' + JSON.stringify(bad));
  ok(titles.every((t) => t.h1 && !/\p{Extended_Pictographic}/u.test(t.h1)), 'no emoji in screen titles');

  /* ---------- 2) Section labels on long screens ---------- */
  const sections = await page.evaluate(() => {
    const UI = window.XCD.ui;
    const labels = (id) => { UI.navigate(id); return [...document.querySelectorAll('#screen-container .section-label')].map((e) => e.textContent.trim()); };
    return { dashboard: labels('dashboard'), school: labels('school'), schedule: labels('schedule'), training: labels('training') };
  });
  ok(['Program', 'Season', 'Squad', 'Latest News'].every((l) => sections.dashboard.includes(l)), 'Dashboard is grouped into sections: ' + sections.dashboard);
  ok(sections.school.length >= 3, 'My Program is grouped into sections: ' + sections.school);
  ok(sections.schedule.includes('Your Season'), 'Schedule is grouped into sections: ' + sections.schedule);
  ok(sections.training.length >= 3, 'Training is grouped into sections: ' + sections.training);

  /* ---------- 3) Table columns ---------- */
  await page.evaluate(() => window.XCD.engine.SaveManager.manualSave(window.XCD.ui.state.game));
  const tables = await page.evaluate(async () => {
    const UI = window.XCD.ui;
    UI.navigate('rankings');
    const poll = document.querySelector('#screen-container table.data');
    const heads = poll ? [...poll.querySelectorAll('thead th')].map((th) => th.textContent.trim()) : [];
    UI.navigate('saves');
    await new Promise((r) => setTimeout(r, 150));
    const wrap = document.querySelector('#screen-container .table-wrap');
    const del = document.querySelector('[data-del]');
    return {
      heads,
      savesFit: !!(wrap && del && del.getBoundingClientRect().right <= wrap.getBoundingClientRect().right + 1)
    };
  });
  ok(tables.heads.length && tables.heads.every((h) => h), 'the poll table has no blank header column: ' + tables.heads.join('|'));
  ok(tables.savesFit, 'Save / Load row actions fit inside the table');

  /* ---------- 4) Awards + Champions after a season ---------- */
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game; const y = g.year;
    while (g.year === y) {
      if (g.week1) Object.assign(g.week1, { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true });
      g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
      g.advanceWeek();
    }
    window.XCD.ui.navigate('history');
  });
  await page.click('[data-tab="champions"]');
  await page.waitForTimeout(80);
  const champ = await page.evaluate(() => {
    const details = [...document.querySelectorAll('details.honor-details')];
    details.forEach((d) => { d.open = true; d.dispatchEvent(new Event('toggle')); });
    return {
      tiles: document.querySelectorAll('.honor-tile').length,
      team: !!document.querySelector('.honor-body[data-school]'),
      indiv: !!document.querySelector('.honor-body[data-ath]'),
      details: details.length
    };
  });
  await page.waitForTimeout(80);
  const champTables = await page.evaluate(() => document.querySelectorAll('details.honor-details table.data').length);
  ok(champ.tiles >= 4 && champ.team && champ.indiv, 'Champions shows team + individual honor tiles: ' + JSON.stringify(champ));
  ok(champ.details >= 2 && champTables >= 2, 'regional + conference champions open as clean tables: ' + champTables);
  await page.click('.honor-body[data-school]');
  await page.waitForTimeout(80);
  ok(await page.$('#active-modal'), 'a champion team tile opens the school profile');
  await page.evaluate(() => window.XCD.ui.closeModal());

  await page.click('[data-tab="awards"]');
  await page.waitForTimeout(80);
  const aw = await page.evaluate(() => {
    const d = document.querySelector('details.honor-details');
    if (d) { d.open = true; d.dispatchEvent(new Event('toggle')); }
    const labels = [...document.querySelectorAll('.honor-label')].map((e) => e.textContent.trim());
    return {
      roy: labels.filter((l) => l === 'Runner of the Year').length,
      coy: labels.filter((l) => l === 'Coach of the Year').length,
      aa: document.querySelectorAll('.pcard').length
    };
  });
  await page.waitForTimeout(80);
  const awTable = await page.evaluate(() => document.querySelectorAll('details.honor-details table.data tbody tr').length);
  ok(aw.roy === 2 && aw.coy === 2 && aw.aa >= 6, 'History Awards shows honor tiles + All-American cards: ' + JSON.stringify(aw));
  ok(awTable > 5, 'conference awards open as a table, one row per conference: ' + awTable);

  await page.evaluate(() => window.XCD.ui.navigate('news'));
  await page.click('[data-ntab="awards"]');
  await page.waitForTimeout(80);
  const news = await page.evaluate(() => ({
    tiles: document.querySelectorAll('#news-body .honor-tile').length,
    cards: document.querySelectorAll('#news-body .pcard').length
  }));
  ok(news.tiles >= 3 && news.cards >= 10, 'News Awards uses the same honor tiles: ' + JSON.stringify(news));

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.log('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS — clean UI (titles, sections, tables, awards, champions)');
}

run().catch((e) => { console.log('FAIL', e); process.exit(1); });
