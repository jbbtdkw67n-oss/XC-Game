// Transfer portal "national contender" preference: a program that finished in
// the top 10 of its division's final poll in the season just completed
// satisfies it automatically, whatever its prestige. Prestige alone (>= 72)
// still qualifies. Ranks are per gender: a top-10 women's squad does not make
// the program a contender for a men's transfer.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };
  page.setDefaultTimeout(120000);
  await newDynasty(page, {});

  const r = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const P = window.XCD.engine.Portal;
    const R = window.XCD.data.PORTAL_REASONS;
    const athlete = g.getRoster(g.playerSchoolId, 'M')[0];
    const entry = { reason: R.contender, fromSchoolId: g.playerSchoolId };
    const pref = () => P.transferPreferences(g, athlete, entry).find((p) => p.key === 'contender');
    const school = g.getSchool(g.playerSchoolId);
    const savedPrestige = school.prestige;
    const savedRanks = g.history.finalRanks;
    const stamp = (year, rankM, rankW) => {
      g.history.finalRanks = { [year]: { [school.id]: [rankM, rankW, school.coachId] } };
    };
    const out = { hasPref: !!pref() };
    school.prestige = 40;
    g.history.finalRanks = {};
    out.lowNoRank = pref().match(school);
    stamp(g.year - 1, 7, 0);
    out.lowTop10LastYear = pref().match(school);
    stamp(g.year, 10, 0);
    out.lowTop10ThisYear = pref().match(school);
    stamp(g.year - 1, 11, 0);
    out.lowRank11 = pref().match(school);
    stamp(g.year - 1, 0, 3);
    out.womenOnlyTop10 = pref().match(school);
    stamp(g.year - 3, 1, 0);
    out.staleTop10 = pref().match(school);
    school.prestige = 80;
    g.history.finalRanks = {};
    out.highPrestige = pref().match(school);
    school.prestige = savedPrestige;
    g.history.finalRanks = savedRanks;
    return out;
  });

  ok(r.hasPref, 'contender preference present for a contender-reason transfer');
  ok(!r.lowNoRank, 'low-prestige unranked program is not a contender');
  ok(r.lowTop10LastYear, 'top-10 finish last season counts as a contender');
  ok(r.lowTop10ThisYear, 'top-10 finish in the just-stamped season counts as a contender');
  ok(!r.lowRank11, '11th place does not count');
  ok(!r.womenOnlyTop10, "a women's top-10 does not satisfy a men's transfer");
  ok(!r.staleTop10, 'a top-10 from several seasons ago does not count');
  ok(r.highPrestige, 'prestige >= 72 still counts');
  ok(errors.length === 0, 'no page errors: ' + errors.join('\n'));

  await browser.close();
  if (fails.length) {
    console.log('FAIL\n - ' + fails.join('\n - '));
    process.exit(1);
  }
  console.log('PASS test-portal-contender', JSON.stringify(r));
}

run().catch((e) => { console.error('FAIL', e); process.exit(1); });
