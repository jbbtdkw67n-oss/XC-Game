// Feature test: the offseason "Available Jobs" popup — appears when the market
// opens, lets the player stay put or take a new job, fully functional.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, {});

  // Advance into the offseason so the coaching market opens with offers.
  const reached = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    let guard = 0;
    const hasOffers = () => g.seasonPhase === 'Offseason' && g.jobOffers &&
      (g.jobOffers.offers || []).some((o) => !o.rejected);
    while (guard++ < 40 && !hasOffers()) g.advanceWeek();
    return { ok: hasOffers(), week: g.week, phase: g.seasonPhase, offers: g.jobOffers ? g.jobOffers.offers.length : 0 };
  });
  ok(reached.ok, 'the offseason job market must open with offers: ' + JSON.stringify(reached));

  // 1) maybeShowJobOffers opens the popup once, then suppresses itself.
  const trig = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.jobOffers.popupSeen = false;
    const first = window.XCD.ui.maybeShowJobOffers(g);
    const second = window.XCD.ui.maybeShowJobOffers(g); // already seen this cycle
    return { first, second, seen: g.jobOffers.popupSeen };
  });
  ok(trig.first === true && trig.second === false && trig.seen === true,
    'the popup shows once per cycle then suppresses: ' + JSON.stringify(trig));
  await page.waitForSelector('.job-popup');

  // 2) The popup renders the screenshot's shape: title, crest, record, ring,
  //    a Continue action, and a selectable list (stay + offers).
  const shape = await page.evaluate(() => ({
    title: (document.querySelector('.job-popup h2') || {}).textContent,
    rows: document.querySelectorAll('.job-row').length,
    crests: document.querySelectorAll('.job-crest').length,
    rings: document.querySelectorAll('.job-ring').length,
    stayRow: !!document.querySelector('.job-row[data-job="__stay__"]'),
    staySelected: document.querySelector('.job-row[data-job="__stay__"]').classList.contains('selected'),
    hasContinue: !!document.querySelector('#job-continue'),
    hasSort: !!document.querySelector('#job-sort-sel'),
    recordShown: /\d+-\d+/.test((document.querySelector('.job-row-sub') || {}).textContent || '')
  }));
  ok(shape.title === 'Available Jobs', 'popup title must be "Available Jobs": ' + shape.title);
  ok(shape.rows >= 3, 'popup must list the stay option plus offers: ' + shape.rows);
  ok(shape.crests === shape.rows && shape.rings === shape.rows, 'every row needs a crest and a rating ring');
  ok(shape.stayRow && shape.staySelected, 'a "stay put" row must exist and be selected by default');
  ok(shape.hasContinue && shape.hasSort, 'popup needs a Continue button and a sort control');
  ok(shape.recordShown, 'rows must show a W-L record');

  // 3) Sorting by Program Rating must be descending by prestige.
  const sortOk = await page.evaluate(() => {
    const rings = [...document.querySelectorAll('.job-row')].slice(1) // skip stay row
      .map((r) => Number(r.querySelector('.job-ring').textContent));
    for (let i = 1; i < rings.length; i++) if (rings[i] > rings[i - 1]) return false;
    return true;
  });
  ok(sortOk, 'offers must sort by Program Rating (descending) by default');

  // 4) Continue with the stay row selected keeps the current job and closes.
  const before = await page.evaluate(() => window.XCD.ui.state.game.playerSchoolId);
  await page.click('#job-continue');
  await page.waitForTimeout(60);
  const afterStay = await page.evaluate(() => ({
    school: window.XCD.ui.state.game.playerSchoolId,
    modalGone: !document.querySelector('.job-popup')
  }));
  ok(afterStay.school === before, 'staying put must not change the player school');
  ok(afterStay.modalGone, 'Continue (stay) must close the popup');

  // 5) Taking a job actually moves the player.
  const move = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Guarantee a landable chair, then reopen the picker and select it.
    const offer = g.jobOffers.offers.find((o) => !o.rejected);
    offer.interest = 100; // certain to land on the application roll
    window.XCD.ui.showJobOffersPopup(g);
    return { targetId: offer.schoolId, targetName: offer.schoolName, before: g.playerSchoolId };
  });
  await page.waitForSelector(`.job-row[data-job="${move.targetId}"]`);
  await page.click(`.job-row[data-job="${move.targetId}"]`);
  await page.click('#job-continue');
  await page.waitForSelector('#job-confirm');
  await page.click('#job-confirm');
  await page.waitForTimeout(120);
  const afterMove = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    return { school: g.playerSchoolId, name: g.getPlayerSchool() && g.getPlayerSchool().name, role: g.playerRole };
  });
  ok(afterMove.school === move.targetId, `taking the job must move the player to the chosen program (${afterMove.name})`);
  ok(!!afterMove.school && afterMove.role === 'Head', 'the player must land as head coach of a valid program');

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 4).join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-joboffers-popup');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
