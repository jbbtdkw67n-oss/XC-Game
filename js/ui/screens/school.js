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
    ['recruiting', 'Recruiting', 'Recruiting effectiveness: weekly points and pull with prospects.'],
    ['training', 'Training', 'Athlete development speed, every single week.'],
    ['peaking', 'Peaking', 'Championship form at Conference, Regionals, and Nationals.'],
    ['culture', 'Culture', 'Morale, happiness, chemistry, and keeping runners out of the portal.']
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
          <h2>${coach.portrait || '🧢'} Head Coach — ${Utils.escapeHtml(coach.fullName)}</h2>
          <div style="color:var(--text-dim); font-size:13px; margin-bottom:12px;">
            Age ${coach.age} • ${Utils.escapeHtml(coach.archetype || '')} • Year ${coach.yearsAtSchool + 1} at ${Utils.escapeHtml(school.name)} • Overall ${coach.overallRating}
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
        </div>

        <div class="card">
          <h2>Facilities — Overall ${school.facilitiesOverall}</h2>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-size:13px; color:var(--text-dim);">Facilities Fund: <strong style="color:var(--text);">$${school.budget.facilitiesFund.toLocaleString()}</strong></span>
            <button class="btn small primary" id="btn-fundraise" ${game.fundraisedYear === game.year ? 'disabled title="Boosters already gave this year"' : ''}>💰 Fundraise</button>
          </div>
          ${Object.entries(FACILITY_LABELS).map(([key, label]) => {
            const level = school.facilities[key];
            const cost = window.XCD.engine.Finances.upgradeCost(level);
            const afford = school.budget.facilitiesFund >= cost && level < 99;
            return `
            <div class="attr-row" style="margin-bottom:6px;">
              <span class="attr-name" style="min-width:128px;">${label}</span>
              <div style="flex:1; margin:0 10px;">${UI.meter(level)}</div>
              <span style="font-weight:700; font-size:12.5px; min-width:24px;">${level}</span>
              <button class="btn small" data-upg="${key}" ${afford ? '' : `disabled title="${level >= 99 ? 'World-class' : 'Costs $' + cost.toLocaleString()}"`}
                style="margin-left:8px;" title="Upgrade +${window.XCD.engine.Finances.UPGRADE_STEP} for $${cost.toLocaleString()}">▲ $${Math.round(cost / 1000)}k</button>
            </div>`;
          }).join('')}
          <div style="font-size:12px; color:var(--text-faint); margin-top:6px;">
            Facilities boost development and recruiting. The fund refills each year — faster when you win.
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

    container.querySelectorAll('[data-coach-upg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.coachUpg;
        if ((coach.upgradePoints || 0) <= 0 || coach[key] >= 99) return;
        coach.upgradePoints -= 1;
        coach[key] = Math.min(99, coach[key] + 2);
        UI.toast(`${COACH_ATTRS.find(([k]) => k === key)[1]} improved to ${coach[key]}.`, 'success');
        render(container);
      });
    });

    container.querySelectorAll('[data-upg]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const result = window.XCD.engine.Finances.upgradeFacility(game, school.id, btn.dataset.upg);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(container);
      });
    });
    const fundBtn = container.querySelector('#btn-fundraise');
    if (fundBtn) {
      fundBtn.addEventListener('click', () => {
        const result = window.XCD.engine.Finances.fundraise(game);
        UI.toast(result.message, result.ok ? 'success' : 'error');
        if (result.ok) render(container);
      });
    }
  }

  UI.screens.school = { render };
})();
