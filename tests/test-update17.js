/*
 * Update 17 test suite — Realism & Interconnection.
 *
 * Verifies the features added in Update 17 and how they tie together:
 *   1. Individual NCAA qualifiers now WORK — the top finishers in each region
 *      NOT on a qualifying team advance (previously slice-then-filter yielded
 *      almost none). They toe the line at nationals.
 *   2. Coach retirement clusters around age 70 (SD ~5), some younger; the old
 *      75+ rule is gone. Old-save clocks migrate down without force-retiring.
 *   3. "Going out on top" — a veteran who just won a national title sometimes
 *      retires a champion.
 *   4. When the player's head coach departs while they assist, the program
 *      offers THEM the promotion (accept → head coach; decline → outside hire).
 *   5. CPU internal promotion — a program's own coordinator is often the
 *      natural successor when a chair opens.
 *   6. Busts (~8% of high-level recruits): ranked high (perceivedPotential) but
 *      a low real ceiling and POOR mental makeup, flagged with scout notes.
 *   7. Gems carry ENHANCED mental makeup (work ethic, toughness, discipline).
 *   8. Coach culture develops athlete mental makeup — work ethic/motivation
 *      rise under a strong culture; every mental ability can improve AND
 *      regress; busts back-slide, gems keep their edge.
 */
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

function stdev(arr) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / arr.length);
}

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, { archetype: 'Developer' });

  // ---- 1) Individual NCAA qualifiers actually advance (run on a pristine
  //         world, before any coach-churn tests). Simulate one full season
  //         through nationals and read the championship fields + start list. --
  const quals = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    let guard = 0;
    while (guard < 40) {
      g.advanceWeek(); guard++;
      const nm = g.season && g.season.meets[g.season.nationalsMeetId];
      if (nm && nm.results && nm.results.M) break; // stop once nationals is contested
    }
    const champs = g.season.championships || {};
    const out = {};
    let totalIndiv = 0, onQualifyingTeam = 0;
    Object.entries(champs).forEach(([div, champ]) => {
      ['M', 'W'].forEach((gender) => {
        const field = new Set(champ.fieldIds[gender] || []);
        const indiv = champ.individualQualifiers[gender] || [];
        out[`${div}-${gender}`] = indiv.length;
        totalIndiv += indiv.length;
        indiv.forEach((id) => {
          const a = g.world.athletes[id];
          if (a && field.has(a.schoolId)) onQualifyingTeam++;
        });
      });
    });
    const natMeet = g.season.meets[g.season.nationalsMeetId];
    let racedAsIndividual = 0, indivAllAmerican = 0;
    if (natMeet && natMeet.results) {
      ['M', 'W'].forEach((gender) => {
        const res = natMeet.results[gender];
        if (res) {
          const ind = (res.finishers || []).filter((f) => f.individual);
          racedAsIndividual += ind.length;
          indivAllAmerican += ind.filter((f) => f.place <= 40).length;
        }
      });
    }
    return { diM: out['DI-M'] || 0, diW: out['DI-W'] || 0, totalIndiv, onQualifyingTeam, racedAsIndividual, indivAllAmerican, byDiv: out };
  });
  ok(quals.totalIndiv >= 40, `individual qualifiers must be selected across divisions (got ${quals.totalIndiv})`);
  ok(quals.diM >= 18 && quals.diW >= 18, `DI should select ~4/region across 9 regions (M ${quals.diM}, W ${quals.diW})`);
  ok(quals.onQualifyingTeam === 0, 'no individual qualifier may be on a team that already qualified');
  ok(quals.racedAsIndividual >= 1, 'individually-qualified runners must toe the line at nationals');
  console.log('individual qualifiers:', JSON.stringify(quals));

  // ---- 2) Retirement age clusters around 70 (SD ~5), some younger ----
  const retire = await page.evaluate(() => {
    const M = window.XCD.models;
    const ages = [];
    for (let i = 0; i < 800; i++) ages.push(new M.Coach({ firstName: 'A', lastName: 'B' }).retireAge);
    const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
    const lt70 = ages.filter((a) => a < 70).length / ages.length;
    const lt64 = ages.filter((a) => a < 64).length / ages.length;
    // Migration (v5→v6): old-save 75+ clocks remap DOWN once, never below
    // age+1, and legitimately-generated new clocks are NOT touched.
    const fakeSave = {
      saveVersion: 5,
      world: { coaches: {
        coach_x: { id: 'coach_x', age: 50, retireAge: 80 },  // old-rule clock
        coach_y: { id: 'coach_y', age: 76, retireAge: 82 },  // old, past new norm
        coach_z: { id: 'coach_z', age: 45, retireAge: 66 }   // already new-style, untouched
      } }
    };
    window.XCD.engine.GameState.migrateSave(fakeSave);
    // Idempotency: running again must not change anything.
    const afterFirst = JSON.stringify(fakeSave.world.coaches);
    window.XCD.engine.GameState.migrateSave(fakeSave);
    const idempotent = afterFirst === JSON.stringify(fakeSave.world.coaches);
    return {
      mean: +mean.toFixed(1), min: Math.min(...ages), max: Math.max(...ages),
      lt70: +lt70.toFixed(2), lt64: +lt64.toFixed(2), ages,
      youngRemap: fakeSave.world.coaches.coach_x.retireAge,
      oldRemap: fakeSave.world.coaches.coach_y.retireAge, oldAge: 76,
      untouched: fakeSave.world.coaches.coach_z.retireAge, idempotent
    };
  });
  ok(retire.mean >= 67 && retire.mean <= 73, `retirement age should average ~70 (got ${retire.mean})`);
  const sd = stdev(retire.ages);
  ok(sd >= 3 && sd <= 7, `retirement age SD should be ~5 (got ${sd.toFixed(1)})`);
  ok(retire.lt70 >= 0.35, `a real share should retire before 70 (got ${retire.lt70})`);
  ok(retire.lt64 >= 0.05, `some should retire notably young (<64: ${retire.lt64})`);
  ok(retire.min >= 58 && retire.max <= 82, `retirement clock stays in [58,82] (got ${retire.min}-${retire.max})`);
  ok(retire.youngRemap >= 66 && retire.youngRemap <= 74, `old 75+ clock migrates down toward ~70 (got ${retire.youngRemap})`);
  ok(retire.oldRemap > retire.oldAge, `migration never force-retires (age ${retire.oldAge}, clock ${retire.oldRemap})`);
  ok(retire.untouched === 66, `an already-new-style clock is left untouched by migration (got ${retire.untouched})`);
  ok(retire.idempotent, 'the retirement migration must be idempotent (runs once, guarded by save version)');
  console.log('retirement:', JSON.stringify({ mean: retire.mean, sd: +sd.toFixed(1), lt70: retire.lt70, min: retire.min, max: retire.max, youngRemap: retire.youngRemap, oldRemap: retire.oldRemap }));

  // ---- 3) Going out on top ----
  const onTop = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Careers = window.XCD.engine.Careers;
    const school = Object.values(g.world.schools).find((s) => (s.division || 'DI') === 'DI');
    const coach = new window.XCD.models.Coach({ firstName: 'Old', lastName: 'Champ', schoolId: school.id });
    coach.age = 70; coach.retireAge = 95; coach.gender = 'M';
    const y = g.year - 1;
    g.history.nationalChampions = g.history.nationalChampions || {};
    g.history.nationalChampions[y] = { M: { teamId: school.id } };
    const wonTitle = Careers.wonNationalTitleLastSeason(g, school);
    let champTop = 0, champRetire = 0;
    for (let i = 0; i < 600; i++) {
      const d = Careers.coachRetirementDecision(g, coach, school, new window.XCD.core.SeededRNG((i * 97 + 3) >>> 0));
      if (d.goOutOnTop) champTop++;
      if (d.retires) champRetire++;
    }
    g.history.nationalChampions[y] = {};
    let noTitleTop = 0;
    for (let i = 0; i < 600; i++) {
      const d = Careers.coachRetirementDecision(g, coach, school, new window.XCD.core.SeededRNG((i * 97 + 3) >>> 0));
      if (d.goOutOnTop) noTitleTop++;
    }
    return { wonTitle, champTop: +(champTop / 600).toFixed(2), noTitleTop, champRetire: +(champRetire / 600).toFixed(2) };
  });
  ok(onTop.wonTitle === true, 'wonNationalTitleLastSeason should detect a staged title');
  ok(onTop.champTop >= 0.30 && onTop.champTop <= 0.55, `a 70-yo champion should sometimes go out on top (~42%, got ${(onTop.champTop * 100).toFixed(0)}%)`);
  ok(onTop.noTitleTop === 0, 'a coach whose team did NOT win can never "go out on top"');
  console.log('go out on top:', JSON.stringify(onTop));

  // ---- 4) Player promotion when the head coach departs ----
  const promo = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Careers = window.XCD.engine.Careers;
    const school = g.getPlayerSchool();
    const player = g.getPlayerCoach();
    // A CPU head coach past their retirement clock (kept < 74 so migration
    // doesn't remap it above the coach's age).
    const head = new window.XCD.models.Coach({
      firstName: 'Retiring', lastName: 'Boss', role: 'Head', age: 74, retireAge: 68,
      recruiting: 60, training: 60, peaking: 60, culture: 60, schoolId: school.id
    });
    g.world.coaches[head.id] = head;
    school.coachId = head.id;
    player.role = 'Assistant'; g.playerRole = 'Assistant';
    school.assistantId = player.id;
    g.headCoachDeparture = null;

    const rng = new window.XCD.core.SeededRNG(20250717);
    Careers.runCarousel(g, rng);
    const held = {
      flagSet: !!g.headCoachDeparture,
      forPlayerSchool: !!(g.headCoachDeparture && g.headCoachDeparture.schoolId === school.id),
      seatOpen: !school.coachId || !g.getCoach(school.coachId),
      hasPromotion: Careers.hasHeadPromotion(g)
    };
    const res = Careers.acceptHeadPromotion(g);
    const afterAccept = {
      ok: res.ok, role: g.playerRole, isHead: school.coachId === player.id,
      notAssistantSeat: school.assistantId !== player.id,
      hasNewAssistant: !!(school.assistantId && g.getCoach(school.assistantId)),
      flagCleared: g.headCoachDeparture === null,
      controlsTraining: g.controlsTraining()
    };
    return { held, afterAccept };
  });
  ok(promo.held.flagSet && promo.held.forPlayerSchool, 'a departing head coach flags the player promotion');
  ok(promo.held.seatOpen, 'the head seat is held OPEN for the player, not auto-filled');
  ok(promo.held.hasPromotion, 'hasHeadPromotion should report the pending decision');
  ok(promo.afterAccept.ok && promo.afterAccept.isHead && promo.afterAccept.role === 'Head', 'accepting makes the player the head coach');
  ok(promo.afterAccept.notAssistantSeat && promo.afterAccept.hasNewAssistant, 'a fresh coordinator fills the vacated assistant seat');
  ok(promo.afterAccept.flagCleared && promo.afterAccept.controlsTraining, 'promotion clears the flag and returns training control');
  console.log('player promotion:', JSON.stringify(promo));

  // ---- 4b) Declining the promotion hires from outside ----
  const decline = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Careers = window.XCD.engine.Careers;
    const school = g.getPlayerSchool();
    const player = g.getPlayerCoach();
    player.role = 'Assistant'; g.playerRole = 'Assistant';
    school.assistantId = player.id;
    school.coachId = null;
    g.headCoachDeparture = { year: g.year, coachName: 'Someone', kind: 'retired', schoolId: school.id };
    const res = Careers.declinePlayerHeadPromotion(g);
    const hired = school.coachId && g.getCoach(school.coachId);
    return {
      ok: res.ok, cleared: g.headCoachDeparture === null,
      seatFilled: !!hired, notPlayer: !!(hired && hired.id !== player.id),
      stillAssistant: g.playerRole === 'Assistant'
    };
  });
  ok(decline.ok && decline.cleared, 'declining clears the pending promotion');
  ok(decline.seatFilled && decline.notPlayer, 'declining lets the program hire a head coach from outside');
  ok(decline.stillAssistant, 'declining keeps the player an assistant');
  console.log('decline promotion:', JSON.stringify(decline));

  // ---- 5) CPU internal promotion ----
  const internal = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const Careers = window.XCD.engine.Careers;
    const WG = window.XCD.engine.WorldGenerator;
    const school = Object.values(g.world.schools).find((s) => s.prestige >= 45 && s.prestige <= 65 && s.id !== g.playerSchoolId);
    let promoted = 0, trials = 0;
    for (let i = 0; i < 150; i++) {
      // A fresh, ready, ambitious internal coordinator for each vacancy.
      const asst = WG.buildAssistant(new window.XCD.core.SeededRNG((i * 977 + 5) >>> 0), school);
      asst.isPlayer = false; asst.age = 42; asst.reputation = 55; asst.ambition = 'careerBuilder';
      g.world.coaches[asst.id] = asst; school.assistantId = asst.id;
      school.coachId = null;
      Careers.fillVacancy(g, school, new window.XCD.core.SeededRNG((i * 131 + 17) >>> 0), 0);
      trials++;
      if (school.coachId === asst.id) promoted++;
    }
    return { rate: trials ? +(promoted / trials).toFixed(2) : 0, trials, promoted };
  });
  ok(internal.rate >= 0.2, `CPU internal promotion should be a real path (got ${(internal.rate * 100).toFixed(0)}% of vacancies)`);
  console.log('CPU internal promotion:', JSON.stringify(internal));

  // ---- 6 & 7) Busts and gems in generated classes ----
  const scouting = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const rng = new window.XCD.core.SeededRNG(778899);
    const busts = [], gems = [];
    let highLevel = 0;
    for (let c = 0; c < 6; c++) {
      const recs = window.XCD.engine.Recruiting.generateClass(g, rng);
      Object.values(recs).forEach((r) => {
        const perceived = r.perceivedPotential != null ? r.perceivedPotential : r.potential;
        if (perceived >= 80) highLevel++;
        if (r.bust) busts.push(r);
        if (r.hiddenGem) gems.push(r);
      });
    }
    const bustStats = {
      count: busts.length,
      allRankedHigh: busts.every((r) => (r.perceivedPotential || 0) > r.potential),
      allBustProfile: busts.every((r) => r.devProfile === 'bust'),
      poorMakeup: busts.filter((r) => r.workEthic <= 58 && r.consistency <= 60).length,
      haveNotes: busts.filter((r) => r.scoutNotes && r.scoutNotes.length).length,
      avgWorkEthic: busts.length ? +(busts.reduce((s, r) => s + r.workEthic, 0) / busts.length).toFixed(0) : 0
    };
    const gemStats = {
      count: gems.length,
      allHiddenCeiling: gems.every((r) => r.potential > (r.perceivedPotential || 0)),
      strongMakeup: gems.filter((r) => r.workEthic >= 78 && (r.mentalToughness || 0) >= 68 && (r.discipline || 0) >= 66).length,
      haveNotes: gems.filter((r) => r.scoutNotes && r.scoutNotes.length).length,
      avgWorkEthic: gems.length ? +(gems.reduce((s, r) => s + r.workEthic, 0) / gems.length).toFixed(0) : 0
    };
    return { highLevel, bustShare: highLevel ? +(busts.length / highLevel).toFixed(3) : 0, bustStats, gemStats };
  });
  ok(scouting.bustStats.count >= 3, `busts should appear in the recruit pool (got ${scouting.bustStats.count})`);
  ok(scouting.bustShare >= 0.03 && scouting.bustShare <= 0.16, `busts should be ~8% of high-level recruits (got ${(scouting.bustShare * 100).toFixed(1)}%)`);
  ok(scouting.bustStats.allRankedHigh, 'every bust must be ranked above its true ceiling (perceived > real)');
  ok(scouting.bustStats.allBustProfile, 'every bust must carry the bust development profile');
  ok(scouting.bustStats.poorMakeup >= scouting.bustStats.count * 0.8, 'busts must have poor mental makeup (low work ethic + consistency)');
  ok(scouting.bustStats.haveNotes === scouting.bustStats.count, 'every bust should surface scout-notebook tells');
  ok(scouting.bustStats.avgWorkEthic <= 52, `busts should average low work ethic (got ${scouting.bustStats.avgWorkEthic})`);
  ok(scouting.gemStats.count >= 3, `gems should still appear (got ${scouting.gemStats.count})`);
  ok(scouting.gemStats.allHiddenCeiling, 'every gem must hide a higher real ceiling than perceived');
  ok(scouting.gemStats.strongMakeup >= scouting.gemStats.count * 0.8, 'gems must carry enhanced mental makeup (work ethic, toughness, discipline)');
  ok(scouting.gemStats.avgWorkEthic >= 80, `gems should average high work ethic (got ${scouting.gemStats.avgWorkEthic})`);
  console.log('scouting:', JSON.stringify(scouting));

  // ---- 8) Coach culture develops athlete mental makeup ----
  const mental = await page.evaluate(() => {
    const M = window.XCD.models;
    const T = window.XCD.engine.Training;
    const mkCoach = (culture) => new M.Coach({ firstName: 'C', lastName: 'X', culture, motivation: culture });
    const mkAth = (over) => new M.Athlete(Object.assign({
      firstName: 'A', lastName: 'Y', classYear: 'Senior', coachRelationship: 70,
      workEthic: 50, discipline: 50, leadership: 50, mentalToughness: 50, coachability: 50, consistency: 60
    }, over));
    const school = { academics: 85 };
    const runYears = (ath, coach, n) => {
      const rng = new window.XCD.core.SeededRNG(4242);
      for (let y = 0; y < n; y++) { ath.careerStats.races = (ath.careerStats.races || 0) + 5; T.mentalDevelopment(ath, coach, rng, school); }
      return ath;
    };
    const strong = runYears(mkAth({ academics: 55 }), mkCoach(92), 6);
    const weak = runYears(mkAth({}), mkCoach(28), 6);
    const eroded = runYears(mkAth({ workEthic: 88 }), mkCoach(24), 6);
    const bust = runYears(mkAth({ workEthic: 45, devProfile: 'bust' }), mkCoach(55), 6);
    const normal = runYears(mkAth({ workEthic: 45, devProfile: 'normal' }), mkCoach(55), 6);
    return {
      strongWE: strong.workEthic, weakWE: weak.workEthic,
      strongLead: strong.leadership, strongTough: strong.mentalToughness, strongCoachable: strong.coachability,
      strongAcad: strong.academics,
      erodedWE: eroded.workEthic, bustWE: bust.workEthic, normalWE: normal.workEthic
    };
  });
  ok(mental.strongWE >= 66, `a strong culture should raise work ethic (50 → ${mental.strongWE})`);
  ok(mental.strongWE > mental.weakWE + 8, `culture should clearly matter (strong ${mental.strongWE} vs weak ${mental.weakWE})`);
  ok(mental.strongLead > 50 && mental.strongTough > 50 && mental.strongCoachable > 50, 'leadership, toughness, and coachability should all be able to improve');
  ok(mental.strongAcad > 55, `academics should also develop at a strong academic program (55 → ${mental.strongAcad})`);
  ok(mental.erodedWE < 88, `an unmotivated program should let a hard worker's ethic regress (88 → ${mental.erodedWE})`);
  ok(mental.bustWE < mental.normalWE, `a bust should back-slide relative to a normal athlete (${mental.bustWE} vs ${mental.normalWE})`);
  console.log('mental development:', JSON.stringify(mental));

  ok(errors.length === 0, 'no page/console errors: ' + errors.slice(0, 3).join(' | '));

  await browser.close();
  if (fails.length) {
    console.log('\nFAILURES:\n' + fails.map((f) => ' ✗ ' + f).join('\n'));
    console.log('\nFAIL test-update17');
    process.exit(1);
  }
  console.log('\nPASS test-update17');
}

run().catch((e) => { console.error(e); process.exit(1); });
