/*
 * My Program screen: school profile, coach card, facilities, budget, history.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  // Five facilities, each with a stated training implication (facilities
  // overhaul) — the tooltip tells the player exactly what the money buys.
  const FACILITY_LABELS = {
    trainingCenter: ['Training Center', 'Development speed: every athlete grows faster each week, and training fitness builds quicker.'],
    weightRoom: ['Weight Room', 'Injury prevention: strong bodies break down less under the same load.'],
    rehabCenter: ['Rehab Center', 'Recovery: faster weekly fatigue recovery, shorter injury layoffs, and less fitness lost while hurt.'],
    indoorTrack: ['Indoor Track', 'Sharpness: speed sessions and race simulations pay out more, and Speed develops faster from speed work.'],
    alumniCenter: ['Alumni Center', 'Fundraising: bigger booster pushes and a faster-refilling facilities fund, scaled by program success and school size.']
  };

  const COACH_ATTRS = [
    ['recruiting', 'Recruiting', 'Recruiting effectiveness: weekly points and pull with prospects.'],
    ['training', 'Training', 'Athlete development speed, every single week.'],
    ['peaking', 'Peaking', 'Championship form at Conference, Regionals, and Nationals.'],
    ['culture', 'Culture', 'Morale, happiness, chemistry, and keeping runners out of the portal.']
  ];

  let activeTab = 'overview';
  let histSub = 'archive'; // Update 12: Archive · Records · Hall of Fame

  /* ---------------- History accessors (Update 12) -------------------- *
   * Reconstruct this program's complete historical archive from the
   * permanent, universe-wide ledgers. Everything here updates automatically
   * after every season because it reads straight from stored history.
   */
  function programHistory(game, school) {
    const H = game.history;
    const sid = school.id;
    const name = school.name;
    const teamNat = [];   // { year, gender, division, coach, teamOverall, teamScore }
    const indivNat = [];  // { year, gender, athlete, athleteId, coach, event }
    const confTeam = [];  // { year, gender, conf }
    const indivConf = []; // { year, gender, athlete, athleteId, coach }
    const regTeam = [];   // { year, gender, region }
    const indivReg = [];  // { year, gender, athlete, athleteId }

    (H.championTeams || []).forEach((t) => {
      if (t.schoolId !== sid) return;
      teamNat.push({ year: t.year, gender: t.gender, division: t.division, coach: t.coachName, teamOverall: t.teamOverall, teamScore: t.teamScore });
    });

    Object.keys(H.nationalChampions || {}).forEach((year) => {
      const slate = H.nationalChampions[year];
      Object.keys(slate).forEach((key) => {
        const rec = slate[key];
        const g = key.endsWith('W') ? 'W' : 'M';
        if (rec.individualSchoolId === sid || rec.individualSchool === name) {
          indivNat.push({ year: Number(year), gender: g, athlete: rec.individual, athleteId: rec.individualId, coach: (game.getCoach(school.coachId) || {}).fullName || '', event: g === 'M' ? '10K' : '6K' });
        }
      });
    });

    Object.keys(H.conferenceChampions || {}).forEach((year) => {
      const slate = H.conferenceChampions[year];
      ['M', 'W'].forEach((g) => {
        Object.keys(slate).forEach((key) => {
          if (!key.endsWith('-' + g)) return;
          if (slate[key] === name) confTeam.push({ year: Number(year), gender: g, conf: key.slice(0, key.lastIndexOf('-')) });
        });
      });
    });
    Object.keys(H.confIndivChampions || {}).forEach((year) => {
      const slate = H.confIndivChampions[year];
      Object.keys(slate).forEach((key) => {
        const rec = slate[key];
        if (rec.schoolId !== sid) return;
        indivConf.push({ year: Number(year), gender: key.endsWith('W') ? 'W' : 'M', athlete: rec.name, athleteId: rec.athleteId, coach: rec.coach });
      });
    });

    Object.keys(H.regionalChampions || {}).forEach((year) => {
      const slate = H.regionalChampions[year];
      Object.keys(slate).forEach((key) => {
        if (slate[key] === name) regTeam.push({ year: Number(year), gender: key.endsWith('W') ? 'W' : 'M', region: key.slice(0, key.lastIndexOf('-')) });
      });
    });
    Object.keys(H.regIndivChampions || {}).forEach((year) => {
      const slate = H.regIndivChampions[year];
      Object.keys(slate).forEach((key) => {
        const rec = slate[key];
        if (rec.schoolId !== sid) return;
        indivReg.push({ year: Number(year), gender: key.endsWith('W') ? 'W' : 'M', athlete: rec.name, athleteId: rec.athleteId });
      });
    });

    const byYearDesc = (a, b) => b.year - a.year;
    [teamNat, indivNat, confTeam, indivConf, regTeam, indivReg].forEach((l) => l.sort(byYearDesc));
    return { teamNat, indivNat, confTeam, indivConf, regTeam, indivReg };
  }

  // Longest run of consecutive years the program won its conference title
  // (either gender), reconstructed from permanent history.
  function longestConfStreak(game, school) {
    const H = game.history;
    const years = Object.keys(H.conferenceChampions || {}).map(Number).sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    years.forEach((y) => {
      const slate = H.conferenceChampions[y];
      const won = Object.keys(slate).some((k) => slate[k] === school.name);
      if (won) { run = (prev !== null && y === prev + 1) ? run + 1 : 1; prev = y; best = Math.max(best, run); }
    });
    return best;
  }

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();
    const coach = game.getPlayerCoach();

    container.innerHTML = `
      <div class="screen-header">
        <h1>${Utils.escapeHtml(school.name)}</h1>
        <div class="actions">
          <div class="pill-tabs">
            <button data-stab="overview" class="${activeTab === 'overview' ? 'active' : ''}">Overview</button>
            <button data-stab="history" class="${activeTab === 'history' ? 'active' : ''}">History</button>
          </div>
          <span style="color:var(--text-dim); font-size:13px;">
            ${window.XCD.data.divisionFor(school).label} • ${Utils.escapeHtml(school.conference)} • ${school.region} • ${window.XCD.data.STATE_NAMES[school.state] || school.state}
          </span>
        </div>
      </div>
      <div id="school-body"></div>`;

    const body = container.querySelector('#school-body');
    if (activeTab === 'history') renderHistoryTab(game, school, body);
    else renderOverview(game, school, coach, body, container);

    container.querySelectorAll('[data-stab]').forEach((btn) => {
      btn.addEventListener('click', () => { activeTab = btn.dataset.stab; render(container); });
    });
  }

  /* ---------------- History tab: the permanent program archive ------- */
  function renderHistoryTab(game, school, body) {
    body.innerHTML = `
      <div class="pill-tabs" style="margin-bottom:14px;">
        <button data-hsub="archive" class="${histSub === 'archive' ? 'active' : ''}">📜 Archive</button>
        <button data-hsub="records" class="${histSub === 'records' ? 'active' : ''}">📊 Program Records</button>
        <button data-hsub="hof" class="${histSub === 'hof' ? 'active' : ''}">🏛 Hall of Fame</button>
      </div>
      <div id="hist-sub-body"></div>`;
    const sub = body.querySelector('#hist-sub-body');
    ({ archive: renderArchive, records: renderRecords, hof: renderSchoolHOF })[histSub](game, school, sub);
    body.querySelectorAll('[data-hsub]').forEach((btn) => {
      btn.addEventListener('click', () => { histSub = btn.dataset.hsub; renderHistoryTab(game, school, body); });
    });
  }

  // Shared: wire every [data-ath]/[data-school] name in a container to its
  // profile (Update 12, Phase 3 — no dead names on the program page).
  function wireProgramClicks(game, el) {
    el.querySelectorAll('[data-ath]').forEach((n) => {
      n.addEventListener('click', (e) => { e.stopPropagation(); UI.openAthlete(game, n.dataset.ath, n.dataset.athName || n.textContent.trim()); });
    });
    el.querySelectorAll('[data-coach]').forEach((n) => {
      n.addEventListener('click', (e) => { e.stopPropagation(); UI.openCoach(game, n.dataset.coach || null, n.dataset.coachName || n.textContent.trim()); });
    });
  }

  /* Phase 4 — Program History Expansion: a complete historical archive. */
  function renderArchive(game, school, body) {
    const Legacy = window.XCD.engine.Legacy;
    const prog = Legacy.program(game, school.id);
    const winPct = Legacy.programWinPct(prog);
    const ph = school.prestigeHistory || [];
    const trend = ph.slice(-10).map((p) => p.prestige);
    const trendStr = trend.length >= 2 ? `${trend[0]} → ${trend[trend.length - 1]} over ${trend.length} yrs` : '—';
    const h = programHistory(game, school);
    const gTag = (g) => g === 'M' ? "Men's" : "Women's";
    const athLink = (name, id) => `<span class="clickable" data-ath="${id || ''}" data-ath-name="${Utils.escapeHtml(name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(name)}</span>`;
    const coachLink = (name) => name ? `<span class="clickable" data-coach="" data-coach-name="${Utils.escapeHtml(name)}" style="cursor:pointer; color:var(--accent-hover);">${Utils.escapeHtml(name)}</span>` : '—';
    const sectionTable = (title, headers, rows, empty) => `
      <div class="card" style="margin-bottom:16px;">
        <h2>${title}</h2>
        ${rows.length ? `<div class="table-wrap"><table class="data">
          <thead><tr>${headers.map((hd) => `<th>${hd}</th>`).join('')}</tr></thead>
          <tbody>${rows.join('')}</tbody></table></div>`
        : `<div style="color:var(--text-dim); font-size:13px;">${empty}</div>`}
      </div>`;

    body.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">All-Time Record</div><div class="value">${prog.wins}-${prog.losses}</div><div class="sub">${winPct}% winning pct</div></div>
        <div class="stat-tile"><div class="label">National Titles</div><div class="value">${prog.natTitles}</div><div class="sub">${prog.natRunnerUp || 0} runner-up</div></div>
        <div class="stat-tile"><div class="label">Best NCAA Finish</div><div class="value">${prog.bestFinish ? Utils.ordinal(prog.bestFinish) : '—'}</div><div class="sub">${prog.podiums} podiums</div></div>
        <div class="stat-tile"><div class="label">Highest Ranking</div><div class="value">${prog.highestRank ? '#' + prog.highestRank : '—'}</div><div class="sub">prestige ${trendStr}</div></div>
      </div>

      ${sectionTable('🏆 Team National Championships',
        ['Year', 'Squad', 'Coach', 'Team OVR', 'Score', 'Roster'],
        h.teamNat.map((t) => `<tr>
          <td>${t.year}</td><td>${gTag(t.gender)}</td><td>${coachLink(t.coach)}</td>
          <td class="num">${t.teamOverall || '—'}</td><td class="num">${t.teamScore ?? '—'}</td>
          <td><span class="clickable" data-view-roster="${t.year}-${t.gender}" style="cursor:pointer; color:var(--accent-hover);">View ▸</span></td>
        </tr>`),
        'No national team titles yet — the banner awaits.')}

      ${sectionTable('🥇 Individual National Champions',
        ['Year', 'Athlete', 'Coach', 'Event'],
        h.indivNat.map((t) => `<tr>
          <td>${t.year}</td><td>${gTag(t.gender)[0]} — ${athLink(t.athlete, t.athleteId)}</td><td>${coachLink(t.coach)}</td><td>${t.event}</td>
        </tr>`),
        'No individual national champions yet.')}

      ${sectionTable('🏅 Conference Team Championships',
        ['Year', 'Squad', 'Conference'],
        h.confTeam.map((t) => `<tr><td>${t.year}</td><td>${gTag(t.gender)}</td><td>${Utils.escapeHtml(t.conf)}</td></tr>`),
        'No conference team titles recorded yet.')}

      ${sectionTable('🥇 Individual Conference Champions',
        ['Year', 'Athlete', 'Coach'],
        h.indivConf.map((t) => `<tr><td>${t.year}</td><td>${gTag(t.gender)[0]} — ${athLink(t.athlete, t.athleteId)}</td><td>${coachLink(t.coach)}</td></tr>`),
        'No individual conference champions yet.')}

      ${sectionTable('🗺 Regional Championships — Team & Individual',
        ['Year', 'Type', 'Detail'],
        [
          ...h.regTeam.map((t) => `<tr><td>${t.year}</td><td>Team (${gTag(t.gender)[0]})</td><td>${Utils.escapeHtml(t.region)} Regional Champions</td></tr>`),
          ...h.indivReg.map((t) => `<tr><td>${t.year}</td><td>Individual (${gTag(t.gender)[0]})</td><td>${athLink(t.athlete, t.athleteId)}</td></tr>`)
        ].sort(),
        'No regional titles recorded yet.')}

      <div class="card" style="margin-bottom:16px;">
        <h2>🧢 Coach Timeline</h2>
        ${prog.coaches.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>Coach</th><th>Years</th><th class="num">Record</th><th class="num">Titles</th><th>Achievements</th></tr></thead>
          <tbody>${prog.coaches.slice().reverse().map((c) => {
            const rec = resolveCoachRecord(game, c);
            const cr = (rec && rec.careerRecord) || {};
            const wl = (cr.wins || cr.losses) ? `${cr.wins || 0}-${cr.losses || 0}` : '—';
            const titles = `${cr.nationalTitles || 0}🏆 ${cr.conferenceTitles || 0}🥇`;
            const ach = [];
            if (cr.natCOY) ach.push(`${cr.natCOY}× Nat CoY`);
            if (cr.regionalTitles) ach.push(`${cr.regionalTitles} reg`);
            if (cr.allAmericans) ach.push(`${cr.allAmericans} AAs`);
            return `<tr>
              <td>${coachLink(c.name)}</td>
              <td style="color:var(--text-dim);">${c.startYear}–${c.endYear || 'present'}</td>
              <td class="num">${wl}</td>
              <td class="num">${titles}</td>
              <td style="font-size:12px; color:var(--text-dim);">${ach.join(' · ') || '—'}</td>
            </tr>`;
          }).join('')}</tbody></table></div>`
        : '<div style="color:var(--text-dim); font-size:13px;">Records begin with your arrival.</div>'}
        <h3 style="margin-top:14px;">Prestige Trajectory</h3>
        ${ph.length ? `<div style="display:flex; align-items:flex-end; gap:2px; height:52px;">
          ${ph.slice(-30).map((p) => `<div title="${p.year}: ${p.prestige}" style="flex:1; background:var(--accent); opacity:0.75; border-radius:2px 2px 0 0; height:${Math.max(6, p.prestige * 0.52)}px;"></div>`).join('')}
        </div>` : '<div style="color:var(--text-dim); font-size:13px;">Prestige history builds season by season.</div>'}
      </div>`;

    wireProgramClicks(game, body);
    // Roster links jump to the championship season's summary (best effort).
    body.querySelectorAll('[data-view-roster]').forEach((el) => {
      el.addEventListener('click', () => UI.toast('Championship rosters are preserved in each athlete\'s profile — click any champion to explore.', 'info'));
    });
  }

  // Resolve a program-ledger coach entry to a live coach or registry record.
  function resolveCoachRecord(game, entry) {
    if (entry.coachId) {
      const live = game.getCoach(entry.coachId);
      if (live) return live;
    }
    const reg = (game.history.coachRegistry || []).slice().reverse().find((r) => r.name === entry.name);
    if (reg) return reg;
    return Object.values(game.world.coaches).find((c) => c.fullName === entry.name) || null;
  }

  /* Phase 5 — Program Records: every historical superlative, auto-updated. */
  function renderRecords(game, school, body) {
    const Legacy = window.XCD.engine.Legacy;
    const GOAT = window.XCD.engine.GOAT;
    const prog = Legacy.program(game, school.id);
    const winPct = Legacy.programWinPct(prog);
    const confStreak = longestConfStreak(game, school);

    // Best athlete & best coach in program history (by legacy score).
    const bestAth = GOAT.athletes(game).filter((r) => r.schoolId === school.id)[0];
    const coachEntries = (prog.coaches || []).map((c) => {
      const rec = resolveCoachRecord(game, c);
      const cr = (rec && rec.careerRecord) || {};
      return { name: c.name, coachId: rec && rec.id, score: (cr.nationalTitles || 0) * 100 + (cr.conferenceTitles || 0) * 10 + (cr.regionalTitles || 0) * 8 + (cr.seasons || 0), cr };
    }).sort((a, b) => b.score - a.score);
    const bestCoach = coachEntries[0];

    // Best single season ≈ the program's highest final poll finish on record.
    const bestSeason = prog.highestRank ? `#${prog.highestRank} national ranking` : '—';

    const rec = (label, value, sub) => `
      <div class="attr-row"><span class="attr-name">${label}</span><span style="text-align:right;"><strong>${value}</strong>${sub ? `<div style="font-size:11.5px; color:var(--text-faint);">${sub}</div>` : ''}</span></div>`;

    body.innerHTML = `
      <div class="grid cols-2">
        <div class="card">
          <h2>Championship Records</h2>
          ${rec('Most National Titles', prog.natTitles || 0)}
          ${rec('National Runner-Up Finishes', prog.natRunnerUp || 0)}
          ${rec('Most Conference Titles', prog.confTitles || 0)}
          ${rec('Most Regional Titles', prog.regionalTitles || 0)}
          ${rec('Most Individual National Champions', prog.indivNatChamps || 0)}
          ${rec('Most Individual Conference Champions', prog.indivConfChamps || 0)}
          ${rec('Most Individual Regional Champions', prog.indivRegChamps || 0)}
          ${rec('Longest Conference Title Streak', confStreak ? `${confStreak} yr${confStreak > 1 ? 's' : ''}` : '—')}
        </div>
        <div class="card">
          <h2>Program Records</h2>
          ${rec('Most Wins (all-time)', prog.wins || 0)}
          ${rec('Highest Winning Percentage', `${winPct}%`, `${prog.wins}-${prog.losses} all-time`)}
          ${rec('Most NCAA Appearances', prog.ncaaAppearances || 0)}
          ${rec('Longest NCAA Appearance Streak', prog.ncaaStreakBest ? `${prog.ncaaStreakBest} yr${prog.ncaaStreakBest > 1 ? 's' : ''}` : '—')}
          ${rec('Most All-Americans', prog.allAmericans || 0)}
          ${rec('Most All-Conference Athletes', prog.allConference || 0)}
          ${rec('Highest Ranked Finish', prog.highestRank ? `#${prog.highestRank}` : '—')}
          ${rec('Best Single Season', bestSeason)}
          ${rec('Top-25 Final Polls', prog.top25Finishes || 0)}
          ${rec('Seasons of History', prog.seasonsPlayed || 0)}
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <h2>🏅 Best Athlete in Program History</h2>
          ${bestAth ? `
            <div class="attr-row clickable" id="best-ath" style="cursor:pointer;">
              <span><strong>${bestAth.generational ? '⭐ ' : ''}${Utils.escapeHtml(bestAth.name)}</strong>
                <div style="font-size:12px; color:var(--text-dim);">${bestAth.natTitles} natl • ${bestAth.allAmerican} AA • ${bestAth.confChamps} conf • ${bestAth.wins} wins</div></span>
              <span style="text-align:right;"><strong>${bestAth.score}</strong><div style="font-size:11px; color:var(--text-faint);">legacy</div></span>
            </div>` : '<div style="color:var(--text-dim); font-size:13px;">No decorated athletes yet.</div>'}
        </div>
        <div class="card">
          <h2>🧢 Best Coach in Program History</h2>
          ${bestCoach && bestCoach.score > 0 ? `
            <div class="attr-row clickable" data-coach="${bestCoach.coachId || ''}" data-coach-name="${Utils.escapeHtml(bestCoach.name)}" style="cursor:pointer;">
              <span><strong>${Utils.escapeHtml(bestCoach.name)}</strong>
                <div style="font-size:12px; color:var(--text-dim);">${bestCoach.cr.nationalTitles || 0} natl • ${bestCoach.cr.conferenceTitles || 0} conf • ${bestCoach.cr.seasons || 0} seasons</div></span>
            </div>` : '<div style="color:var(--text-dim); font-size:13px;">The program\'s defining coach is yet to emerge.</div>'}
        </div>
      </div>`;

    const ba = body.querySelector('#best-ath');
    if (ba && bestAth) ba.addEventListener('click', () => UI.openAthlete(game, bestAth.athleteId, bestAth.name));
    wireProgramClicks(game, body);
  }

  /* Phase 6 — School Hall of Fame: only the historically significant. */
  function renderSchoolHOF(game, school, body) {
    const inductees = (game.history.hallOfFame || [])
      .filter((h) => h.schoolId === school.id)
      .sort((a, b) => (b.legacyScore ?? b.score) - (a.legacyScore ?? a.score));

    body.innerHTML = `
      <div class="card">
        <h2>🏛 ${Utils.escapeHtml(school.name)} Hall of Fame — ${inductees.length}</h2>
        <div style="color:var(--text-dim); font-size:12.5px; margin-bottom:10px;">
          Reserved for the historically significant — national champions, multi-time All-Americans, and
          the program's greatest careers. Click any legend for their full profile.
        </div>
        ${inductees.length ? inductees.map((h, i) => `
          <div class="attr-row clickable" data-hof="${i}" style="cursor:pointer; align-items:flex-start; padding:10px 0;">
            <span style="font-size:26px; margin-right:10px;">${h.portrait || '🏛'}</span>
            <span style="flex:1;">
              <strong>${Utils.escapeHtml(h.name)}</strong>
              <span style="color:var(--text-faint); font-size:12px;"> (${h.gender}) • ${h.yearsCompeted || h.inducted} • inducted ${h.inducted}</span>
              <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">
                ${(h.badges || []).filter((b) => b.key !== 'generational').map((b) => `${b.icon} ${b.label}`).slice(0, 4).join(' · ') || 'A defining career'}
              </div>
              <div style="font-size:12px; color:var(--text-dim);">
                ${h.stats.wins} wins • ${h.stats.top5} top-5s • ${h.stats.allAmerican} All-Am • ${h.stats.natChamp} natl titles
              </div>
            </span>
            <span style="text-align:right;"><strong style="font-size:18px;">${h.legacyScore ?? h.score}</strong><div style="font-size:11px; color:var(--text-faint);">legacy score</div></span>
          </div>`).join('')
        : '<div style="color:var(--text-dim); font-size:13px;">No inductees yet — a legendary career earns the first plaque.</div>'}
      </div>`;

    body.querySelectorAll('[data-hof]').forEach((row) => {
      row.addEventListener('click', () => {
        const h = inductees[Number(row.dataset.hof)];
        UI.openAthlete(game, h.athleteId, h.name);
      });
    });
  }

  /* ---------------- Overview tab ---------------- */
  function renderOverview(game, school, coach, container, outerContainer) {
    const b = school.budget;
    const h = school.historicalSuccess;
    const rivals = school.rivalries.map((id) => game.getSchool(id)).filter(Boolean);
    const repLevel = coach.reputationLevel || { label: 'Unknown', icon: '❔' };
    const tendencies = (coach.tendencies || [])
      .map((t) => (window.XCD.data.COACH_TENDENCIES.find((x) => x.key === t) || {}).label)
      .filter(Boolean);

    container.innerHTML = `
      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Prestige</div><div class="value">${school.prestige}</div><div class="sub">${Utils.ratingGrade(school.prestige)} • ${(() => {
          const ph = school.prestigeHistory || [];
          if (ph.length < 2) return 'new era';
          const d = ph[ph.length - 1].prestige - ph[Math.max(0, ph.length - 4)].prestige;
          return d > 1 ? '📈 rising' : d < -1 ? '📉 falling' : 'steady';
        })()}</div></div>
        <div class="stat-tile"><div class="label">Coach Reputation</div><div class="value">${Math.round(coach.reputation || 0)}</div><div class="sub">${repLevel.icon} ${repLevel.label}</div></div>
        <div class="stat-tile"><div class="label">Academics</div><div class="value">${school.academics}</div><div class="sub">${Utils.ratingGrade(school.academics)}</div></div>
        <div class="stat-tile"><div class="label">Weather</div><div class="value">${school.weather.tempBase}°F</div><div class="sub">${school.weather.altitude === 'High' ? '⛰ ' : ''}${school.weather.altitude} altitude • ${school.weather.humidity} humidity</div></div>
      </div>
      ${school.weather.altitude !== 'Low' ? `
        <div class="card" style="margin-bottom:16px; border-left:3px solid var(--accent);">
          <h3>⛰ ${school.weather.altitude === 'High' ? 'High-Altitude' : 'Moderate-Altitude'} Program</h3>
          <div style="color:var(--text-dim); font-size:13px;">Training at elevation builds bigger aerobic engines — a steady lift to <strong>Stamina</strong> and <strong>Lactate Threshold</strong>. The tradeoff: the thin air taxes recovery, so athletes fatigue faster and workload must be managed more carefully.</div>
        </div>` : ''}

      <div class="grid cols-2">
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <h2 style="margin:0;">${coach.portrait || '🧢'} ${coach.role === 'Assistant' ? 'Assistant Coach' : 'Head Coach'} — ${Utils.escapeHtml(coach.fullName)}</h2>
            <div style="display:flex; gap:6px;">
              ${window.XCD.engine.Careers.canRetire(game) ? '<button class="btn small" id="btn-retire-coach" title="Retire this coach — the dynasty continues with a successor you create">🏁 Retire</button>' : ''}
              <button class="btn small" id="btn-coach-profile">Full Profile</button>
            </div>
          </div>
          <div style="color:var(--text-dim); font-size:13px; margin:6px 0;">
            Age ${coach.age} • ${Utils.escapeHtml(coach.archetype || '')} • Year ${coach.yearsAtSchool + 1} at ${Utils.escapeHtml(school.name)} • Overall ${coach.overallRating}
          </div>
          ${(() => {
            // Show the counterpart on the staff: the head coach you serve under
            // as an assistant, or your recruiting coordinator as a head coach.
            const partnerId = coach.role === 'Assistant' ? school.coachId : school.assistantId;
            const partner = partnerId && partnerId !== coach.id ? game.getCoach(partnerId) : null;
            if (!partner) return '';
            const partnerRole = partner.role === 'Assistant' ? 'Assistant Coach' : 'Head Coach';
            return `<div style="font-size:12.5px; margin:0 0 10px;">
              ${partnerRole}: <span class="clickable" id="btn-partner-coach" style="cursor:pointer; color:var(--accent-hover);">${partner.portrait || '🧢'} ${Utils.escapeHtml(partner.fullName)}</span>
              <span style="color:var(--text-faint);"> • ${Utils.escapeHtml(partner.archetype || '')} • Overall ${partner.overallRating}</span>
              ${coach.role !== 'Assistant' ? ' <button class="btn small" id="btn-manage-staff" style="margin-left:6px;" title="Compare assistant candidates and reshape your staff">Manage Staff</button>' : ''}
            </div>`;
          })()}
          <div style="font-size:12.5px; margin-bottom:12px;">
            <span title="National reputation — separate from school prestige. Feeds recruiting, the portal, and job offers.">${repLevel.icon} <strong>${repLevel.label}</strong> (${Math.round(coach.reputation || 0)}/99)</span>
            ${tendencies.length ? `<span style="color:var(--text-dim);"> • ${tendencies.join(' • ')}</span>` : ''}
            <span style="color:var(--text-dim);"> • Career ${coach.careerRecord.wins}-${coach.careerRecord.losses} (${coach.winPct}%)</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:13px;">Upgrade Points: <strong style="color:${coach.upgradePoints ? 'var(--gold)' : 'var(--text-dim)'};">${coach.upgradePoints || 0}</strong></span>
            <span style="font-size:11.5px; color:var(--text-faint);">1 point = +2 to a rating</span>
          </div>
          ${COACH_ATTRS.map(([key, label, hint]) => `
            <div class="attr-row" style="margin-bottom:6px;" title="${hint}">
              <span class="attr-name" style="min-width:90px;">${label}</span>
              <div style="flex:1; margin:0 10px;">${UI.meter(coach[key])}</div>
              ${UI.ratingBadge(coach[key])}
              <button class="btn small" data-coach-upg="${key}" style="margin-left:8px;"
                ${(coach.upgradePoints || 0) > 0 && coach[key] < 99 ? '' : `disabled title="${coach[key] >= 99 ? 'Maxed out' : 'Earn points via titles, All-Americans, top classes, and beating expectations'}"`}>+2</button>
            </div>`).join('')}
          <div style="font-size:12px; color:var(--text-faint); margin-top:6px;">
            Earn upgrade points with conference/regional/national titles, individual champions,
            All-Americans, top-10 recruiting classes, and beating preseason expectations.
          </div>
          ${(() => {
            const D = window.XCD.data;
            const tp = D.trainingPhilosophy(coach.trainingPhilosophy);
            const rp = D.racePhilosophy(coach.racePhilosophy);
            return `
            <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:10px;">
              <div style="font-size:12.5px;"><strong>${tp.icon} Training Philosophy:</strong> ${tp.label}
                <span style="color:var(--text-faint);"> • permanent, scales with Training (${coach.training})</span></div>
              <div style="font-size:12px; color:var(--text-dim); margin:3px 0 10px;">${tp.desc}</div>
              <div style="font-size:12.5px; margin-bottom:5px;"><strong>Race Philosophy:</strong> <span style="color:var(--text-dim);">${rp.desc}</span></div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${D.RACE_PHILOSOPHIES.map((x) => `
                  <button class="btn small ${coach.racePhilosophy === x.key ? 'primary' : ''}" data-race-philo="${x.key}"
                    title="${x.desc.replace(/&amp;/g, '&').replace(/"/g, '&quot;')}">${x.icon} ${x.label}</button>`).join('')}
              </div>
            </div>`;
          })()}
        </div>

        <div class="card">
          <h2>Facilities — Overall ${school.facilitiesOverall}</h2>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:13px; color:var(--text-dim);">Facilities Fund: <strong style="color:var(--text);">$${school.budget.facilitiesFund.toLocaleString()}</strong></span>
            <button class="btn small primary" id="btn-fundraise" ${game.fundraisedYear === game.year ? 'disabled title="Boosters already gave this year"' : ''}>💰 Fundraise</button>
          </div>
          ${Object.entries(FACILITY_LABELS).map(([key, [label, effect]]) => {
            const level = school.facilities[key];
            const cost = window.XCD.engine.Finances.upgradeCost(level);
            const afford = school.budget.facilitiesFund >= cost && level < 99;
            return `
            <div class="attr-row" style="margin-bottom:6px;" title="${effect}">
              <span class="attr-name" style="min-width:128px; cursor:help;">${label}</span>
              <div style="flex:1; margin:0 10px;">${UI.meter(level)}</div>
              <span style="font-weight:700; font-size:12.5px; min-width:24px;">${level}</span>
              <button class="btn small" data-upg="${key}" ${afford ? '' : `disabled title="${level >= 99 ? 'World-class' : 'Costs $' + cost.toLocaleString()}"`}
                style="margin-left:8px;" title="Upgrade +${window.XCD.engine.Finances.UPGRADE_STEP} for $${cost.toLocaleString()} — ${effect}">▲ $${Math.round(cost / 1000)}k</button>
            </div>`;
          }).join('')}
          <div style="font-size:12px; color:var(--text-faint); margin-top:6px;">
            Every facility has a real training implication — hover a name to see it. Fundraising scales with
            program success and school size (${window.XCD.engine.Finances.schoolSizeLabel(school).toLowerCase()}),
            amplified by the Alumni Center. The fund also refills yearly — faster when you win.
          </div>
        </div>
      </div>

      <div class="grid cols-2" style="margin-top:16px;">
        <div class="card">
          <h2>Budget — $${b.total.toLocaleString()}</h2>
          <div class="attr-row"><span class="attr-name">Recruiting</span><span>$${b.recruiting.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">Travel</span><span>$${b.travel.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">Scholarships</span><span>$${b.scholarships.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">NIL Fund</span><span>$${b.nil.toLocaleString()}</span></div>
          <div class="attr-row"><span class="attr-name">Facilities Fund</span><span>$${b.facilitiesFund.toLocaleString()}</span></div>
          <div class="attr-row" style="margin-top:8px; border-top:1px solid var(--border); padding-top:8px;">
            <span class="attr-name">Scholarships (M / W)</span>
            <span>${school.scholarshipsAvailableM} / ${school.scholarshipsAvailableW}</span>
          </div>
        </div>

        <div class="card">
          <h2>Program History</h2>
          <div class="attr-row"><span class="attr-name">Men's Conference Titles</span><span>${h.conferenceTitlesM}</span></div>
          <div class="attr-row"><span class="attr-name">Women's Conference Titles</span><span>${h.conferenceTitlesW}</span></div>
          <div class="attr-row"><span class="attr-name">Men's National Titles</span><span>${h.nationalTitlesM}</span></div>
          <div class="attr-row"><span class="attr-name">Women's National Titles</span><span>${h.nationalTitlesW}</span></div>
          <h3 style="margin-top:14px;">Rivalries</h3>
          ${rivals.length
            ? rivals.map((r) => `<div class="attr-row"><span>${Utils.escapeHtml(r.name)}</span><span class="attr-name">${Utils.escapeHtml(r.conference)}</span></div>`).join('')
            : '<div style="color:var(--text-dim); font-size:13px;">No established rivals.</div>'}
          <h3 style="margin-top:14px;">School Records</h3>
          ${school.records && Object.keys(school.records).length
            ? Object.entries(school.records).sort().map(([key, rec]) => `
                <div class="attr-row">
                  <span class="attr-name">${key.replace('M-', "Men's ").replace('W-', "Women's ")}</span>
                  <span>${window.XCD.engine.Races.formatTime(rec.time)} — ${Utils.escapeHtml(rec.name)} ('${String(rec.year).slice(2)})</span>
                </div>`).join('')
            : '<div style="color:var(--text-dim); font-size:13px;">No records on the books yet — race!</div>'}
        </div>
      </div>`;

    const profBtn = container.querySelector('#btn-coach-profile');
    if (profBtn) profBtn.addEventListener('click', () => UI.showCoachCard(coach, game));

    // Legacy Dynasty Mode (Update 6, Section 1): retirement never ends the
    // dynasty — it starts the next generation. Confirm, then run the
    // succession wizard; nothing changes until the final confirmation.
    const retireBtn = container.querySelector('#btn-retire-coach');
    if (retireBtn) retireBtn.addEventListener('click', () => {
      const cr = coach.careerRecord || {};
      UI.showModal(`
        <h2>🏁 Retire ${Utils.escapeHtml(coach.fullName)}?</h2>
        <p style="color:var(--text-dim); font-size:13.5px; line-height:1.5; margin:10px 0;">
          Retirement is permanent — this career (${cr.seasons || 0} seasons,
          ${cr.nationalTitles || 0} national titles, ${cr.conferenceTitles || 0} conference titles)
          is sealed into the record books forever. <strong>The dynasty does not end:</strong>
          the world, every program, every athlete, and all history continue. You will
          immediately create a brand-new coach and choose where the next era begins.
        </p>
        <p style="color:var(--text-faint); font-size:12.5px;">You can back out at any step of the succession wizard before the final confirmation.</p>
        <div style="display:flex; gap:10px; margin-top:14px;">
          <button class="btn" data-modal-close>Keep Coaching</button>
          <button class="btn primary" id="btn-retire-confirm" style="flex:1;">Begin Succession →</button>
        </div>
      `, (modal) => {
        modal.querySelector('#btn-retire-confirm').addEventListener('click', () => {
          UI.closeModal();
          UI.successionFlow(game);
        });
      });
    });

    const partnerBtn = container.querySelector('#btn-partner-coach');
    if (partnerBtn) partnerBtn.addEventListener('click', () => {
      const partnerId = coach.role === 'Assistant' ? school.coachId : school.assistantId;
      const partner = partnerId && game.getCoach(partnerId);
      if (partner) UI.showCoachCard(partner, game);
    });

    // Staff management (Update 6, Section 9): compare candidates, hire, and
    // let the incumbent go — head coaches only, and never an empty seat.
    const staffBtn = container.querySelector('#btn-manage-staff');
    if (staffBtn) staffBtn.addEventListener('click', () => {
      const Coaching = window.XCD.engine.Coaching;
      const current = school.assistantId && game.getCoach(school.assistantId);
      const candidates = Coaching.assistantCandidates(game);
      // Full comparison profiles (spec Part 2, Section 12): philosophy,
      // every craft that feeds gameplay, experience, career record, and
      // reputation — enough to genuinely weigh candidates.
      const row = (c, tag, btnHtml) => {
        const cr = c.careerRecord || {};
        const seasons = cr.seasons || 0;
        const veteran = !!window.XCD.ui.state.game.world.coaches[c.id];
        const rp = (window.XCD.data.racePhilosophy(c.racePhilosophy) || {});
        return `
        <div class="attr-row" style="align-items:flex-start; padding:8px 0;">
          <div style="flex:1;">
            <div><strong>${c.portrait || '🧢'} ${Utils.escapeHtml(c.fullName)}</strong>
              <span style="color:var(--text-faint); font-size:11.5px;"> ${tag}</span>
              ${veteran && !tag ? '<span class="rating r-good" style="font-size:10px;" title="A real free agent from the coaching pool — career history and all">Free Agent</span>' : ''}</div>
            <div style="color:var(--text-dim); font-size:12px; margin-top:2px;">
              Age ${c.age} • ${Utils.escapeHtml(c.archetype || '')} •
              ${Utils.escapeHtml((window.XCD.data.trainingPhilosophy(c.trainingPhilosophy) || {}).label || '')}${rp.label ? ` / ${Utils.escapeHtml(rp.label)}` : ''}
              ${seasons ? ` • ${seasons} season${seasons > 1 ? 's' : ''} coached${cr.wins || cr.losses ? ` (${cr.wins || 0}-${cr.losses || 0})` : ''}${cr.nationalTitles ? ` • ${cr.nationalTitles}🏆` : ''}` : ' • First job'}
              • Rep ${Math.round(c.reputation || 0)}
            </div>
            <div style="font-size:12px; margin-top:3px;">
              <span title="Recruiting pull — adds weekly recruiting points">Rec <strong>${c.recruiting}</strong></span> •
              <span title="Development — multiplies every athlete's weekly growth">Dev <strong>${c.training}</strong></span> •
              <span title="Peaking — sharpens championship race day">Peak <strong>${c.peaking}</strong></span> •
              <span title="Culture — feeds squad chemistry">Cul <strong>${c.culture}</strong></span> •
              <span title="Motivation — lifts struggling athletes' morale">Mot <strong>${c.motivation ?? 55}</strong></span> •
              <span title="Communication — bonds that keep athletes home">Com <strong>${c.relationships ?? 55}</strong></span> •
              <span title="Scouting accuracy">Eval <strong>${c.talentEval}</strong></span>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">${btnHtml}</div>
        </div>`;
      };
      const gate = Coaching.canHireAssistant(game);
      UI.showModal(`
        <button class="btn small modal-close" data-modal-close>✕ Close</button>
        <h2>👥 Assistant Staff</h2>
        <p style="color:var(--text-dim); font-size:12.5px; margin:6px 0 10px;">
          Better Staff Management attracts stronger applicants. Hiring replaces your
          current assistant, and a program makes <strong>one staff hire per offseason</strong> —
          coaches finish the season they signed on for.
        </p>
        ${gate.ok ? '' : `<div style="color:var(--warning); font-size:12.5px; margin:0 0 10px;">🔒 ${gate.why}</div>`}
        <h3>Current</h3>
        ${current ? row(current, `• Year ${(current.yearsAtSchool || 0) + 1} on staff`, `<button class="btn small" id="btn-view-current">Profile</button>`) : '<div style="color:var(--text-dim); font-size:13px;">Vacant (a hire below fills it).</div>'}
        <h3 style="margin-top:12px;">Candidates This Week</h3>
        ${candidates.map((c, i) => row(c, '', `
          <button class="btn small primary" data-hire="${i}" ${gate.ok ? '' : `disabled title="${gate.why}"`}>Hire</button>
          <button class="btn small" data-view-cand="${i}">Profile</button>`)).join('')}
        <div style="color:var(--text-faint); font-size:11.5px; margin-top:8px;">
          A strong assistant genuinely matters: Dev multiplies weekly development, Rec adds recruiting
          points, Cul feeds chemistry, Mot lifts struggling athletes, and Peak sharpens championship day.
        </div>
      `, (modal) => {
        const viewBtn = modal.querySelector('#btn-view-current');
        if (viewBtn) viewBtn.addEventListener('click', () => UI.showCoachCard(current, game));
        modal.querySelectorAll('[data-view-cand]').forEach((btn) => {
          btn.addEventListener('click', () => UI.showCoachCard(candidates[Number(btn.dataset.viewCand)], game));
        });
        modal.querySelectorAll('[data-hire]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cand = candidates[Number(btn.dataset.hire)];
            const res = window.XCD.engine.Coaching.hireAssistant(game, cand);
            UI.toast(res.message, res.ok ? 'success' : 'error');
            UI.closeModal();
            if (res.ok) render(outerContainer);
          });
        });
      });
    });

    container.querySelectorAll('[data-race-philo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.racePhilo;
        if (coach.racePhilosophy === key) return;
        coach.racePhilosophy = key;
        UI.toast(`Race philosophy set: ${window.XCD.data.racePhilosophy(key).label}.`, 'success');
        render(outerContainer);
      });
    });

    container.querySelectorAll('[data-coach-upg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.coachUpg;
        if ((coach.upgradePoints || 0) <= 0 || coach[key] >= 99) return;
        coach.upgradePoints -= 1;
        coach[key] = Math.min(99, coach[key] + 2);
        UI.toast(`${COACH_ATTRS.find(([k]) => k === key)[1]} improved to ${coach[key]}.`, 'success');
        render(outerContainer);
      });
    });

    container.querySelectorAll('[data-upg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = window.XCD.engine.Finances.upgradeFacility(game, school.id, btn.dataset.upg);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(outerContainer);
      });
    });
    const fundBtn = container.querySelector('#btn-fundraise');
    if (fundBtn) {
      fundBtn.addEventListener('click', () => {
        const result = window.XCD.engine.Finances.fundraise(game);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(outerContainer);
      });
    }
  }

  UI.screens.school = { render };
})();
