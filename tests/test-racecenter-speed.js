// Race Center replay speed: the 1× / 2× / 4× buttons must match the speed
// actually playing. The highlighted button is the current speed, the replay
// clock runs 2× / 4× as fast as at 1×, and the choice survives Replay and a
// Men/Women switch.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page);
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    g.week1 = { progressionReviewed: true, rosterConfirmed: true, scheduleFinalized: true, staffConfirmed: true, setupConfirmed: true };
    g.weeklyFlow = { trainingConfirmed: true, recruitingDone: true };
    window.XCD.ui.renderShell();
  });
  await page.click('#btn-sim-race');
  await page.waitForSelector('#speed-tabs');

  const active = () => page.$$eval('#speed-tabs [data-speed]', (bs) =>
    bs.filter((b) => b.classList.contains('active')).map((b) => b.textContent.trim()));
  // Race seconds the replay clock advances over `ms` of wall time.
  const clockRate = async (ms) => {
    const read = () => page.$eval('#race-clock', (el) => {
      const m = el.textContent.match(/(\d+):(\d+(?:\.\d+)?)/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
    });
    const a = await read();
    const t0 = Date.now();
    await page.waitForTimeout(ms);
    const b = await read();
    return (b - a) / ((Date.now() - t0) / 1000);
  };

  ok(JSON.stringify(await active()) === '["1×"]', 'a replay starts with 1× highlighted');
  const r1 = await clockRate(700);
  await page.click('#speed-tabs [data-speed="2"]');
  ok(JSON.stringify(await active()) === '["2×"]', 'clicking 2× highlights 2× only');
  const r2 = await clockRate(700);
  await page.click('#speed-tabs [data-speed="4"]');
  ok(JSON.stringify(await active()) === '["4×"]', 'clicking 4× highlights 4× only');
  const r4 = await clockRate(700);
  console.log('race-seconds per wall-second:', JSON.stringify({ r1: +r1.toFixed(1), r2: +r2.toFixed(1), r4: +r4.toFixed(1), x2: +(r2 / r1).toFixed(2), x4: +(r4 / r1).toFixed(2) }));
  ok(r2 / r1 > 1.6 && r2 / r1 < 2.4, `2× must play twice as fast as 1× (got ${(r2 / r1).toFixed(2)}×)`);
  ok(r4 / r1 > 3.2 && r4 / r1 < 4.8, `4× must play four times as fast as 1× (got ${(r4 / r1).toFixed(2)}×)`);

  // Replay keeps the chosen speed (and its highlight).
  await page.click('#btn-replay');
  await page.waitForTimeout(100);
  ok(JSON.stringify(await active()) === '["4×"]', 'Replay keeps 4× highlighted');
  const rReplay = await clockRate(700);
  ok(rReplay / r1 > 3.2, `Replay keeps playing at 4× (got ${(rReplay / r1).toFixed(2)}×)`);

  // Switching squads keeps it too.
  await page.click('#g-w');
  await page.waitForSelector('#speed-tabs');
  ok(JSON.stringify(await active()) === '["4×"]', 'the Women\'s replay keeps 4× highlighted');

  // Back to 1×.
  await page.click('#speed-tabs [data-speed="1"]');
  ok(JSON.stringify(await active()) === '["1×"]', 'clicking 1× highlights 1× only');

  ok(!errors.length, 'no page errors: ' + errors[0]);
  console.log(fails.length ? 'FAIL\n - ' + fails.join('\n - ') : 'PASS');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
