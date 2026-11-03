// Update 27: the Absorbing bar fills under real training, and the whole game
// is touch friendly.
// Verifies:
//   - A high-mileage block banks training: the squad's bank (measured in
//     weeks of its own gains) climbs, and the Squad Form "Absorbing" meter
//     visibly fills and says what was banked last week
//   - A fresh squad banks nothing and the bar reads empty
//   - On a touchscreen tablet (iPad: wide layout, coarse pointer) every tab,
//     filter, select, sort header, nav item and button is finger-sized
//   - Touch tooltips: tapping a label with an explanation shows it; a
//     long-press on a button shows its explanation WITHOUT pressing it; a
//     quick tap still presses it
const { chromium, devices } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  const errors = [];

  // ---- 1) The absorption bank under a high-mileage block ----
  const ctx1 = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx1.newPage();
  wireErrors(page, errors);
  page.setDefaultTimeout(600000);
  await newDynasty(page, {});
  const ab = await page.evaluate(() => {
    const g0 = window.XCD.ui.state.game;
    const GS = window.XCD.engine.GameState;
    const T = window.XCD.engine.Training;
    window.XCD.engine.Settings.set(g0, 'injuryRate', 0);
    const clone = () => GS.fromJSON(JSON.parse(JSON.stringify(g0.toJSON())));
    const setup = (g, miles) => {
      g.week = 2;
      g.training.overrides = {}; g.training.mileageOverrides = {};
      g.training.M = ['easy', 'intervals', 'easy', 'tempo', 'easy', 'long', 'easy'];
      g.getRoster(g.playerSchoolId, 'M').forEach((a) => {
        a.injury = null; a.health = 'Healthy'; a.fatigue = 15; a.absorbBank = 0; a.highLoadWeeks = 0;
        a.chronicMileage = 70;
        g.training.mileageOverrides[a.id] = miles;
      });
    };
    const out = {};
    const hard = clone(); setup(hard, 88);
    const weeks = [];
    for (let i = 0; i < 6; i++) {
      T.processWeek(hard, new window.XCD.core.SeededRNG(40 + i));
      hard.week++;
      const f = T.squadForm(hard, hard.getPlayerSchool(), 'M');
      weeks.push({ fatigue: f.fatigue, absorb: f.absorb, absorbWeeks: f.absorbWeeks, banked: f.banked });
    }
    out.weeks = weeks;
    out.fresh = T.squadForm(g0, g0.getPlayerSchool(), 'M');
    out.full = T.ABSORB.FULL_WEEKS;
    // Render the hard-trained squad on the Training screen.
    window.XCD.ui.state.game = hard;
    window.XCD.ui.navigate('training');
    const row = document.querySelector('.form-absorb');
    out.ui = row ? {
      width: parseFloat(row.querySelector('.meter span').style.width),
      text: row.textContent.replace(/\s+/g, ' '),
      note: (document.querySelector('.form-absorb-note') || {}).textContent || ''
    } : null;
    window.XCD.ui.state.game = g0;
    window.XCD.ui.navigate('training');
    const row0 = document.querySelector('.form-absorb');
    out.freshWidth = row0 ? parseFloat(row0.querySelector('.meter span').style.width) : null;
    return out;
  });
  console.log('absorb:', JSON.stringify(ab));
  const last = ab.weeks[ab.weeks.length - 1];
  ok(last.absorbWeeks >= 0.5, 'a high-mileage block must fill the absorption bank: ' + JSON.stringify(ab.weeks));
  ok(ab.weeks.some((w) => w.banked > 0), 'the squad must bank part of its training under load');
  ok(ab.ui && ab.ui.width >= 15, 'the Absorbing bar must visibly fill after a high-mileage block: ' + JSON.stringify(ab.ui));
  ok(ab.ui && /wk/.test(ab.ui.text) && /banked/.test(ab.ui.note), 'the Absorbing row must read in weeks and say what was banked: ' + JSON.stringify(ab.ui));
  ok(ab.fresh && ab.fresh.absorbWeeks === 0 && ab.freshWidth === 0, 'a fresh squad must read an empty bank');
  await ctx1.close();

  // ---- 2) Touch targets on a touchscreen tablet ----
  const ctx2 = await browser.newContext({ ...devices['iPad Pro 11'] });
  const tab = await ctx2.newPage();
  wireErrors(tab, errors);
  tab.setDefaultTimeout(600000);
  await newDynasty(tab, {});
  const coarse = await tab.evaluate(() => matchMedia('(pointer: coarse)').matches);
  ok(coarse, 'the tablet context must report a coarse pointer');
  const small = [];
  for (const screen of ['dashboard', 'roster', 'training', 'recruiting', 'schedule', 'rankings', 'world', 'inbox', 'history', 'settings', 'saves']) {
    await tab.evaluate((s) => {
      window.XCD.ui.navigate(s);
      const t = document.getElementById('toast-container'); if (t) t.remove();
    }, screen);
    await tab.waitForTimeout(80);
    const found = await tab.evaluate(() => {
      const out = [];
      const sel = '.btn, .nav-item, .pill-tabs button, .pc-tabs button, .flow-step, table.data th, select, input.search-input, .sb-chip';
      document.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (r.height < 35.5) out.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().replace(/\s+/g, '.')} "${(el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return out;
    });
    found.forEach((f) => small.push(`${screen}: ${f}`));
  }
  ok(small.length === 0, 'every tab, filter, header and button must be finger-sized on a touchscreen:\n   ' + small.slice(0, 15).join('\n   '));

  // ---- 3) Touch tooltips ----
  await tab.evaluate(() => window.XCD.ui.navigate('training'));
  await tab.waitForTimeout(100);
  const cdp = await ctx2.newCDPSession(tab);
  const press = async (selector, holdMs) => {
    await tab.evaluate((s) => {
      const t = document.getElementById('toast-container'); if (t) t.remove();
      document.querySelector(s).scrollIntoView({ block: 'center' });
    }, selector);
    await tab.waitForTimeout(80);
    const box = await (await tab.$(selector)).boundingBox();
    const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await tab.waitForTimeout(holdMs);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await tab.waitForTimeout(120);
    return tab.evaluate(() => { const t = document.querySelector('.touch-tip'); return t ? t.textContent : null; });
  };
  const labelTip = await press('.form-absorb .k', 60);
  ok(labelTip && /absorbed/.test(labelTip), 'tapping the Absorbing label must show its explanation: ' + labelTip);
  const dismissed = await press('.form-absorb .k', 60);
  ok(dismissed === null, 'tapping again must dismiss the tooltip');
  await tab.evaluate(() => {
    window.__presses = 0;
    const b = document.querySelector('#screen-container button[title]');
    b.id = b.id || 'touch-tip-probe';
    b.addEventListener('click', (e) => { window.__presses++; e.stopImmediatePropagation(); e.preventDefault(); }, true);
    window.__probe = '#' + b.id;
  });
  const probe = await tab.evaluate(() => window.__probe);
  const longTip = await press(probe, 700);
  const afterLong = await tab.evaluate(() => window.__presses);
  ok(!!longTip && afterLong === 0, `a long-press must show the button's explanation without pressing it (tip=${!!longTip}, presses=${afterLong})`);
  await press(probe, 60);
  const afterTap = await tab.evaluate(() => window.__presses);
  ok(afterTap === 1, 'a quick tap must still press the button: ' + afterTap);

  ok(errors.length === 0, 'page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) {
    console.error('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-update27');
}

run().catch((e) => { console.error('FAIL (crash)', e); process.exit(1); });
