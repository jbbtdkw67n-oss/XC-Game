// Season-by-season results: every program's season (final men's/women's
// poll ranking, NCAA team finish, head coach) is stamped at awards week. The
// program profile's Year by Year tab and the coach profile's Season-by-Season
// list show every finished season, one line per squad:
//   Men: Conference Champion · National Third Place · D1 #3
//   Women: Season Complete · D1 #21
// Meet results tag top-25 teams with their rank and division in the TEAM
// results only (never in the individual results).
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

  // ---- Two full seasons, then the stamp itself ----
  const data = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const W = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    const startYear = g.year;
    for (let i = 0; i < 2 * W; i++) g.advanceWeek();
    const Legacy = window.XCD.engine.Legacy;
    const H = g.history;
    const fr = H.finalRanks || {};
    const y0 = fr[startYear] || {};
    const schools = Object.values(g.world.schools);
    const allStamped = schools.every((s) => Array.isArray(y0[s.id]) && y0[s.id].length >= 3);
    // The DI men's champion: final poll #1 and an NCAA team place of 1.
    const natM = (H.nationalChampions[startYear] || {}).M;
    const champ = natM ? Legacy.finalRanksFor(g, natM.teamId, startYear) : null;
    // A DI men's team that finished 3rd at nationals.
    const third = schools.map((s) => ({ s, f: Legacy.finalRanksFor(g, s.id, startYear) }))
      .find((x) => x.f && x.f.natM === 3 && x.f.division === 'DI');
    // A conference champion.
    const confMeta = (H.confChampMeta || {})[startYear] || {};
    const [ckey, cm] = Object.entries(confMeta)[0] || [];
    const ps = cm ? Legacy.programSeason(g, cm.schoolId, startYear, cm.school) : null;
    const confG = ckey && ckey.slice(-1);
    return {
      startYear, nowYear: g.year, years: Object.keys(fr).map(Number), allStamped,
      champ, thirdId: third && third.s.id, thirdLine: third ? window.XCD.ui.seasonResult(
        Legacy.programSeason(g, third.s.id, startYear, third.s.name), 'DI').lines : '',
      confSchoolId: cm && cm.schoolId, confWon: !!(ps && ps[confG] && ps[confG].conf),
      psRank: ps && (ps.M.rank || ps.W.rank),
      // Finished seasons only: the year just begun is not listed.
      completed: Legacy.completedSeasonYears(g),
      compactRow: Object.values(y0).find((r) => r.length === 3) || null
    };
  });
  console.log('data:', JSON.stringify(data));
  ok(data.years.includes(data.startYear) && data.years.includes(data.startYear + 1), 'both completed seasons are stamped');
  ok(data.allStamped, 'every program gets a season row');
  ok(data.champ && data.champ.M === 1 && data.champ.natM === 1, 'the DI men\'s champion is #1 in the poll and 1st at nationals');
  ok(data.thirdLine.includes('National Third Place') && data.thirdLine.includes('D1 #'), 'a 3rd-place nationals team reads "National Third Place · D1 #n": ' + data.thirdLine);
  ok(data.confWon && data.psRank, 'programSeason reports the conference title and the final rank');
  ok(!data.completed.includes(data.nowYear) && data.completed.includes(data.startYear + 1), 'only finished seasons are listed');
  ok(!!data.compactRow, 'programs that missed nationals store a compact 3-value row');

  // ---- Program profile → Year by Year tab ----
  const readSchool = (id) => page.evaluate(({ id }) => {
    const g = window.XCD.ui.state.game;
    document.querySelectorAll('[data-modal-close]').forEach((b) => b.click());
    window.XCD.ui.showSchoolCard(g.getSchool(id), g);
    const box = document.querySelector('#sc-seasons');
    const rows = box ? [...box.querySelectorAll('.lrow')] : [];
    return {
      tab: !!document.querySelector('[data-pctab="seasons"]'),
      text: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
      clickable: box ? box.querySelectorAll('[data-season-coach]').length : 0
    };
  }, { id });
  const school = await readSchool(data.confSchoolId);
  console.log('school:', JSON.stringify(school));
  ok(school.tab, 'the program profile has a Year by Year tab');
  ok(school.text.length === 2, 'the program profile lists every finished season (2)');
  const yearOf = (t) => Number((t.match(/\b(\d{4})\b/) || [])[1]);
  ok(yearOf(school.text[0]) === data.startYear + 1 && yearOf(school.text[1]) === data.startYear, 'newest season first, each led by its year');
  ok(school.text.every((t) => t.includes('Men:') && t.includes('Women:')), 'each season has a Men line and a Women line');
  ok(school.text.every((t) => (t.match(/D[123] #\d+/g) || []).length === 2), 'each squad shows its final poll as "D1 #n"');
  ok(school.text.some((t) => yearOf(t) === data.startYear && t.includes('Conference Champion')), 'the conference title is listed');
  ok(school.clickable === 2, 'each season row opens the coach who led it');
  if (data.thirdId) {
    const t = await readSchool(data.thirdId);
    ok(t.text.some((x) => x.includes('National Third Place')), 'the program profile shows the nationals finish');
  }
  await page.click('[data-pctab="seasons"]');
  await page.click('#sc-seasons [data-season-coach]');
  await page.waitForTimeout(100);
  const opened = await page.evaluate(() => document.querySelectorAll('.pc-tabs [data-pctab="tree"]').length);
  ok(opened >= 1, 'tapping a season opens a coach profile');

  // ---- Coach profile → History tab ----
  const coach = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    document.querySelectorAll('[data-modal-close]').forEach((b) => b.click());
    window.XCD.ui.showCoachCard(g.getCoach(g.playerCoachId), g);
    const pane = document.querySelector('[data-pcpane="history"]');
    const card = pane.querySelector('.card');
    return [...card.querySelectorAll('.lrow')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  });
  console.log('coach:', JSON.stringify(coach));
  ok(coach.length === 2, 'the coach profile lists only the 2 finished seasons: ' + coach.length);
  ok(coach.every((t) => t.includes('Men:') && t.includes('Women:') && (t.match(/D[123] #\d+/g) || []).length === 2), 'coach seasons show titles + final poll per squad');

  // ---- Old saves: a season never stamped still lists, without a poll ----
  const legacy = await page.evaluate(({ y, id }) => {
    const g = window.XCD.ui.state.game;
    const Legacy = window.XCD.engine.Legacy;
    const saved = g.history.finalRanks[y];
    delete g.history.finalRanks[y];
    const ps = Legacy.programSeason(g, id, y, g.getSchool(id).name);
    const lines = window.XCD.ui.seasonResult(ps, 'DI').lines;
    const listed = Legacy.completedSeasonYears(g).includes(y);
    g.history.finalRanks[y] = saved;
    return { lines, listed };
  }, { y: data.startYear, id: data.confSchoolId });
  ok(legacy.listed, 'an unstamped past season is still listed');
  ok(legacy.lines.includes('Final poll not recorded') && legacy.lines.includes('Conference Champion'), 'it shows its titles and "Final poll not recorded"');

  // ---- Save/load ----
  const rt = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const back = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    return JSON.stringify(back.history.finalRanks) === JSON.stringify(g.history.finalRanks);
  });
  ok(rt, 'season records round-trip through save/load');

  // ---- Meet results: poll tags in team results only ----
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
    return {
      stamped: !!res.pollStamped,
      allTop25: ranked.every((t) => t.pollRank >= 1 && t.pollRank <= 25 && t.pollDiv),
      rankedCount: ranked.length, taggedRows: tagged.length,
      indivTags: document.querySelectorAll('.modal tr[data-ath] .poll-tag').length,
      tagOk: tagged.every((r) => {
        const t = res.teamScores.find((x) => x.schoolId === r.dataset.school);
        return t && t.pollRank && r.querySelector('.poll-tag').textContent.startsWith('#' + t.pollRank + ' D');
      })
    };
  });
  console.log('meet:', JSON.stringify(meet));
  ok(meet && meet.stamped, 'a run meet stamps the poll ranks going in');
  ok(meet && meet.allTop25, 'only top-25 teams carry a stamped rank, with their division');
  ok(meet && meet.taggedRows === meet.rankedCount, 'the team results tag exactly the top-25 teams');
  ok(meet && meet.tagOk, 'each tag reads "#rank D#"');
  ok(meet && meet.indivTags === 0, 'the individual results carry no poll tags');

  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  await browser.close();
  if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('PASS');
})();
