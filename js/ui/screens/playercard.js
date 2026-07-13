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
    const ACC_ICON = {
      natChampTeam: '🏆', natChampIndiv: '🥇', runnerOfYear: '🏅', allAmerican: '🇺🇸',
      freshmanOfYear: '🌱', confChamp: '🥇', confRunnerOfYear: '🏅', confFreshmanOfYear: '🌱',
      allConference: '🏅', academicAllAmerican: '📚'
    };
    const accoladesHtml = accolades.length ? `
      <div class="card" style="padding:12px; margin-bottom:14px;">
        <h3>Career Accolades — ${accolades.length}</h3>
        <div style="max-height:220px; overflow-y:auto;">
          ${accolades.map((acc) => `
            <div class="attr-row" style="padding:4px 0;">
              <span>${ACC_ICON[acc.type] || '🎖'} ${Utils.escapeHtml(Legacy.accoladeLabel(acc))}</span>
            </div>`).join('')}
        </div>
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
        <div class="who">
          <h2>${athlete.generational ? '⭐ ' : ''}${Utils.escapeHtml(athlete.fullName)}</h2>
          <div class="sub">
            ${athlete.classYear} • ${athlete.gender === 'M' ? "Men's" : "Women's"} •
            ${Utils.escapeHtml(athlete.hometownCity)}, ${athlete.hometownState} •
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
          <div class="attr-row"><span class="attr-name">Eligibility Left</span><span>${athlete.eligibilityRemaining} yr</span></div>
          <div class="attr-row"><span class="attr-name">Redshirt</span><span>${athlete.redshirt}</span></div>
          <div class="attr-row"><span class="attr-name">Races / Wins / Top-5s</span><span>${athlete.careerStats.races} / ${athlete.careerStats.wins} / ${athlete.careerStats.top5}</span></div>
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
})();
