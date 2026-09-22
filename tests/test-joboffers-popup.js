// Feature test: the offseason "Available Jobs" popup — appears when the market
// opens, shows decision detail per offer, lets the player turn the offers
// down (stay put) or take a new job, fully functional.
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

  // 2) The popup renders: title, current-program reference card, offer rows
  //    with crest/ring/interest/kind, sort control, and the footer actions
  //    (Turn Down Offers + Take/Apply). The current school is NOT an option.
  const shape = await page.evaluate(() => ({
    title: (document.querySelector('.job-popup h2') || {}).textContent,
    rows: document.querySelectorAll('.job-row').length,
    crests: document.querySelectorAll('.job-row .job-crest').length,
    rings: document.querySelectorAll('.job-row .job-ring').length,
    chances: document.querySelectorAll('.job-row .job-chance').length,
    kinds: document.querySelectorAll('.job-row .job-kind').length,
    current: !!document.querySelector('.job-current'),
    currentSelectable: !!document.querySelector('.job-current[data-job], .job-row[data-job="__stay__"]'),
    hasDecline: !!document.querySelector('#job-decline'),
    continueDisabled: document.querySelector('#job-continue').disabled,
    hasSort: !!document.querySelector('#job-sort-sel'),
    recordShown: /\d+-\d+/.test((document.querySelector('.job-row-sub') || {}).textContent || '')
  }));
  ok(shape.title === 'Available Jobs', 'popup title must be "Available Jobs": ' + shape.title);
  ok(shape.rows >= 2, 'popup must list the offers: ' + shape.rows);
  ok(shape.crests === shape.rows && shape.rings === shape.rows, 'every row needs a crest and a rating ring');
  ok(shape.chances === shape.rows && shape.kinds === shape.rows, 'every row needs an interest/offer chip and a move-type tag');
  ok(shape.current && !shape.currentSelectable, 'the current program is shown for reference, not as a selectable option');
  ok(shape.hasDecline, 'popup needs a Turn Down Offers button');
  ok(shape.continueDisabled, 'Take/Apply is disabled until an offer is selected');
  ok(shape.hasSort, 'popup needs a sort control');
  ok(shape.recordShown, 'rows must show a W-L record');

  // 3) Sorting by Program Rating must be descending by prestige.
  const sortOk = await page.evaluate(() => {
    const rings = [...document.querySelectorAll('.job-row .job-ring')].map((r) => Number(r.textContent));
    for (let i = 1; i < rings.length; i++) if (rings[i] > rings[i - 1]) return false;
    return true;
  });
  ok(sortOk, 'offers must sort by Program Rating (descending) by default');

  // 4) Selecting an offer expands a decision panel comparing it with the
  //    current program and enables the Take/Apply button.
  const firstId = await page.evaluate(() => document.querySelector('.job-row').dataset.job);
  await page.click(`.job-row[data-job="${firstId}"] .job-row-main`);
  const detail = await page.evaluate((id) => {
    const row = document.querySelector(`.job-row[data-job="${id}"]`);
    const d = row && row.querySelector('.job-detail');
    return {
      selected: row && row.classList.contains('selected'),
      stats: d ? d.querySelectorAll('.job-stat').length : 0,
      labels: d ? [...d.querySelectorAll('.job-stat-label')].map((x) => x.textContent) : [],
      yours: d ? /yours:/.test(d.textContent) : false,
      weighPros: d ? d.querySelectorAll('.job-weigh li.pro').length : 0,
      weighCons: d ? d.querySelectorAll('.job-weigh li.con').length : 0,
      btn: document.querySelector('#job-continue').textContent,
      btnDisabled: document.querySelector('#job-continue').disabled
    };
  }, firstId);
  ok(detail.selected && detail.stats >= 8, 'selecting an offer expands its detail stats: ' + JSON.stringify(detail));
  ['Program Rating', 'Roster Strength', 'Budget', 'Facilities', 'Academics', 'Expectations'].forEach((l) =>
    ok(detail.labels.includes(l), 'detail panel must show ' + l));
  ok(detail.yours, 'detail stats must compare against your current program');
  ok(detail.weighPros >= 1 && detail.weighCons >= 1, 'detail panel must list reasons to take it and to stay');
  ok(!detail.btnDisabled && /^(Take This Job|Apply \(\d+% chance\))/.test(detail.btn), 'selecting enables Take/Apply: ' + detail.btn);
  // Tapping the same row again collapses it.
  await page.click(`.job-row[data-job="${firstId}"] .job-row-main`);
  const collapsed = await page.evaluate(() => !document.querySelector('.job-detail') && document.querySelector('#job-continue').disabled);
  ok(collapsed, 'tapping a selected row collapses it and disables Take/Apply');

  // 5) Taking a job actually moves the player.
  const move = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Guarantee a landable chair, then reopen the picker and select it.
    const offer = g.jobOffers.offers.find((o) => !o.rejected);
    offer.interest = 100; // certain to land on the application roll
    return { targetId: offer.schoolId, targetName: offer.schoolName, before: g.playerSchoolId };
  });

  // 5a) Turn Down Offers: confirm → market closes, player stays, popup gone.
  const beforeDecline = await page.evaluate(() => window.XCD.ui.state.game.playerSchoolId);
  await page.click('#job-decline');
  await page.waitForSelector('#job-decline-confirm');
  // Back returns to the picker without closing the market.
  await page.click('#job-back');
  await page.waitForSelector('.job-popup');
  ok(await page.evaluate(() => !!window.XCD.ui.state.game.jobOffers), 'Back from the turn-down confirm keeps the market open');
  // Stash the market so we can restore it for the move test afterwards.
  await page.evaluate(() => { window.__market = JSON.parse(JSON.stringify(window.XCD.ui.state.game.jobOffers)); });
  await page.click('#job-decline');
  await page.waitForSelector('#job-decline-confirm');
  await page.click('#job-decline-confirm');
  await page.waitForTimeout(80);
  const afterDecline = await page.evaluate(() => ({
    school: window.XCD.ui.state.game.playerSchoolId,
    market: window.XCD.ui.state.game.jobOffers,
    modalGone: !document.querySelector('.job-popup') && !document.querySelector('#active-modal')
  }));
  ok(afterDecline.school === beforeDecline, 'turning down offers must keep the player at the current school');
  ok(afterDecline.market === null, 'turning down offers closes the market for this cycle');
  ok(afterDecline.modalGone, 'turning down offers closes the popup');

  // 5b) Restore the market and take the job.
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.jobOffers = window.__market;
    window.XCD.ui.showJobOffersPopup(g);
  });
  await page.waitForSelector(`.job-row[data-job="${move.targetId}"]`);
  await page.click(`.job-row[data-job="${move.targetId}"] .job-row-main`);
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
