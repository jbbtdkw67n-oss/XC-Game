// Update 13 (second wave) test:
//  1) Championship results carry NO gold highlighting — honor earners are
//     denoted by the award emoji only (source-level check on both result
//     renderers).
//  2) Avatars: coaches wear polos (with a wizard color slider that is
//     honored), singlet straps go over the shoulders, curly/braided women's
//     hair never paints over the face, and no polo/singlet color sits in the
//     dark-background range.
//  3) CPU coaches earn AND spend upgrade points: after a full simmed season
//     the national champion's CPU coach has grown, no CPU coach sits on an
//     unspent balance, and the player's own points are never auto-spent.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

(async () => {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // ---- 1) No gold highlighting in championship results (source check) ----
  ['../js/ui/screens/schedule.js', '../js/ui/screens/racecenter.js'].forEach((rel) => {
    const src = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
    ok(!src.includes('rgba(212,160,23'), `${rel} still paints gold row backgrounds`);
    ok(!src.includes('highlighted in gold'), `${rel} still advertises gold highlighting`);
    ok(src.includes('honor.icon'), `${rel} lost the honor emoji marker`);
  });

  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage();
  const errors = [];
  wireErrors(page, errors);
  await newDynasty(page);
  page.setDefaultTimeout(180000);

  // ---- 2) Avatars: polos, straps, face-safe hair, bright palettes ----
  const av = await page.evaluate(() => {
    const UI = window.XCD.ui;
    const g = window.XCD.ui.state.game;
    const coach = g.getPlayerCoach();
    coach.appearance = Object.assign({}, coach.appearance, { polo: 4 });
    const coachSvg = UI.avatar(coach, { size: 24 });
    const athleteSvg = UI.avatar(Object.values(g.world.athletes)[0], { size: 24 });
    // Face box: ellipse cx 32 rx 10.5 → x 21.5–42.5; the old braid strands
    // ran at x=28/x=36 straight down the face.
    const braidSvg = UI.avatarSvg({ gender: 'W', skin: 3, hair: 6, hairStyle: 7, beard: 0 }, { size: 24 });
    const curlSvg = UI.avatarSvg({ gender: 'W', skin: 3, hair: 6, hairStyle: 3, beard: 0 }, { size: 24 });
    const brightness = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3;
    };
    const palettes = UI.AVATAR.POLO_COLORS.concat(['#3d8bfd', '#e5534b', '#34c98e', '#e8b339', '#9b6ef3', '#eb7a34', '#2ab7c9', '#d4507a']);
    return {
      poloPlacket: coachSvg.includes('x="31.3"'),
      poloColorHonored: coachSvg.toLowerCase().includes(UI.AVATAR.POLO_COLORS[4].toLowerCase()),
      noSuitShirt: !coachSvg.includes('#F4F6F8'),
      strapScoop: athleteSvg.includes('46.4'), // scoop-neck strap curve
      oldSinglet: athleteSvg.includes('M13.5 64'), // pre-13 below-shoulder tank
      braidOnFace: /M2[89] 2\d|M3[456] 2\d/.test(braidSvg.match(/stroke[^/]+/)?.[0] || ''),
      curlCircle: /<circle[^>]+cy="16\.5"/.test(curlSvg),
      dimmest: Math.min(...palettes.map(brightness))
    };
  });
  ok(av.poloPlacket, 'coach polo must render its placket');
  ok(av.poloColorHonored, 'wizard-chosen polo color must be worn');
  ok(av.noSuitShirt, 'suit shirt must be gone from coach avatars');
  ok(av.strapScoop, 'singlet must run over the shoulders with a scoop neck');
  ok(!av.oldSinglet, 'old below-the-shoulder singlet path must be gone');
  ok(!av.braidOnFace, 'braid strands must not run down the face');
  ok(!av.curlCircle, 'curly hair must not hang a circle over the face');
  ok(av.dimmest > 90, `an outfit color blends into the dark background (avg channel ${av.dimmest})`);
  console.log('avatars:', JSON.stringify(av));

  // ---- 3) CPU coaches earn and spend upgrade points over a season ----
  const cpu = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const sum = (c) => (c.recruiting || 0) + (c.training || 0) + (c.peaking || 0) + (c.culture || 0);
    g.getPlayerCoach().upgradePoints = 3; // must survive untouched
    const weeks = window.XCD.data.CALENDAR.WEEKS_PER_YEAR;
    let pre = null, awardsYear = null;
    for (let w = 0; w < weeks; w++) {
      const yr = g.year;
      if (!awardsYear) {
        pre = {};
        Object.values(g.world.coaches).forEach((c) => { pre[c.id] = sum(c); });
      }
      g.advanceWeek();
      if (!awardsYear && g.history.awards && g.history.awards[yr]) awardsYear = yr;
    }
    const nat = (g.history.nationalChampions || {})[awardsYear] || {};
    const champSchool = nat.M && g.getSchool(nat.M.teamId);
    const champCoach = champSchool && g.getCoach(champSchool.coachId);
    const cpuCoaches = Object.values(g.world.coaches).filter((c) => !c.isPlayer && c.schoolId);
    return {
      awardsYear,
      champIsCpu: !!(champCoach && !champCoach.isPlayer),
      champDelta: champCoach && pre[champCoach.id] !== undefined ? sum(champCoach) - pre[champCoach.id] : null,
      champSum: champCoach ? sum(champCoach) : null,
      unspent: cpuCoaches.filter((c) => (c.upgradePoints || 0) > 0 &&
        ['recruiting', 'training', 'peaking', 'culture'].some((k) => (c[k] || 0) < 99)).length,
      playerPts: g.getPlayerCoach().upgradePoints
    };
  });
  console.log('cpu progression:', JSON.stringify(cpu));
  ok(cpu.awardsYear, 'season never reached the awards ceremony');
  if (cpu.champIsCpu && cpu.champDelta !== null) {
    ok(cpu.champDelta >= 1 || cpu.champSum >= 380,
      `national champion's CPU coach banked a title but never grew (Δ${cpu.champDelta})`);
  }
  ok(cpu.unspent === 0, `${cpu.unspent} CPU coaches sit on unspent upgrade points`);
  ok(cpu.playerPts >= 3, 'player upgrade points must never be auto-spent by the CPU spender');

  await browser.close();
  const problems = fails.concat(errors);
  if (problems.length) {
    console.error('FAIL');
    problems.forEach((p) => console.error(' -', p));
    process.exit(1);
  }
  console.log('PASS');
})().catch((e) => { console.error('FAIL (exception)', e); process.exit(1); });
