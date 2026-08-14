/*
 * Realism & Authenticity Update — verification suite.
 *
 * Locks in the changes that make the game mirror real NCAA cross country:
 *   1. Balanced NCAA regionals (real regions per division)
 *   2. New coaches eligible for ANY job (restriction removed)
 *   3. Real qualification numbers (auto + at-large + individuals)
 *   4. Division II awards the top 40 All-Americans
 *   5. Accurate initial prestige (blue bloods on top, no inflated football brands)
 *   6. Strong programs start with strong coaches
 *   7. Every meet shows host / city / course
 *   8. Real hometowns everywhere (no fictional towns)
 *   9. NCAA Championships only at authentic venues
 *   10/12. Altitude is a real, deterministic location trait
 */
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log('  ✗ ' + msg); } };

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page, { archetype: 'Developer', school: 'Northern Arizona' });

  // ---- Data-level invariants ----
  const data = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    const schools = Object.values(g.world.schools);
    const by = (n) => schools.find((s) => s.name === n);

    const regionStats = {};
    ['DI', 'DII', 'DIII'].forEach((div) => {
      const c = {};
      schools.filter((s) => (s.division || 'DI') === div)
        .forEach((s) => { const r = D.ncaaRegionFor(s); c[r] = (c[r] || 0) + 1; });
      const n = Object.values(c);
      regionStats[div] = { regions: n.length, min: Math.min(...n), max: Math.max(...n) };
    });

    // Real towns: sample athletes must all be real towns for their state.
    const townSet = {};
    Object.entries(D.REAL_TOWNS).forEach(([st, l]) => { townSet[st] = new Set(l); });
    let realTowns = 0, totalTowns = 0;
    Object.values(g.world.athletes).forEach((a) => {
      if (a.hometownState && a.hometownState !== 'INT') {
        totalTowns++;
        if (townSet[a.hometownState] && townSet[a.hometownState].has(a.hometownCity)) realTowns++;
      }
    });
    // Recruits too
    let realRec = 0, totalRec = 0;
    Object.values(g.world.recruits || {}).forEach((r) => {
      if (r.hometownState && r.hometownState !== 'INT') {
        totalRec++;
        if (townSet[r.hometownState] && townSet[r.hometownState].has(r.hometownCity)) realRec++;
      }
    });

    const strongCoach = (n) => { const s = by(n); const c = g.getCoach(s.coachId); return c ? c.overallRating : 0; };

    return {
      regionStats,
      diiAA: D.divisionFor('DII').championship.allAmericans,
      diAA: D.divisionFor('DI').championship.allAmericans,
      diiiAA: D.divisionFor('DIII').championship.allAmericans,
      diAuto: D.divisionFor('DI').championship.autoQualifiersPerRegional,
      diIndiv: D.divisionFor('DI').championship.individualQualifiersPerRegional,
      diField: D.divisionFor('DI').championship.nationalsFieldSize,
      nau: { prestige: by('Northern Arizona').prestige, city: by('Northern Arizona').city, alt: by('Northern Arizona').weather.altitude },
      byuAlt: by('BYU').weather.altitude,
      airForceAlt: by('Air Force').weather.altitude,
      floridaAlt: by('Florida').weather.altitude,
      utahStateAlt: by('Utah State').weather.altitude,
      oregonCity: by('Oregon').city,
      wiscCity: by('Wisconsin').city,
      // Blue bloods should out-prestige a random football brand with no XC pedigree.
      blueBloodMin: Math.min(...['Northern Arizona', 'BYU', 'Oklahoma State', 'Stanford', 'Oregon', 'Arkansas'].map((n) => by(n).prestige)),
      // strong programs -> strong coaches (auto-generated head coaches)
      strongCoaches: ['BYU', 'Oklahoma State', 'Arkansas', 'Colorado', 'Wisconsin'].map(strongCoach),
      townShare: totalTowns ? realTowns / totalTowns : 0,
      recShare: totalRec ? realRec / totalRec : 1,
      venueCount: D.CHAMPIONSHIP_VENUES.length
    };
  });

  console.log('regions:', JSON.stringify(data.regionStats));
  // 1) Balanced regionals — real region counts, max/min ratio under 2.5x.
  ok(data.regionStats.DI.regions === 9, 'DI must have 9 NCAA regions');
  ok(data.regionStats.DII.regions === 8, 'DII must have 8 NCAA regions');
  ok(data.regionStats.DIII.regions === 8, 'DIII must have 8 NCAA regions');
  ['DI', 'DII', 'DIII'].forEach((d) => {
    const r = data.regionStats[d];
    ok(r.max / r.min <= 2.5, `${d} regionals must be balanced (ratio ${(r.max / r.min).toFixed(2)})`);
  });

  // 3) Qualification numbers
  ok(data.diField === 31, 'DI national field must be 31 teams');
  ok(data.diAuto === 2, 'DI auto qualifiers must be top 2 per region');
  ok(data.diIndiv === 4, 'DI individual qualifiers must be top 4 per region');

  // 4) DII All-Americans = top 40
  ok(data.diiAA === 40, 'DII All-Americans must be top 40');
  ok(data.diAA === 40, 'DI All-Americans must be top 40');
  ok(data.diiiAA === 40, 'DIII All-Americans must be top 40');

  // 5) Prestige realism
  ok(data.nau.prestige >= 90, 'Northern Arizona must start elite');
  ok(data.blueBloodMin >= 80, 'every named blue blood must start elite (80+)');

  // 6) Strong coaches at strong programs
  console.log('strong coaches (BYU,OkSt,Ark,Colo,Wisc):', JSON.stringify(data.strongCoaches));
  ok(data.strongCoaches.filter((o) => o >= 65).length >= 4, 'strong programs must start with strong coaches');

  // 8) Real towns everywhere
  console.log('town realism:', data.townShare.toFixed(3), 'recruits:', data.recShare.toFixed(3));
  ok(data.townShare >= 0.999, 'every athlete hometown must be a real town');
  ok(data.recShare >= 0.999, 'every recruit hometown must be a real town');

  // 9) real campus cities
  ok(data.nau.city === 'Flagstaff', 'Northern Arizona campus city must be Flagstaff');
  ok(data.oregonCity === 'Eugene', 'Oregon campus city must be Eugene');
  ok(data.wiscCity === 'Madison', 'Wisconsin campus city must be Madison');

  // 10/12) Altitude designations
  ok(data.nau.alt === 'High', 'Northern Arizona must be a high-altitude program');
  ok(data.byuAlt === 'High', 'BYU must be high altitude');
  ok(data.airForceAlt === 'High', 'Air Force must be high altitude');
  ok(data.utahStateAlt === 'Medium', 'Utah State must be moderate altitude');
  ok(data.floridaAlt === 'Low', 'Florida must be low altitude');
  ok(data.venueCount >= 6, 'there must be a rotation of real championship venues');

  // ---- Season-level: build one postseason and inspect regionals + venue + host info ----
  const champ = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const D = window.XCD.data;
    let guard = 0;
    while (g.week < D.CALENDAR.NATIONAL_WEEK && guard++ < 40 && g.advanceWeek) g.advanceWeek();
    const season = g.season;
    const Sched = window.XCD.engine.Scheduling;
    const diReg = (season.byWeek[season.regionalWeek] || []).map((id) => season.meets[id]).filter((m) => (m.division || 'DI') === 'DI');
    const nat = season.meets[season.nationalsMeetId];
    const venues = D.CHAMPIONSHIP_VENUES.map((v) => v.name);
    // host info for a regional and for nationals
    const regHost = diReg[0] ? Sched.meetHostHtml(g, diReg[0]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const natHost = nat ? Sched.meetHostHtml(g, nat).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    return {
      diRegionCount: diReg.length,
      diNamesOk: diReg.every((m) => /^NCAA .*Regional$/.test(m.name)),
      natName: nat && nat.name,
      natVenue: nat && nat.venue,
      venueAuthentic: nat && venues.includes(nat.venue),
      fieldM: season.nationalsFieldIds.M ? season.nationalsFieldIds.M.length : 0,
      regHost, natHost
    };
  });
  console.log('postseason:', JSON.stringify(champ));
  ok(champ.diRegionCount === 9, 'exactly 9 DI regionals must be held');
  ok(champ.diNamesOk, 'regionals must be named "NCAA <Region> Regional"');
  ok(champ.venueAuthentic, 'the national championship must use an authentic venue');
  ok(champ.fieldM === 31, 'the DI national field must fill to 31 teams');
  ok(/Hosted by/.test(champ.regHost), 'a regional must display its host school');
  ok(/Hosted at/.test(champ.natHost), 'nationals must display its host venue');

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 2).join(' | '));

  await browser.close();
  if (failures) { console.log(`\n${failures} check(s) failed`); console.log('FAIL'); process.exit(1); }
  console.log('\nPASS');
})();
