/*
 * Shared coach profile modal (Update 3): a detailed résumé for any coach —
 * active or retired — mirroring the athlete card. Age, career record,
 * schools coached with a timeline, reputation, Coach of the Year awards,
 * team and individual championships, athletes coached, winning percentage,
 * recruiting rankings, personality, coaching style, and career prestige.
 */
(function () {
  const UI = window.XCD.ui;
  const Utils = window.XCD.core.Utils;
  const D = window.XCD.data;

  function tendencyLabels(coach) {
    return (coach.tendencies || [])
      .map((k) => (D.COACH_TENDENCIES.find((t) => t.key === k) || {}).label || k);
  }

  function trainingPhilosophy(coach) {
    const t = coach.tendencies || [];
    const vol = t.includes('mileage-heavy') ? 'High-mileage'
      : t.includes('low-mileage') ? 'Low-mileage, speed-first' : 'Balanced-mileage';
    const temp = t.includes('aggressive') ? 'aggressive racer'
      : t.includes('conservative') ? 'conservative developer' : 'measured';
    return `${vol} · ${temp}`;
  }

  /*
   * `coach` is a live Coach instance (has schoolId, ratings) OR a retired
   * registry record (has careerRecord, stints, reputationLabel). Both share
   * enough shape to render a profile; missing live-only fields degrade gracefully.
   */
  UI.showCoachCard = function (coach, game, opts = {}) {
    const cr = coach.careerRecord || {};
    const retired = !!opts.retired || (!coach.schoolId && !coach.id);
    const school = (coach.schoolId && game) ? game.getSchool(coach.schoolId) : null;
    const repLabel = coach.reputationLabel ||
      ((D.reputationLevel(coach.reputation || 0) || {}).label || '');
    const repIcon = (D.reputationLevel(coach.reputation || 0) || {}).icon || '';
    const archIcon = (D.COACH_ARCHETYPES.find((a) => a.key === coach.archetype) || {}).icon || '🧢';

    const winPct = coach.winPct !== undefined ? coach.winPct
      : (() => { const g = (cr.wins || 0) + (cr.losses || 0); return g ? Math.round((cr.wins / g) * 1000) / 10 : 0; })();

    // Career timeline from stints (schools coached, in order, with years).
    const stints = (coach.stints || []).slice().sort((a, b) => a.startYear - b.startYear);
    const yearsCoached = cr.seasons || stints.reduce((s, st) => s + Math.max(0, (st.endYear || (game ? game.year : st.startYear)) - st.startYear), 0);

    const ratingRow = (label, val) => `
      <div class="attr-row"><span class="attr-name">${label}</span>${UI.ratingBadge(Math.round(val || 0))}</div>`;

    const stat = (label, val, sub) => `
      <div class="stat-tile"><div class="label">${label}</div><div class="value">${val}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

    const timelineHtml = stints.length ? stints.map((s) => {
      const end = s.endYear ? s.endYear : (retired ? s.endYear : 'present');
      const div = s.division && s.division !== 'DI' ? ` <span style="color:var(--text-faint);">${s.division}</span>` : '';
      return `<div class="attr-row">
        <span>${Utils.escapeHtml(s.school)}${div}</span>
        <span style="color:var(--text-dim);">${s.startYear}–${end}</span>
      </div>`;
    }).join('') : '<div style="color:var(--text-dim); font-size:13px;">No coaching stops recorded.</div>';

    UI.showModal(`
      <button class="btn small modal-close" data-modal-close>✕ Close</button>
      <div class="player-card-header">
        <div class="who">
          <h2>${archIcon} ${Utils.escapeHtml(coach.fullName || coach.name || `${coach.firstName || ''} ${coach.lastName || ''}`)}${coach.isPlayer ? ' <span style="color:var(--accent);">(You)</span>' : ''}</h2>
          <div class="sub">
            ${retired ? '<span style="color:var(--text-faint);">Retired</span> • ' : ''}Age ${coach.age || '—'} •
            ${school ? Utils.escapeHtml(school.name) + ' (' + Utils.escapeHtml(school.conference) + ')' : (retired ? 'Career complete' : 'Free agent')}
          </div>
          <div class="sub">${repIcon} ${Utils.escapeHtml(repLabel)} • ${Utils.escapeHtml(coach.archetype || 'Developer')} • ${Utils.escapeHtml(trainingPhilosophy(coach))}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:26px; font-weight:800;">${Math.round(coach.reputation || 0)}</div>
          <div style="font-size:12px; color:var(--text-dim);">CAREER PRESTIGE</div>
          <div style="font-size:12px; color:var(--text-faint); margin-top:2px;">${winPct}% win rate</div>
        </div>
      </div>

      <div class="grid cols-4" style="margin-bottom:14px;">
        ${stat('Record', `${cr.wins || 0}-${cr.losses || 0}`, `${yearsCoached} yrs · ${cr.seasons || 0} seasons`)}
        ${stat('National Titles', cr.nationalTitles || 0, `${cr.conferenceTitles || 0} conf · ${cr.regionalTitles || 0} reg`)}
        ${stat('Coach of Year', `${cr.natCOY || 0}🇺🇸 ${cr.confCOY || 0}🏅`, 'national · conference')}
        ${stat('Nationals Trips', cr.nationalsAppearances || 0, `best class #${cr.bestClassRank || '—'}`)}
      </div>

      <div class="grid cols-2" style="margin-bottom:14px;">
        <div class="card" style="padding:12px;">
          <h3>Athletes Coached</h3>
          <div class="attr-row"><span class="attr-name">All-Americans</span><span><strong>${cr.allAmericans || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">All-Conference</span><span><strong>${cr.allConference || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">National Champions</span><span><strong>${cr.indivNatChamps || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">Conference Champions</span><span><strong>${cr.indivConfChamps || 0}</strong></span></div>
          <div class="attr-row"><span class="attr-name">Best Recruiting Class</span><span><strong>${cr.bestClassRank ? '#' + cr.bestClassRank : '—'}</strong></span></div>
        </div>
        <div class="card" style="padding:12px;">
          <h3>Coaching Craft</h3>
          ${coach.recruiting !== undefined ? `
            ${ratingRow('Recruiting', coach.recruiting)}
            ${ratingRow('Training', coach.training)}
            ${ratingRow('Peaking', coach.peaking)}
            ${ratingRow('Team Culture', coach.culture)}
          ` : '<div style="color:var(--text-dim); font-size:13px;">Ratings not tracked for retired coaches.</div>'}
          <div class="attr-row" style="margin-top:6px;"><span class="attr-name">Style</span><span style="font-size:12px; color:var(--text-dim);">${tendencyLabels(coach).join(', ') || '—'}</span></div>
        </div>
      </div>

      <div class="card" style="padding:12px;">
        <h3>Career Timeline — ${stints.length} stop${stints.length === 1 ? '' : 's'}</h3>
        ${timelineHtml}
      </div>
    `);
  };
})();
