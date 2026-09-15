// Course records must start BLANK (no auto-seeded historical marks) and be set
// by the runners themselves — the first athlete to race a course sets its
// opening record.
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

  // 1) At dynasty start: named courses are registered (browsable) but hold NO
  //    records at all — and nothing is flagged as a seeded/historic mark.
  const start = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const book = g.history.courseRecords || {};
    const entries = Object.values(book);
    let recordCount = 0, seeded = 0;
    entries.forEach((e) => Object.values(e.records || {}).forEach((r) => {
      recordCount++;
      if (r.seeded) seeded++;
    }));
    return { courses: entries.length, recordCount, seeded };
  });
  ok(start.recordCount === 0, 'course records must start completely blank: ' + JSON.stringify(start));
  ok(start.seeded === 0, 'no course record may be a seeded/historic mark: ' + start.seeded);

  // 2) After a full season of racing, course records exist — and every one was
  //    set by a real runner (a real athlete id, never a seeded mark).
  const after = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    let err = null;
    try { for (let w = 0; w < weeks; w++) g.advanceWeek(); } catch (e) { err = e.message + '\n' + (e.stack || '').slice(0, 300); }
    const book = g.history.courseRecords || {};
    let recordCount = 0, seeded = 0, noAthlete = 0, withHolder = 0;
    Object.values(book).forEach((e) => Object.values(e.records || {}).forEach((r) => {
      recordCount++;
      if (r.seeded) seeded++;
      if (!r.athleteId) noAthlete++; else withHolder++;
    }));
    return { err, recordCount, seeded, noAthlete, withHolder, logLen: (g.history.courseRecordLog || []).length };
  });
  ok(!after.err, 'a season of racing must not crash: ' + after.err);
  ok(after.recordCount > 0, 'course records must be set once racing begins: ' + JSON.stringify(after));
  ok(after.seeded === 0, 'no course record may ever be a seeded mark: ' + after.seeded);
  ok(after.noAthlete === 0, 'every course record must have a real runner as its holder: ' + JSON.stringify(after));

  // 3) The Course Records screen renders cleanly with the runner-set book.
  await page.evaluate(() => window.XCD.ui.navigate('courses'));
  await page.waitForTimeout(60);
  const screenOk = await page.evaluate(() => {
    const el = document.querySelector('#screen-container');
    return !!el && el.innerHTML.includes('Course Records');
  });
  ok(screenOk, 'the Course Records screen must render');

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 4).join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-courserecords-blank');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
