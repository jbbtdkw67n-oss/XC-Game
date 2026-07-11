/*
 * My Program screen: school profile, coach card, facilities, budget, history.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;

  const FACILITY_LABELS = {
    trainingCenter: 'Training Center', weightRoom: 'Weight Room', recoveryCenter: 'Recovery Center',
    nutrition: 'Nutrition Program', lockerRoom: 'Locker Room', indoorTrack: 'Indoor Track',
    altitudeRoom: 'Altitude Room', sportsScienceLab: 'Sports Science Lab'
  };

  const COACH_ATTRS = [
    ['recruiting', 'Recruiting'], ['training', 'Training'], ['raceStrategy', 'Race Strategy'],
    ['development', 'Development'], ['loyalty', 'Loyalty'], ['charisma', 'Charisma'],
    ['discipline', 'Discipline'], ['culture', 'Culture']
  ];

  function render(container) {
    const game = UI.state.game;
    const school = game.getPlayerSchool();
    const coach = game.getPlayerCoach();
    const b = school.budget;
    const h = school.historicalSuccess;
    const rivals = school.rivalries.map((id) => game.getSchool(id)).filter(Boolean);

    container.innerHTML = `
      <div class="screen-header">
        <h1>${Utils.escapeHtml(school.name)}</h1>
        <div class="actions">
          <span style="color:var(--text-dim); font-size:13px;">
            ${Utils.escapeHtml(school.conference)} • ${school.region} • ${window.XCD.data.STATE_NAMES[school.state] || school.state}
          </span>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:16px;">
        <div class="stat-tile"><div class="label">Prestige</div><div class="value">${school.prestige}</div><div class="sub">${Utils.ratingGrade(school.prestige)}</div></div>
        <div class="stat-tile"><div class="label">Academics</div><div class="value">${school.academics}</div><div class="sub">${Utils.ratingGrade(school.academics)}</div></div>
        <div class="stat-tile"><div class="label">Campus Appeal</div><div class="value">${school.campusAppeal}</div><div class="sub">${Utils.ratingGrade(school.campusAppeal)}</div></div>
        <div class="stat-tile"><div class="label">Weather</div><div class="value">${school.weather.tempBase}°F</div><div class="sub">${school.weather.altitude} altitude • ${school.weather.humidity} humidity</div></div>
      </div>

      <div class="grid cols-2">
        <div class="card">
          <h2>Head Coach — ${Utils.escapeHtml(coach.fullName)}</h2>
          <div style="color:var(--text-dim); font-size:13px; margin-bottom:12px;">
            Age ${coach.age} • ${Utils.escapeHtml(coach.personality)} • Year ${coach.yearsAtSchool + 1} at ${Utils.escapeHtml(school.name)} • Overall ${coach.overallRating}
          </div>
          <div class="attr-grid">
            ${COACH_ATTRS.map(([key, label]) => `
              <div class="attr-row"><span class="attr-name">${label}</span>${UI.ratingBadge(coach[key])}</div>`).join('')}
          </div>
        </div>

        <div class="card">
          <h2>Facilities — Overall ${school.facilitiesOverall}</h2>
          ${Object.entries(FACILITY_LABELS).map(([key, label]) => `
            <div class="attr-row" style="margin-bottom:6px;">
              <span class="attr-name" style="min-width:140px;">${label}</span>
              <div style="flex:1; margin:0 10px;">${UI.meter(school.facilities[key])}</div>
              <span style="font-weight:700; font-size:12.5px;">${school.facilities[key]}</span>
            </div>`).join('')}
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
        </div>
      </div>`;
  }

  UI.screens.school = { render };
})();
