// Feature test: every coaching philosophy (training + race) carries explicit
// strengths and weaknesses, shown on the coach-creation cards, the career
// summary, and the My Program screen.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));

  // 1) Data: every philosophy has at least one pro and one con.
  const data = await page.evaluate(() => {
    const D = window.XCD.data;
    return D.TRAINING_PHILOSOPHIES.concat(D.RACE_PHILOSOPHIES).map((p) => ({
      key: p.key, pros: (p.pros || []).length, cons: (p.cons || []).length
    }));
  });
  data.forEach((p) => ok(p.pros >= 1 && p.cons >= 1, `philosophy ${p.key} needs pros and cons: ${JSON.stringify(p)}`));

  // 2) Wizard: training + race cards each render a strengths/weaknesses block.
  await page.click('#btn-new');
  await page.waitForSelector('#coach-first'); await page.click('#btn-next');
  await page.waitForSelector('#coach-avatar-preview'); await page.click('#btn-next');
  await page.waitForSelector('[data-arch]'); await page.click('[data-arch="Developer"]'); await page.click('#btn-next');
  await page.waitForSelector('[data-tp]');
  const tp = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-tp]').length,
    withTradeoffs: document.querySelectorAll('[data-tp] .tradeoffs').length,
    pros: document.querySelectorAll('[data-tp] .tradeoffs li.pro').length,
    cons: document.querySelectorAll('[data-tp] .tradeoffs li.con').length
  }));
  ok(tp.cards > 0 && tp.withTradeoffs === tp.cards && tp.pros >= tp.cards && tp.cons >= tp.cards,
    'every training philosophy card shows strengths and weaknesses: ' + JSON.stringify(tp));
  await page.click('[data-tp="high-mileage"]');
  await page.click('#btn-next');
  await page.waitForSelector('[data-rp]');
  const rp = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-rp]').length,
    withTradeoffs: document.querySelectorAll('[data-rp] .tradeoffs').length
  }));
  ok(rp.cards > 0 && rp.withTradeoffs === rp.cards, 'every race philosophy card shows strengths and weaknesses: ' + JSON.stringify(rp));
  await page.click('[data-rp="aggressive"]');
  await page.click('#btn-next');
  await page.waitForSelector('.wizard-summary-box');
  const sum = await page.evaluate(() => document.querySelectorAll('.to-summary .pro').length + document.querySelectorAll('.to-summary .con').length);
  ok(sum === 4, 'summary shows a headline strength + weakness for both philosophies: ' + sum);

  // 3) My Program: the coach's training AND current race philosophy show
  //    their trade-offs, and switching race philosophy updates them.
  await newDynasty(page, {});
  await page.evaluate(() => window.XCD.ui.navigate('school'));
  await page.waitForSelector('[data-race-philo]');
  const before = await page.evaluate(() => ({
    blocks: document.querySelectorAll('.tradeoffs').length,
    text: [...document.querySelectorAll('.tradeoffs')].map((b) => b.textContent).join(' ')
  }));
  ok(before.blocks >= 2, 'My Program shows training + race philosophy trade-offs: ' + before.blocks);
  await page.click('[data-race-philo="sit-and-kick"]');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => [...document.querySelectorAll('.tradeoffs')].map((b) => b.textContent).join(' '));
  ok(/Strongest finishing kick/.test(after), 'switching race philosophy shows the new strengths');

  ok(errors.length === 0, 'page errors: ' + errors.slice(0, 4).join(' | '));

  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-philosophy-tradeoffs');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
