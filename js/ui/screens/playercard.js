/*
 * Shared player card modal: full attribute breakdown for any athlete.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  const PHYSICAL_ATTRS = [
    ['vo2Max', 'VO2 Max'], ['lactateThreshold', 'Lactate Threshold'], ['endurance', 'Endurance'],
    ['rawSpeed', 'Raw Speed'], ['kickSpeed', 'Kick Speed'], ['acceleration', 'Acceleration'],
    ['runningEconomy', 'Running Economy'], ['strength', 'Strength'], ['recovery', 'Recovery'],
    ['stamina', 'Stamina'], ['packRunning', 'Pack Running'], ['hillRunning', 'Hill Running'],
    ['downhillRunning', 'Downhill Running'], ['trackSpeed', 'Track Speed'],
    ['fiveKAbility', '5K Ability'], ['eightKAbility', '8K Ability'], ['tenKAbility', '10K Ability'],
    ['weatherPerformance', 'Weather Perf.'], ['altitudePerformance', 'Altitude Perf.'],
    ['injuryResistance', 'Injury Resist.'], ['durability', 'Durability']
  ];

  const MENTAL_ATTRS = [
    ['mentalToughness', 'Mental Toughness'], ['raceIQ', 'Race IQ'], ['discipline', 'Discipline'],
    ['leadership', 'Leadership'], ['confidence', 'Confidence'], ['consistency', 'Consistency'],
    ['workEthic', 'Work Ethic'], ['coachability', 'Coachability'], ['academics', 'Academics']
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

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div class="who">
          <h2>${Utils.escapeHtml(athlete.fullName)}</h2>
          <div class="sub">
            ${athlete.classYear} • ${athlete.gender === 'M' ? "Men's" : "Women's"} •
            ${Utils.escapeHtml(athlete.hometownCity)}, ${athlete.hometownState} •
            ${heightFt}'${heightIn}" / ${athlete.weightLb} lb • Age ${athlete.age}
          </div>
          <div class="sub">
            ${school ? Utils.escapeHtml(school.name) + ' • ' : ''}Major: ${Utils.escapeHtml(athlete.major)} •
            ${Utils.escapeHtml(athlete.personality)}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:30px; font-weight:800;">${athlete.currentOverall}</div>
          <div style="font-size:12px; color:var(--text-dim);">OVERALL (POT ${athlete.potential})</div>
        </div>
      </div>

      <div class="grid cols-3" style="margin-bottom:16px;">
        <div>
          <h3>Fatigue — ${athlete.fatigue}</h3>
          ${UI.meter(athlete.fatigue, statusColor)}
        </div>
        <div>
          <h3>Morale — ${athlete.morale}</h3>
          ${UI.meter(athlete.morale, moraleColor)}
        </div>
        <div>
          <h3>Fitness — ${athlete.fitness}</h3>
          ${UI.meter(athlete.fitness)}
        </div>
      </div>

      <div class="grid cols-2" style="margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <h3>Status</h3>
          <div class="attr-row"><span class="attr-name">Health</span><span>${Utils.escapeHtml(athlete.health)}${athlete.injury ? ` — ${Utils.escapeHtml(athlete.injury.type)} (${athlete.injury.weeksRemaining} wk)` : ''}</span></div>
          <div class="attr-row"><span class="attr-name">Eligibility Left</span><span>${athlete.eligibilityRemaining} yr</span></div>
          <div class="attr-row"><span class="attr-name">Redshirt</span><span>${athlete.redshirt}</span></div>
          <div class="attr-row"><span class="attr-name">Career Races</span><span>${athlete.careerStats.races}</span></div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>Preferences</h3>
          <div class="attr-row"><span class="attr-name">Distance</span><span>${athlete.preferredDistance}</span></div>
          <div class="attr-row"><span class="attr-name">Climate</span><span>${athlete.preferredClimate}</span></div>
          <div class="attr-row"><span class="attr-name">School Size</span><span>${athlete.preferredSchoolSize}</span></div>
        </div>
      </div>

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
