/*
 * Shared player card modal: full attribute breakdown for any athlete.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  const PHYSICAL_ATTRS = [
    ['vo2Max', 'VO₂ Max'], ['runningEconomy', 'Running Economy'], ['stamina', 'Stamina'],
    ['lactateThreshold', 'Lactate Threshold'], ['speed', 'Speed'], ['injuryResistance', 'Injury Resistance']
  ];

  const MENTAL_ATTRS = [
    ['workEthic', 'Work Ethic'], ['confidence', 'Confidence'], ['mentalToughness', 'Mental Toughness'],
    ['academics', 'Academics'], ['coachRelationship', 'Coach Relationship'], ['teamRelationship', 'Team Relationship'],
    ['raceIQ', 'Race IQ'], ['discipline', 'Discipline'], ['leadership', 'Leadership'],
    ['consistency', 'Consistency'], ['coachability', 'Coachability']
  ];

  const ACC_ICON = {
    natChampTeam: '🏆', natChampIndiv: '🥇', natRunnerUp: '🥈', runnerOfYear: '🏅',
    allAmerican: '🇺🇸', freshmanOfYear: '🌱', regChamp: '🗺', confChamp: '🥇',
    confRunnerOfYear: '🏅', confFreshmanOfYear: '🌱',
    allConference: '🏅', academicAllAmerican: '📚', nxnChampion: '👟', nxnAllAmerican: '🎽'
  };

  // Accolades grouped logically (Update 13, Phase 5): National, Regional,
  // Conference, Academic, and High School honors in their own sections rather
  // than one long undifferentiated list. Chronological order is preserved
  // within each group.
  const ACC_GROUPS = [
    { label: 'National', types: ['natChampIndiv', 'natChampTeam', 'natRunnerUp', 'runnerOfYear', 'allAmerican', 'freshmanOfYear'] },
    { label: 'Regional', types: ['regChamp'] },
    { label: 'Conference', types: ['confChamp', 'confRunnerOfYear', 'confFreshmanOfYear', 'allConference'] },
    { label: 'Academic', types: ['academicAllAmerican'] },
    { label: 'High School', types: ['nxnChampion', 'nxnAllAmerican'] }
  ];

  function accoladesCard(accolades, Legacy) {
    if (!accolades || !accolades.length) return '';
    const label = (acc) => Legacy && Legacy.accoladeLabel
      ? Legacy.accoladeLabel(acc) : `${acc.year} ${acc.label || acc.type}`;
    const row = (acc) => `<div class="attr-row" style="padding:4px 0;">
      <span>${ACC_ICON[acc.type] || '🎖'} ${Utils.escapeHtml(label(acc))}</span></div>`;
    let seen = 0;
    const sections = ACC_GROUPS.map((grp) => {
      const rows = accolades.filter((a) => grp.types.includes(a.type));
      if (!rows.length) return '';
      seen += rows.length;
      return `<div style="margin-bottom:6px;">
        <div style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); margin:4px 0;">${grp.label} — ${rows.length}</div>
        ${rows.map(row).join('')}</div>`;
    }).join('');
    // Any accolade type not in a known group still shows (forward-compatible).
    const other = accolades.filter((a) => !ACC_GROUPS.some((g) => g.types.includes(a.type)));
    const otherHtml = other.length ? `<div style="margin-bottom:6px;">
      <div style="font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em; color:var(--text-faint); margin:4px 0;">Other — ${other.length}</div>
      ${other.map(row).join('')}</div>` : '';
    return `
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Career Accolades — ${accolades.length}</h3>
        <div style="max-height:240px; overflow-y:auto;">${sections}${otherHtml}</div>
      </div>`;
  }
  UI._accoladesCard = accoladesCard;

  UI.showPlayerCard = function (athlete, game) {
    const school = athlete.schoolId ? game.getSchool(athlete.schoolId) : null;
    const heightFt = Math.floor(athlete.heightIn / 12);
    const heightIn = athlete.heightIn % 12;

    const attrRows = (attrs) => attrs.map(([key, label]) => `
      <div class="attr-row">
        <span class="attr-name">${label}</span>
        ${UI.ratingBadge(athlete[key])}
      </div>`).join('');

    const statusColor = athlete.fatigue > 70 ? 'red' : athlete.fatigue > 40 ? 'yellow' : 'green';
    const moraleColor = athlete.morale < 40 ? 'red' : athlete.morale < 65 ? 'yellow' : 'green';

    // Permanent award badges (Part 10) — earned years, displayed for life.
    const Legacy = window.XCD.engine.Legacy;
    const badges = Legacy ? Legacy.badgesFor(athlete) : [];
    const badgesHtml = badges.length ? `
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin:0 0 14px;">
        ${badges.map((b) => `
          <span style="background:var(--accent-soft); border:1px solid var(--border); border-radius:14px; padding:4px 10px; font-size:12.5px;"
            title="${b.label}${b.years.length ? ' — ' + b.years.join(', ') : ''}">
            ${b.icon} ${b.label}${b.years.length ? ` <span style="color:var(--text-dim);">${b.years.join(' · ')}</span>` : ''}
          </span>`).join('')}
      </div>` : '';

    // Full career accolade ledger (Update 4, Part 1): every honor with its
    // division, conference, and year — a complete historical record that
    // preserves honors earned across multiple divisions/conferences.
    const accolades = Legacy ? Legacy.accoladesFor(athlete) : [];
    const accoladesHtml = accoladesCard(accolades, Legacy);

    // Transfer Risk Indicator (spec Part 2, Section 14): the athlete's
    // Transfer Desire as a five-step level; expanding it reveals exactly
    // what's pushing them out — or anchoring them home.
    const risk = window.XCD.engine.Portal && window.XCD.engine.Portal.transferRisk
      ? window.XCD.engine.Portal.transferRisk(game, athlete)
      : null;
    const riskHtml = risk ? `
      <div class="attr-row" style="align-items:flex-start;"><span class="attr-name">Transfer Risk</span>
        <details style="text-align:right;">
          <summary style="cursor:pointer; color:${risk.level.color}; font-weight:700; list-style:none;">
            ${risk.graduating ? '<span style="color:var(--text-faint); font-weight:400;">— (finishing career)</span>' : `${risk.level.label} ▾`}
          </summary>
          ${risk.graduating ? '' : `
          <div style="font-size:12px; color:var(--text-dim); margin-top:4px;">
            ${(risk.level.key === 'very-low' || risk.level.key === 'low') && risk.anchors.length
              ? risk.anchors.map((r) => `<div>✓ ${Utils.escapeHtml(r)}</div>`).join('')
              : risk.reasons.length
                ? risk.reasons.map((r) => `<div>• ${Utils.escapeHtml(r)}</div>`).join('')
                : '<div>No pressing concerns</div>'}
          </div>`}
        </details>
      </div>` : '';

    // Injury history (Injury System Expansion): the permanent career ledger,
    // with the long-term toll of repeated major injuries spelled out.
    const ci = athlete.careerInjuries || [];
    const majors = ci.filter((i) => i.major).length;
    const injuryHistoryHtml = ci.length ? `
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Injury History — ${ci.length}${majors ? ` (${majors} major)` : ''}</h3>
        ${(athlete.potentialLostToInjury || 0) > 0 ? `
          <div style="color:var(--danger); font-size:12.5px; margin:4px 0 8px;">
            ⚠ Repeated major injuries have lowered this athlete's long-term ceiling
            (−${athlete.potentialLostToInjury} potential) and slowed future development.
          </div>` : ''}
        <div style="max-height:180px; overflow-y:auto;">
          ${ci.slice().reverse().map((inj) => `
            <div class="attr-row" style="padding:4px 0;">
              <span>${Utils.escapeHtml(inj.type)}${inj.major ? ' <span style="color:var(--danger); font-size:10.5px; font-weight:700;">MAJOR</span>' : ''}</span>
              <span style="color:var(--text-dim);">Wk ${inj.week}, ${inj.year} — ${inj.weeks} wk out</span>
            </div>`).join('')}
        </div>
      </div>` : '';

    // Career overall progression (Update 4, Part 10).
    const oh = athlete.overallHistory || [];
    const progressHtml = oh.length >= 2 ? `
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Career Progression</h3>
        <div style="display:flex; align-items:flex-end; gap:3px; height:48px;">
          ${oh.slice(-8).map((h) => `<div title="${h.year}: ${h.overall} OVR" style="flex:1; background:var(--accent); opacity:0.75; border-radius:2px 2px 0 0; height:${Math.max(6, h.overall * 0.48)}px;"></div>`).join('')}
        </div>
        <div style="font-size:11.5px; color:var(--text-faint); margin-top:4px;">${oh[0].year} (${oh[0].overall}) → ${oh[oh.length - 1].year} (${oh[oh.length - 1].overall})</div>
      </div>` : '';

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div style="flex:0 0 auto; margin-right:14px;">${UI.avatar(athlete, { size: 64, outfit: 'jersey' })}</div>
        <div class="who">
          <h2>${athlete.generational ? '⭐ ' : ''}${Utils.escapeHtml(athlete.fullName)}</h2>
          <div class="sub">
            ${athlete.classYear} • ${athlete.gender === 'M' ? "Men's" : "Women's"} •
            ${Utils.escapeHtml(athlete.hometownCity)}, ${athlete.hometownState === 'INT' ? Utils.escapeHtml(athlete.country || 'Intl') : athlete.hometownState} •
            ${heightFt}'${heightIn}" / ${athlete.weightLb} lb • Age ${athlete.age}
          </div>
          <div class="sub">
            ${school ? Utils.escapeHtml(school.name) + ' • ' : ''}Major: ${Utils.escapeHtml(athlete.major)} •
            ${Utils.escapeHtml(athlete.personality)}${athlete.isWalkOn ? ' • <span style="color:var(--text-faint);">Walk-On</span>' : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:30px; font-weight:800;">${athlete.currentOverall}</div>
          <div style="font-size:12px; color:var(--text-dim);">OVERALL (POT ${athlete.potential})</div>
        </div>
      </div>

      ${badgesHtml}

      <div class="grid cols-4" style="margin-bottom:16px;">
        <div>
          <h3>Fatigue — ${Math.round(athlete.fatigue)}</h3>
          ${UI.meter(athlete.fatigue, statusColor)}
        </div>
        <div>
          <h3>Sharpness — ${Math.round(athlete.sharpness ?? 55)}</h3>
          ${UI.meter(Math.round(athlete.sharpness ?? 55))}
        </div>
        <div>
          <h3>Morale — ${Math.round(athlete.morale)}</h3>
          ${UI.meter(athlete.morale, moraleColor)}
        </div>
        <div>
          <h3>Fitness — ${Math.round(athlete.fitness)}</h3>
          ${UI.meter(athlete.fitness)}
        </div>
      </div>

      <div class="grid cols-2" style="margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <h3>Status &amp; Career</h3>
          <div class="attr-row"><span class="attr-name">Health</span><span>${
            athlete.injury
              ? `<span style="color:var(--danger);">Injured — ${Utils.escapeHtml(athlete.injury.type)} (${athlete.injury.weeksRemaining} wk)</span>`
              : athlete.health === 'Recovering'
                ? `<span style="color:var(--warning);">Recovering — rebuilding race form (~${Math.max(1, athlete.recentInjuryWeeks || 1)} wk)</span>`
                : Utils.escapeHtml(athlete.health)
          }</span></div>
          ${riskHtml}
          <div class="attr-row"><span class="attr-name">Eligibility Left</span><span>${athlete.eligibilityRemaining} yr</span></div>
          <div class="attr-row"><span class="attr-name">Redshirt</span><span>${athlete.redshirt}</span></div>
          <div class="attr-row"><span class="attr-name">Races / Wins / Top-5s</span><span>${athlete.careerStats.races} / ${athlete.careerStats.wins} / ${athlete.careerStats.top5}</span></div>
          ${athlete.hsPB !== undefined ? `<div class="attr-row"><span class="attr-name">HS 5K PB</span><span title="Official high-school personal best — permanent history">${window.XCD.engine.Races.formatTime(athlete.hsPB)}</span></div>` : ''}
          ${athlete.nxn && athlete.nxn.finish ? `<div class="attr-row"><span class="attr-name">HSXN Finish</span><span>${athlete.nxn.finish === 1 ? '🥇 Champion' : '#' + athlete.nxn.finish}${athlete.nxn.year ? ` (${athlete.nxn.year})` : ''}</span></div>` : ''}
          ${Object.entries(athlete.careerStats.personalBests || {}).map(([k, t]) =>
            `<div class="attr-row"><span class="attr-name">PR ${k}</span><span>${window.XCD.engine.Races ? window.XCD.engine.Races.formatTime(t) : t}</span></div>`).join('')}
        </div>
        <div class="card" style="padding:12px;">
          <h3>Preferences</h3>
          <div class="attr-row"><span class="attr-name">Distance</span><span>${athlete.preferredDistance}</span></div>
          <div class="attr-row"><span class="attr-name">Climate</span><span>${athlete.preferredClimate}</span></div>
          <div class="attr-row"><span class="attr-name">School Size</span><span>${athlete.preferredSchoolSize}</span></div>
        </div>
      </div>

      ${athlete.raceLog && athlete.raceLog.length ? `
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Recent Races</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>When</th><th>Meet</th><th></th><th class="num">Place</th><th class="num">Time</th></tr></thead>
          <tbody>
            ${athlete.raceLog.map((r) => `
              <tr>
                <td>Wk ${r.w}, ${r.y}</td>
                <td>${Utils.escapeHtml(r.m)}</td>
                <td>${r.d}</td>
                <td class="num">${r.p === 1 ? '🥇 1' : r.p}</td>
                <td class="num">${window.XCD.engine.Races.formatTime(r.t)}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>` : ''}

      ${accoladesHtml}
      ${injuryHistoryHtml}
      ${progressHtml}

      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Physical Ratings</h3>
        <div class="attr-grid">${attrRows(PHYSICAL_ATTRS)}</div>
      </div>

      <div class="card" style="padding:12px;">
        <h3>Mental & Makeup</h3>
        <div class="attr-grid">${attrRows(MENTAL_ATTRS)}</div>
      </div>
    `);
  };

  /*
   * Legend card (Update 12, Phase 3): the profile of a GRADUATED athlete,
   * rendered from an alumni / Hall of Fame ledger record — name, badges,
   * full accolade history, career stats, and legacy score. This is what
   * makes every historical name clickable forever, long after the live
   * Athlete object has left the world.
   */
  UI.showLegendCard = function (rec, game) {
    if (!rec) { UI.toast('That career is lost to history.', 'error'); return; }
    const Legacy = window.XCD.engine.Legacy;
    const GOAT = window.XCD.engine.GOAT;
    const badges = rec.badges || [];
    const accolades = (rec.accolades || []).slice()
      .sort((a, b) => (a.year - b.year)); // chronological within each grouped section
    const stats = rec.stats || {};
    const legacyScore = rec.legacyScore ?? (GOAT ? GOAT.athleteScore({
      accolades: rec.accolades || [], stats,
      seasons: (rec.overallHistory || []).length || 4
    }) : '—');
    const oh = rec.overallHistory || [];
    const winPct = stats.races ? Math.round((stats.wins / stats.races) * 1000) / 10 : 0;
    const school = rec.schoolId && game ? game.getSchool(rec.schoolId) : null;

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div style="flex:0 0 auto; margin-right:14px;">${UI.avatar(rec, { size: 64, outfit: 'jersey' })}</div>
        <div class="who">
          <h2>${rec.generational ? '⭐ ' : '🏛 '}${Utils.escapeHtml(rec.name)}</h2>
          <div class="sub">
            ${rec.gender === 'M' ? "Men's" : "Women's"} •
            <span class="${school ? 'clickable' : ''}" id="legend-school" ${school ? 'style="cursor:pointer; color:var(--accent-hover);"' : ''}>${Utils.escapeHtml(rec.school || '?')}</span>
            ${rec.gradYear ? ` • Class of ${rec.gradYear}` : ''}${rec.yearsCompeted ? ` • Competed ${rec.yearsCompeted}` : ''}
            ${rec.inducted ? ` • <span style="color:var(--gold, #d4a017);">Hall of Fame ’${String(rec.inducted).slice(2)}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:30px; font-weight:800;">${legacyScore}</div>
          <div style="font-size:12px; color:var(--text-dim);">LEGACY SCORE</div>
        </div>
      </div>

      ${badges.length ? `
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin:0 0 14px;">
        ${badges.map((b) => `
          <span style="background:var(--accent-soft); border:1px solid var(--border); border-radius:14px; padding:4px 10px; font-size:12.5px;"
            title="${b.label}${b.years && b.years.length ? ' — ' + b.years.join(', ') : ''}">
            ${b.icon} ${b.label}${b.years && b.years.length ? ` <span style="color:var(--text-dim);">${b.years.join(' · ')}</span>` : ''}
          </span>`).join('')}
      </div>` : ''}

      <div class="grid cols-4" style="margin-bottom:14px;">
        <div class="stat-tile"><div class="label">Races</div><div class="value">${stats.races ?? '—'}</div></div>
        <div class="stat-tile"><div class="label">Wins</div><div class="value">${stats.wins ?? 0}</div><div class="sub">${winPct}% win rate</div></div>
        <div class="stat-tile"><div class="label">Top-5 Finishes</div><div class="value">${stats.top5 ?? 0}</div></div>
        <div class="stat-tile"><div class="label">Seasons</div><div class="value">${oh.length || '—'}</div></div>
      </div>

      ${accolades.length
        ? accoladesCard(accolades, Legacy)
        : '<div class="card" style="padding:12px; margin-bottom:14px; color:var(--text-dim);">A career remembered for the wins, not the hardware.</div>'}

      ${stats.prs && Object.keys(stats.prs).length ? `
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Personal Bests</h3>
        ${Object.entries(stats.prs).sort().map(([k, t]) =>
          `<div class="attr-row"><span class="attr-name">PR ${k}</span><span>${window.XCD.engine.Races.formatTime(t)}</span></div>`).join('')}
      </div>` : ''}

      ${oh.length >= 2 ? `
      <div class="card" style="padding:12px;">
        <h3>Career Progression</h3>
        <div style="display:flex; align-items:flex-end; gap:3px; height:48px;">
          ${oh.slice(-8).map((h) => `<div title="${h.year}: ${h.overall} OVR" style="flex:1; background:var(--accent); opacity:0.75; border-radius:2px 2px 0 0; height:${Math.max(6, h.overall * 0.48)}px;"></div>`).join('')}
        </div>
        <div style="font-size:11.5px; color:var(--text-faint); margin-top:4px;">${oh[0].year} (${oh[0].overall}) → ${oh[oh.length - 1].year} (${oh[oh.length - 1].overall})</div>
      </div>` : ''}
    `, (modal) => {
      const se = modal.querySelector('#legend-school');
      if (se && school) se.addEventListener('click', () => UI.showSchoolCard(school, game));
    });
  };

  /*
   * Universal athlete profile opener (Update 12, Phase 3): resolves a name
   * to the right card no matter where the career stands — a live roster
   * athlete, a recruit, a decorated alumnus, or a Hall of Famer. Every
   * athlete click in the game routes through here so there are no dead ends.
   */
  UI.openAthlete = function (game, athleteId, fallbackName) {
    if (athleteId) {
      const live = game.getAthlete(athleteId) || (game.world.recruits || {})[athleteId];
      if (live) { UI.showPlayerCard(live, game); return true; }
      const alum = (game.history.alumni || []).find((x) => x.athleteId === athleteId);
      if (alum) { UI.showLegendCard(alum, game); return true; }
      const hof = (game.history.hallOfFame || []).find((x) => x.athleteId === athleteId);
      if (hof) { UI.showLegendCard(hof, game); return true; }
    }
    if (fallbackName) {
      const alum = (game.history.alumni || []).slice().reverse().find((x) => x.name === fallbackName);
      if (alum) { UI.showLegendCard(alum, game); return true; }
      const hof = (game.history.hallOfFame || []).slice().reverse().find((x) => x.name === fallbackName);
      if (hof) { UI.showLegendCard(hof, game); return true; }
    }
    UI.toast('That career has faded from the historical record.', 'info');
    return false;
  };

  // Universal coach opener: live coach, or the retired registry.
  UI.openCoach = function (game, coachId, fallbackName) {
    if (coachId) {
      const live = game.getCoach(coachId);
      if (live) { UI.showCoachCard(live, game); return true; }
    }
    if (fallbackName) {
      const reg = (game.history.coachRegistry || []).slice().reverse().find((r) => r.name === fallbackName);
      if (reg) { UI.showCoachCard(reg, game, { retired: true }); return true; }
      const past = (game.history.playerCareers || []).slice().reverse().find((r) => r.name === fallbackName);
      if (past) { UI.showCoachCard(past, game, { retired: true }); return true; }
    }
    UI.toast('That coaching career has faded from the registry.', 'info');
    return false;
  };
})();
