// Coach followers + transfer history + coach-relationship variance.
// Verifies:
//   - Coach Relationship differs meaningfully between teammates in season
//     (rapport, racing time, moments), and Top 7 racers bond more
//   - a new head coach restarts the bond from a first impression
//   - taking another head job opens a "Bring Your Runners" pitch: up to 3
//     picks, each with a chance built from the bond and fit (never 100%)
//   - the pitch resolves once, followers move at the rollover with their
//     bond intact, and the profile card shows the school they came from
//   - CPU coaches poached in the offseason bring followers the same way
//   - transfer history survives a save round-trip
const { chromium } = require('playwright');
const { newDynasty, wireErrors, launchOpts } = require('./helpers');

async function run() {
  const browser = await chromium.launch(launchOpts());
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  wireErrors(page, errors);
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  await newDynasty(page, {});

  // ---- 1) Coach Relationship varies within a squad, in season ----
  const spread = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    while (g.week < 12) g.advanceWeek();
    const sd = (xs) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };
    const schools = Object.values(g.world.schools).slice(0, 80);
    let sds = [], ranges = [], racers = [], benchers = [];
    schools.forEach((s) => ['M', 'W'].forEach((gd) => {
      const roster = g.getRoster(s.id, gd);
      const rels = roster.map((a) => a.coachRelationship);
      sds.push(sd(rels));
      ranges.push(Math.max(...rels) - Math.min(...rels));
      const squad = new Set(window.XCD.engine.Races.raceSquad(g, s, gd).map((a) => a.id));
      roster.forEach((a) => { if (!a.injury) (squad.has(a.id) ? racers : benchers).push(a.coachRelationship); });
    }));
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    return { sd: avg(sds), range: avg(ranges), racers: avg(racers), benchers: avg(benchers), week: g.week };
  });
  ok(spread.sd >= 6, 'coach relationship should vary within a squad (avg SD >= 6): ' + JSON.stringify(spread));
  ok(spread.range >= 18, 'a squad should span a real range of bonds (avg range >= 18): ' + JSON.stringify(spread));
  ok(spread.racers > spread.benchers + 3, 'Top 7 racers should bond more than the bench: ' + JSON.stringify(spread));

  // ---- 2) A new head coach means a fresh first impression ----
  const reset = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const F = window.XCD.engine.Followers;
    const s = Object.values(g.world.schools).find((x) => x.id !== g.playerSchoolId && x.coachId);
    const a = g.getRoster(s.id, 'M')[0];
    const oldCoach = g.getCoach(s.coachId);
    const other = Object.values(g.world.coaches).find((c) => c.id !== oldCoach.id && !c.isPlayer && c.role === 'Head');
    a.coachRelationship = 95;
    const before = a.coachBondId;
    F.syncBond(a, other);
    const rapports = g.getRoster(s.id, 'M').map((x) => F.rapport(x, other));
    return {
      before: before === oldCoach.id, after: a.coachBondId === other.id,
      rel: a.coachRelationship, first: F.firstImpression(a, other),
      rapportSpread: Math.max(...rapports) - Math.min(...rapports)
    };
  });
  ok(reset.before && reset.after, 'the bond tracks the current head coach: ' + JSON.stringify(reset));
  ok(reset.rel === reset.first && reset.rel < 95, 'a new coach restarts the bond from a first impression: ' + JSON.stringify(reset));
  ok(reset.rapportSpread >= 8, 'rapport with a coach differs between athletes: ' + JSON.stringify(reset));

  // ---- 3) Take another head job → the pitch opens ----
  const move = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    let guard = 0;
    const headOffers = () => g.jobOffers ? g.jobOffers.offers.filter((o) => !o.rejected && !o.assistantRole) : [];
    while (guard++ < 40 && !(g.seasonPhase === 'Offseason' && headOffers().length && g.portal && g.portal.open)) g.advanceWeek();
    if (!headOffers().length) return { ok: false, week: g.week };
    const oldId = g.playerSchoolId;
    const offer = headOffers()[0];
    const res = window.XCD.engine.Careers.acceptOffer(g, offer.schoolId);
    const F = window.XCD.engine.Followers;
    const cf = F.pending(g);
    const cands = F.candidates(g);
    return {
      ok: res.ok, followers: res.followers, oldId, newId: g.playerSchoolId,
      pending: !!cf, from: cf && cf.fromSchoolId, to: cf && cf.toSchoolId,
      n: cands.length, pcts: cands.map((c) => c.pct),
      allEligible: cands.every((c) => c.athlete.eligibilityRemaining >= 2 && c.athlete.schoolId === oldId),
      factors: cands.every((c) => Array.isArray(c.fit.factors) && c.fit.factors.length > 0)
    };
  });
  ok(move.ok && move.followers && move.pending, 'taking a head job opens the follower pitch: ' + JSON.stringify(move));
  ok(move.from === move.oldId && move.to === move.newId, 'the pitch runs from the old school to the new one');
  ok(move.n >= 6 && move.allEligible, 'candidates are the old roster with eligibility left: ' + move.n);
  ok(move.pcts.every((p) => p >= 2 && p <= 92), 'no chance is ever a guarantee (2-92%): ' + move.pcts.join(','));
  ok(new Set(move.pcts).size >= 4, 'chances differ between athletes: ' + move.pcts.join(','));
  ok(move.factors, 'every candidate shows fit factors');

  // ---- 4) Bond and fit both move the odds ----
  const odds = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const F = window.XCD.engine.Followers;
    const cf = g.coachFollowers;
    const from = g.getSchool(cf.fromSchoolId), to = g.getSchool(cf.toSchoolId);
    const coach = g.world.coaches[cf.coachId];
    const a = F.candidates(g)[0].athlete;
    const hi = F.followChance(g, a, coach, to, from, 92).pct;
    const lo = F.followChance(g, a, coach, to, from, 38).pct;
    // Fit: the same bond, but buried on a deep roster vs leading a thin one.
    const key = a.gender === 'M' ? 'rosterM' : 'rosterW';
    const saved = to[key].slice();
    const deep = Object.values(g.world.athletes).filter((x) => x.gender === a.gender && x.currentOverall > a.currentOverall + 3 && !x.isRecruit).slice(0, 10).map((x) => x.id);
    to[key] = saved.concat(deep);
    const buried = F.followChance(g, a, coach, to, from, 75);
    to[key] = [];
    const leads = F.followChance(g, a, coach, to, from, 75);
    to[key] = saved;
    return { hi, lo, buried: buried.pct, leads: leads.pct, buriedSlot: buried.fit.slot };
  });
  ok(odds.hi >= odds.lo + 40, 'a strong bond is the foundation of the odds: ' + JSON.stringify(odds));
  ok(odds.leads > odds.buried + 10, 'fit at the new school moves the odds: ' + JSON.stringify(odds));

  // ---- 5) The popup: pick up to 3, pitch once, reveal ----
  await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    // Strong bonds for the top candidates so the pitch is likely to land.
    const F = window.XCD.engine.Followers;
    F.candidates(g).slice(0, 4).forEach((c) => { g.coachFollowers.bonds[c.athlete.id] = 95; });
    window.XCD.ui.renderShell();
    window.XCD.ui.showFollowersPopup(g);
  });
  await page.waitForSelector('.fol-modal .fol-card');
  const ui1 = await page.evaluate(() => ({
    cards: document.querySelectorAll('.fol-card').length,
    rings: document.querySelectorAll('.fol-card .fol-ring').length,
    slots: document.querySelectorAll('.fol-slot.empty').length,
    pitchDisabled: document.querySelector('#fol-pitch').disabled,
    title: document.querySelector('.fol-head h2').textContent
  }));
  ok(ui1.cards >= 6 && ui1.rings === ui1.cards, 'every candidate card shows a chance ring: ' + JSON.stringify(ui1));
  ok(ui1.slots === 3 && ui1.pitchDisabled, 'three open spots and no pitch until someone is picked: ' + JSON.stringify(ui1));
  for (let i = 0; i < 4; i++) {
    await page.click(`.fol-card:nth-child(${i + 1})`);
    await page.waitForTimeout(40);
  }
  const ui2 = await page.evaluate(() => ({
    picked: window.XCD.ui.state.game.coachFollowers.picks.length,
    filled: document.querySelectorAll('.fol-slot:not(.empty)').length,
    pitchDisabled: document.querySelector('#fol-pitch').disabled
  }));
  ok(ui2.picked === 3 && ui2.filled === 3 && !ui2.pitchDisabled, 'picks cap at three: ' + JSON.stringify(ui2));
  await page.click('#fol-pitch');
  await page.waitForSelector('.fol-result');
  const pitched = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const cf = g.coachFollowers;
    const results = cf.results;
    const entries = results.map((r) => g.portal.entries.find((e) => e.athleteId === r.athleteId));
    return {
      results,
      cards: document.querySelectorAll('.fol-result').length,
      stamps: document.querySelectorAll('.fol-stamp').length,
      consistent: results.every((r) => r.came === (r.roll < r.pct)),
      routed: results.every((r, i) => !r.came || (entries[i] && entries[i].destination === cf.toSchoolId && entries[i].followedCoach)),
      pendingAfter: !!window.XCD.engine.Followers.pending(g),
      repitch: window.XCD.engine.Followers.pitch(g).ok
    };
  });
  ok(pitched.cards === 3 && pitched.stamps === 3, 'the reveal shows each decision: ' + JSON.stringify(pitched));
  ok(pitched.consistent, 'each decision is a single roll against the shown chance');
  ok(pitched.routed, 'followers are routed to the new school through the transfer window');
  ok(!pitched.pendingAfter && !pitched.repitch, 'the pitch resolves once and cannot be rerolled');
  ok(pitched.results.some((r) => r.came), 'with strong bonds at least one runner should follow: ' + JSON.stringify(pitched.results));
  await page.click('#fol-done');

  // ---- 6) CPU coaches bring followers too ----
  const cpu = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const F = window.XCD.engine.Followers;
    const schools = Object.values(g.world.schools).filter((s) => s.id !== g.playerSchoolId && s.coachId &&
      s.id !== g.coachFollowers.fromSchoolId);
    const from = schools[3], to = schools[4];
    const coach = g.getCoach(from.coachId);
    const roster = ['M', 'W'].flatMap((gd) => g.getRoster(from.id, gd)).filter((a) => a.eligibilityRemaining >= 2 &&
      !g.portal.entries.some((e) => e.athleteId === a.id));
    roster.forEach((a) => { a.coachBondId = coach.id; a.coachRelationship = 15; });
    const none = F.cpuFollow(g, coach, from, to).length;
    roster.forEach((a) => { a.coachRelationship = 97; });
    const moved = F.cpuFollow(g, coach, from, to);
    return {
      none, moved: moved.length,
      routed: moved.every((a) => g.portal.entries.some((e) => e.athleteId === a.id && e.destination === to.id && e.followedCoach))
    };
  });
  ok(cpu.none === 0, 'a CPU coach with frayed bonds brings no one: ' + JSON.stringify(cpu));
  ok(cpu.moved >= 1 && cpu.moved <= 3 && cpu.routed, 'a CPU coach with strong bonds brings 1-3 followers: ' + JSON.stringify(cpu));

  // ---- 7) The rollover moves them; the profile shows where they came from ----
  const landed = await page.evaluate(() => {
    const g = window.XCD.ui.state.game;
    const came = g.coachFollowers.results.filter((r) => r.came).map((r) => r.athleteId);
    const coachId = g.coachFollowers.coachId;
    const fromId = g.coachFollowers.fromSchoolId;
    const startYear = g.year;
    let guard = 0;
    while (g.year === startYear && guard++ < 10) g.advanceWeek();
    const people = came.map((id) => g.getAthlete(id)).filter(Boolean);
    const last = (a) => (a.transferHistory || [])[a.transferHistory.length - 1] || {};
    const portalMoves = Object.values(g.world.athletes).filter((a) => (a.transferHistory || []).some((t) => !t.followedCoach)).length;
    return {
      came: came.length, found: people.length,
      onRoster: people.every((a) => a.schoolId === g.playerSchoolId && g.getRoster(g.playerSchoolId, a.gender).some((x) => x.id === a.id)),
      ledger: people.every((a) => last(a).fromSchoolId === fromId && last(a).followedCoach && last(a).year === g.year),
      bond: people.map((a) => Math.round(a.coachRelationship)),
      bondId: people.every((a) => a.coachBondId === coachId),
      graced: people.every((a) => window.XCD.engine.Portal.newToProgram(g, a)),
      cleared: g.coachFollowers === null,
      portalMoves,
      first: people[0] ? people[0].id : null
    };
  });
  ok(landed.found === landed.came && landed.onRoster, 'followers are on the new roster after the rollover: ' + JSON.stringify(landed));
  ok(landed.ledger, 'the transfer ledger records the old school and the coach they followed: ' + JSON.stringify(landed));
  ok(landed.bond.every((b) => b >= 66) && landed.bondId, 'followers keep their bond with the coach: ' + JSON.stringify(landed));
  ok(landed.graced, 'followers arrive settled (first-season grace)');
  ok(landed.cleared, 'the pitch state clears at the rollover');
  ok(landed.portalMoves >= 10, 'ordinary portal transfers are on the ledger too: ' + landed.portalMoves);

  if (landed.first) {
    await page.evaluate((id) => {
      const g = window.XCD.ui.state.game;
      window.XCD.ui.showPlayerCard(g.getAthlete(id), g);
    }, landed.first);
    await page.waitForSelector('.xfer-pill');
    const card = await page.evaluate(() => {
      const pill = document.querySelector('.xfer-pill');
      const hist = document.querySelector('[data-pcpane="history"]');
      return { pill: pill.textContent.replace(/\s+/g, ' ').trim(), crest: !!pill.querySelector('.job-crest'), history: /Transfer History/.test(hist.textContent) };
    });
    ok(/Transferred from/.test(card.pill) && /Followed/.test(card.pill) && card.crest,
      'the profile header shows the old school and that they followed their coach: ' + card.pill);
    ok(card.history, 'the History tab lists the transfer');
  }

  // ---- 8) Save round-trip keeps the ledger and the bond ----
  const rt = await page.evaluate((id) => {
    const g = window.XCD.ui.state.game;
    const copy = window.XCD.engine.GameState.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    const a = g.getAthlete(id), b = copy.getAthlete(id);
    return a && b && JSON.stringify(a.transferHistory) === JSON.stringify(b.transferHistory) &&
      a.coachBondId === b.coachBondId && a.coachRapport === b.coachRapport;
  }, landed.first);
  ok(rt, 'transfer history and coach bond survive a save round-trip');

  ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails.length) {
    console.log('FAIL');
    fails.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
  console.log('PASS');
}

run().catch((e) => { console.error(e); console.log('FAIL'); process.exit(1); });
