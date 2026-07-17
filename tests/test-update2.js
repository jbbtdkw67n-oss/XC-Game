// Update 2 test: save migration (v2 -> v3), mileage/taper mechanics,
// durability gating, coach reputation effects, division layer, legacy ledgers.
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page);
  page.setDefaultTimeout(180000);

  // ---- Mileage meta mechanics (Part 6) ----
  const mileage = await page.evaluate(() => {
    const TE = window.XCD.engine.Training;
    const lo = TE.mileageMeta(30, 70);
    const mid = TE.mileageMeta(70, 70);
    const hi = TE.mileageMeta(120, 120);
    const taper = TE.mileageMeta(45, 95); // cutting hard off a big base
    return {
      fatigueOrdered: lo.fatigueAdd < mid.fatigueAdd && mid.fatigueAdd < hi.fatigueAdd,
      injuryOrdered: lo.injuryMult < mid.injuryMult && mid.injuryMult < hi.injuryMult,
      fitnessOrdered: lo.fitnessMult < mid.fitnessMult && mid.fitnessMult < hi.fitnessMult,
      devOrdered: lo.devMult < hi.devMult,
      sharpOrdered: lo.sharpTarget > mid.sharpTarget && mid.sharpTarget > hi.sharpTarget,
      taperDetected: taper.taper === true && mid.taper === false,
      taperSharp: taper.sharpTarget > TE.mileageMeta(45, 45).sharpTarget - 1,
      durability: TE.safeMileage({ injuryResistance: 90 }) > 100 &&
                  TE.safeMileage({ injuryResistance: 30 }) < 85
    };
  });
  Object.entries(mileage).forEach(([k, v]) => { if (!v) errors.push('mileage mechanic failed: ' + k); });
  console.log('mileage mechanics:', JSON.stringify(mileage));

  // ---- Coach reputation moves recruiting fit (Part 1) ----
  const rep = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const RE = window.XCD.engine.Recruiting;
    const school = g.getPlayerSchool();
    const coach = g.getPlayerCoach();
    const rec = Object.values(g.world.recruits).find((r) => r.hometownState !== 'INT');
    const old = coach.reputation;
    coach.reputation = 10;
    const lowFit = RE.fitScore(g, school, rec);
    coach.reputation = 95;
    const highFit = RE.fitScore(g, school, rec);
    coach.reputation = old;
    return { lowFit, highFit, gap: highFit - lowFit };
  });
  console.log('reputation fit effect:', JSON.stringify(rep));
  if (rep.gap < 8) errors.push('Coach reputation barely moves recruiting: ' + rep.gap);

  // ---- Division layer is data-driven (Part 13) ----
  const div = await page.evaluate(() => {
    const D = window.XCD.data;
    const g = window.XCD.ui.state.game;
    const school = g.getPlayerSchool();
    return {
      hasAll: ['DA', 'DB', 'DC'].every((k) => D.DIVISIONS[k]),
      schoolDivision: school.division,
      diField: D.divisionFor(school).championship.nationalsFieldSize,
      diiiScholarships: D.DIVISIONS.DC.scholarships.M === 0,
      championshipsKeyed: !!g.season.championships.DA
    };
  });
  console.log('division layer:', JSON.stringify(div));
  if (!div.hasAll || div.schoolDivision !== 'DA' || div.diField !== 31 || !div.diiiScholarships || !div.championshipsKeyed) {
    errors.push('Division layer broken: ' + JSON.stringify(div));
  }

  // ---- Simulate 2 seasons, then test v2 -> v3 save migration ----
  const migration = await page.evaluate(async () => {
    const g = window.XCD.ui.state.game;
    for (let i = 0; i < 42; i++) g.advanceWeek();

    // Fabricate a pre-Update-2 save: strip every Update 2 field.
    const old = JSON.parse(JSON.stringify(g.toJSON()));
    delete old.saveVersion;
    old.week = 9; // an old 14-week-calendar week number
    delete old.training.mileage;
    delete old.training.mileageOverrides;
    old.season = null;
    Object.values(old.world.schools).forEach((s) => {
      delete s.division; delete s.prestigeHistory; delete s.prestigeMomentum;
    });
    Object.values(old.world.coaches).forEach((c) => {
      delete c.reputation; delete c.tendencies; delete c.stints;
      delete c.talentEval; delete c.motivation; delete c.transferRecruiting;
      delete c.internationalRecruiting; delete c.media; delete c.staffManagement;
      delete c.relationships;
      c.careerRecord = { wins: 0, losses: 0, conferenceTitles: 1, regionalTitles: 0, nationalTitles: 0 };
      c.retireAge = 68; // old rule
    });
    Object.values(old.world.athletes).forEach((a) => {
      delete a.sharpness; delete a.chronicMileage; delete a.honorYears;
      delete a.generational; delete a.genProfile; delete a.seasonInjuryWeeks;
    });

    const loaded = window.XCD.engine.GameState.fromJSON(old);
    const coach = loaded.getPlayerCoach();
    const school = loaded.getPlayerSchool();
    const ath = Object.values(loaded.world.athletes).find((a) => !a.isRecruit);
    const aiCoach = Object.values(loaded.world.coaches).find((c) => !c.isPlayer && c.role === 'Head');
    return {
      week: loaded.week,
      year: loaded.year === g.year,
      division: school.division === 'DA',
      mileage: loaded.training.mileage && loaded.training.mileage.M > 0,
      reputationSeeded: typeof coach.reputation === 'number' && coach.reputation > 0,
      secondaryRatings: typeof aiCoach.talentEval === 'number',
      retireAgeFixed: aiCoach.retireAge >= 75,
      sharpnessDefault: typeof ath.sharpness === 'number',
      honorYears: !!ath.honorYears,
      seasonRebuilt: !!loaded.season && !!loaded.season.championships,
      saveVersion: window.XCD.engine.GameState.SAVE_VERSION === 5,
      // Migrated dynasty keeps running
      survives: (() => { try { for (let i = 0; i < 21; i++) loaded.advanceWeek(); return true; } catch (e) { return e.message; } })()
    };
  });
  console.log('v2->v3 migration:', JSON.stringify(migration));
  Object.entries(migration).forEach(([k, v]) => { if (v !== true && k !== 'week') errors.push(`migration failed: ${k} = ${v}`); });
  if (migration.week !== 1) errors.push('migrated save should resume at week 1, got ' + migration.week);

  // ---- Legacy ledgers filled after 2 seasons ----
  const legacy = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const prog = window.XCD.engine.Legacy.program(g, g.playerSchoolId);
    const anyAA = Object.values(g.world.athletes).some((a) =>
      a.honorYears && a.honorYears.allConference && a.honorYears.allConference.length);
    return {
      record: prog.wins + prog.losses > 0,
      programs: Object.keys(g.history.programs).length >= 350,
      honorYears: anyAA,
      coachStints: (g.getPlayerCoach().stints || []).length >= 1
    };
  });
  console.log('legacy ledgers:', JSON.stringify(legacy));
  Object.entries(legacy).forEach(([k, v]) => { if (!v) errors.push('legacy failed: ' + k); });

  console.log(errors.length ? 'FAIL\n' + errors.join('\n---\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1); });
