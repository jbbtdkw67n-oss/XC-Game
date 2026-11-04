// Season-by-season results: every program's final men's/women's ranking is
// stamped at awards week, the program profile lists each completed season
// with its final ranks and conference (and other) titles, and the coach
// profile's season-by-season rows show the final ranks too.
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
  page.setDefaultTimeout(300000);

  // Two full seasons.
  const data = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const W = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    const startYear = g.year;
    for (let i = 0; i < 2 * W; i++) g.advanceWeek();
    const Legacy = window.XCD.engine.Legacy;
    const H = g.history;
    const fr = H.finalRanks || {};
    const years = Object.keys(fr).map(Number);
    const y0 = fr[startYear] || {};
    const schools = Object.values(g.world.schools);
    const allStamped = schools.every((s) => Array.isArray(y0[s.id]) && y0[s.id].length === 3);
    // The stamped ranks agree with the national champion finishing #1.
    const natM = (H.nationalChampions[startYear] || {}).M;
    const champRank = natM ? (y0[natM.teamId] || [])[0] : null;
    // Find a conference champion and check programSeason reports it.
    const confMeta = (H.confChampMeta || {})[startYear] || {};
    const [ckey, cm] = Object.entries(confMeta)[0] || [];
    const ps = cm ? Legacy.programSeason(g, cm.schoolId, startYear, cm.school) : null;
    return {
      startYear, years, allStamped, champRank,
      confSchoolId: cm && cm.schoolId, confGender: ckey && ckey.slice(-1),
      ps, playerSchoolId: g.playerSchoolId,
      playerRanks: y0[g.playerSchoolId]
    };
  });
  console.log('data:', JSON.stringify(data));
  ok(data.years.includes(data.startYear) && data.years.includes(data.startYear + 1), 'final ranks are stamped for both completed seasons');
  ok(data.allStamped, 'every program gets a [rankM, rankW, coachId] final-rank row');
  ok(data.champRank === 1, 'the DI men\'s national champion finishes #1 in the final poll');
  ok(data.ps && data.ps.conf.includes(data.confGender), 'programSeason reports the conference title');
  ok(data.ps && (data.ps.rankM || data.ps.rankW), 'programSeason carries the final ranks');

  // Program profile → History tab lists the seasons with ranks + titles.
  const school = await page.evaluate(({ id }) => {
    const g = window.XCD.ui.state.game;
    window.XCD.ui.showSchoolCard(g.getSchool(id), g);
    const box = document.querySelector('#sc-seasons');
    const rows = box ? [...box.querySelectorAll('.lrow')] : [];
    return {
      count: rows.length,
      text: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
      chips: box ? box.querySelectorAll('.rank-chip').length : 0,
      clickable: box ? box.querySelectorAll('[data-season-coach]').length : 0
    };
  }, { id: data.confSchoolId });
  console.log('school:', JSON.stringify(school));
  ok(school.count === 2, 'the program profile lists both completed seasons');
  ok(school.text.some((t) => t.includes(String(data.startYear)) && t.includes('Conference Champions')), 'the conference-title season is marked');
  ok(school.chips >= 4, 'each season shows men\'s and women\'s final rank chips');
  ok(school.text.every((t) => t.includes('Final:')), 'every season row shows the final ranking');
  ok(school.clickable === 2, 'each season row opens the coach who led it');

  // Clicking a season opens that season's coach profile.
  await page.click('[data-pctab="history"]');
  await page.click('#sc-seasons [data-season-coach]');
  await page.waitForTimeout(100);
  const opened = await page.evaluate(() => [...document.querySelectorAll('.pc-tabs [data-pctab="tree"]')].length);
  ok(opened >= 1, 'clicking a season row opens a coach profile');

  // Player coach profile → History tab: completed seasons show final ranks.
  const coach = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    document.querySelectorAll('[data-modal-close]').forEach((b) => b.click());
    window.XCD.ui.showCoachCard(g.getCoach(g.playerCoachId), g);
    const pane = document.querySelector('[data-pcpane="history"]');
    const rows = [...pane.querySelectorAll('.lrow')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
    return { rows };
  });
  console.log('coach:', JSON.stringify(coach));
  const finals = coach.rows.filter((t) => t.includes('Final:'));
  ok(finals.length >= 2, 'the coach profile shows final ranks for completed seasons');

  // The stamp survives a save/load round trip.
  const rt = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const GS = window.XCD.engine.GameState;
    const back = GS.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    return JSON.stringify(back.history.finalRanks) === JSON.stringify(g.history.finalRanks);
  });
  ok(rt, 'final ranks round-trip through save/load');

  // Meet results: top-25 teams carry their rank going into the meet and
  // their division beside their name — and only top-25 teams do.
  const meet = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    document.querySelectorAll('[data-modal-close]').forEach((b) => b.click());
    const ran = () => Object.values(g.season.meets).filter((m) => m.results && m.results.M &&
      m.results.M.teamScores.some((t) => t.pollRank));
    for (let i = 0; i < 20 && !ran().length; i++) g.advanceWeek();
    const m = ran()[0];
    if (!m) return null;
    const res = m.results.M;
    const ranked = res.teamScores.filter((t) => t.pollRank);
    window.XCD.ui.showMeetResults(g, m, 'M');
    const rows = [...document.querySelectorAll('.modal tr[data-school]')];
    const tagged = rows.filter((r) => r.querySelector('.poll-tag'));
    const tagText = tagged.map((r) => r.querySelector('.poll-tag').textContent);
    return {
      stamped: !!res.pollStamped, field: res.teamScores.length,
      allTop25: ranked.every((t) => t.pollRank >= 1 && t.pollRank <= 25 && t.pollDiv),
      rankedCount: ranked.length, taggedRows: tagged.length, tagText,
      tagOk: tagged.every((r) => {
        const t = res.teamScores.find((x) => x.schoolId === r.dataset.school);
        return t && t.pollRank && r.querySelector('.poll-tag').textContent.startsWith('#' + t.pollRank + ' D');
      })
    };
  });
  console.log('meet:', JSON.stringify(meet));
  ok(meet && meet.stamped, 'a run meet stamps the poll ranks going in');
  ok(meet && meet.allTop25, 'only top-25 teams carry a stamped rank, with their division');
  ok(meet && meet.taggedRows === meet.rankedCount && meet.rankedCount < meet.field + 1, 'the team results tag exactly the top-25 teams');
  ok(meet && meet.tagOk, 'each tag reads "#rank D#"');

  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
